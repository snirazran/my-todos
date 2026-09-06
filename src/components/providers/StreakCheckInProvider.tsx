'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { useAuth } from '@/components/auth/AuthContext';
import { useNotification } from '@/components/providers/NotificationProvider';
import {
  checkInStreak,
  localDayKey,
  openStreakSheet,
  subscribeStreakSheet,
  takePrewarmedCheckIn,
  type StreakSheetRequest,
} from '@/hooks/useLoginStreak';
import { StreakSheet } from '@/components/ui/streak/StreakSheet';
import { StreakRescueSheet } from '@/components/ui/streak/StreakRescueSheet';
import { ShieldSheet } from '@/components/ui/streak/ShieldSheet';
import { openShieldSheet, subscribeShieldSheet } from '@/hooks/useShields';
import { recordAppUsageDay } from '@/lib/rateApp';
import {
  LOGIN_STREAK_HOLD,
  holdAutoPopups,
  releaseAutoPopups,
  whenScreenIsFree,
} from '@/lib/popupGate';
import { emitCampaignTrigger } from '@/lib/campaigns/orchestrator';
import type { CheckInResult, LoginStreakRescue } from '@/lib/streak/types';
import type { ShieldOffer } from '@/lib/shields/types';

// One auto-offer per app session, on top of the server's day-scale cooldown.
// The server can't see that the user already closed it 30 seconds ago.
let shieldOfferedThisSession = false;

// Keyed per user so a fresh account created in the same session (after another
// account already checked in today) still gets its own check-in.
let lastChecked: { dayKey: string; userId: string } | null = null;

const EXCLUDED_PREFIXES = [
  '/welcome',
  '/login',
  '/register',
  '/onboarding',
  '/auth',
];

/** The streak sheet is a real sheet, so it keeps its own claim on the screen
 *  once open; this only has to outlive a user reading it. */
const SHEET_HOLD_MS = 5 * 60_000;
/** Quiet beat after the streak flow before anything else may interrupt. */
const AFTER_STREAK_GRACE_MS = 1500;

const queueStreakSheet = (show: () => void, dropAfterMs?: number, initialDelayMs = 0) =>
  // The streak reveal is the payoff for the check-in that just happened, so it
  // opens on the first free frame instead of landing a beat after the page it
  // is interrupting. It waits out sheets and cinematics, but not its own hold.
  whenScreenIsFree(show, {
    dropAfterMs,
    initialDelayMs,
    ownHold: LOGIN_STREAK_HOLD,
  });

/**
 * The server decides whether the user should ever see the offer; this decides
 * whether *now* is a moment worth interrupting, and never twice in one session.
 * An offer that can't find a clean moment within a few seconds is dropped
 * rather than queued, so it can't surface in the middle of something unrelated.
 */
function queueShieldOffer(offer: ShieldOffer) {
  if (shieldOfferedThisSession) return false;
  shieldOfferedThisSession = true;
  queueStreakSheet(() => openShieldSheet(offer), 8000, 900);
  return true;
}

const PLEDGE_INVITE_KEY = 'frog:pledgeInviteDay';
const PLEDGE_INVITE_COOLDOWN_DAYS = 3;

/**
 * True at most once every few days. The pledge is worth asking for, and worth
 * not nagging about — an invite that reappears every morning is a demand.
 */
function takePledgeInvite(): boolean {
  try {
    const today = localDayKey();
    const last = localStorage.getItem(PLEDGE_INVITE_KEY);
    if (last) {
      const elapsed =
        (Date.parse(`${today}T00:00:00`) - Date.parse(`${last}T00:00:00`)) /
        86_400_000;
      if (!Number.isFinite(elapsed) || elapsed < PLEDGE_INVITE_COOLDOWN_DAYS) {
        return false;
      }
    }
    localStorage.setItem(PLEDGE_INVITE_KEY, today);
    return true;
  } catch {
    return false;
  }
}

export function StreakCheckInProvider() {
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const pathname = usePathname();
  const excludedRoute = EXCLUDED_PREFIXES.some((p) => pathname?.startsWith(p));
  const eligible = !!user && !excludedRoute;

  const userId = user?.uid ?? null;

  useEffect(() => {
    if (!eligible || !userId) return;

    const run = async () => {
      const today = localDayKey();
      if (lastChecked?.dayKey === today && lastChecked.userId === userId)
        return;
      // Claimed before the check-in leaves for the server, not after it comes
      // back: everything else that fires on a launch timer would otherwise win
      // a race against a popup that hasn't been decided on yet.
      holdAutoPopups(LOGIN_STREAK_HOLD);
      let queued = false;
      try {
        // The prewarmed check-in is fired from onboarding the moment the account
        // is created, so it can lose a race with the session cookie and resolve
        // null. Consuming that null without retrying left a brand-new account
        // never checked in: streak stuck at 0, and no pledge invite.
        const prewarmed = await takePrewarmedCheckIn();
        const result = prewarmed ?? (await checkInStreak());
        if (!result) return;
        lastChecked = { dayKey: today, userId };
        recordAppUsageDay();
        if (!result.active) return;
        if (result.shieldConsumedDays.length > 0 && result.view) {
          showNotification(
            <span>
              🪷 A Lily Pad caught your <b>{result.view.count}-day</b> streak!
            </span>,
          );
        }
        const offer = result.rescue;
        const canRescue =
          !!offer &&
          offer.adEligible &&
          offer.adsWatched < Math.max(1, offer.adsRequired);
        if (offer && canRescue) {
          queueStreakSheet(() => openStreakSheet({ rescue: offer }));
          queued = true;
        } else if (result.shieldOffer) {
          queued = queueShieldOffer(result.shieldOffer);
        } else if (result.extended) {
          queueStreakSheet(() => openStreakSheet({ celebration: result }));
          queued = true;
        } else if (!result.view?.goal && takePledgeInvite()) {
          // A pledge is only ever offered, never auto-enrolled — but the offer
          // used to ride on `extended`, and a new account's first check-in is
          // consumed by the onboarding prewarm. That left day one with no invite
          // at all, which is the one day it matters most.
          queueStreakSheet(() => openStreakSheet({ commit: true }));
          queued = true;
        }
        if (result.extended) {
          emitCampaignTrigger('streak_milestone', {
            streak: result.view?.count ?? 0,
          });
        }
      } finally {
        // Nothing to reveal — a check-in that failed, a day already counted —
        // so the screen goes back to everyone else immediately. A queued sheet
        // keeps the hold alive itself until it has been seen and closed.
        if (!queued) releaseAutoPopups(LOGIN_STREAK_HOLD, 0);
      }
    };

    void run();

    let handle: PluginListenerHandle | undefined;
    if (Capacitor.isNativePlatform()) {
      void App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) void run();
      }).then((h) => {
        handle = h;
      });
    }

    return () => {
      void handle?.remove();
    };
  }, [eligible, userId, showNotification]);

  if (!eligible) return null;
  return <StreakSheetHost />;
}

function StreakSheetHost() {
  const [open, setOpen] = useState(false);
  const [celebration, setCelebration] = useState<CheckInResult | null>(null);
  const [commitIntent, setCommitIntent] = useState(false);
  const [rescueOpen, setRescueOpen] = useState(false);
  const [rescue, setRescue] = useState<LoginStreakRescue | null>(null);
  const [shieldOpen, setShieldOpen] = useState(false);
  const [shieldOffer, setShieldOffer] = useState<ShieldOffer | null>(null);

  useEffect(() => {
    return subscribeStreakSheet((req: StreakSheetRequest) => {
      if (req.rescue) {
        setRescue(req.rescue);
        setRescueOpen(true);
        return;
      }
      setCelebration(req.celebration ?? null);
      setCommitIntent(!!req.commit);
      setOpen(true);
    });
  }, []);

  useEffect(() => {
    return subscribeShieldSheet((offer) => {
      setShieldOffer(offer);
      setShieldOpen(true);
    });
  }, []);

  // The hold outlives the check-in that took it: it belongs to the streak flow
  // as a whole, and only lifts once the user has closed what they were shown —
  // plus a beat, so the next popup isn't a jump cut off the closing animation.
  const streakVisible = open || rescueOpen || shieldOpen;
  useEffect(() => {
    if (streakVisible) {
      holdAutoPopups(LOGIN_STREAK_HOLD, SHEET_HOLD_MS);
      return () => releaseAutoPopups(LOGIN_STREAK_HOLD, AFTER_STREAK_GRACE_MS);
    }
  }, [streakVisible]);

  return (
    <>
      <StreakSheet
        commitIntent={commitIntent}
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            setCelebration(null);
            setCommitIntent(false);
          }
        }}
        celebration={celebration}
      />
      <StreakRescueSheet
        open={rescueOpen}
        onOpenChange={(v) => {
          setRescueOpen(v);
          if (!v) setRescue(null);
        }}
        offer={rescue}
      />
      <ShieldSheet
        open={shieldOpen}
        onOpenChange={(v) => {
          setShieldOpen(v);
          if (!v) setShieldOffer(null);
        }}
        offer={shieldOffer}
      />
    </>
  );
}
