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
import { hapticCelebrate, hapticImpact, hapticSelect } from '@/lib/haptics';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useSettled } from '@/hooks/useSettled';
import { SheetEnteredContext } from '@/lib/sheetEntered';
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
import { CATALOG } from '@/lib/skins/catalog';
import { warmFrogStamps, type FrogStampIndices } from '@/lib/frogStampEngine';
import { riveDevicePixelRatio } from '@/lib/riveLoader';
import { announcePledgeMade } from '@/lib/widget/prompt';
import type { QuestReward } from '@/lib/quests/types';
import { openShieldSheet } from '@/hooks/useShields';
import { StreakCelebration } from './StreakCelebration';
import { maybeRequestAppRating } from '@/lib/rateApp';
import { pledgeFrogLine, streakRevealMessage } from '@/lib/streak/revealMessage';
import { PondBackdrop } from '@/components/ui/PondBackdrop';
import { FrogSpeechBubble } from '@/components/ui/FrogSpeechBubble';
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
  common: 'New',
  uncommon: 'New',
  rare: 'Special',
  epic: 'Super special',
  legendary: 'Legendary',
};

const SKIN_ROLL_SAMPLE = 6;
const SKIN_ROLL_STAMP_CSS = 96;

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
function LilyPadTile({ count, className }: { count: number; className?: string }) {
  return (
    <span
      className={cn(
        REWARD_TILE_FRAME,
        'border-emerald-400 bg-gradient-to-br from-emerald-100 to-emerald-50 shadow-emerald-900/10 dark:from-emerald-900 dark:to-emerald-950',
        className,
      )}
      title={`${count} Lily Pad${count === 1 ? '' : 's'}`}
    >
      <Icon name="lilyPad" label="Lily Pad" className="h-[62%] w-[62%]" />
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
  className = 'h-11 w-11 rounded-xl',
}: {
  minRarity: string;
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const options = useMemo(
    () => skinRollOptions(rewardCatalog, minRarity),
    [rewardCatalog, minRarity],
  );

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
      still
      className={className}
      frogClassName="h-[142%] w-[142%] -translate-y-[20%]"
    />
  );
}

function skinRollOptions(
  rewardCatalog: Record<string, QuestRewardCatalogItem>,
  minRarity: string,
): string[] {
  const floor = SKIN_ROLL_RARITY_ORDER.indexOf(
    minRarity as (typeof SKIN_ROLL_RARITY_ORDER)[number],
  );
  const ids = Object.values(rewardCatalog)
    .filter(
      (item) =>
        item.slot !== 'container' &&
        item.slot !== 'background' &&
        SKIN_ROLL_RARITY_ORDER.indexOf(
          item.rarity as (typeof SKIN_ROLL_RARITY_ORDER)[number],
        ) >= Math.max(0, floor),
    )
    .map((item) => item.id);
  const step = Math.max(1, Math.ceil(ids.length / SKIN_ROLL_SAMPLE));
  return ids.filter((_, index) => index % step === 0).slice(0, SKIN_ROLL_SAMPLE);
}

function skinRollStampIndices(item: QuestRewardCatalogItem): FrogStampIndices {
  return {
    skin: item.slot === 'skin' ? item.riveIndex : 0,
    mood: 0,
    hat: item.slot === 'hat' ? item.riveIndex : 0,
    body: item.slot === 'body' ? item.riveIndex : 0,
    hand_item: item.slot === 'hand_item' ? item.riveIndex : 0,
  };
}

function useWarmSkinRolls(
  tiers: { rewards: LoginStreakReward[] }[],
  rewardCatalog: Record<string, QuestRewardCatalogItem>,
) {
  const key = tiers.map((tier) => skinRollFloor(tier.rewards) ?? '').join('|');
  useEffect(() => {
    const floors = Array.from(
      new Set(
        tiers
          .map((tier) => skinRollFloor(tier.rewards))
          .filter((floor): floor is string => !!floor),
      ),
    );
    if (floors.length === 0) return;
    const indices = floors.flatMap((floor) =>
      skinRollOptions(rewardCatalog, floor).map((id) =>
        skinRollStampIndices(rewardCatalog[id]),
      ),
    );
    let cancel: (() => void) | null = null;
    const timer = window.setTimeout(() => {
      cancel = warmFrogStamps(
        indices,
        Math.round(SKIN_ROLL_STAMP_CSS * riveDevicePixelRatio()),
      );
    }, 450);
    return () => {
      window.clearTimeout(timer);
      cancel?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, rewardCatalog]);
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
  still = false,
}: {
  rewards: LoginStreakReward[];
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  /** Staggered so four tiers' worth of artwork never parses in one frame. */
  hydrateDelayMs?: number;
  /** Only the selected tier animates; the rest hold a still frame. */
  paused?: boolean;
  still?: boolean;
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
          still={still}
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
          {SKIN_ROLL_RARITY_LABEL[skinFloor] ?? 'New'} outfit
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
        const label = date.toLocaleDateString('en-US', { weekday: 'narrow' });
        const longLabel = date.toLocaleDateString('en-US', { weekday: 'long' });
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
            {new Date(`${dayKey}T12:00:00`).toLocaleDateString('en-US', {
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
            'en-US',
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
                      ? 'bg-white text-amber-500 shadow-[0_2px_0_0_var(--streak-ink-shadow)]'
                      : pendingToday
                        ? 'bg-white/20 text-white ring-2 ring-white/80'
                        : future
                          ? 'bg-white/15'
                          : 'bg-[color:var(--streak-dim)] text-white/50',
                  isToday && (lit || frozen) && 'ring-[3px] ring-amber-200',
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
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-[color:var(--streak-dim)]">
        <motion.div
          initial={reduceMotion ? false : { scaleX: 0 }}
          animate={{ scaleX: ratio }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.9 }}
          className="h-full origin-left rounded-full bg-gradient-to-r from-amber-200 to-white"
        />
      </div>
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
  const [landed, setLanded] = useState(false);
  const [minDelayDone, setMinDelayDone] = useState(false);
  const [capDone, setCapDone] = useState(false);
  const shortScreen = useMediaQuery('(max-height: 800px)');
  const frogHeight = shortScreen ? 234 : 300;
  const frogWidth = Math.round((frogHeight * 128) / 144);
  const revealMessage = streakRevealMessage({
    count: view.count,
    longestStreak: view.longestStreak,
    nextTierDays: view.nextTierDays,
    dayOfWeek: new Date().getDay(),
    shieldUsed: celebration.shieldConsumedDays.length > 0,
  });
  const activeGoal =
    view.goal && view.goal.progress < view.goal.days ? view.goal : null;

  useEffect(() => {
    const minTimer = window.setTimeout(() => setMinDelayDone(true), 1000);
    const capTimer = window.setTimeout(() => setCapDone(true), 2600);
    return () => {
      window.clearTimeout(minTimer);
      window.clearTimeout(capTimer);
    };
  }, []);

  const readyToPop = minDelayDone && (landed || capDone);
  useEffect(() => {
    if (!readyToPop || popped) return;
    setPopped(true);
    frogRef.current?.fireEmote(
      view.count > 1 && view.count >= view.longestStreak ? 'tada' : 'celebrate',
    );
    confetti({
      particleCount: 110,
      spread: 90,
      startVelocity: 40,
      origin: { y: 0.3 },
      zIndex: 99999,
      colors: ['#fbbf24', '#fde68a', '#93df6e', '#4f9a45', '#ffffff'],
      disableForReducedMotion: true,
    });
    hapticCelebrate();
  }, [readyToPop, popped]);

  useEffect(() => {
    if (popped) setCount(view.count);
  }, [popped, view.count]);

  return (
    <div className="streak-stage relative flex min-h-0 flex-1 flex-col bg-[color:var(--streak-base)]">
      <PondBackdrop className="absolute inset-0 h-full w-full" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'var(--streak-overlay)' }}
      />
      <div className="pointer-events-none absolute inset-0 opacity-[var(--streak-ray-opacity)]">
        <RotatingRays
          colorClass="text-[color:var(--streak-ray)]"
          masked={false}
          size="118vmax"
        />
      </div>
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'var(--streak-glow)' }}
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
                      className="absolute rounded-[2px] bg-amber-200"
                      style={{ width: spark.size, height: spark.size }}
                    />
                  ))}
                </>
              )}
              <Flame
                className={cn(
                  'relative h-[84px] w-[84px] transition-[color,fill] duration-500 short-screen:h-16 short-screen:w-16',
                  popped
                    ? 'fill-amber-300 text-amber-100 drop-shadow-[0_0_18px_rgba(255,200,80,0.85)]'
                    : 'fill-white/25 text-white/50',
                )}
              />
            </motion.div>
            </div>

            <TickerNumber
              value={count}
              className="font-display text-[112px] leading-[0.95] tracking-wide text-white [filter:drop-shadow(0_5px_0_var(--streak-ink-shadow))] short-screen:text-[84px]"
            />
          </div>

          <p className="-mt-1 font-display text-[26px] leading-none tracking-wide text-white [filter:drop-shadow(0_2px_0_var(--streak-ink-shadow))] short-screen:text-[22px]">
            day streak
          </p>

          <div
            className="pointer-events-none relative z-20"
            style={{
              width: frogWidth,
              height: frogHeight,
              marginTop: -(Math.round(frogHeight * 0.68) - 102),
              marginBottom: shortScreen ? -27 : -11,
            }}
          >
            <Frog
              ref={frogRef}
              width={frogWidth}
              height={frogHeight}
              indices={indices}
              emote="love"
              arrive="drop"
              onArrived={() => setLanded(true)}
            />
            {popped && landed && (
              <FrogSpeechBubble
                rate={0}
                done={0}
                total={0}
                fixedMessage={revealMessage}
                className={shortScreen ? '!top-[142px]' : '!top-[188px]'}
              />
            )}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={popped ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.35, type: 'spring', stiffness: 260, damping: 24 }}
            className="relative z-10 w-full rounded-[24px] bg-[color:var(--streak-glass)] p-4 ring-1 ring-inset ring-white/30 backdrop-blur-md short-screen:mt-4 short-screen:p-3"
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

      <div className="relative shrink-0 px-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 short-screen:pb-[calc(0.75rem+env(safe-area-inset-bottom))] short-screen:pt-3 md:px-8 md:pb-7">
        <div className="relative mx-auto w-full max-w-[320px]">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={popped ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.6 }}
            className="relative z-10 w-full"
          >
            <button
              type="button"
              onClick={onContinue}
              className="w-full rounded-2xl bg-white py-4 text-[17px] font-black tracking-tight text-[#447d3f] shadow-[0_5px_0_0_#2c511a,0_12px_24px_-8px_rgba(10,40,16,0.55)] ring-1 ring-[#2c511a]/15 transition-[transform,box-shadow] hover:bg-white/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#447d3f] active:translate-y-1 active:shadow-none short-screen:py-3.5"
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
  7: 'Tadpole',
  14: 'Froglet',
  30: 'Bullfrog',
  50: 'Legend',
};

function pledgeName(days: number) {
  return PLEDGE_NAMES[days] ?? `${days} days`;
}

type PrizeRow = { key: string; tile: React.ReactNode; title: string; note?: string };

const PRIZE_TILE_CLASS = 'h-[52px] w-[52px] rounded-[14px]';

function pledgePrizeRows(
  rewards: LoginStreakReward[],
  rewardCatalog: Record<string, QuestRewardCatalogItem>,
  isPremium: boolean,
  paused: boolean,
): PrizeRow[] {
  const rows: PrizeRow[] = [];
  const skinFloor = skinRollFloor(rewards);
  if (skinFloor) {
    rows.push({
      key: 'skin',
      tile: (
        <SkinRollTile
          minRarity={skinFloor}
          rewardCatalog={rewardCatalog}
          isPremium={isPremium}
          className={PRIZE_TILE_CLASS}
        />
      ),
      title: `${SKIN_ROLL_RARITY_LABEL[skinFloor] ?? 'New'} outfit`,
      note: 'A new look you don’t own yet',
    });
  }
  const flyRows: PrizeRow[] = [];
  rewards.forEach((reward, index) => {
    if (isShieldReward(reward)) return;
    if ((reward as { type?: string }).type === 'SKIN_ROLL') return;
    const questReward = reward as QuestReward;
    const isFlies = questReward.type === 'FLIES';
    const copies =
      !isFlies && (questReward.amount ?? 1) > 1 ? `${questReward.amount}× ` : '';
    const row: PrizeRow = {
      key: `${questReward.type}-${questReward.itemId ?? ''}`,
      tile: (
        <RewardTile
          reward={questReward}
          rewardCatalog={rewardCatalog}
          isPremium={isPremium}
          compact
          hideBadge
          className={PRIZE_TILE_CLASS}
          flySize={36}
          hydrateDelayMs={index * 60}
          paused={paused}
        />
      ),
      title: `${copies}${rewardLabel(questReward, rewardCatalog, isPremium)}`,
      note: isFlies
        ? 'Spend them on outfits'
        : questReward.type === 'BOX'
          ? copies
            ? 'Each hides a surprise outfit or background'
            : 'Hides a surprise outfit or background'
          : undefined,
    };
    if (isFlies) flyRows.push(row);
    else rows.push(row);
  });
  const shields = rewards.reduce(
    (sum, reward) =>
      isShieldReward(reward) ? sum + ((reward as any).amount ?? 1) : sum,
    0,
  );
  if (shields > 0) {
    rows.push({
      key: 'shield',
      tile: <LilyPadTile count={shields} className={PRIZE_TILE_CLASS} />,
      title: shields > 1 ? `${shields} Lily Pads` : 'Lily Pad',
      note: shields > 1 ? 'Each one saves a missed day' : 'Saves a missed day',
    });
  }
  rows.push(...flyRows);
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const count = seen.get(row.key) ?? 0;
    seen.set(row.key, count + 1);
    return count === 0 ? row : { ...row, key: `${row.key}-${count}` };
  });
}

function pledgePrizeSummary(
  rewards: LoginStreakReward[],
  rewardCatalog: Record<string, QuestRewardCatalogItem>,
  isPremium: boolean,
) {
  return pledgePrizeRows(rewards, rewardCatalog, isPremium, true)
    .map((row) => row.title)
    .join(', ');
}

function formatPledgeEnd(days: number) {
  const end = new Date(`${addDaysToKey(localDayKey(), days)}T12:00:00`);
  return end.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function CommitStep({
  view,
  indices,
  rewardCatalog,
  isPremium,
  onPicked,
  onSkip,
}: {
  view: LoginStreakView;
  indices: Partial<Record<'skin' | 'hat' | 'body' | 'hand_item', number>>;
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
  useWarmSkinRolls(view.goalTiers, rewardCatalog);
  const frogRef = useRef<FrogHandle>(null);
  const [frogLanded, setFrogLanded] = useState(false);
  const shortScreen = useMediaQuery('(max-height: 800px)');
  const frogHeight = shortScreen ? 190 : 210;
  const frogWidth = Math.round((frogHeight * 128) / 144);
  const choose = (days: number) => {
    setSelectedDays(days);
    setError(null);
    hapticSelect();
    const longest = Math.max(...view.goalTiers.map((tier) => tier.days));
    frogRef.current?.fireEmote(
      days >= longest ? 'celebrate' : days === lowestTierDays ? 'hop' : 'love',
    );
  };
  const [error, setError] = useState<string | null>(null);
  const selectedTier =
    view.goalTiers.find((tier) => tier.days === selectedDays) ?? null;
  const topTier = view.goalTiers.reduce<LoginStreakView['goalTiers'][number] | null>(
    (best, tier) => (!best || tier.days > best.days ? tier : best),
    null,
  );
  const bestStartDays =
    steppingUpTo === null &&
    view.goalTiers.some(
      (tier) => tier.days === lowestTierDays && tier.repeatIndex === 0 && tier.payoutPercent >= 100,
    )
      ? lowestTierDays
      : null;

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
          announcePledgeMade();
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
    ? pledgePrizeRows(selectedTier.rewards, rewardCatalog, isPremium, false)
    : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div
        className="no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
        style={{ contain: 'paint' }}
      >
        <div className="min-h-full bg-[radial-gradient(140%_42%_at_50%_0%,hsl(var(--primary)/0.13),transparent_72%)] px-4 pb-6 pt-[calc(env(safe-area-inset-top)+3.75rem)] sm:px-6 short-screen:pb-4 short-screen:pt-[calc(env(safe-area-inset-top)+3rem)] md:px-8 md:pt-14">
          <div className="mx-auto flex w-full max-w-sm flex-col items-center">
            <h2
              id="streak-goal-heading"
              className="text-center text-[clamp(1.5rem,7vw,1.75rem)] font-black tracking-tight text-foreground"
            >
              Make a pledge
            </h2>
            <p
              id="streak-goal-hint"
              className="mt-1 max-w-[30ch] text-pretty text-center text-sm font-semibold leading-snug text-muted-foreground"
            >
              Get one thing done every day. Keep it up and the prize is yours.
            </p>

            <div className="relative mt-[80px] w-full short-screen:mt-[74px]">
              <div
                className="pointer-events-none absolute bottom-[calc(100%-11px)] left-[-22px] z-20"
                style={{ width: frogWidth, height: frogHeight }}
              >
                <Frog
                  ref={frogRef}
                  width={frogWidth}
                  height={frogHeight}
                  indices={indices}
                  arrive="hop"
                  greet="question"
                  onArrived={() => setFrogLanded(true)}
                />
              </div>
              {frogLanded && (
                <FrogSpeechBubble
                  key={selectedDays ?? 'ask'}
                  side
                  rate={0}
                  done={0}
                  total={0}
                  fixedMessage={pledgeFrogLine(selectedDays)}
                  messageClassName="!text-[14px]"
                  className={cn(
                    '[--bubble-max:calc(100vw-11.5rem)] md:[--bubble-max:14rem]',
                    shortScreen ? '!left-[128px] !top-[-30px]' : '!left-[144px] !top-[-30px]',
                  )}
                />
              )}

              <div className="pond-panel relative z-10 w-full rounded-[24px] border border-[color:var(--pond-line)] bg-[linear-gradient(to_bottom,var(--pond-surface-top),var(--pond-surface-bottom))] px-3 pb-3.5 pt-5 shadow-[0_3px_0_0_var(--pond-line)] short-screen:pb-3">
                <fieldset
                  className="w-full"
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
                            onChange={() => choose(tier.days)}
                            className="peer sr-only"
                          />
                          {(tier.days === steppingUpTo || tier.days === bestStartDays) && (
                            <span className="absolute -top-2 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-black leading-none text-amber-950 shadow-sm">
                              {tier.days === steppingUpTo ? 'Next up' : 'Best start'}
                            </span>
                          )}
                          <span
                            className={cn(
                              'flex h-[80px] flex-col items-center justify-center rounded-2xl border-2 short-screen:h-[72px] transition-[transform,background-color,border-color,box-shadow] duration-150 active:translate-y-[2px] peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-disabled:cursor-wait',
                              selected
                                ? 'border-[#447d3f] bg-[#447d3f] text-white shadow-[0_4px_0_0_#2c511a]'
                                : 'border-[color:var(--pond-chip-line)] bg-[color:var(--pond-chip)] text-[color:var(--pond-ink)] shadow-[0_3px_0_0_var(--pond-chip-line)] hover:bg-[color:var(--pond-chip-hover)]',
                            )}
                          >
                            <span className="font-display text-[28px] leading-none tracking-wide short-screen:text-[26px]">
                              {tier.days}
                            </span>
                            <span
                              className={cn(
                                'mt-1.5 text-[11px] font-black leading-none',
                                selected ? 'text-white/90' : 'text-[color:var(--pond-ink-muted)]',
                              )}
                            >
                              {tier.payoutPercent < 100
                                ? `days · ${tier.payoutPercent}%`
                                : 'days'}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </div>
            </div>

            <section className="mt-5 w-full short-screen:mt-4" aria-live="polite">
              <div className="mb-2 flex h-6 items-center justify-between gap-2 px-1.5">
                <h3 className="flex items-center gap-1.5 text-[13px] font-black text-amber-800 dark:text-amber-300">
                  <Trophy aria-hidden className="h-4 w-4 text-amber-500" />
                  {selectedDays !== null ? `${pledgeName(selectedDays)} prize` : 'Prizes'}
                </h3>
                {selectedDays !== null && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11.5px] font-bold text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
                    Ends {formatPledgeEnd(selectedDays)}
                  </span>
                )}
              </div>
              <div className="rounded-[24px] border border-amber-200 bg-[linear-gradient(to_bottom,#fffbeb,#ffffff)] px-3.5 py-1.5 shadow-[0_3px_0_0_rgba(217,119,6,0.14)] dark:border-amber-400/25 dark:bg-[linear-gradient(to_bottom,rgba(251,191,36,0.11),rgba(251,191,36,0.03))] dark:shadow-[0_3px_0_0_rgba(0,0,0,0.3)]">
                {selectedDays !== null ? (
                  <>
                    <ul className="relative flex flex-col divide-y divide-amber-200/70 dark:divide-amber-400/15">
                      <AnimatePresence initial={false} mode="popLayout">
                        {settled
                          ? rows.map((row) => (
                              <motion.li
                                key={row.key}
                                layout={reduceMotion ? false : 'position'}
                                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
                                transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                                className="flex items-center gap-3.5 py-3 short-screen:py-2.5"
                              >
                                <span className="grid h-[52px] w-[52px] shrink-0 place-items-center">
                                  {row.tile}
                                </span>
                                <span className="min-w-0">
                                  <span className="block text-[15px] font-black leading-tight text-foreground">
                                    {row.title}
                                  </span>
                                  {row.note && (
                                    <span className="mt-1 block text-[12.5px] font-semibold leading-snug text-muted-foreground">
                                      {row.note}
                                    </span>
                                  )}
                                </span>
                              </motion.li>
                            ))
                          : rows.map((row) => (
                              <li key={row.key} className="h-[76px] short-screen:h-[72px]" aria-hidden />
                            ))}
                      </AnimatePresence>
                    </ul>
                    {selectedTier && selectedTier.payoutPercent < 100 && (
                      <p className="mb-2 rounded-xl bg-muted px-3 py-2 text-[12px] font-bold leading-snug text-muted-foreground">
                        You&apos;ve kept this pledge before, so its flies pay{' '}
                        {selectedTier.payoutPercent}%. A longer one pays in full.
                      </p>
                    )}
                  </>
                ) : (
                  <div className="flex min-h-[148px] flex-col items-center justify-center gap-3 py-3 text-center short-screen:min-h-[140px]">
                    {topTier && (
                      <PledgeRewardTiles
                        rewards={topTier.rewards}
                        rewardCatalog={rewardCatalog}
                        isPremium={isPremium}
                        hydrateDelayMs={450}
                        paused
                        still
                      />
                    )}
                    <span>
                      <span className="block text-[15px] font-black leading-tight text-foreground">
                        Longer pledges win bigger prizes
                      </span>
                      <span className="mt-1 block text-[12.5px] font-semibold text-muted-foreground">
                        Pick a length to see yours
                      </span>
                    </span>
                  </div>
                )}
              </div>
            </section>
          </div>
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
            disabled={busyDays !== null || selectedDays === null}
            onClick={() => {
              if (selectedDays !== null) void pickGoal(selectedDays);
            }}
            aria-live="polite"
            className="flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-[#447d3f] px-4 text-base font-black text-white shadow-[0_4px_0_0_#2c511a] ring-1 ring-[#2c511a]/40 transition-[transform,box-shadow,filter] hover:brightness-110 active:translate-y-1 active:shadow-none disabled:translate-y-0 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-[0_4px_0_0_rgba(0,0,0,0.08)] disabled:ring-0 disabled:hover:brightness-100"
          >
            {selectedDays !== null && <Flame className="h-5 w-5 fill-amber-300 text-amber-200" />}
            {busyDays !== null
              ? 'Starting…'
              : selectedDays !== null
                ? `Pledge ${selectedDays} days`
                : 'Pick a pledge'}
          </button>
          <button
            type="button"
            onClick={onSkip}
            disabled={busyDays !== null}
            className="mt-1 min-h-11 px-4 text-sm font-bold text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

function HomeStep({
  view,
  indices,
  rewardCatalog,
  isPremium,
  onGetLilyPad,
  onCommit,
  onDone,
  onGoToTasks,
}: {
  view: LoginStreakView;
  indices: Partial<Record<'skin' | 'hat' | 'body' | 'hand_item', number>>;
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

          <div
            aria-hidden
            className="relative mb-1 -mt-14 h-[196px] w-[196px] motion-safe:animate-[streak-frog-bob_3.2s_ease-in-out_infinite] short-screen:-mt-16"
          >
            <Frog width={196} height={196} indices={indices} emote="love" arrive="rise" />
          </div>

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
                      hydrateDelayMs={650}
                      still
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
        (inventoryData?.catalog?.length ? inventoryData.catalog : CATALOG).map(
          (item) => [item.id, item],
        ),
      ),
    [inventoryData?.catalog],
  );
  const { indices } = useWardrobeIndices(open);

  const view = liveView ?? celebration?.view ?? null;
  const hasRewardEvents = !!celebration?.goalEvent;

  const [step, setStep] = useState<Step>('home');
  const [buyOpen, setBuyOpen] = useState(false);
  const [enteredStep, setEnteredStep] = useState<Step | null>(null);
  const [openSeen, setOpenSeen] = useState(open);
  if (open !== openSeen) {
    setOpenSeen(open);
    if (open) {
      setStep(
        commitIntent && !liveView?.goal
          ? 'commit'
          : celebration?.extended
            ? 'reveal'
            : 'home',
      );
      setEnteredStep(null);
    }
  }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebration, commitIntent]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

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
          initial={false}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2, ease: 'easeOut' } }}
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget) setEnteredStep(step);
          }}
          className="sheet-backdrop-in pointer-events-auto fixed inset-0 z-[1400] overflow-hidden"
        >
          <div className="absolute inset-0 bg-background md:bg-black/60" />

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
                onAnimationComplete={(definition) => {
                  if ((definition as { opacity?: number }).opacity === 1) {
                    setEnteredStep(step);
                  }
                }}
                onClick={(event) => event.stopPropagation()}
                className="relative mx-auto flex h-full w-full transform-gpu flex-col overflow-hidden will-change-transform [backface-visibility:hidden] md:h-auto md:max-h-[min(40rem,calc(100dvh-3rem))] md:w-[min(100%,40rem)] md:rounded-[32px] md:shadow-2xl"
              >
                <SheetEnteredContext.Provider value={enteredStep === step}>
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
                    indices={indices}
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
                </SheetEnteredContext.Provider>
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
