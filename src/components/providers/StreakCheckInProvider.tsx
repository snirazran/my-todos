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
import { useSheetStore } from '@/lib/sheetStore';
import { useUIStore } from '@/lib/uiStore';
import { rewardedAdsAvailable } from '@/lib/ads';
import { recordAppUsageDay } from '@/lib/rateApp';
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

/**
 * Holds the offer until the screen is actually free. The server decides whether
 * the user should ever see it; this decides whether *now* is a moment worth
 * interrupting — never over a cinematic, never stacked on another sheet, and
 * never twice in one session. An offer that can't find a clean moment within a
 * few seconds is dropped rather than queued for later, so it can't surface in
 * the middle of something unrelated.
 */
function queueShieldOffer(offer: ShieldOffer) {
  if (shieldOfferedThisSession) return;
  shieldOfferedThisSession = true;

  const deadline = Date.now() + 8000;
  const tryOpen = () => {
    const busy =
      useSheetStore.getState().count > 0 ||
      useUIStore.getState().isCinematicActive;
    if (!busy) {
      openShieldSheet(offer);
      return;
    }
    if (Date.now() > deadline) return;
    window.setTimeout(tryOpen, 600);
  };
  window.setTimeout(tryOpen, 900);
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
      const canAd =
        !!offer &&
        offer.adEligible &&
        offer.adsWatched < Math.max(1, offer.adsRequired) &&
        (offer.adsRequired === 0 || rewardedAdsAvailable());
      if (offer && canAd) {
        openStreakSheet({ rescue: offer });
      } else if (result.shieldOffer) {
        queueShieldOffer(result.shieldOffer);
      } else if (result.extended) {
        openStreakSheet({ celebration: result });
      } else if (!result.view?.goal && takePledgeInvite()) {
        // A pledge is only ever offered, never auto-enrolled — but the offer
        // used to ride on `extended`, and a new account's first check-in is
        // consumed by the onboarding prewarm. That left day one with no invite
        // at all, which is the one day it matters most.
        openStreakSheet({ commit: true });
      }
      if (result.extended) {
        emitCampaignTrigger('streak_milestone', {
          streak: result.view?.count ?? 0,
        });
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
