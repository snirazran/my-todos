'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { enableWebPush } from '@/lib/webPush';
import { cn } from '@/lib/utils';
import { Bell } from 'lucide-react';
import type { OnboardingStepProps } from './types';
import { OnboardingFrogHeader, ONBOARDING_BODY_CLASS, ONBOARDING_FOOTER_SPACER_CLASS } from './OnboardingFrogHeader';
import { OnboardingButton, OnboardingFooter } from './OnboardingFooter';

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
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className={cn('flex flex-col items-center', ONBOARDING_BODY_CLASS)}
      >
        <motion.div
          initial={{ opacity: 0, y: -18, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 320, damping: 24 }}
          className="flex w-full items-center gap-3 rounded-[22px] border border-border/50 bg-card/95 px-3.5 py-3 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.25)] backdrop-blur md:max-w-md"
        >
          <img src="/frogress-icon.png" alt="" className="h-11 w-11 shrink-0 rounded-[12px] shadow-sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-[15px] font-black text-foreground">{frogName}</p>
              <span className="text-xs font-semibold text-muted-foreground">now</span>
            </div>
            <p className="truncate text-[15px] text-foreground/90">Remember to drink water! 💧</p>
          </div>
        </motion.div>
        <p className="mt-4 text-center text-[13px] font-semibold text-muted-foreground">
          No spam. Turn them off anytime.
        </p>

      </motion.div>

      <div className={ONBOARDING_FOOTER_SPACER_CLASS} />

      <OnboardingFooter>
        <OnboardingButton onClick={handleEnable} disabled={saving} loading={requesting}>
          <Bell className="h-5 w-5" strokeWidth={2.5} />
          Turn on reminders
        </OnboardingButton>
        <OnboardingButton variant="ghost" onClick={onNext} disabled={saving || requesting}>
          Maybe later
        </OnboardingButton>
      </OnboardingFooter>
    </div>
  );
}
