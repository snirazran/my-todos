'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { enableWebPush } from '@/lib/webPush';
import { cn } from '@/lib/utils';
import type { OnboardingStepProps } from './types';
import { OnboardingFrogHeader, ONBOARDING_BODY_CLASS } from './OnboardingFrogHeader';

async function enableNotifications() {
  if (Capacitor.isNativePlatform()) {
    let status = await FirebaseMessaging.checkPermissions();
    if (
      status.receive === 'prompt' ||
      status.receive === 'prompt-with-rationale'
    ) {
      status = await FirebaseMessaging.requestPermissions();
    }
    if (status.receive !== 'granted') return;

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const { token } = await FirebaseMessaging.getToken();
    if (token) {
      await fetch('/api/notifications/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ fcmToken: token, timezone }),
      });
    }
    return;
  }

  await enableWebPush();
}

export default function NotificationStep({ selections, onNext, saving, direction }: OnboardingStepProps) {
  const frogName = selections.frogName?.[0]?.trim() || 'Cookie';
  const [requesting, setRequesting] = useState(false);

  const handleEnable = async () => {
    setRequesting(true);
    try {
      await enableNotifications();
    } catch {
      // Permission setup is best-effort; onboarding should still continue.
    } finally {
      setRequesting(false);
      onNext();
    }
  };

  return (
    <div className="flex-1 flex flex-col relative">
      <OnboardingFrogHeader
        title={`Get reminders from ${frogName}`}
        subtitle="Stay on track with gentle reminders."
      />

      <motion.div
        key="notifications"
        custom={direction}
        initial={{ opacity: 0, x: direction * 40 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: direction * -40 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className={cn('flex flex-col items-center px-4', ONBOARDING_BODY_CLASS)}
      >
        <div className="flex w-[calc(100%+4rem)] max-w-[calc(100vw-1.5rem)] items-center gap-3 rounded-3xl bg-muted/70 px-4 py-3 shadow-sm md:w-full md:max-w-md lg:max-w-lg">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-background shadow-sm">
            <img src="/frogress-icon.png" alt="" className="h-10 w-10 rounded-xl" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-base font-black text-foreground">From {frogName}</p>
              <span className="text-sm font-medium text-muted-foreground">now</span>
            </div>
            <p className="truncate text-base text-foreground">Remember to drink water!</p>
          </div>
        </div>

      </motion.div>

      <div className="flex-[8]" />

      <div className="flex flex-col items-center gap-3 pb-[calc(4rem+env(safe-area-inset-bottom))]">
        <motion.button
          type="button"
          onClick={handleEnable}
          disabled={saving || requesting}
          whileTap={{ scale: 0.97 }}
          className="h-14 w-full md:w-80 rounded-2xl bg-primary text-base font-bold tracking-wide text-primary-foreground shadow-lg shadow-primary/25 transition-all duration-200 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {requesting ? 'Opening settings...' : 'Turn on notifications'}
        </motion.button>

        <motion.button
          type="button"
          onClick={onNext}
          disabled={saving || requesting}
          whileTap={{ scale: 0.97 }}
          className={cn(
            'h-14 w-full md:w-80 rounded-2xl bg-muted text-base font-bold tracking-wide text-muted-foreground shadow-sm transition-all duration-200 hover:bg-muted/80',
            (saving || requesting) && 'cursor-not-allowed opacity-70',
          )}
        >
          Maybe later
        </motion.button>
      </div>
    </div>
  );
}
