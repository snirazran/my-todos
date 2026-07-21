'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Flame, Snowflake, Trophy, X, ChevronRight } from 'lucide-react';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { RotatingRays } from '@/components/ui/gift-box/RotatingRays';
import Fly from '@/components/ui/fly';
import { cn } from '@/lib/utils';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import { hapticCelebrate, hapticImpact } from '@/lib/haptics';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import {
  useLoginStreak,
  patchStreakView,
  addDaysToKey,
  localDayKey,
} from '@/hooks/useLoginStreak';
import { patchInventoryFlies, useInventory } from '@/hooks/useInventory';
import { FreezePurchaseSheet } from './FreezePurchaseSheet';
import { StreakCelebration } from './StreakCelebration';
import type {
  CheckInResult,
  LoginStreakReward,
  LoginStreakView,
} from '@/lib/streak/types';

type Step = 'reveal' | 'rewards' | 'commit' | 'home';

const STREAK_REVEAL_MESSAGES = [
  'You showed up today. That’s how streaks are made.',
  'You kept it going today. One more day, well earned.',
  'Another check-in complete. Your streak is growing.',
  'Small steps add up. Today’s step is complete.',
  'You made time today. Keep that momentum going.',
  'Today’s effort counts. Your streak is stronger.',
  'One more day complete. Keep showing up.',
  'You followed through today. That’s real progress.',
  'Today is in the books. Keep the streak alive.',
  'Consistency starts small. You added another day.',
] as const;

function rewardsLabel(rewards: LoginStreakReward[]) {
  const parts: string[] = [];
  let flies = 0;
  let freezes = 0;
  let items = 0;
  for (const r of rewards) {
    if (r.type === 'STREAK_FREEZE') freezes += r.amount ?? 1;
    else if (r.type === 'FLIES')
      flies += r.amountMode === 'random' ? r.maxAmount ?? 0 : r.amount ?? 0;
    else items += 1;
  }
  if (flies > 0) parts.push(`${flies} flies`);
  if (freezes > 0) parts.push(`${freezes} freeze${freezes > 1 ? 's' : ''}`);
  if (items > 0) parts.push(`${items} item${items > 1 ? 's' : ''}`);
  return parts.join(' + ') || 'Surprise';
}

function RewardVisuals({ rewards }: { rewards: LoginStreakReward[] }) {
  let flies = 0;
  let freezes = 0;
  let items = 0;
  for (const reward of rewards) {
    if (reward.type === 'STREAK_FREEZE') freezes += reward.amount ?? 1;
    else if (reward.type === 'FLIES') {
      flies +=
        reward.amountMode === 'random'
          ? reward.maxAmount ?? 0
          : reward.amount ?? 0;
    } else {
      items += 1;
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 short-screen:gap-1">
      {flies > 0 && (
        <span className="inline-flex items-center gap-0.5 font-black text-primary">
          <Fly
            size={24}
            y={-3}
            alwaysPlay
            interactive={false}
            className="short-screen:!h-5 short-screen:!w-5"
          />
          <span className="tabular-nums">{flies}</span>
        </span>
      )}
      {flies > 0 && (freezes > 0 || items > 0) && (
        <span className="text-muted-foreground/50">+</span>
      )}
      {freezes > 0 && (
        <span className="inline-flex items-center gap-1 font-black text-sky-500">
          <Snowflake className="h-4 w-4" />
          <span className="tabular-nums">{freezes}</span>
        </span>
      )}
      {freezes > 0 && items > 0 && (
        <span className="text-muted-foreground/50">+</span>
      )}
      {items > 0 && (
        <span className="font-black text-amber-500">
          {items} item{items > 1 ? 's' : ''}
        </span>
      )}
    </span>
  );
}

function WeekStrip({ view, light = false }: { view: LoginStreakView; light?: boolean }) {
  const today = localDayKey();
  const days = useMemo(() => {
    const weekStart = addDaysToKey(
      today,
      -new Date(`${today}T12:00:00`).getDay(),
    );
    return Array.from({ length: 7 }, (_, i) => addDaysToKey(weekStart, i));
  }, [today]);
  const runStart = useMemo(() => {
    if (view.count <= 0 || !view.lastDayKey) return null;
    const frozen = new Set(view.freezeUsedDayKeys);
    let cursor = view.lastDayKey;
    let remaining = view.count;
    for (let i = view.count + frozen.size; i > 0; i--) {
      if (!frozen.has(cursor)) remaining -= 1;
      if (remaining <= 0) break;
      cursor = addDaysToKey(cursor, -1);
    }
    return cursor;
  }, [view.count, view.lastDayKey, view.freezeUsedDayKeys]);

  return (
    <div className="mt-6 grid w-full max-w-sm grid-cols-7 gap-1.5 short-screen:mt-3 short-screen:gap-1 roomy-screen:mt-8 tall-screen:mt-10">
      {days.map((dayKey, i) => {
        const frozen = view.freezeUsedDayKeys.includes(dayKey);
        const lit =
          !!runStart && dayKey >= runStart && dayKey <= view.lastDayKey;
        const isToday = dayKey === today;
        const label = new Date(`${dayKey}T12:00:00`).toLocaleDateString(
          undefined,
          { weekday: 'narrow' },
        );
        return (
          <div key={dayKey} className="flex flex-col items-center gap-1.5 short-screen:gap-1">
            <span
              className={cn(
                'text-[10px] font-black uppercase',
                light ? 'text-white/80' : 'text-muted-foreground',
              )}
            >
              {label}
            </span>
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.05 * i, type: 'spring', stiffness: 400, damping: 22 }}
              className={cn(
                'grid h-10 w-10 place-items-center rounded-full short-screen:h-8 short-screen:w-8',
                frozen
                  ? light
                    ? 'bg-white/25 text-sky-100'
                    : 'bg-sky-100 text-sky-500 dark:bg-sky-500/15'
                  : lit
                    ? light
                      ? 'bg-white/25 text-yellow-200'
                      : 'bg-orange-100 text-orange-500 dark:bg-orange-500/15'
                    : light
                      ? 'bg-white/10 text-white/40'
                      : 'bg-muted/60 text-muted-foreground/40',
                isToday && (light ? 'ring-2 ring-white' : 'ring-2 ring-primary'),
              )}
            >
              {frozen ? (
                <Snowflake className="h-4 w-4" />
              ) : lit ? (
                <Flame className="h-4 w-4 fill-current" />
              ) : (
                <span className="text-xs font-bold">·</span>
              )}
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}

function RevealStep({
  celebration,
  view,
  indices,
  onContinue,
}: {
  celebration: CheckInResult;
  view: LoginStreakView;
  indices: Partial<Record<'skin' | 'hat' | 'body' | 'hand_item', number>>;
  onContinue: () => void;
}) {
  const frogRef = useRef<FrogHandle>(null);
  const [count, setCount] = useState(celebration.previousCount);
  const [popped, setPopped] = useState(false);
  const [frogReady, setFrogReady] = useState(false);
  const revealMessage =
    STREAK_REVEAL_MESSAGES[
      (Math.max(1, view.count) - 1) % STREAK_REVEAL_MESSAGES.length
    ];

  useEffect(() => {
    const frogTimer = window.setTimeout(() => setFrogReady(true), 250);
    const popTimer = window.setTimeout(() => {
      setCount(view.count);
      setPopped(true);
      frogRef.current?.fireEmote('love');
      confetti({
        particleCount: 110,
        spread: 90,
        startVelocity: 40,
        origin: { y: 0.45 },
        zIndex: 99999,
        colors: ['#fb923c', '#fbbf24', '#fde68a', '#ffffff'],
      });
      hapticCelebrate();
    }, 1100);
    return () => {
      window.clearTimeout(frogTimer);
      window.clearTimeout(popTimer);
    };
  }, [view.count]);

  return (
    <div className="relative flex h-full flex-col items-center overflow-x-hidden overflow-y-auto overscroll-contain bg-gradient-to-b from-orange-500 via-amber-500 to-amber-600">
      <div className="relative flex min-h-full w-full shrink-0 flex-col items-center justify-start px-6 pb-8 pt-[clamp(2rem,8vh,5rem)] short-screen:pb-3 short-screen:pt-[calc(env(safe-area-inset-top)+0.75rem)] roomy-screen:pt-[clamp(4rem,8vh,6rem)] tall-screen:pt-[clamp(6rem,10vh,8rem)]">
        <div className="pointer-events-none absolute inset-0 opacity-30">
          <RotatingRays colorClass="text-white" />
        </div>

      <motion.div
        initial={{ y: 40, opacity: 0, scale: 0.8 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 240, damping: 20 }}
        className="relative mb-6 short-screen:mb-4 roomy-screen:mb-12 tall-screen:mb-14"
      >
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          {frogReady && (
            <Frog
              ref={frogRef}
              width={190}
              height={190}
              className="short-screen:!h-[140px] short-screen:!w-[140px]"
              indices={indices}
              emote="love"
            />
          )}
          {!frogReady && (
            <div
              className="short-screen:!h-[140px] short-screen:!w-[140px]"
              style={{ width: 190, height: 190 }}
            />
          )}
        </motion.div>
      </motion.div>

      <div className="relative mt-2 flex items-center gap-3 short-screen:mt-0 short-screen:gap-2 roomy-screen:mt-3 tall-screen:mt-4">
        <motion.div
          initial={{ scale: 0, rotate: -30 }}
          animate={
            popped
              ? { scale: [1, 1.35, 1], rotate: [0, -8, 8, 0] }
              : { scale: 1, rotate: 0 }
          }
          transition={
            popped
              ? { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
              : { type: 'spring', stiffness: 320, damping: 16, delay: 0.35 }
          }
          className="relative"
        >
          <motion.div
            animate={
              popped
                ? { opacity: [0.6, 0], scale: [1, 2.2] }
                : { opacity: 0, scale: 1 }
            }
            transition={{ duration: 0.7 }}
            className="absolute inset-0 rounded-full bg-yellow-200"
          />
          <Flame className="relative h-16 w-16 fill-yellow-200 text-yellow-100 drop-shadow-[0_3px_10px_rgba(255,200,50,0.55)] short-screen:h-12 short-screen:w-12" />
        </motion.div>

        <motion.span
          key={count}
          initial={popped ? { scale: 1.5, y: -6 } : false}
          animate={{ scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 14 }}
          className="text-8xl font-black tabular-nums text-white drop-shadow-[0_3px_0_rgba(0,0,0,0.15)] short-screen:text-6xl"
        >
          {count}
        </motion.span>
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-2 text-lg font-black uppercase tracking-[0.2em] text-white/90 short-screen:mt-1 short-screen:text-base roomy-screen:mt-4 tall-screen:mt-5"
      >
        day streak
      </motion.p>

      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={popped ? { opacity: 1, y: 0 } : {}}
        transition={{ delay: 0.35 }}
        className="mt-4 flex min-h-10 max-w-[34ch] items-center justify-center text-pretty text-center text-sm font-bold leading-snug text-white/85 short-screen:mt-2 short-screen:min-h-8 short-screen:text-xs roomy-screen:mt-6 tall-screen:mt-8"
      >
        {celebration.freezeConsumedDays.length > 0
          ? '❄️ A streak freeze covered your missed day. Welcome back!'
          : revealMessage}
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={popped ? { opacity: 1, y: 0 } : {}}
        transition={{ delay: 0.5 }}
        className="flex w-full justify-center"
      >
        <WeekStrip view={view} light />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={popped ? { opacity: 1, y: 0 } : {}}
        transition={{ delay: 0.7 }}
        className="mt-10 flex w-full justify-center short-screen:mt-4 roomy-screen:mt-12 tall-screen:mt-16"
      >
        <button
          type="button"
          onClick={onContinue}
          className="w-full max-w-[280px] rounded-2xl bg-white py-3.5 text-sm font-black uppercase tracking-wide text-amber-700 shadow-[0_5px_0_0_rgba(0,0,0,0.15)] transition-[transform,box-shadow,background-color] hover:bg-white/95 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-amber-500 active:translate-y-1 active:shadow-none short-screen:py-3"
        >
          Continue
        </button>
      </motion.div>
      </div>
    </div>
  );
}

function CommitStep({
  view,
  onPicked,
  onSkip,
}: {
  view: LoginStreakView;
  onPicked: (view: LoginStreakView) => void;
  onSkip: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const [busyDays, setBusyDays] = useState<number | null>(null);
  const [selectedDays, setSelectedDays] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pickGoal = async (days: number) => {
    if (busyDays !== null) return;
    setBusyDays(days);
    setError(null);
    try {
      const res = await fetch('/api/streak/goal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          days,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      if (res.ok) {
        const payload = await res.json();
        if (payload.view) {
          patchStreakView(payload.view);
          hapticImpact();
          onPicked(payload.view);
          return;
        }
      }
      setError('Could not start this goal. Try again.');
    } catch {
      setError('Could not start this goal. Try again.');
    } finally {
      setBusyDays(null);
    }
  };

  return (
    <div className="h-full overflow-x-hidden overflow-y-auto overscroll-contain bg-background">
      <div className="flex min-h-full w-full shrink-0 flex-col items-center justify-center px-3 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+3.5rem)] sm:px-6 short-screen:justify-start short-screen:pb-[calc(0.75rem+env(safe-area-inset-bottom))] short-screen:pt-[calc(0.75rem+env(safe-area-inset-top))] tall-screen:justify-start tall-screen:pt-[clamp(5rem,8vh,7rem)]">
        <motion.div
          initial={reduceMotion ? false : { scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-amber-100 dark:bg-amber-500/15 short-screen:h-14 short-screen:w-14"
          aria-hidden="true"
        >
          <Trophy className="h-10 w-10 text-amber-500 short-screen:h-7 short-screen:w-7" />
        </motion.div>

        <h2
          id="streak-goal-heading"
          className="mt-5 max-w-full text-balance text-center text-[clamp(1.5rem,7vw,1.875rem)] font-black tracking-tight text-foreground short-screen:mt-3"
        >
          Choose a streak goal
        </h2>
        <p
          id="streak-goal-hint"
          className="mt-2 max-w-[32ch] text-pretty text-center text-sm font-medium leading-snug text-muted-foreground short-screen:mt-1 short-screen:text-xs"
        >
          Check in each day to reach your goal and earn the reward
        </p>

        <fieldset
          className="mt-7 w-full max-w-sm short-screen:mt-4"
          aria-labelledby="streak-goal-heading"
          aria-describedby={`streak-goal-hint${error ? ' streak-goal-error' : ''}`}
          disabled={busyDays !== null}
        >
          <legend className="sr-only">Streak goal options</legend>
          <div className="space-y-2.5 short-screen:space-y-2">
            {view.goalTiers.map((tier, i) => {
              const selected = selectedDays === tier.days;
              const rewardId = `streak-goal-${tier.days}-reward`;
              return (
                <motion.div
                  key={tier.days}
                  initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: 0.08 * i,
                    type: 'spring',
                    stiffness: 300,
                    damping: 24,
                  }}
                >
                  <label className="block cursor-pointer">
                    <input
                      type="radio"
                      name="streak-goal"
                      value={tier.days}
                      checked={selected}
                      onChange={() => {
                        setSelectedDays(tier.days);
                        setError(null);
                      }}
                      aria-describedby={rewardId}
                      className="peer sr-only"
                    />
                    <span
                      className={cn(
                        'flex min-h-16 w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left shadow-sm transition-[transform,border-color,background-color,box-shadow] hover:border-amber-400 active:scale-[0.99] peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-disabled:cursor-wait peer-disabled:opacity-60 sm:min-h-20 sm:gap-4 sm:p-4',
                        selected
                          ? 'border-amber-400 bg-amber-50/70 shadow-md dark:bg-amber-500/10'
                          : 'border-border/60',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-[border-color,background-color]',
                          selected
                            ? 'border-amber-500 bg-amber-500'
                            : 'border-muted-foreground/40 bg-background',
                        )}
                      >
                        {selected && (
                          <span className="h-2 w-2 rounded-full bg-white" />
                        )}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <Flame
                            aria-hidden="true"
                            className="h-5 w-5 shrink-0 fill-orange-400 text-orange-500"
                          />
                          <span className="min-w-0 text-sm font-black text-foreground sm:text-base">
                            {tier.days}-day goal
                          </span>
                        </span>
                        <span
                          id={rewardId}
                          className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1 text-[11px] font-bold text-muted-foreground sm:text-xs"
                        >
                          <span>Reward</span>
                          <RewardVisuals rewards={tier.rewards} />
                        </span>
                      </span>
                    </span>
                  </label>
                </motion.div>
              );
            })}
          </div>
        </fieldset>

        {error && (
          <p
            id="streak-goal-error"
            role="alert"
            className="mt-3 max-w-sm text-center text-xs font-bold text-destructive"
          >
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={busyDays !== null}
          onClick={() => {
            if (selectedDays === null) {
              setError('Select a streak goal.');
              return;
            }
            void pickGoal(selectedDays);
          }}
          aria-live="polite"
          className="mt-4 flex h-12 w-full max-w-sm items-center justify-center rounded-2xl bg-primary px-4 text-sm font-black text-primary-foreground shadow-[0_4px_0_0_hsl(var(--primary)/0.6)] transition-[transform,box-shadow,filter] hover:brightness-110 active:translate-y-1 active:shadow-none disabled:cursor-wait disabled:opacity-60 short-screen:mt-3"
        >
          {busyDays !== null
            ? 'Starting…'
            : selectedDays !== null
              ? `Start ${selectedDays}-day goal`
              : 'Start goal'}
        </button>

        <button
          type="button"
          onClick={onSkip}
          disabled={busyDays !== null}
          className="mt-4 min-h-11 px-4 text-sm font-bold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60 short-screen:mt-2 short-screen:text-xs"
        >
          Choose later
        </button>
      </div>
    </div>
  );
}

function HomeStep({
  view,
  indices,
  frogReady,
  onBuyFreeze,
  onCommit,
  onDone,
}: {
  view: LoginStreakView;
  indices: Partial<Record<'skin' | 'hat' | 'body' | 'hand_item', number>>;
  frogReady: boolean;
  onBuyFreeze: () => void;
  onCommit: () => void;
  onDone: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center overflow-y-auto bg-background px-6 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+3rem)]">
      <div className="flex items-center gap-2">
        <Flame
          className={cn(
            'h-10 w-10',
            view.count > 0
              ? 'fill-orange-400 text-orange-500'
              : 'text-muted-foreground/40',
          )}
        />
        <span className="text-6xl font-black tabular-nums text-foreground">
          {view.count}
        </span>
      </div>
      <p className="mt-1 text-sm font-bold text-muted-foreground">
        day streak
        {view.longestStreak > 1 && (
          <span className="font-medium"> · best {view.longestStreak}</span>
        )}
        {!view.checkedInToday && view.count > 0 && (
          <span className="text-orange-500"> · check in today!</span>
        )}
      </p>

      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        className="-mt-8"
      >
        {frogReady ? (
          <Frog width={170} height={170} indices={indices} emote="love" />
        ) : (
          <div style={{ width: 170, height: 170 }} />
        )}
      </motion.div>

      <WeekStrip view={view} />

      <div className="mt-6 w-full max-w-sm rounded-2xl border border-border/60 bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-black text-foreground">
              <Snowflake className="h-4 w-4 text-sky-500" />
              Streak freezes
            </p>
            <p className="mt-0.5 text-xs font-medium text-muted-foreground">
              Auto-protects your streak when you miss a day.
            </p>
          </div>
          <div className="flex items-center gap-1">
            {Array.from({ length: view.freezeCap }, (_, i) => (
              <div
                key={i}
                className={cn(
                  'grid h-8 w-8 place-items-center rounded-full',
                  i < view.freezes
                    ? 'bg-sky-100 text-sky-500 dark:bg-sky-500/15'
                    : 'bg-muted/60 text-muted-foreground/30',
                )}
              >
                <Snowflake className="h-4 w-4" />
              </div>
            ))}
          </div>
        </div>
        {view.freezes < view.freezeCap && (
          <button
            type="button"
            onClick={onBuyFreeze}
            className="mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-sky-500 text-sm font-black text-white shadow-[0_3px_0_0_#0369a1] transition-all active:translate-y-0.5 active:shadow-none"
          >
            Get a freeze ·
            <Fly size={16} paused y={-1} />
            {view.freezePriceFlies}
          </button>
        )}
      </div>

      <div className="mt-3 w-full max-w-sm rounded-2xl border border-border/60 bg-card p-4">
        {view.goal ? (
          <>
            <p className="flex items-center gap-1.5 text-sm font-black text-foreground">
              <Trophy className="h-4 w-4 text-amber-500" />
              {view.goal.days}-day commitment
            </p>
            <div className="mt-2.5 h-3 overflow-hidden rounded-full bg-muted">
              <motion.div
                initial={{ width: 0 }}
                animate={{
                  width: `${Math.min(100, (view.goal.progress / view.goal.days) * 100)}%`,
                }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                className="h-full rounded-full bg-amber-400"
              />
            </div>
            <p className="mt-1.5 text-xs font-bold text-muted-foreground">
              {view.goal.progress} / {view.goal.days} days ·{' '}
              {rewardsLabel(
                view.goalTiers.find((t) => t.days === view.goal!.days)
                  ?.rewards ?? [],
              )}{' '}
              at the finish
            </p>
          </>
        ) : (
          <button
            type="button"
            onClick={onCommit}
            className="flex w-full items-center gap-3 text-left"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-100 dark:bg-amber-500/15">
              <Trophy className="h-5 w-5 text-amber-500" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black text-foreground">
                Make a commitment
              </span>
              <span className="block text-xs font-medium text-muted-foreground">
                Pick a goal, earn a reward at the finish.
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/40" />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onDone}
        className="mt-6 w-full max-w-sm shrink-0 rounded-2xl bg-primary py-3.5 text-sm font-black uppercase tracking-wide text-primary-foreground shadow-[0_5px_0_0_rgba(0,0,0,0.15)] transition-all active:translate-y-1 active:shadow-none"
      >
        Done
      </button>
    </div>
  );
}

export function StreakSheet({
  open,
  onOpenChange,
  celebration,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  celebration: CheckInResult | null;
}) {
  const { view: liveView } = useLoginStreak(open);
  const { data: inventoryData } = useInventory(open, true);
  const flyBalance = inventoryData?.wardrobe?.flies ?? 0;
  const { indices } = useWardrobeIndices(open);

  const view = liveView ?? celebration?.view ?? null;
  const hasRewardEvents =
    !!celebration &&
    ((celebration.milestoneEvents?.length ?? 0) > 0 || !!celebration.goalEvent);

  const [step, setStep] = useState<Step>('home');
  const [buyOpen, setBuyOpen] = useState(false);
  const [frogReady, setFrogReady] = useState(false);

  useRegisterOpenSheet(open);

  useEffect(() => {
    if (!open) return;
    setStep(celebration?.extended ? 'reveal' : 'home');
    const t = window.setTimeout(() => setFrogReady(true), 300);
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(t);
      setFrogReady(false);
      document.body.style.overflow = '';
    };
  }, [open, celebration]);

  const close = () => onOpenChange(false);

  // Celebration flows (reveal → rewards → commit) end by closing the sheet;
  // the detail page only shows when the user opens their streak directly.
  const advanceFromReveal = () => {
    if (hasRewardEvents) setStep('rewards');
    else if (view && !view.goal) setStep('commit');
    else close();
  };

  const advanceFromRewards = () => {
    if (view && !view.goal) setStep('commit');
    else close();
  };

  const finishCommit = () => {
    if (celebration) close();
    else setStep('home');
  };

  const handleBackdropClick = () => {
    if (buyOpen) return;
    close();
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && view && (
        <motion.div
          key="streak-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="fixed inset-0 z-[1400]"
        >
          <div className="absolute inset-0 bg-background md:bg-black/60 md:backdrop-blur-sm" />

          <div
            className="absolute inset-0 md:flex md:items-center md:justify-center md:p-6"
            onClick={handleBackdropClick}
          >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -60 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              onClick={(event) => event.stopPropagation()}
              className="mx-auto h-full w-full md:h-[min(720px,100%)] md:max-w-md md:overflow-hidden md:rounded-[32px] md:shadow-2xl"
            >
              {step === 'reveal' && celebration && (
                <RevealStep
                  celebration={celebration}
                  view={view}
                  indices={indices}
                  onContinue={advanceFromReveal}
                />
              )}
              {step === 'commit' && (
                <CommitStep
                  view={view}
                  onPicked={finishCommit}
                  onSkip={finishCommit}
                />
              )}
              {step === 'home' && (
                <HomeStep
                  view={view}
                  indices={indices}
                  frogReady={frogReady}
                  onBuyFreeze={() => setBuyOpen(true)}
                  onCommit={() => setStep('commit')}
                  onDone={() => onOpenChange(false)}
                />
              )}
            </motion.div>
          </AnimatePresence>
          </div>

          {step === 'rewards' && celebration && (
            <StreakCelebration
              open
              onClose={advanceFromRewards}
              result={celebration}
            />
          )}

          {(step === 'home' || step === 'commit') && (
            <button
              type="button"
              aria-label="Close streak"
              onClick={() =>
                step === 'commit' ? finishCommit() : onOpenChange(false)
              }
              className="absolute right-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-40 grid h-10 w-10 place-items-center rounded-full bg-muted/70 text-muted-foreground backdrop-blur transition-colors active:scale-95"
            >
              <X className="h-5 w-5" />
            </button>
          )}

          <FreezePurchaseSheet
            open={buyOpen}
            onClose={() => setBuyOpen(false)}
            view={view}
            balance={flyBalance}
            onPurchased={(freezes, balance) => {
              patchStreakView({ ...view, freezes });
              patchInventoryFlies(balance);
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
