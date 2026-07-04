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
  type StreakSheetRequest,
} from '@/hooks/useLoginStreak';
import { StreakSheet } from '@/components/ui/streak/StreakSheet';
import type { CheckInResult } from '@/lib/streak/types';

let lastCheckedDayKey: string | null = null;

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

  useEffect(() => {
    if (!eligible) return;

    const run = async () => {
      const today = localDayKey();
      if (lastCheckedDayKey === today) return;
      const result = await checkInStreak();
      if (!result) return;
      lastCheckedDayKey = today;
      if (!result.active) return;
      if (result.freezeConsumedDays.length > 0 && result.view) {
        showNotification(
          <span>
            ❄️ A streak freeze saved your{' '}
            <b>{result.view.count}-day</b> streak!
          </span>,
        );
      }
      if (result.extended) {
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
  }, [eligible, showNotification]);

  if (!eligible) return null;
  return <StreakSheetHost />;
}

function StreakSheetHost() {
  const [open, setOpen] = useState(false);
  const [celebration, setCelebration] = useState<CheckInResult | null>(null);

  useEffect(() => {
    return subscribeStreakSheet((req: StreakSheetRequest) => {
      setCelebration(req.celebration ?? null);
      setOpen(true);
    });
  }, []);

  return (
    <StreakSheet
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setCelebration(null);
      }}
      celebration={celebration}
    />
  );
}
