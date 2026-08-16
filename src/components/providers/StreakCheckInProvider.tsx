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
      const result = await (takePrewarmedCheckIn() ?? checkInStreak());
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
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setCelebration(null);
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
