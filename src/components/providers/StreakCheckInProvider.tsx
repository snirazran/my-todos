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
  STREAK_EXTENDED_EVENT,
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
let rescueShownId: string | null = null;

// Keyed per user so a fresh account created in the same session (after another
// account already checked in today) still gets its own check-in. Until a task
// has counted today, a resume checks again: a widget tick made while the app
// was in the background leaves a reveal waiting to be claimed.
let lastChecked: { dayKey: string; userId: string; doneToday: boolean } | null =
  null;

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

/** Lets the tongue catch and fly pop finish before the reveal takes over. */
const AFTER_CATCH_DELAY_MS = 1400;

function revealStreakDay(result: CheckInResult, initialDelayMs = 0) {
  queueStreakSheet(
    () => openStreakSheet({ celebration: result }),
    undefined,
    initialDelayMs,
  );
  emitCampaignTrigger('streak_milestone', {
    streak: result.view?.count ?? 0,
  });
  return true;
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
      if (
        lastChecked?.dayKey === today &&
        lastChecked.userId === userId &&
        lastChecked.doneToday
      )
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
        // never checked in.
        const prewarmed = await takePrewarmedCheckIn();
        const result = prewarmed ?? (await checkInStreak());
        if (!result) return;
        lastChecked = {
          dayKey: today,
          userId,
          doneToday: !!result.view?.checkedInToday,
        };
        recordAppUsageDay();
        if (!result.active) return;
        if (
          !result.extended &&
          result.shieldConsumedDays.length > 0 &&
          result.view
        ) {
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
        if (offer && canRescue && rescueShownId !== offer.id) {
          rescueShownId = offer.id;
          queueStreakSheet(() => openStreakSheet({ rescue: offer }));
          queued = true;
        } else if (result.shieldOffer) {
          queued = queueShieldOffer(result.shieldOffer);
        } else if (result.extended) {
          queued = revealStreakDay(result);
        }
      } finally {
        // Nothing to reveal — a check-in that failed, a day already counted —
        // so the screen goes back to everyone else immediately. A queued sheet
        // keeps the hold alive itself until it has been seen and closed.
        if (!queued) releaseAutoPopups(LOGIN_STREAK_HOLD, 0);
      }
    };

    void run();

    let revealing = false;
    const onExtended = async () => {
      if (revealing) return;
      revealing = true;
      holdAutoPopups(LOGIN_STREAK_HOLD);
      let queued = false;
      try {
        const result = await checkInStreak();
        if (result?.view?.checkedInToday) {
          lastChecked = { dayKey: localDayKey(), userId, doneToday: true };
        }
        if (result?.active && result.extended) {
          queued = revealStreakDay(result, AFTER_CATCH_DELAY_MS);
        }
      } finally {
        revealing = false;
        if (!queued) releaseAutoPopups(LOGIN_STREAK_HOLD, 0);
      }
    };
    window.addEventListener(STREAK_EXTENDED_EVENT, onExtended);

    let handle: PluginListenerHandle | undefined;
    if (Capacitor.isNativePlatform()) {
      void App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) void run();
      }).then((h) => {
        handle = h;
      });
    }

    return () => {
      window.removeEventListener(STREAK_EXTENDED_EVENT, onExtended);
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
