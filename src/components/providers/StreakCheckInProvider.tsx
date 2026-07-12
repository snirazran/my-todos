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
import { rewardedAdsAvailable } from '@/lib/ads';
import { recordAppUsageDay } from '@/lib/rateApp';
import type { CheckInResult, LoginStreakRescue } from '@/lib/streak/types';

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
      if (result.freezeConsumedDays.length > 0 && result.view) {
        showNotification(
          <span>
            ❄️ A streak freeze saved your{' '}
            <b>{result.view.count}-day</b> streak!
          </span>,
        );
      }
      if (
        result.rescue &&
        result.rescue.adsWatched < Math.max(1, result.rescue.adsRequired) &&
        (result.rescue.adsRequired === 0 || rewardedAdsAvailable())
      ) {
        openStreakSheet({ rescue: result.rescue });
      } else if (result.extended) {
        openStreakSheet({ celebration: result });
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
    </>
  );
}
