'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Flame, Snowflake, Trophy, X, ChevronRight } from 'lucide-react';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { RotatingRays } from '@/components/ui/gift-box/RotatingRays';
import { cn } from '@/lib/utils';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import { hapticCelebrate, hapticImpact } from '@/lib/haptics';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import {
  useLoginStreak,
  patchStreakView,
  addDaysToKey,
  localDayKey,
} from '@/hooks/useLoginStreak';
import { patchInventoryFlies, useInventory } from '@/hooks/useInventory';
import { Icon } from '@/components/ui/Icon';
import {
  RewardTile,
  type QuestRewardCatalogItem,
} from '@/components/ui/QuestCards';
import { rewardStackTileStyle } from '@/lib/questClaims';
import type { QuestReward } from '@/lib/quests/types';
import { openShieldSheet } from '@/hooks/useShields';
import { StreakCelebration } from './StreakCelebration';
import { streakRevealMessage } from '@/lib/streak/revealMessage';
import type {
  CheckInResult,
  LoginStreakReward,
  LoginStreakView,
} from '@/lib/streak/types';

type Step = 'reveal' | 'rewards' | 'commit' | 'home';

// `STREAK_FREEZE` is what tiers authored before the shield merge still say.
const isShieldReward = (reward: LoginStreakReward) =>
  reward.type === 'SHIELD' || (reward.type as string) === 'STREAK_FREEZE';

const SKIN_ROLL_RARITY_LABEL: Record<string, string> = {
  common: 'Common+',
  uncommon: 'Uncommon+',
  rare: 'Rare+',
  epic: 'Epic+',
  legendary: 'Legendary',
};

/** Matches REWARD_TILE_TONE, so the chip reads as the tile it is promising. */
const SKIN_ROLL_RARITY_CHIP: Record<string, string> = {
  common: 'border-slate-300/60 bg-slate-500/10 text-slate-600 dark:text-slate-300',
  uncommon:
    'border-emerald-400/50 bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
  rare: 'border-sky-400/50 bg-sky-500/12 text-sky-700 dark:text-sky-400',
  epic: 'border-violet-400/50 bg-violet-500/12 text-violet-700 dark:text-violet-400',
  legendary:
    'border-amber-400/50 bg-amber-500/12 text-amber-700 dark:text-amber-400',
};

function skinRollFloor(rewards: LoginStreakReward[]): string | null {
  const roll = rewards.find(
    (reward) => (reward as { type?: string }).type === 'SKIN_ROLL',
  ) as { minRarity?: string } | undefined;
  return roll?.minRarity ?? null;
}


const SKIN_ROLL_RARITY_ORDER = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
] as const;

const REWARD_TILE_FRAME =
  'relative flex h-11 w-11 items-center justify-center overflow-visible rounded-xl border-2 shadow-sm';

/** A Lily Pad in the same frame a reward tile uses — it is a prize, not a note. */
function LilyPadTile({ count }: { count: number }) {
  return (
    <span
      className={cn(
        REWARD_TILE_FRAME,
        'border-emerald-400 bg-gradient-to-br from-emerald-100 to-emerald-50 shadow-emerald-900/10 dark:from-emerald-900 dark:to-emerald-950',
      )}
      title={`${count} Lily Pad${count === 1 ? '' : 's'}`}
    >
      <Icon name="lilyPad" label="Lily Pad" className="h-7 w-7" />
      {count > 1 && (
        <span className="absolute -right-1.5 -top-1.5 z-30 flex min-w-5 items-center justify-center rounded-md border border-white/10 bg-black/55 px-1 text-[9px] font-bold leading-[16px] tracking-wide text-white shadow-sm backdrop-blur-sm">
          ×{count}
        </span>
      )}
    </span>
  );
}

/**
 * A guaranteed skin has no identity until it is drawn, so the tile shows what
 * the promise covers by cycling through the eligible wearables — the rarity is
 * fixed, the skin is not.
 */
function SkinRollTile({
  minRarity,
  rewardCatalog,
  isPremium,
}: {
  minRarity: string;
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const options = useMemo(() => {
    const floor = SKIN_ROLL_RARITY_ORDER.indexOf(
      minRarity as (typeof SKIN_ROLL_RARITY_ORDER)[number],
    );
    return Object.values(rewardCatalog)
      .filter(
        (item) =>
          item.slot !== 'container' &&
          item.slot !== 'background' &&
          SKIN_ROLL_RARITY_ORDER.indexOf(
            item.rarity as (typeof SKIN_ROLL_RARITY_ORDER)[number],
          ) >= Math.max(0, floor),
      )
      .map((item) => item.id);
  }, [rewardCatalog, minRarity]);

  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (reduceMotion || options.length <= 1) return;
    const timer = window.setInterval(() => {
      setShown((current) => {
        let next = current;
        while (next === current) {
          next = Math.floor(Math.random() * options.length);
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [reduceMotion, options.length]);

  const itemId = options[shown % Math.max(1, options.length)];
  if (!itemId) return null;

  return (
    <RewardTile
      reward={{ type: 'ITEM', itemId }}
      rewardCatalog={rewardCatalog}
      isPremium={isPremium}
      compact
      hideBadge
      className="h-11 w-11 rounded-xl"
      frogClassName="h-[142%] w-[142%] -translate-y-[20%]"
    />
  );
}

/**
 * A pledge's prizes drawn the way an objective's are: one fanned stack of
 * reward tiles. Lily Pads and guaranteed skins are not catalog items, so they
 * get purpose-built tiles, but they join the same fan rather than sitting off
 * to the side. The rarity promise rides beside the stack, never over the art.
 */
function PledgeRewardTiles({
  rewards,
  rewardCatalog,
  isPremium,
}: {
  rewards: LoginStreakReward[];
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
}) {
  const itemRewards = rewards.filter(
    (reward) =>
      !isShieldReward(reward) &&
      (reward as { type?: string }).type !== 'SKIN_ROLL',
  ) as QuestReward[];
  const shields = rewards.reduce(
    (sum, reward) =>
      isShieldReward(reward) ? sum + ((reward as any).amount ?? 1) : sum,
    0,
  );
  const skinFloor = skinRollFloor(rewards);

  const tiles: { key: string; node: React.ReactNode }[] = itemRewards
    .slice(0, 3)
    .map((reward, index) => ({
      key: `${index}-${reward.type}-${reward.itemId ?? ''}`,
      node: (
        <RewardTile
          reward={reward}
          rewardCatalog={rewardCatalog}
          isPremium={isPremium}
          compact
          className="h-11 w-11 rounded-xl"
          flySize={30}
          giftAnimation={index === 0 ? 'box_shake' : undefined}
        />
      ),
    }));
  if (shields > 0) {
    tiles.push({ key: 'shield', node: <LilyPadTile count={shields} /> });
  }
  if (skinFloor) {
    tiles.push({
      key: 'skin',
      node: (
        <SkinRollTile
          minRarity={skinFloor}
          rewardCatalog={rewardCatalog}
          isPremium={isPremium}
        />
      ),
    });
  }

  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <span className="relative flex shrink-0 items-center">
        {tiles.map((tile, index) => (
          <span
            key={tile.key}
            className="relative"
            style={rewardStackTileStyle(index, tiles.length)}
          >
            {tile.node}
          </span>
        ))}
      </span>
      {skinFloor && (
        <span
          className={cn(
            'shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-black',
            SKIN_ROLL_RARITY_CHIP[skinFloor] ?? SKIN_ROLL_RARITY_CHIP.rare,
          )}
        >
          {SKIN_ROLL_RARITY_LABEL[skinFloor] ?? skinFloor} skin
        </span>
      )}
    </span>
  );
}

function WeekStrip({
  view,
  light = false,
}: {
  view: LoginStreakView;
  light?: boolean;
}) {
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
    const frozen = new Set(view.shieldedDayKeys);
    let cursor = view.lastDayKey;
    let remaining = view.count;
    for (let i = view.count + frozen.size; i > 0; i--) {
      if (!frozen.has(cursor)) remaining -= 1;
      if (remaining <= 0) break;
      cursor = addDaysToKey(cursor, -1);
    }
    return cursor;
  }, [view.count, view.lastDayKey, view.shieldedDayKeys]);

  return (
    <div className="mt-6 grid w-full max-w-sm grid-cols-7 gap-1.5 short-screen:mt-3 short-screen:gap-1 md:mt-7">
      {days.map((dayKey, i) => {
        const frozen = view.shieldedDayKeys.includes(dayKey);
        const lit =
          !!runStart && dayKey >= runStart && dayKey <= view.lastDayKey;
        const isToday = dayKey === today;
        const label = new Date(`${dayKey}T12:00:00`).toLocaleDateString(
          undefined,
          { weekday: 'narrow' },
        );
        return (
          <div
            key={dayKey}
            className="flex flex-col items-center gap-1.5 short-screen:gap-1"
          >
            <span
              className={cn(
                'text-[12px] font-black',
                light
                  ? 'text-white drop-shadow-[0_1px_2px_rgba(124,45,18,0.6)]'
                  : 'text-muted-foreground',
              )}
            >
              {label}
            </span>
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                delay: 0.05 * i,
                type: 'spring',
                stiffness: 400,
                damping: 22,
              }}
              className={cn(
                'grid h-10 w-10 place-items-center rounded-full short-screen:h-8 short-screen:w-8',
                frozen
                  ? light
                    ? 'bg-white'
                    : 'bg-emerald-100 dark:bg-emerald-500/15'
                  : lit
                    ? light
                      ? 'bg-white text-orange-500'
                      : 'bg-orange-100 text-orange-500 dark:bg-orange-500/15'
                    : light
                      ? 'bg-orange-950/25 text-white/50'
                      : 'bg-muted/60 text-muted-foreground/40',
                isToday &&
                  (light
                    ? 'ring-2 ring-white ring-offset-2 ring-offset-transparent'
                    : 'ring-2 ring-primary'),
              )}
            >
              {frozen ? (
                <Icon name="lilyPad" label="Covered" className="h-4 w-4" />
              ) : lit ? (
                <Flame className="w-4 h-4 fill-current" />
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
  const shortScreen = useMediaQuery('(max-height: 800px)');
  const frogHeight = shortScreen ? 234 : 300;
  const frogWidth = Math.round((frogHeight * 128) / 144);
  const revealMessage = streakRevealMessage({
    count: view.count,
    longestStreak: view.longestStreak,
    nextTierDays: view.nextTierDays,
    dayOfWeek: new Date().getDay(),
  });

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
    <div className="relative flex flex-col flex-1 min-h-0 bg-gradient-to-b from-orange-500 via-amber-500 to-amber-600">
      <div className="absolute inset-0 pointer-events-none opacity-30">
        <RotatingRays colorClass="text-white" />
      </div>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 92% 52% at 50% 36%, rgba(124,45,18,0.32), rgba(124,45,18,0) 72%)',
        }}
      />

      <div className="no-scrollbar relative flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain px-6 pb-2 pt-[calc(env(safe-area-inset-top)+2rem)] short-screen:pt-[calc(env(safe-area-inset-top)+1rem)] md:px-8 md:pt-9">
        <div className="flex flex-col items-center w-full max-w-sm m-auto shrink-0 md:max-w-md">
          <div className="flex flex-col items-center min-w-0">
            <div className="relative flex items-center gap-3 short-screen:gap-2">
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
                    : {
                        type: 'spring',
                        stiffness: 320,
                        damping: 16,
                        delay: 0.35,
                      }
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
                  className="absolute inset-0 bg-yellow-200 rounded-full"
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
              className="mt-2 text-lg font-black text-white drop-shadow-[0_1px_3px_rgba(124,45,18,0.55)] short-screen:mt-1 short-screen:text-base"
            >
              day streak
            </motion.p>

            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={popped ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.35 }}
              className="mt-3 flex min-h-10 max-w-[34ch] items-center justify-center text-pretty text-center text-sm font-bold leading-snug text-white drop-shadow-[0_1px_3px_rgba(124,45,18,0.55)] short-screen:mt-2 short-screen:min-h-8 short-screen:text-xs"
            >
              {celebration.shieldConsumedDays.length > 0
                ? '🪷 A Lily Pad caught your missed day. Welcome back!'
                : revealMessage}
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={popped ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.5 }}
            className="flex justify-center w-full"
          >
            <WeekStrip view={view} light />
          </motion.div>
        </div>
      </div>

      <div className="relative shrink-0 px-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-[126px] short-screen:pb-[calc(0.75rem+env(safe-area-inset-bottom))] short-screen:pt-[98px] md:px-8 md:pb-7">
        <div className="relative mx-auto w-full max-w-[320px]">
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.85 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 240, damping: 20 }}
            className="pointer-events-none absolute inset-x-0 bottom-[calc(100%-11px)] z-20 flex justify-center short-screen:bottom-[calc(100%-10px)] md:bottom-[calc(100%-12px)]"
          >
            {frogReady && (
              <Frog
                ref={frogRef}
                width={frogWidth}
                height={frogHeight}
                indices={indices}
                emote="love"
              />
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={popped ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.7 }}
            className="relative z-10 w-full"
          >
            <button
              type="button"
              onClick={onContinue}
              className="w-full rounded-2xl bg-white py-4 text-base font-black tracking-wide text-amber-700 shadow-[0_5px_0_0_rgba(0,0,0,0.15)] transition-[transform,box-shadow,background-color] hover:bg-white/95 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-amber-500 active:translate-y-1 active:shadow-none short-screen:py-3.5"
            >
              Continue
            </button>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function CommitStep({
  view,
  rewardCatalog,
  isPremium,
  onPicked,
  onSkip,
}: {
  view: LoginStreakView;
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  onPicked: (view: LoginStreakView) => void;
  onSkip: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const [busyDays, setBusyDays] = useState<number | null>(null);
  const [selectedDays, setSelectedDays] = useState<number | null>(null);
  // `nextTierDays` is the rung above the longest pledge ever kept, so on a first
  // pledge it is simply the lowest rung — badging that says nothing the
  // pre-selected radio does not already say. It only carries information once
  // there is a kept rung to step past.
  const lowestTierDays = view?.goalTiers?.length
    ? Math.min(...view.goalTiers.map((tier) => tier.days))
    : null;
  const stepUpTier = view?.goalTiers?.find(
    (tier) => tier.days === view.nextTierDays,
  );
  const steppingUpTo =
    stepUpTier &&
    stepUpTier.days !== lowestTierDays &&
    // At the top of the ladder `nextTierDays` falls back to the last rung, so
    // without this it would badge "step up" on a rung already kept.
    stepUpTier.repeatIndex === 0
      ? stepUpTier.days
      : null;
  // The rung above the longest pledge kept so far arrives pre-selected, so the
  // ladder offers the next step rather than asking the user to find it.
  useEffect(() => {
    if (selectedDays !== null) return;
    const suggested = view?.nextTierDays ?? null;
    if (suggested !== null) setSelectedDays(suggested);
  }, [view?.nextTierDays, selectedDays]);
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
    <div className="flex flex-col flex-1 min-h-0 bg-background">
      <div className="no-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 pb-4 pt-[calc(env(safe-area-inset-top)+3.5rem)] sm:px-6 short-screen:pt-[calc(0.75rem+env(safe-area-inset-top))] md:px-8 md:pt-9">
        <div className="flex flex-col items-center w-full max-w-sm mx-auto md:max-w-xl">
          <motion.div
            initial={reduceMotion ? false : { scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="grid w-20 h-20 rounded-full shrink-0 place-items-center bg-amber-100 dark:bg-amber-500/15 short-screen:h-14 short-screen:w-14"
            aria-hidden="true"
          >
            <Trophy className="w-10 h-10 text-amber-500 short-screen:h-7 short-screen:w-7" />
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
            className="w-full mt-7 short-screen:mt-4"
            aria-labelledby="streak-goal-heading"
            aria-describedby={`streak-goal-hint${error ? ' streak-goal-error' : ''}`}
            disabled={busyDays !== null}
          >
            <legend className="sr-only">Streak goal options</legend>
            <div className="grid grid-cols-1 gap-2.5 short-screen:gap-2 md:grid-cols-2 md:gap-3">
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
                        className="sr-only peer"
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
                            <span className="w-2 h-2 bg-white rounded-full" />
                          )}
                        </span>

                        <span className="flex-1 min-w-0">
                          <span className="flex items-center min-w-0 gap-2">
                            <Flame
                              aria-hidden="true"
                              className="w-5 h-5 text-orange-500 shrink-0 fill-orange-400"
                            />
                            <span className="min-w-0 text-sm font-black text-foreground sm:text-base">
                              {tier.days}-day pledge
                            </span>
                            {tier.days === steppingUpTo && (
                              <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-black text-emerald-600 dark:text-emerald-400">
                                Step up
                              </span>
                            )}
                            {tier.payoutPercent < 100 && (
                              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-black text-muted-foreground">
                                {tier.payoutPercent}%
                              </span>
                            )}
                          </span>
                          <span
                            id={rewardId}
                            className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1 text-[11px] font-bold text-muted-foreground sm:text-xs"
                          >
                            <PledgeRewardTiles
                              rewards={tier.rewards}
                              rewardCatalog={rewardCatalog}
                              isPremium={isPremium}
                            />
                            {tier.payoutPercent < 100 && (
                              <span className="text-muted-foreground/70">
                                · repeat rung, step up for full price
                              </span>
                            )}
                          </span>
                        </span>
                      </span>
                    </label>
                  </motion.div>
                );
              })}
            </div>
          </fieldset>
        </div>
      </div>

      <div className="shrink-0 border-t border-border/60 bg-background px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 sm:px-6 short-screen:pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:px-8 md:pb-6">
        <div className="flex flex-col items-center w-full max-w-sm mx-auto">
          {error && (
            <p
              id="streak-goal-error"
              role="alert"
              className="mb-2 text-xs font-bold text-center text-destructive"
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
            className="flex h-12 w-full items-center justify-center rounded-2xl bg-primary px-4 text-sm font-black text-primary-foreground shadow-[0_4px_0_0_hsl(var(--primary)/0.6)] transition-[transform,box-shadow,filter] hover:brightness-110 active:translate-y-1 active:shadow-none disabled:cursor-wait disabled:opacity-60"
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
            className="px-4 mt-2 text-sm font-bold min-h-11 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60 short-screen:mt-1 short-screen:text-xs"
          >
            Choose later
          </button>
        </div>
      </div>
    </div>
  );
}

function HomeStep({
  view,
  indices,
  frogReady,
  rewardCatalog,
  isPremium,
  onGetLilyPad,
  onCommit,
  onDone,
}: {
  view: LoginStreakView;
  indices: Partial<Record<'skin' | 'hat' | 'body' | 'hand_item', number>>;
  frogReady: boolean;
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  onGetLilyPad: () => void;
  onCommit: () => void;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-col flex-1 min-h-0 bg-background">
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-4 pt-[calc(env(safe-area-inset-top)+3rem)] short-screen:pt-[calc(env(safe-area-inset-top)+1rem)] md:px-8 md:pt-9">
        <div className="flex flex-col items-center w-full max-w-sm mx-auto md:max-w-xl">
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

          <div className="grid w-full gap-3 mt-6 md:grid-cols-2">
            <div className="w-full p-4 border rounded-2xl border-border/60 bg-card">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-black text-foreground">
                    <Icon name="lilyPad" className="h-5 w-5" />
                    Lily Pads
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                    Catches your streak by itself the day you miss.
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {Array.from({ length: view.shieldCap }, (_, i) => (
                    <div
                      key={i}
                      className={cn(
                        'grid h-10 w-10 place-items-center rounded-full',
                        i < view.shields
                          ? 'bg-emerald-100 dark:bg-emerald-500/15'
                          : 'bg-muted/60 opacity-30 grayscale',
                      )}
                    >
                      <Icon name="lilyPad" className="h-6 w-6" />
                    </div>
                  ))}
                </div>
              </div>
              {view.shields < view.shieldCap && (
                <button
                  type="button"
                  onClick={onGetLilyPad}
                  className="mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[#4f9149] text-sm font-black text-white shadow-[0_3px_0_0_#3b7a38] transition-all active:translate-y-0.5 active:shadow-none"
                >
                  Get a Lily Pad
                </button>
              )}
            </div>

            <div className="w-full p-4 border rounded-2xl border-border/60 bg-card">
              {view.goal ? (
                <>
                  <p className="flex items-center gap-1.5 text-sm font-black text-foreground">
                    <Trophy className="w-4 h-4 text-amber-500" />
                    {view.goal.days}-day commitment
                  </p>
                  {/* Endowed progress: the pledge itself is step one, already
                      filled, so the bar never starts at nothing. */}
                  <div className="mt-2.5 flex gap-1">
                    {Array.from({ length: view.goal.stepCount }).map((_, step) => (
                      <motion.span
                        key={step}
                        initial={{ opacity: 0.4, scaleY: 0.6 }}
                        animate={{ opacity: 1, scaleY: 1 }}
                        transition={{
                          duration: 0.3,
                          delay: Math.min(0.4, step * 0.02),
                        }}
                        className={cn(
                          'h-3 min-w-0 flex-1 rounded-full',
                          step < view.goal!.stepsFilled
                            ? step === 0
                              ? 'bg-emerald-400'
                              : 'bg-amber-400'
                            : 'bg-muted',
                        )}
                      />
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs font-bold text-muted-foreground">
                    <span className="text-emerald-600 dark:text-emerald-400">
                      You made the pledge ✓
                    </span>{' '}
                    · {view.goal.progress} / {view.goal.days} days
                    {view.goal.payoutPercent < 100
                      ? ` · ${view.goal.payoutPercent}% (repeat rung)`
                      : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <PledgeRewardTiles
                      rewards={
                        view.goalTiers.find((t) => t.days === view.goal!.days)
                          ?.rewards ?? []
                      }
                      rewardCatalog={rewardCatalog}
                      isPremium={isPremium}
                    />
                    <span className="whitespace-nowrap text-[11px] font-bold text-muted-foreground">
                      at the finish
                    </span>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={onCommit}
                  className="flex items-center w-full gap-3 text-left"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-100 dark:bg-amber-500/15">
                    <Trophy className="w-5 h-5 text-amber-500" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-black text-foreground">
                      Make a commitment
                    </span>
                    <span className="block text-xs font-medium text-muted-foreground">
                      Pick a goal, earn a reward at the finish.
                    </span>
                  </span>
                  <ChevronRight className="w-5 h-5 shrink-0 text-muted-foreground/40" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-border/60 bg-background px-6 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 short-screen:pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:px-8 md:pb-6">
        <button
          type="button"
          onClick={onDone}
          className="mx-auto block w-full max-w-sm rounded-2xl bg-primary py-3.5 text-sm font-black tracking-wide text-primary-foreground shadow-[0_5px_0_0_rgba(0,0,0,0.15)] transition-all active:translate-y-1 active:shadow-none"
        >
          Done
        </button>
      </div>
    </div>
  );
}

export function StreakSheet({
  open,
  onOpenChange,
  celebration,
  commitIntent = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  celebration: CheckInResult | null;
  commitIntent?: boolean;
}) {
  const { view: liveView } = useLoginStreak(open);
  // Full catalog, not the owned-items summary: reward tiles resolve art by id,
  // so gift boxes rendered as blank tiles and the guaranteed-skin pool came up
  // empty for any rarity the user happened not to own yet.
  const { data: inventoryData } = useInventory(open);
  const flyBalance = inventoryData?.wardrobe?.flies ?? 0;
  const isPremium = inventoryData?.isPremium ?? false;
  // Reward tiles resolve item art by id, and the inventory payload already
  // carries the catalog, so the pledge prizes need no second fetch.
  const rewardCatalog = useMemo<Record<string, QuestRewardCatalogItem>>(
    () =>
      Object.fromEntries(
        (inventoryData?.catalog ?? []).map((item) => [item.id, item]),
      ),
    [inventoryData?.catalog],
  );
  const { indices } = useWardrobeIndices(open);

  const view = liveView ?? celebration?.view ?? null;
  const hasRewardEvents = !!celebration?.goalEvent;

  const [step, setStep] = useState<Step>('home');
  const [buyOpen, setBuyOpen] = useState(false);
  const [frogReady, setFrogReady] = useState(false);

  useRegisterOpenSheet(open);

  useEffect(() => {
    if (!open) return;
    setStep(
      commitIntent && !liveView?.goal
        ? 'commit'
        : celebration?.extended
          ? 'reveal'
          : 'home',
    );
    const t = window.setTimeout(() => setFrogReady(true), 300);
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(t);
      setFrogReady(false);
      document.body.style.overflow = '';
    };
  }, [open, celebration, commitIntent, liveView?.goal]);

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

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || buyOpen) return;
      event.stopPropagation();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, buyOpen, onOpenChange]);

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
          className="pointer-events-auto fixed inset-0 z-[1400] overflow-hidden"
        >
          <div className="absolute inset-0 bg-background md:bg-black/60 md:backdrop-blur-sm" />

          <div
            className="absolute inset-0 md:flex md:items-center md:justify-center md:p-6"
            onClick={handleBackdropClick}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={step}
                role="dialog"
                aria-modal="true"
                aria-label="Daily streak"
                initial={{ opacity: 0, x: 60 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -60 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                onClick={(event) => event.stopPropagation()}
                className="relative mx-auto flex h-full w-full flex-col overflow-hidden md:h-auto md:max-h-[min(40rem,calc(100dvh-3rem))] md:w-[min(100%,40rem)] md:rounded-[32px] md:shadow-2xl"
              >
                {(step === 'home' || step === 'commit') && (
                  <button
                    type="button"
                    aria-label="Close streak"
                    onClick={() =>
                      step === 'commit' ? finishCommit() : onOpenChange(false)
                    }
                    className="absolute right-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-40 grid h-10 w-10 place-items-center rounded-full bg-muted/70 text-muted-foreground backdrop-blur transition-colors hover:bg-muted active:scale-95 md:top-4"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}

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
                    rewardCatalog={rewardCatalog}
                    isPremium={isPremium}
                    onPicked={finishCommit}
                    onSkip={finishCommit}
                  />
                )}
                {step === 'home' && (
                  <HomeStep
                    view={view}
                    indices={indices}
                    frogReady={frogReady}
                    rewardCatalog={rewardCatalog}
                    isPremium={isPremium}
                    onGetLilyPad={() => openShieldSheet()}
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
              <X className="w-5 h-5" />
            </button>
          )}

        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
