'use client';

import React, { useEffect, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { create } from 'zustand';
import { mutate } from 'swr';
import confetti from 'canvas-confetti';
import { Bell, Check, Sparkle } from 'lucide-react';
import Frog from '@/components/ui/frog';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { PremiumFrogAura } from '@/components/ui/PremiumFrogAura';
import { Icon } from '@/components/ui/Icon';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { hapticCelebrate } from '@/lib/haptics';
import { BENEFITS } from '@/lib/plusBenefits';
import { useAutoPopupHold, whenScreenIsFree } from '@/lib/popupGate';
import {
  PLUS_STATUS_KEY,
  formatPlusDate,
  plusPhase,
  prefetchPlusStatus,
  type PlusStatus,
} from '@/lib/plusStatus';
import { cn } from '@/lib/utils';

const DAY_MS = 86_400_000;
const REMINDER_LEAD_DAYS = 2;

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
      className="border-0 sm:max-w-[400px]"
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
  const { indices } = useWardrobeIndices(true);
  const trial = useMemo(() => trialInfo(status), [status]);
  useAutoPopupHold('plus-welcome', true);

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
      colors: ['#fbbf24', '#fde68a', '#4ade80', '#ffffff'],
      disableForReducedMotion: true,
    });
  }, [entered, reduceMotion]);

  return (
    <div className="flex max-h-[92dvh] flex-col sm:max-h-[calc(100dvh-3rem)]">
      <div
        ref={bindScroll}
        className="no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
      >
        <div className="relative z-10 flex h-[196px] shrink-0 items-end justify-center short-screen:h-[164px]">
          <div aria-hidden className="absolute inset-0 overflow-hidden">
            <span className="absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_0%,#2f7d50_0%,#1d5a3f_45%,#123a2a_100%)]" />
            <span className="absolute left-1/2 top-[62%] h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 opacity-50 [mask-image:radial-gradient(circle,black_20%,transparent_62%)]">
              <span className="block h-full w-full will-change-transform motion-safe:animate-[spin_24s_linear_infinite] [background:repeating-conic-gradient(from_0deg,rgba(251,191,36,0.22)_0deg_8deg,transparent_8deg_24deg)]" />
            </span>
            <motion.span
              className="absolute bottom-0 left-1/2 h-56 w-56 rounded-full bg-[radial-gradient(closest-side,rgba(251,191,36,0.45),transparent)]"
              style={{ x: '-50%', y: '33%' }}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={entered ? { opacity: 1, scale: 1 } : undefined}
              transition={{ type: 'spring', stiffness: 140, damping: 16 }}
            />
          </div>
          <div className="relative -mb-0.5">
            {entered ? (
              <>
                <Frog width={170} height={180} indices={indices} emote="love" />
                <PremiumFrogAura show compact alwaysPlay />
              </>
            ) : (
              <FrogSnapshot width={170} height={180} indices={indices} />
            )}
          </div>
        </div>

        <div className="relative px-6 pb-4 pt-4 text-center">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-600 dark:text-amber-400">
            Frogress Plus
          </p>
          <h2
            id="plus-welcome-title"
            className="mt-1 text-[30px] font-black leading-none tracking-tight short-screen:text-[26px]"
          >
            You’re in!
          </h2>
          <p className="mx-auto mt-2 max-w-[18rem] text-[14px] font-semibold leading-snug text-muted-foreground">
            {trial
              ? `Your ${trial.days}-day free trial is on. Everything in Plus is yours, free until ${trial.endsOn}.`
              : 'Every perk is unlocked. Thanks for backing Frogress.'}
          </p>
          {trial && (
            <ol className="mt-4 grid grid-cols-3 gap-2 text-left">
              {[
                {
                  icon: <Sparkle className="h-3.5 w-3.5" fill="currentColor" />,
                  when: 'Today',
                  what: 'All unlocked',
                  done: true,
                },
                {
                  icon: <Bell className="h-3.5 w-3.5" strokeWidth={2.75} />,
                  when: trial.remindOn,
                  what: 'We remind you',
                  done: false,
                },
                {
                  icon: <Icon name="frogPlus" className="h-4 w-4" />,
                  when: trial.endsOn,
                  what: 'Plan starts',
                  done: false,
                },
              ].map((step) => (
                <li
                  key={step.what}
                  className={cn(
                    'rounded-2xl px-2.5 py-2 ring-1 ring-inset',
                    step.done
                      ? 'bg-emerald-500/10 ring-emerald-500/25'
                      : 'bg-muted/50 ring-border/60',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full',
                      step.done
                        ? 'bg-emerald-500 text-white'
                        : 'bg-card text-amber-600 ring-1 ring-border dark:text-amber-400',
                    )}
                  >
                    {step.done ? <Check className="h-3.5 w-3.5" strokeWidth={3.5} /> : step.icon}
                  </span>
                  <span className="mt-1.5 block truncate text-[12px] font-black leading-tight">
                    {step.when}
                  </span>
                  <span className="block truncate text-[11px] font-semibold text-muted-foreground">
                    {step.what}
                  </span>
                </li>
              ))}
            </ol>
          )}

          <ul className="mt-4 space-y-2 text-left">
            {BENEFITS.map((benefit, i) => (
              <motion.li
                key={benefit.title}
                className="flex items-center gap-3 rounded-2xl border border-border/50 bg-muted/30 px-3 py-2.5"
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={entered ? { opacity: 1, y: 0 } : undefined}
                transition={{ type: 'spring', stiffness: 320, damping: 26, delay: 0.1 + i * 0.1 }}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/15">
                  <Icon name={benefit.icon} className="h-6 w-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-black leading-tight">
                    {benefit.title}
                  </span>
                  <span className="block text-[11.5px] font-semibold leading-snug text-muted-foreground">
                    {benefit.body}
                  </span>
                </span>
                <motion.span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"
                  initial={reduceMotion ? false : { scale: 0 }}
                  animate={entered ? { scale: 1 } : undefined}
                  transition={{ type: 'spring', stiffness: 500, damping: 15, delay: 0.35 + i * 0.12 }}
                >
                  <Check className="h-3 w-3" strokeWidth={4} />
                </motion.span>
              </motion.li>
            ))}
          </ul>
        </div>
      </div>

      <div className="shrink-0 border-t border-border/50 bg-card px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:pb-5">
        <button
          type="button"
          onClick={onDone}
          className="flex h-14 w-full items-center justify-center rounded-2xl bg-[linear-gradient(180deg,#fcd34d_0%,#f59e0b_100%)] text-[17px] font-black tracking-tight text-[#3b2708] shadow-[0_4px_0_0_#b45309] ring-1 ring-inset ring-amber-100/60 transition-all active:translate-y-1 active:shadow-none [@media(hover:hover)]:hover:brightness-105"
        >
          Let’s hop in
        </button>
        <p className="mt-2 text-center text-[11.5px] font-semibold text-muted-foreground">
          Manage or cancel anytime in Settings → Frogress Plus.
        </p>
      </div>
    </div>
  );
}
