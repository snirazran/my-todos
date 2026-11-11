'use client';

import React, { useEffect, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { create } from 'zustand';
import useSWR, { mutate } from 'swr';
import confetti from 'canvas-confetti';
import { Bell, Check } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { PlusGoldButton, PlusStage } from '@/components/ui/plus/PlusKit';
import { useNotificationStatus } from '@/hooks/useNotificationStatus';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';
import { hapticCelebrate } from '@/lib/haptics';
import { useAutoPopupHold, whenScreenIsFree } from '@/lib/popupGate';
import {
  PLUS_STATUS_KEY,
  formatPlusDate,
  plusPhase,
  prefetchPlusStatus,
  type PlusStatus,
} from '@/lib/plusStatus';
import { DEFAULT_SHOP_SALES } from '@/lib/skins/shopSales';

const DAY_MS = 86_400_000;
const REMINDER_LEAD_DAYS = 2;
const SHOP_ITEMS = DEFAULT_SHOP_SALES.freeSlots + DEFAULT_SHOP_SALES.plusSlots;

const usePlusWelcomeStore = create<{
  open: boolean;
  status: PlusStatus | null;
}>(() => ({ open: false, status: null }));

let pending = false;

export function showPlusWelcome() {
  if (pending) return;
  pending = true;
  void prefetchPlusStatus()
    .catch(() => null)
    .then((status) => {
      if (status) void mutate(PLUS_STATUS_KEY, status, { revalidate: false });
      whenScreenIsFree(
        () => {
          pending = false;
          usePlusWelcomeStore.setState({ open: true, status });
        },
        { initialDelayMs: 1200 },
      );
    });
}

export function PlusWelcomeHost() {
  const { open, status } = usePlusWelcomeStore();
  return (
    <PlusWelcomeCelebration
      open={open}
      status={status}
      onDone={() => usePlusWelcomeStore.setState({ open: false })}
    />
  );
}

function trialInfo(status: PlusStatus | null | undefined) {
  const sub = status?.subscription;
  if (plusPhase(status ?? undefined) !== 'trial' || !sub?.expiresAt) return null;
  const end = new Date(sub.expiresAt).getTime();
  const start = sub.startedAt ? new Date(sub.startedAt).getTime() : Date.now();
  return {
    days: Math.max(1, Math.round((end - start) / DAY_MS)),
    endsOn: formatPlusDate(sub.expiresAt),
    remindOn: formatPlusDate(new Date(end - REMINDER_LEAD_DAYS * DAY_MS).toISOString()),
    canRemind: end - Date.now() > REMINDER_LEAD_DAYS * DAY_MS,
  };
}

export function PlusWelcomeCelebration({
  open = true,
  onDone,
  status,
}: {
  open?: boolean;
  onDone: () => void;
  status?: PlusStatus | null;
}) {
  return (
    <BaseSheet
      open={open}
      onOpenChange={(next) => !next && onDone()}
      zIndex={10010}
      hideHandle
      showClose={false}
      className="plus-paywall border-0 bg-background text-foreground sm:max-w-[420px]"
    >
      {({ entered, bindScroll }) => (
        <WelcomeContent
          entered={entered}
          bindScroll={bindScroll}
          status={status}
          onDone={onDone}
        />
      )}
    </BaseSheet>
  );
}

function WelcomeContent({
  entered,
  bindScroll,
  status,
  onDone,
}: {
  entered: boolean;
  bindScroll: (el: HTMLElement | null) => void;
  status?: PlusStatus | null;
  onDone: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { indices } = useWardrobeIndices(true);
  const notifications = useNotificationStatus();
  const { data: me } = useSWR<{ frogName?: string | null }>(
    user ? '/api/user' : null,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );
  const trial = useMemo(() => trialInfo(status), [status]);
  useAutoPopupHold('plus-welcome', true);
  const frogName = me?.frogName?.trim() || '';
  const inShop = pathname === '/shop';
  const unlocked = [
    '2× flies from every quest and habit',
    '2 prizes in every gift',
    `${SHOP_ITEMS} Special items in today’s shop`,
    frogName ? `A golden fly for ${frogName}` : 'A golden fly companion',
  ];

  useEffect(() => {
    if (!entered) return;
    hapticCelebrate();
    if (reduceMotion) return;
    confetti({
      particleCount: 90,
      spread: 80,
      startVelocity: 38,
      origin: { y: 0.3 },
      zIndex: 10020,
      colors: ['#f5c84c', '#fde68a', '#a78bfa', '#ffffff'],
      disableForReducedMotion: true,
    });
  }, [entered, reduceMotion]);

  const finish = (action: 'shop' | 'done' | 'later') => {
    trackAnalyticsEvent('plus_welcome_step', { action, status: trial ? 'trial' : 'paid' });
    onDone();
    if (action === 'shop') router.push('/shop');
  };

  return (
    <div className="flex max-h-[94dvh] flex-col sm:max-h-[calc(100dvh-3rem)]">
      <div
        ref={bindScroll}
        className="no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
      >
        <PlusStage look={indices} greet="tada" />

        <div className="px-5 pb-4 pt-6 text-center short:pt-5">
          <h2
            id="plus-welcome-title"
            className="text-balance text-[27px] font-black leading-[1.08] tracking-tight short:text-[24px]"
          >
            {frogName ? `${frogName} is in the club!` : 'You’re in the club!'}
          </h2>
          <p className="mx-auto mt-2.5 max-w-[19rem] text-pretty text-[14.5px] font-semibold leading-snug text-muted-foreground">
            {trial
              ? `Your ${trial.days}-day free trial is on. Nothing is charged before ${trial.endsOn}.`
              : 'Every perk is unlocked. Thank you for backing Frogress.'}
          </p>
          {trial?.canRemind ? (
            notifications.isEnabled ? (
              <p className="mt-2.5 inline-flex items-center gap-1.5 text-[13.5px] font-black text-primary">
                <Bell className="h-4 w-4" strokeWidth={2.75} aria-hidden />
                We’ll remind you on {trial.remindOn}
              </p>
            ) : notifications.canEnable ? (
              <button
                type="button"
                onClick={() => void notifications.enableOrConfigure()}
                className="mt-2.5 inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/10 px-3.5 text-[13.5px] font-black text-primary transition-[background-color,transform] hover:bg-white/15 active:scale-95"
              >
                <Bell className="h-4 w-4" strokeWidth={2.75} aria-hidden />
                Remind me before the trial ends
              </button>
            ) : null
          ) : null}

          <ul className="mt-4 divide-y divide-white/10 rounded-[22px] bg-card px-4 text-left shadow-[0_4px_0_0_rgba(26,8,56,0.35)]">
            {unlocked.map((line, i) => (
              <li key={line} className="flex items-center gap-3 py-[11px] short:py-[9px]">
                <motion.span
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--plus-cta)] text-[var(--plus-cta-ink)]"
                  initial={reduceMotion ? false : { scale: 0 }}
                  animate={entered ? { scale: 1 } : undefined}
                  transition={{ type: 'spring', stiffness: 520, damping: 16, delay: 0.5 + i * 0.16 }}
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={3.5} aria-hidden />
                </motion.span>
                <span className="min-w-0 text-[14.5px] font-bold leading-tight">{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="plus-dock shrink-0 px-5 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3.5">
        <PlusGoldButton onClick={() => finish(inShop ? 'done' : 'shop')}>
          {inShop ? 'Let’s go' : 'See today’s Plus shop'}
        </PlusGoldButton>
        {inShop ? null : (
          <button
            type="button"
            onClick={() => finish('later')}
            className="mt-1.5 min-h-10 w-full rounded-xl text-[13.5px] font-black text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          >
            Later
          </button>
        )}
        <p className="mt-1 text-center text-[11.5px] font-semibold text-muted-foreground">
          Manage or cancel anytime in Settings → Frogress Plus.
        </p>
      </div>
    </div>
  );
}
