'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { usePathname, useRouter } from 'next/navigation';
import { Flame, Snowflake, Trophy, X, ChevronRight } from 'lucide-react';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { RotatingRays } from '@/components/ui/gift-box/RotatingRays';
import { cn } from '@/lib/utils';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import { hapticCelebrate, hapticImpact } from '@/lib/haptics';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useSettled } from '@/hooks/useSettled';
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
  hydrateDelayMs = 0,
  paused = false,
}: {
  rewards: LoginStreakReward[];
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  /** Staggered so four tiers' worth of artwork never parses in one frame. */
  hydrateDelayMs?: number;
  /** Only the selected tier animates; the rest hold a still frame. */
  paused?: boolean;
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
          hydrateDelayMs={hydrateDelayMs + index * 90}
          paused={paused}
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
    <ul
      aria-label="This week"
      className="mt-6 grid w-full max-w-sm grid-cols-7 gap-1.5 short-screen:mt-3 short-screen:gap-1 md:mt-7"
    >
      {days.map((dayKey, i) => {
        const frozen = view.shieldedDayKeys.includes(dayKey);
        const lit =
          !!runStart && dayKey >= runStart && dayKey <= view.lastDayKey;
        const isToday = dayKey === today;
        const future = dayKey > today;
        const pendingToday = isToday && !lit && !frozen;
        const date = new Date(`${dayKey}T12:00:00`);
        const label = date.toLocaleDateString(undefined, { weekday: 'narrow' });
        const longLabel = date.toLocaleDateString(undefined, { weekday: 'long' });
        const state = frozen
          ? 'covered by a Lily Pad'
          : lit
            ? 'streak kept'
            : pendingToday
              ? 'not done yet'
              : future
                ? 'upcoming'
                : 'no streak';
        return (
          <li
            key={dayKey}
            aria-label={`${longLabel}${isToday ? ', today' : ''}, ${state}`}
            className="flex flex-col items-center gap-1.5 short-screen:gap-1"
          >
            <span
              aria-hidden
              className={cn(
                'text-[12px] font-black',
                light
                  ? 'text-white drop-shadow-[0_1px_2px_rgba(124,45,18,0.6)]'
                  : isToday
                    ? 'text-foreground'
                    : 'text-muted-foreground',
              )}
            >
              {label}
            </span>
            <motion.div
              aria-hidden
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
                    : pendingToday
                      ? light
                        ? 'border-2 border-dashed border-white text-white/80'
                        : 'border-2 border-dashed border-orange-400 text-orange-400'
                      : future
                        ? light
                          ? 'border-2 border-dashed border-white/40'
                          : 'border-2 border-dashed border-border'
                        : light
                          ? 'bg-orange-950/25 text-white/60'
                          : 'bg-muted text-muted-foreground',
                isToday &&
                  !pendingToday &&
                  (light
                    ? 'ring-2 ring-white ring-offset-2 ring-offset-transparent'
                    : 'ring-2 ring-orange-400 ring-offset-2 ring-offset-background'),
              )}
            >
              {frozen ? (
                <Icon name="lilyPad" className="h-4 w-4" />
              ) : lit ? (
                <Flame className="w-4 h-4 fill-current" />
              ) : pendingToday ? (
                <Flame className="w-4 h-4" />
              ) : future ? null : (
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
              )}
            </motion.div>
          </li>
        );
      })}
    </ul>
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
  const settled = useSettled();
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
      <div
        className="no-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 pb-4 pt-[calc(env(safe-area-inset-top)+3.5rem)] sm:px-6 short-screen:pt-[calc(0.75rem+env(safe-area-inset-top))] md:px-8 md:pt-9"
        style={{ contain: 'paint' }}
      >
        <div className="flex flex-col items-center w-full max-w-sm mx-auto md:max-w-xl">
          <motion.div
            initial={reduceMotion ? false : { scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="grid w-20 h-20 rounded-full shrink-0 place-items-center bg-amber-100 will-change-transform dark:bg-amber-500/15 short-screen:h-14 short-screen:w-14"
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
            Finish a task each day to reach your goal and earn the reward
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
                    initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      type: 'spring',
                      stiffness: 400,
                      damping: 30,
                      mass: 0.7,
                      delay: i * 0.045,
                    }}
                    className="will-change-transform"
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
                            {settled ? (
                              <motion.span
                                initial={reduceMotion ? false : { opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.2, ease: 'easeOut' }}
                                className="flex min-w-0 flex-1 items-center"
                              >
                                <PledgeRewardTiles
                                  rewards={tier.rewards}
                                  rewardCatalog={rewardCatalog}
                                  isPremium={isPremium}
                                  hydrateDelayMs={i * 90}
                                  paused={!selected}
                                />
                              </motion.span>
                            ) : (
                              <span aria-hidden className="block h-11" />
                            )}
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
  onGoToTasks,
}: {
  view: LoginStreakView;
  indices: Partial<Record<'skin' | 'hat' | 'body' | 'hand_item', number>>;
  frogReady: boolean;
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  onGetLilyPad: () => void;
  onCommit: () => void;
  onDone: () => void;
  onGoToTasks: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const atRisk = !view.checkedInToday && view.count > 0;
  const toBeat = view.longestStreak - view.count + 1;
  const goal = view.goal;
  const goalPct = goal
    ? Math.min(100, Math.max(4, (goal.stepsFilled / Math.max(1, goal.stepCount)) * 100))
    : 0;
  const daysLeft = goal ? Math.max(0, goal.days - goal.progress) : 0;

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-background">
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 pt-[calc(env(safe-area-inset-top)+2.25rem)] short-screen:pt-[calc(env(safe-area-inset-top)+1rem)] md:px-8 md:pt-8">
        <div className="flex flex-col items-center w-full max-w-sm mx-auto md:max-w-xl">
          <h2 className="flex flex-col items-center">
            <span className="flex items-center gap-1.5">
              <Flame
                aria-hidden
                className={cn(
                  'h-9 w-9',
                  view.count > 0
                    ? 'fill-orange-400 text-orange-500'
                    : 'text-muted-foreground/60',
                )}
              />
              <span className="text-5xl font-black tabular-nums leading-none text-foreground">
                {view.count}
              </span>
            </span>
            <span className="mt-1 text-sm font-bold text-muted-foreground">
              day streak
              {view.longestStreak > 1 && (
                <span className="font-medium"> · best {view.longestStreak}</span>
              )}
            </span>
          </h2>
          {atRisk ? (
            <p className="mt-1 rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-black text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
              Finish a task today to keep it
            </p>
          ) : view.count > 1 && view.count >= view.longestStreak ? (
            <p className="mt-1 text-xs font-black text-orange-600 dark:text-orange-400">
              Personal best — keep going!
            </p>
          ) : view.longestStreak > 1 && toBeat > 0 ? (
            <p className="mt-1 text-xs font-bold text-muted-foreground">
              {toBeat} more {toBeat === 1 ? 'day' : 'days'} to beat your best
            </p>
          ) : null}

          <motion.div
            aria-hidden
            animate={reduceMotion ? undefined : { y: [0, -5, 0] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
            className="mb-1 -mt-14 short-screen:-mt-16"
          >
            {frogReady ? (
              <Frog width={196} height={196} indices={indices} emote="love" />
            ) : (
              <div style={{ width: 196, height: 196 }} />
            )}
          </motion.div>

          <WeekStrip view={view} />

          <div className="mt-5 grid w-full gap-2.5 md:grid-cols-2">
            <div className="flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-card px-3.5 py-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 dark:bg-emerald-500/15">
                <Icon name="lilyPad" className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-black text-foreground">
                  Lily Pads
                  <span
                    className="flex items-center gap-1"
                    role="img"
                    aria-label={`${view.shields} of ${view.shieldCap}`}
                  >
                    {Array.from({ length: view.shieldCap }, (_, i) => (
                      <span
                        key={i}
                        className={cn(
                          'h-2 w-2 rounded-full',
                          i < view.shields
                            ? 'bg-emerald-500'
                            : 'border border-muted-foreground/50',
                        )}
                      />
                    ))}
                  </span>
                </p>
                <p className="text-xs font-medium leading-snug text-muted-foreground">
                  Saves your streak on a day you miss.
                </p>
              </div>
              {view.shields < view.shieldCap && (
                <button
                  type="button"
                  onClick={onGetLilyPad}
                  className="flex min-h-10 shrink-0 items-center gap-0.5 rounded-xl px-2.5 text-[13px] font-black text-emerald-700 transition-colors hover:bg-emerald-500/10 active:scale-95 dark:text-emerald-400"
                >
                  Get more
                  <ChevronRight aria-hidden className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="w-full rounded-2xl border border-border/60 bg-card px-3.5 py-3">
              {goal ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-sm font-black text-foreground">
                      <Trophy aria-hidden className="w-4 h-4 text-amber-500" />
                      {goal.days}-day pledge
                    </p>
                    <p className="text-xs font-black tabular-nums text-muted-foreground">
                      {goal.progress} / {goal.days}
                    </p>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={`${goal.days}-day pledge`}
                    aria-valuemin={0}
                    aria-valuemax={goal.days}
                    aria-valuenow={goal.progress}
                    aria-valuetext={`${goal.progress} of ${goal.days} days`}
                    className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted"
                  >
                    <motion.div
                      initial={reduceMotion ? false : { width: 0 }}
                      animate={{ width: `${goalPct}%` }}
                      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-amber-400"
                    />
                  </div>
                  <p className="mt-1.5 text-xs font-bold text-muted-foreground">
                    <span className="text-emerald-700 dark:text-emerald-400">
                      Pledge made ✓
                    </span>
                    {' · '}
                    {daysLeft} {daysLeft === 1 ? 'day' : 'days'} to go
                    {goal.payoutPercent < 100
                      ? ` · ${goal.payoutPercent}% flies (repeat)`
                      : ''}
                  </p>
                  <div className="mt-2.5 flex items-center gap-2.5 border-t border-border/50 pt-2.5">
                    <span className="shrink-0 text-xs font-black text-muted-foreground">
                      Finish prize
                    </span>
                    <PledgeRewardTiles
                      rewards={
                        view.goalTiers.find((t) => t.days === goal.days)
                          ?.rewards ?? []
                      }
                      rewardCatalog={rewardCatalog}
                      isPremium={isPremium}
                    />
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={onCommit}
                  className="flex items-center w-full gap-3 text-left"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 dark:bg-amber-500/15">
                    <Trophy aria-hidden className="w-5 h-5 text-amber-500" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-black text-foreground">
                      Make a commitment
                    </span>
                    <span className="block text-xs font-medium text-muted-foreground">
                      Pick a goal, earn a reward at the finish.
                    </span>
                  </span>
                  <ChevronRight aria-hidden className="w-5 h-5 shrink-0 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-border/60 bg-background px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 short-screen:pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:px-8 md:pb-6">
        <button
          type="button"
          onClick={atRisk ? onGoToTasks : onDone}
          className={cn(
            'mx-auto flex w-full max-w-sm items-center justify-center gap-1.5 rounded-2xl py-3.5 text-sm font-black tracking-wide transition-all active:translate-y-1 active:shadow-none',
            atRisk
              ? 'bg-orange-500 text-white shadow-[0_5px_0_0_#c2410c]'
              : 'bg-primary text-primary-foreground shadow-[0_5px_0_0_rgba(0,0,0,0.15)]',
          )}
        >
          {atRisk && <Flame aria-hidden className="h-4 w-4 fill-current" />}
          {atRisk ? 'Go to my tasks' : 'Done'}
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
  const router = useRouter();
  const pathname = usePathname();
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
                className="relative mx-auto flex h-full w-full transform-gpu flex-col overflow-hidden will-change-transform [backface-visibility:hidden] md:h-auto md:max-h-[min(40rem,calc(100dvh-3rem))] md:w-[min(100%,40rem)] md:rounded-[32px] md:shadow-2xl"
              >
                {(step === 'home' || step === 'commit') && (
                  <button
                    type="button"
                    aria-label="Close streak"
                    onClick={() =>
                      step === 'commit' ? finishCommit() : onOpenChange(false)
                    }
                    className="absolute right-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-40 grid h-11 w-11 place-items-center rounded-full bg-muted/70 text-muted-foreground backdrop-blur transition-colors hover:bg-muted active:scale-95 md:top-4"
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
                    onGoToTasks={() => {
                      onOpenChange(false);
                      if (pathname !== '/') router.push('/');
                    }}
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


        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
