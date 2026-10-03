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
  rewardLabel,
  type QuestRewardCatalogItem,
} from '@/components/ui/QuestCards';
import { rewardStackTileStyle } from '@/lib/questClaims';
import type { QuestReward } from '@/lib/quests/types';
import { openShieldSheet } from '@/hooks/useShields';
import { StreakCelebration } from './StreakCelebration';
import { maybeRequestAppRating } from '@/lib/rateApp';
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

const SPARKS = Array.from({ length: 10 }, (_, i) => {
  const angle = (i / 10) * Math.PI * 2 + 0.3;
  const distance = 54 + (i % 3) * 14;
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
    size: i % 2 ? 6 : 8,
  };
});

function TickerNumber({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <span
      className={cn(
        'relative -my-[0.2em] inline-grid overflow-hidden py-[0.2em]',
        className,
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={value}
          initial={reduceMotion ? { opacity: 0 } : { y: '70%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { y: '-70%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 360, damping: 24 }}
          className="col-start-1 row-start-1 block tabular-nums"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function weekRunState(view: LoginStreakView) {
  const today = localDayKey();
  const weekStart = addDaysToKey(
    today,
    -new Date(`${today}T12:00:00`).getDay(),
  );
  const days = Array.from({ length: 7 }, (_, i) => addDaysToKey(weekStart, i));
  let runStart: string | null = null;
  if (view.count > 0 && view.lastDayKey) {
    const frozen = new Set(view.shieldedDayKeys);
    let cursor = view.lastDayKey;
    let remaining = view.count;
    for (let i = view.count + frozen.size; i > 0; i--) {
      if (!frozen.has(cursor)) remaining -= 1;
      if (remaining <= 0) break;
      cursor = addDaysToKey(cursor, -1);
    }
    runStart = cursor;
  }
  return { today, days, runStart };
}

/**
 * The week as one chain: kept days are joined by a band that draws itself in,
 * and today's link lands last.
 */
function StreakChain({ view, play }: { view: LoginStreakView; play: boolean }) {
  const reduceMotion = useReducedMotion();
  const { today, days, runStart } = useMemo(() => weekRunState(view), [view]);
  const litIndexes = days
    .map((dayKey, i) =>
      (runStart && dayKey >= runStart && dayKey <= view.lastDayKey) ||
      view.shieldedDayKeys.includes(dayKey)
        ? i
        : -1,
    )
    .filter((i) => i >= 0);
  const first = litIndexes.length ? Math.min(...litIndexes) : -1;
  const last = litIndexes.length ? Math.max(...litIndexes) : -1;

  return (
    <div className="w-full">
      <div className="grid grid-cols-7" aria-hidden>
        {days.map((dayKey) => (
          <span
            key={dayKey}
            className={cn(
              'text-center text-[12px] font-black',
              dayKey === today ? 'text-white' : 'text-white/70',
            )}
          >
            {new Date(`${dayKey}T12:00:00`).toLocaleDateString(undefined, {
              weekday: 'narrow',
            })}
          </span>
        ))}
      </div>
      <ul
        aria-label="This week"
        className="relative mt-2 grid grid-cols-7 short-screen:mt-1.5"
      >
        {first >= 0 && (
          <motion.span
            aria-hidden
            initial={reduceMotion ? false : { scaleX: 0 }}
            animate={play ? { scaleX: 1 } : {}}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
            className="absolute inset-y-0 origin-left rounded-full bg-white/35"
            style={{
              left: `calc(${(first / 7) * 100}% + 2px)`,
              width: `calc(${((last - first + 1) / 7) * 100}% - 4px)`,
            }}
          />
        )}
        {days.map((dayKey, i) => {
          const frozen = view.shieldedDayKeys.includes(dayKey);
          const lit =
            !!runStart && dayKey >= runStart && dayKey <= view.lastDayKey;
          const isToday = dayKey === today;
          const future = dayKey > today;
          const pendingToday = isToday && !lit && !frozen;
          const longLabel = new Date(`${dayKey}T12:00:00`).toLocaleDateString(
            undefined,
            { weekday: 'long' },
          );
          const state = frozen
            ? 'covered by a Lily Pad'
            : lit
              ? 'streak kept'
              : pendingToday
                ? 'not done yet'
                : future
                  ? 'upcoming'
                  : 'missed';
          const landsLast = isToday && (lit || frozen);
          return (
            <li
              key={dayKey}
              aria-label={`${longLabel}${isToday ? ', today' : ''}, ${state}`}
              className="relative flex justify-center py-1"
            >
              <motion.span
                aria-hidden
                initial={reduceMotion ? false : { scale: landsLast ? 0 : 0.7, opacity: 0 }}
                animate={play || !landsLast ? { scale: 1, opacity: 1 } : {}}
                transition={{
                  type: 'spring',
                  stiffness: landsLast ? 520 : 420,
                  damping: landsLast ? 14 : 24,
                  delay: landsLast ? 0.55 : 0.04 * i,
                }}
                className={cn(
                  'grid h-9 w-9 place-items-center rounded-full short-screen:h-8 short-screen:w-8',
                  frozen
                    ? 'bg-white'
                    : lit
                      ? 'bg-white text-orange-500 shadow-[0_2px_0_0_rgba(124,45,18,0.25)]'
                      : pendingToday
                        ? 'bg-white/20 text-white ring-2 ring-white/80'
                        : future
                          ? 'bg-white/15'
                          : 'bg-orange-950/20 text-white/50',
                  isToday && (lit || frozen) && 'ring-[3px] ring-yellow-200',
                )}
              >
                {frozen ? (
                  <Icon name="lilyPad" className="h-4 w-4" />
                ) : lit || pendingToday ? (
                  <Flame className={cn('h-4 w-4', lit && 'fill-current')} />
                ) : future ? null : (
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                )}
              </motion.span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PledgeProgress({
  goal,
  rewards,
  rewardCatalog,
  isPremium,
}: {
  goal: NonNullable<LoginStreakView['goal']>;
  rewards?: LoginStreakReward[];
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const left = Math.max(0, goal.days - goal.progress);
  const ratio = goal.stepCount > 0 ? goal.stepsFilled / goal.stepCount : 0;
  const prize = rewards?.length
    ? pledgePrizeSummary(rewards, rewardCatalog, isPremium)
    : null;
  return (
    <div className="mt-4 border-t border-white/20 pt-4 text-left short-screen:mt-3 short-screen:pt-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-1.5 text-[14px] font-black text-white">
          <Trophy className="h-4 w-4" />
          {goal.days}-day pledge
        </span>
        <span className="text-[13px] font-bold text-white/85">
          {left === 0
            ? 'Prize ready'
            : `${left} ${left === 1 ? 'day' : 'days'} to go`}
        </span>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-orange-950/25">
        <motion.div
          initial={reduceMotion ? false : { scaleX: 0 }}
          animate={{ scaleX: ratio }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.9 }}
          className="h-full origin-left rounded-full bg-gradient-to-r from-yellow-200 to-white"
        />
      </div>
      {prize && (
        <p className="mt-2 text-[12px] font-bold text-white/80">
          Prize: {prize}
        </p>
      )}
    </div>
  );
}

function RevealStep({
  celebration,
  view,
  indices,
  rewardCatalog,
  isPremium,
  onContinue,
}: {
  celebration: CheckInResult;
  view: LoginStreakView;
  indices: Partial<Record<'skin' | 'hat' | 'body' | 'hand_item', number>>;
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  onContinue: () => void;
}) {
  const reduceMotion = useReducedMotion();
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
  const activeGoal =
    view.goal && view.goal.progress < view.goal.days ? view.goal : null;

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
        origin: { y: 0.3 },
        zIndex: 99999,
        colors: ['#fb923c', '#fbbf24', '#fde68a', '#ffffff'],
      });
      hapticCelebrate();
    }, 1000);
    return () => {
      window.clearTimeout(frogTimer);
      window.clearTimeout(popTimer);
    };
  }, [view.count]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-gradient-to-b from-orange-500 via-orange-400 to-orange-600">
      <div className="pointer-events-none absolute inset-0 opacity-[0.16]">
        <RotatingRays colorClass="text-white" />
      </div>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 38% at 50% 22%, rgba(255,237,160,0.55), rgba(255,237,160,0) 70%)',
        }}
      />

      <div className="no-scrollbar relative flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain px-6 pb-2 pt-[calc(env(safe-area-inset-top)+2.25rem)] short-screen:pt-[calc(env(safe-area-inset-top)+1rem)] md:px-8 md:pt-10">
        <div className="m-auto flex w-full max-w-sm shrink-0 flex-col items-center md:max-w-md">
          <div className="flex items-center gap-1 short-screen:gap-0.5">
            <div className="-mt-5 short-screen:-mt-3">
            <motion.div
              initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
              animate={
                popped
                  ? { scale: [1, 1.3, 1], rotate: [0, -8, 6, 0], opacity: 1 }
                  : { scale: 1, opacity: 1 }
              }
              transition={
                popped
                  ? { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
                  : { type: 'spring', stiffness: 300, damping: 18, delay: 0.2 }
              }
              className="relative grid place-items-center"
            >
              {popped && !reduceMotion && (
                <>
                  <motion.span
                    aria-hidden
                    initial={{ opacity: 0.7, scale: 0.6 }}
                    animate={{ opacity: 0, scale: 2.4 }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                    className="absolute h-16 w-16 rounded-full bg-yellow-100"
                  />
                  {SPARKS.map((spark, i) => (
                    <motion.span
                      key={i}
                      aria-hidden
                      initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
                      animate={{
                        x: spark.x,
                        y: spark.y,
                        opacity: 0,
                        rotate: 90,
                      }}
                      transition={{ duration: 0.65, ease: [0.2, 0.8, 0.3, 1] }}
                      className="absolute rounded-[2px] bg-yellow-100"
                      style={{ width: spark.size, height: spark.size }}
                    />
                  ))}
                </>
              )}
              <Flame
                className={cn(
                  'relative h-[84px] w-[84px] transition-[color,fill] duration-500 short-screen:h-16 short-screen:w-16',
                  popped
                    ? 'fill-yellow-200 text-yellow-50 drop-shadow-[0_0_18px_rgba(255,230,120,0.9)]'
                    : 'fill-white/25 text-white/50',
                )}
              />
            </motion.div>
            </div>

            <TickerNumber
              value={count}
              className="font-display text-[112px] leading-[0.95] tracking-wide text-white [filter:drop-shadow(0_5px_0_rgba(124,45,18,0.3))] short-screen:text-[84px]"
            />
          </div>

          <p className="-mt-1 font-display text-[26px] leading-none tracking-wide text-white [filter:drop-shadow(0_2px_0_rgba(124,45,18,0.3))] short-screen:text-[22px]">
            day streak
          </p>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={popped ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.25 }}
            className="mt-3 flex min-h-10 max-w-[32ch] items-center justify-center text-pretty text-center text-[15px] font-bold leading-snug text-white short-screen:mt-2 short-screen:min-h-8 short-screen:text-sm"
          >
            {celebration.shieldConsumedDays.length > 0
              ? 'A Lily Pad caught your missed day. Welcome back!'
              : revealMessage}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={popped ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.35, type: 'spring', stiffness: 260, damping: 24 }}
            className="mt-5 w-full rounded-[24px] bg-white/15 p-4 ring-1 ring-inset ring-white/25 backdrop-blur-sm short-screen:mt-3 short-screen:p-3"
          >
            <StreakChain view={view} play={popped} />
            {activeGoal && (
              <PledgeProgress
                goal={activeGoal}
                rewards={
                  view.goalTiers.find((tier) => tier.days === activeGoal.days)
                    ?.rewards
                }
                rewardCatalog={rewardCatalog}
                isPremium={isPremium}
              />
            )}
          </motion.div>
        </div>
      </div>

      <div className="relative shrink-0 px-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-[126px] short-screen:pb-[calc(0.75rem+env(safe-area-inset-bottom))] short-screen:pt-[98px] md:px-8 md:pb-7">
        <div className="relative mx-auto w-full max-w-[320px]">
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.85 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 240, damping: 20 }}
            className="pointer-events-none absolute inset-x-0 bottom-[calc(100%-11px)] z-20 flex justify-center short-screen:bottom-[calc(100%-10px)]"
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
            transition={{ delay: 0.6 }}
            className="relative z-10 w-full"
          >
            <button
              type="button"
              onClick={onContinue}
              className="w-full rounded-2xl bg-white py-4 text-[17px] font-black tracking-tight text-orange-600 shadow-[0_5px_0_0_#9a3412,0_12px_24px_-8px_rgba(124,45,18,0.55)] ring-1 ring-orange-900/10 transition-[transform,box-shadow] hover:bg-white/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-orange-500 active:translate-y-1 active:shadow-none short-screen:py-3.5"
            >
              Continue
            </button>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

const PLEDGE_NAMES: Record<number, string> = {
  7: 'Warm-up',
  14: 'Steady',
  30: 'Serious',
  50: 'Legend',
};

function pledgeName(days: number) {
  return PLEDGE_NAMES[days] ?? `${days} days`;
}

type PrizeRow = { key: string; tile: React.ReactNode; title: string; note?: string };

function pledgePrizeRows(
  rewards: LoginStreakReward[],
  days: number,
  rewardCatalog: Record<string, QuestRewardCatalogItem>,
  isPremium: boolean,
  paused: boolean,
): PrizeRow[] {
  const rows: PrizeRow[] = [];
  rewards.forEach((reward, index) => {
    if (isShieldReward(reward)) return;
    if ((reward as { type?: string }).type === 'SKIN_ROLL') return;
    const questReward = reward as QuestReward;
    const copies =
      questReward.type !== 'FLIES' && (questReward.amount ?? 1) > 1
        ? `${questReward.amount}× `
        : '';
    const flies =
      questReward.type === 'FLIES' ? Math.max(0, questReward.amount ?? 0) : 0;
    rows.push({
      key: `${index}-${questReward.type}-${questReward.itemId ?? ''}`,
      tile: (
        <RewardTile
          reward={questReward}
          rewardCatalog={rewardCatalog}
          isPremium={isPremium}
          compact
          hideBadge
          className="h-11 w-11 rounded-xl"
          flySize={30}
          hydrateDelayMs={index * 80}
          paused={paused}
        />
      ),
      title: `${copies}${rewardLabel(questReward, rewardCatalog, isPremium)}`,
      note:
        flies > 0 && days > 0
          ? `About ${Math.round((flies / days) * 10) / 10} a day`
          : undefined,
    });
  });
  const shields = rewards.reduce(
    (sum, reward) =>
      isShieldReward(reward) ? sum + ((reward as any).amount ?? 1) : sum,
    0,
  );
  if (shields > 0) {
    rows.push({
      key: 'shield',
      tile: <LilyPadTile count={shields} />,
      title: shields > 1 ? `${shields} Lily Pads` : 'Lily Pad',
      note: shields > 1 ? 'Each one saves a missed day' : 'Saves a missed day',
    });
  }
  const skinFloor = skinRollFloor(rewards);
  if (skinFloor) {
    rows.push({
      key: 'skin',
      tile: (
        <SkinRollTile
          minRarity={skinFloor}
          rewardCatalog={rewardCatalog}
          isPremium={isPremium}
        />
      ),
      title: `${SKIN_ROLL_RARITY_LABEL[skinFloor] ?? skinFloor} skin`,
      note: 'Guaranteed, and one you don’t own yet',
    });
  }
  return rows;
}

function pledgePrizeSummary(
  rewards: LoginStreakReward[],
  rewardCatalog: Record<string, QuestRewardCatalogItem>,
  isPremium: boolean,
) {
  return pledgePrizeRows(rewards, 0, rewardCatalog, isPremium, true)
    .map((row) => row.title)
    .join(', ');
}

function formatPledgeEnd(days: number) {
  const end = new Date(`${addDaysToKey(localDayKey(), days)}T12:00:00`);
  return end.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
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
  const lowestTierDays = view?.goalTiers?.length
    ? Math.min(...view.goalTiers.map((tier) => tier.days))
    : null;
  const stepUpTier = view?.goalTiers?.find(
    (tier) => tier.days === view.nextTierDays,
  );
  const steppingUpTo =
    stepUpTier &&
    stepUpTier.days !== lowestTierDays &&
    stepUpTier.repeatIndex === 0
      ? stepUpTier.days
      : null;
  useEffect(() => {
    if (selectedDays !== null) return;
    const suggested = view?.nextTierDays ?? view?.goalTiers?.[0]?.days ?? null;
    if (suggested !== null) setSelectedDays(suggested);
  }, [view?.nextTierDays, view?.goalTiers, selectedDays]);
  const [error, setError] = useState<string | null>(null);
  const selectedTier =
    view.goalTiers.find((tier) => tier.days === selectedDays) ?? null;

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
      setError('Could not start this pledge. Try again.');
    } catch {
      setError('Could not start this pledge. Try again.');
    } finally {
      setBusyDays(null);
    }
  };

  const rows = selectedTier
    ? pledgePrizeRows(
        selectedTier.rewards,
        selectedTier.days,
        rewardCatalog,
        isPremium,
        false,
      )
    : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div
        className="no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-4 pt-[calc(env(safe-area-inset-top)+3.5rem)] sm:px-6 short-screen:pt-[calc(0.75rem+env(safe-area-inset-top))] md:px-8 md:pt-10"
        style={{ contain: 'paint' }}
      >
        <div className="mx-auto flex w-full max-w-sm flex-col items-center">
          <h2
            id="streak-goal-heading"
            className="text-center text-[clamp(1.5rem,7vw,1.875rem)] font-black tracking-tight text-foreground"
          >
            Make a pledge
          </h2>
          <p
            id="streak-goal-hint"
            className="mt-1.5 max-w-[30ch] text-pretty text-center text-sm font-semibold leading-snug text-muted-foreground"
          >
            Get one thing done every day. Keep it up and the prize is yours.
          </p>

          <div className="mt-5 flex items-center gap-1 text-orange-500 short-screen:mt-3">
            <Flame className="h-12 w-12 fill-orange-400 short-screen:h-10 short-screen:w-10" />
            <TickerNumber
              value={selectedDays ?? 0}
              className="font-display text-[72px] leading-none tracking-wide text-orange-500 short-screen:text-[60px]"
            />
          </div>
          <p className="font-display text-xl leading-none tracking-wide text-orange-500/90">
            days in a row
          </p>
          {selectedDays !== null && (
            <span className="mt-2.5 rounded-full bg-orange-500/10 px-3 py-1 text-[13px] font-bold text-orange-700 dark:text-orange-300">
              Ends {formatPledgeEnd(selectedDays)}
            </span>
          )}

          <fieldset
            className="mt-5 w-full short-screen:mt-4"
            aria-labelledby="streak-goal-heading"
            aria-describedby={`streak-goal-hint${error ? ' streak-goal-error' : ''}`}
            disabled={busyDays !== null}
          >
            <legend className="sr-only">Pledge length</legend>
            <div className="grid grid-cols-4 gap-2">
              {view.goalTiers.map((tier) => {
                const selected = selectedDays === tier.days;
                return (
                  <label key={tier.days} className="relative block cursor-pointer">
                    <input
                      type="radio"
                      name="streak-goal"
                      value={tier.days}
                      checked={selected}
                      onChange={() => {
                        setSelectedDays(tier.days);
                        setError(null);
                      }}
                      className="peer sr-only"
                    />
                    {tier.days === steppingUpTo && (
                      <span className="absolute -top-2 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-black leading-none text-white shadow-sm">
                        Next up
                      </span>
                    )}
                    <span
                      className={cn(
                        'flex h-[72px] flex-col items-center justify-center rounded-2xl border-2 transition-[transform,background-color,border-color,box-shadow] duration-150 active:translate-y-[2px] peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-disabled:cursor-wait',
                        selected
                          ? 'border-orange-500 bg-orange-500 text-white shadow-[0_4px_0_0_#c2410c]'
                          : 'border-border/70 bg-card text-foreground shadow-[0_3px_0_0_rgba(0,0,0,0.08)] hover:border-orange-300',
                      )}
                    >
                      <span className="font-display text-[26px] leading-none tracking-wide">
                        {tier.days}
                      </span>
                      <span
                        className={cn(
                          'mt-1 text-[11px] font-black leading-none',
                          selected ? 'text-white/90' : 'text-muted-foreground',
                        )}
                      >
                        {tier.payoutPercent < 100
                          ? `${tier.payoutPercent}% prize`
                          : pledgeName(tier.days)}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-4 w-full rounded-[24px] border border-border/60 bg-card p-4 shadow-sm short-screen:mt-3 short-screen:p-3">
            <p className="text-[13px] font-black text-muted-foreground">
              {selectedDays !== null ? `Prize for ${selectedDays} days` : 'Prize'}
            </p>
            <AnimatePresence mode="wait" initial={false}>
              <motion.ul
                key={selectedDays ?? 'none'}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="mt-3 flex flex-col gap-3"
              >
                {settled
                  ? rows.map((row) => (
                      <li key={row.key} className="flex items-center gap-3">
                        <span className="grid h-11 w-11 shrink-0 place-items-center">
                          {row.tile}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[15px] font-black leading-tight text-foreground">
                            {row.title}
                          </span>
                          {row.note && (
                            <span className="mt-0.5 block text-[12px] font-semibold leading-tight text-muted-foreground">
                              {row.note}
                            </span>
                          )}
                        </span>
                      </li>
                    ))
                  : rows.map((row) => (
                      <li key={row.key} className="h-11" aria-hidden />
                    ))}
              </motion.ul>
            </AnimatePresence>
            {selectedTier && selectedTier.payoutPercent < 100 && (
              <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-[12px] font-bold leading-snug text-muted-foreground">
                You&apos;ve kept this pledge before, so its flies pay{' '}
                {selectedTier.payoutPercent}%. A longer one pays in full.
              </p>
            )}
          </div>

          <p className="mt-3 flex items-start gap-2 px-1 text-[12px] font-semibold leading-snug text-muted-foreground">
            <Icon name="lilyPad" className="mt-px h-4 w-4 shrink-0" />
            Miss a day and a Lily Pad can cover it. Breaking a pledge only
            costs the prize.
          </p>
        </div>
      </div>

      <div className="shrink-0 border-t border-border/60 bg-background px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 sm:px-6 short-screen:pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:px-8 md:pb-6">
        <div className="mx-auto flex w-full max-w-sm flex-col items-center">
          {error && (
            <p
              id="streak-goal-error"
              role="alert"
              className="mb-2 text-center text-xs font-bold text-destructive"
            >
              {error}
            </p>
          )}
          <button
            type="button"
            disabled={busyDays !== null}
            onClick={() => {
              if (selectedDays === null) {
                setError('Pick how many days to pledge.');
                return;
              }
              void pickGoal(selectedDays);
            }}
            aria-live="polite"
            className="flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 px-4 text-base font-black text-white shadow-[0_4px_0_0_#c2410c] transition-[transform,box-shadow,filter] hover:brightness-105 active:translate-y-1 active:shadow-none disabled:cursor-wait disabled:opacity-60"
          >
            <Flame className="h-5 w-5 fill-current" />
            {busyDays !== null
              ? 'Starting…'
              : selectedDays !== null
                ? `Pledge ${selectedDays} days`
                : 'Pledge'}
          </button>
          <button
            type="button"
            onClick={onSkip}
            disabled={busyDays !== null}
            className="mt-1 min-h-11 px-4 text-sm font-bold text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
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
    if (view && !view.goal) {
      setStep('commit');
      return;
    }
    close();
    maybeRequestAppRating('streak_goal');
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
                    rewardCatalog={rewardCatalog}
                    isPremium={isPremium}
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
