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
import { useWideStage } from '@/hooks/useWideStage';
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
import { SolidFlame } from './StreakIcons';
import { maybeRequestAppRating } from '@/lib/rateApp';
import { pledgeFrogLine, streakRevealMessage } from '@/lib/streak/revealMessage';
import { PondBackdrop } from '@/components/ui/PondBackdrop';
import { FrogSpeechBubble } from '@/components/ui/FrogSpeechBubble';
import {
  ONBOARDING_DOCK_SURFACE_CLASS,
  OnboardingSpeechBubble,
} from '@/app/onboarding/steps/OnboardingFrogHeader';
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
export function PledgeRewardTiles({
  rewards,
  rewardCatalog,
  isPremium,
  hydrateDelayMs = 0,
  paused = false,
  still = false,
  flatLimit,
}: {
  rewards: LoginStreakReward[];
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  flatLimit?: number;
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
          flyOversample={flatLimit ? 2 : undefined}
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

  if (flatLimit) {
    const ordered = skinFloor ? [tiles[tiles.length - 1], ...tiles.slice(0, -1)] : tiles;
    const overflow = ordered.length > flatLimit;
    const shown = ordered.slice(0, overflow ? flatLimit - 1 : flatLimit);
    return (
      <span className="flex shrink-0 items-center gap-1.5">
        {shown.map((tile) => (
          <span key={tile.key} className="relative">
            {tile.node}
          </span>
        ))}
        {overflow && (
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-muted text-[13px] font-black tabular-nums text-muted-foreground">
            +{ordered.length - shown.length}
          </span>
        )}
      </span>
    );
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

const SPARKS = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2 + 0.3;
  const distance = 92 + (i % 3) * 22;
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
    size: i % 2 ? 7 : 10,
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
 * The week as one chain: kept days sit in a warm band that draws itself in,
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
              'text-center text-[11px] font-black',
              dayKey === today ? 'text-foreground' : 'text-muted-foreground',
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
        className="relative mt-1.5 grid grid-cols-7"
      >
        {first >= 0 && (
          <motion.span
            aria-hidden
            initial={reduceMotion ? false : { scaleX: 0 }}
            animate={play ? { scaleX: 1 } : {}}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
            className="absolute inset-y-0 origin-left rounded-full bg-amber-100 dark:bg-amber-400/15"
            style={{
              left: `calc(${(first / 7) * 100}% + 1px)`,
              width: `calc(${((last - first + 1) / 7) * 100}% - 2px)`,
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
                initial={reduceMotion ? false : { scale: landsLast ? 0.4 : 0.8, opacity: 0 }}
                animate={play || !landsLast ? { scale: 1, opacity: 1 } : {}}
                transition={{
                  type: 'spring',
                  stiffness: landsLast ? 520 : 420,
                  damping: landsLast ? 14 : 26,
                  delay: landsLast ? 0.55 : 0.03 * i,
                }}
                className={cn(
                  'grid h-9 w-9 place-items-center rounded-full short-screen:h-8 short-screen:w-8',
                  frozen
                    ? 'bg-emerald-100 shadow-[0_2px_0_0_#6ee7b7] dark:bg-emerald-500/20 dark:shadow-[0_2px_0_0_rgba(16,185,129,0.45)]'
                    : lit
                      ? 'bg-gradient-to-b from-amber-300 to-orange-400 text-white shadow-[0_2px_0_0_#c2410c]'
                      : pendingToday
                        ? 'border-2 border-dashed border-orange-300 text-orange-400 dark:border-orange-400/60'
                        : future
                          ? 'bg-muted/70'
                          : 'bg-muted text-muted-foreground/70',
                  isToday &&
                    (lit || frozen) &&
                    'ring-2 ring-amber-300 ring-offset-2 ring-offset-card dark:ring-amber-400/70',
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
  play,
}: {
  goal: NonNullable<LoginStreakView['goal']>;
  rewards?: LoginStreakReward[];
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  play: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const ratio = goal.stepCount > 0 ? goal.stepsFilled / goal.stepCount : 0;
  return (
    <div className="mt-3.5 flex items-center gap-3 border-t border-border/60 pt-3.5 short-screen:mt-3 short-screen:pt-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-100 shadow-[0_2px_0_0_#fcd34d] dark:bg-amber-400/15 dark:shadow-[0_2px_0_0_rgba(251,191,36,0.35)]">
        <Trophy aria-hidden className="h-5 w-5 text-amber-500" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-black leading-tight text-foreground">
          {pledgeName(goal.days)} pledge
        </p>
        <div
          role="progressbar"
          aria-label={`${goal.days}-day pledge`}
          aria-valuemin={0}
          aria-valuemax={goal.days}
          aria-valuenow={goal.progress}
          aria-valuetext={`${goal.progress} of ${goal.days} days`}
          className="relative mt-1.5 h-5 overflow-hidden rounded-full bg-muted"
        >
          <motion.div
            initial={reduceMotion ? false : { scaleX: 0 }}
            animate={{ scaleX: play ? ratio : 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.7 }}
            className="absolute inset-0 origin-left rounded-full bg-gradient-to-r from-amber-300 to-orange-400"
          />
          <span className="relative grid h-full place-items-center text-[11px] font-black tabular-nums text-foreground/80">
            {goal.progress} / {goal.days}
          </span>
        </div>
      </div>
      {rewards && rewards.length > 0 && (
        <PledgeRewardTiles
          rewards={rewards}
          rewardCatalog={rewardCatalog}
          isPremium={isPremium}
          hydrateDelayMs={900}
          flatLimit={2}
          still
        />
      )}
    </div>
  );
}

function sunNumeralSize(count: number, short: boolean, roomy: boolean) {
  const digits = String(Math.max(0, count)).length;
  const base = digits <= 1 ? 232 : digits === 2 ? 206 : 148;
  const scale = short ? 0.76 : roomy ? 1.06 : 1;
  return Math.round(base * scale);
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
  const shortScreen = useMediaQuery('(max-height: 760px)');
  const roomy = useMediaQuery('(min-width: 768px)');

  const frogHeight = shortScreen ? 216 : roomy ? 292 : 264;
  const frogWidth = Math.round((frogHeight * 128) / 144);
  const frogSeat = 1 + Math.round(frogHeight * 0.045);
  const numeralSize = sunNumeralSize(
    Math.max(view.count, celebration.previousCount),
    shortScreen,
    roomy,
  );
  const digitBottom = Math.round(frogHeight * 0.32);
  const stageHeight = digitBottom + Math.round(numeralSize * 0.78) + 8;
  const bubbleY = Math.round(frogHeight * 0.11);

  const revealMessage = streakRevealMessage({
    count: view.count,
    longestStreak: view.longestStreak,
    nextTierDays: view.nextTierDays,
    dayOfWeek: new Date().getDay(),
    shieldUsed: celebration.shieldConsumedDays.length > 0,
  });
  const activeGoal =
    view.goal && view.goal.progress < view.goal.days ? view.goal : null;
  const newBest = view.count > 1 && view.count >= view.longestStreak;

  useEffect(() => {
    const minTimer = window.setTimeout(() => setMinDelayDone(true), 900);
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
    frogRef.current?.fireEmote(newBest ? 'tada' : 'celebrate');
    confetti({
      particleCount: 110,
      spread: 90,
      startVelocity: 40,
      origin: { y: 0.28 },
      zIndex: 99999,
      colors: ['#fbbf24', '#fde68a', '#93df6e', '#4f9a45', '#ffffff'],
      disableForReducedMotion: true,
    });
    hapticCelebrate();
  }, [readyToPop, popped, newBest]);

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

      <div className="no-scrollbar relative flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain px-6 pb-2 pt-[calc(env(safe-area-inset-top)+1.5rem)] short-screen:pt-[calc(env(safe-area-inset-top)+0.75rem)] md:px-10 md:pt-8">
        <div className="mx-auto mt-auto flex w-full max-w-sm shrink-0 flex-col items-center md:max-w-md">
          <p className="sr-only" aria-live="polite">
            {view.count} day streak
          </p>

          <div
            aria-hidden
            className="relative w-full"
            style={{ height: stageHeight }}
          >
            <div
              className="pointer-events-none absolute left-1/2 -translate-x-1/2 translate-y-1/2"
              style={{
                bottom: digitBottom + Math.round(numeralSize * 0.36),
                width: numeralSize * 2.6,
                height: numeralSize * 2.6,
              }}
            >
              <div
                className={cn(
                  'absolute inset-0 transition-[opacity,transform] duration-[900ms] ease-[cubic-bezier(0.23,1,0.32,1)]',
                  popped ? 'scale-100 opacity-100' : 'scale-75 opacity-40',
                )}
                style={{ background: 'var(--streak-sun)' }}
              />
              <div
                className={cn(
                  'absolute inset-0 transition-opacity duration-700',
                  popped ? 'opacity-[var(--streak-sun-ray-opacity)]' : 'opacity-0',
                )}
                style={{
                  maskImage:
                    'radial-gradient(circle at center, black 18%, transparent 62%)',
                  WebkitMaskImage:
                    'radial-gradient(circle at center, black 18%, transparent 62%)',
                }}
              >
                <RotatingRays
                  colorClass="text-[color:var(--streak-sun-ray)]"
                  masked={false}
                  size="100%"
                />
              </div>
              {popped && !reduceMotion && (
                <div className="absolute inset-0 grid place-items-center">
                  <motion.span
                    initial={{ opacity: 0.8, scale: 0.4 }}
                    animate={{ opacity: 0, scale: 1.6 }}
                    transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
                    className="col-start-1 row-start-1 rounded-full bg-amber-50/80"
                    style={{ width: numeralSize, height: numeralSize }}
                  />
                  {SPARKS.map((spark, i) => (
                    <motion.span
                      key={i}
                      initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.6 }}
                      animate={{
                        x: spark.x * (numeralSize / 188),
                        y: spark.y * (numeralSize / 188),
                        opacity: 0,
                        rotate: 120,
                        scale: 1,
                      }}
                      transition={{ duration: 0.75, ease: [0.2, 0.8, 0.3, 1] }}
                      className="col-start-1 row-start-1 rounded-[3px] bg-amber-200"
                      style={{ width: spark.size, height: spark.size }}
                    />
                  ))}
                </div>
              )}
            </div>

            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.92 }}
              animate={
                popped && !reduceMotion
                  ? { opacity: 1, y: 0, scale: [1, 1.08, 1] }
                  : { opacity: 1, y: 0, scale: 1 }
              }
              transition={
                popped
                  ? { duration: 0.55, ease: [0.23, 1, 0.32, 1] }
                  : { type: 'spring', duration: 0.6, bounce: 0.2, delay: 0.1 }
              }
              className="absolute inset-x-0 flex justify-center"
              style={{
                bottom: digitBottom - Math.round(numeralSize * 0.06),
                fontSize: numeralSize,
              }}
            >
              <TickerNumber
                value={count}
                className={cn(
                  'font-display leading-[0.78] tracking-[0.01em] transition-[color,filter] duration-500',
                  popped
                    ? 'text-[color:var(--streak-numeral)] [filter:drop-shadow(0_6px_0_var(--streak-ink-shadow))_drop-shadow(0_0_28px_var(--streak-numeral-glow))]'
                    : 'text-white/60 [filter:drop-shadow(0_6px_0_var(--streak-ink-shadow))]',
                )}
              />
            </motion.div>
          </div>

          <div className="relative w-full">
            {popped && landed && (
              <div
                className="pointer-events-none absolute z-0"
                style={{
                  left: `calc(50% - ${Math.round(frogWidth * 0.06)}px)`,
                  bottom: `calc(100% + ${bubbleY}px)`,
                }}
              >
                <FrogSpeechBubble
                  rate={0}
                  done={0}
                  total={0}
                  side
                  fixedMessage={revealMessage}
                  className="!left-0 !top-0 [--bubble-max:min(calc(100vw-13rem),15rem)] md:[--bubble-max:15rem]"
                />
              </div>
            )}

            <div
              aria-hidden
              className="pointer-events-none absolute z-20"
              style={{
                width: frogWidth,
                height: frogHeight,
                bottom: `calc(100% - ${frogSeat}px)`,
                left: `calc(50% - ${Math.round(frogWidth * 0.86)}px)`,
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
            </div>

            <div
              className={cn(
                ONBOARDING_DOCK_SURFACE_CLASS,
                'relative z-10 w-full rounded-[24px] px-4 pb-4 pt-3.5 short-screen:px-3.5 short-screen:pb-3 short-screen:pt-3',
              )}
            >
              <div className="mb-2.5 flex items-center justify-between gap-3 short-screen:mb-2">
                <span className="flex items-center gap-1.5 text-[15px] font-black text-foreground">
                  <Flame
                    aria-hidden
                    className={cn(
                      'h-[18px] w-[18px] transition-[color,fill] duration-500',
                      popped
                        ? 'fill-amber-400 text-orange-500'
                        : 'fill-transparent text-muted-foreground',
                    )}
                  />
                  Day streak
                </span>
                {newBest ? (
                  <motion.span
                    initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
                    animate={popped ? { opacity: 1, scale: 1 } : {}}
                    transition={{ delay: 0.8, type: 'spring', duration: 0.4, bounce: 0.3 }}
                    className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-700 dark:bg-amber-400/15 dark:text-amber-300"
                  >
                    New best!
                  </motion.span>
                ) : view.longestStreak > 1 ? (
                  <span className="text-[12px] font-bold tabular-nums text-muted-foreground">
                    Best {view.longestStreak}
                  </span>
                ) : null}
              </div>
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
                  play={popped}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="relative shrink-0 px-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 short-screen:pb-[calc(0.75rem+env(safe-area-inset-bottom))] short-screen:pt-3 md:px-10 md:pb-7">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={popped ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.6, duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
          className="mx-auto w-full max-w-sm md:max-w-md"
        >
          <button
            type="button"
            onClick={onContinue}
            className="flex h-14 w-full items-center justify-center rounded-2xl bg-white text-[17px] font-black tracking-tight text-[#447d3f] shadow-[0_5px_0_0_#2c511a,0_12px_24px_-8px_rgba(10,40,16,0.55)] ring-1 ring-[#2c511a]/15 transition-[transform,box-shadow] hover:bg-white/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#2c511a] active:translate-y-1 active:shadow-[0_1px_0_0_#2c511a] short-screen:h-[52px]"
          >
            Continue
          </button>
        </motion.div>
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

const PLEDGE_COLORS = {
  '--pl-bg': '#0a6f66',
  '--pl-on-bg': '#ffffff',
  '--pl-on-bg-muted': 'rgba(255,255,255,0.88)',
  '--pl-cta': '#ffc531',
  '--pl-cta-ink': '#3b2800',
  '--pl-cta-edge': '#c98b00',
  '--pl-pick': '#0a6f66',
  '--pl-pick-ink': '#ffffff',
  '--pl-pick-edge': '#064a44',
  '--pl-pick-soft': '#e9f6f4',
} as React.CSSProperties;

export function pledgeName(days: number) {
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
  wide,
  onPicked,
  onSkip,
}: {
  view: LoginStreakView;
  indices: Partial<Record<'skin' | 'hat' | 'body' | 'hand_item', number>>;
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  wide: boolean;
  onPicked: (view: LoginStreakView) => void;
  onSkip: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const [busyDays, setBusyDays] = useState<number | null>(null);
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
  const frogHeight = wide ? 315 : shortScreen ? 190 : 210;
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
  const recommendedDays = steppingUpTo ?? bestStartDays ?? lowestTierDays;
  if (selectedDays === null && recommendedDays !== null) {
    setSelectedDays(recommendedDays);
  }

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

  const frog = (
    <Frog
      ref={frogRef}
      width={frogWidth}
      height={frogHeight}
      indices={indices}
      arrive="hop"
      greet="question"
      onArrived={() => setFrogLanded(true)}
    />
  );

  const heading = (
    <>
        <h2
          id="streak-goal-heading"
          className={cn(
          'text-center font-black tracking-tight text-[color:var(--pl-on-bg)]',
          wide ? 'text-[32px]' : 'text-[clamp(1.5rem,7vw,1.75rem)]',
        )}
        >
          Make a pledge
        </h2>
        <p
          id="streak-goal-hint"
          className={cn(
          'mt-1 text-pretty text-center text-sm font-semibold leading-snug text-[color:var(--pl-on-bg-muted)]',
          !wide && 'max-w-[30ch]',
        )}
        >
          Get one thing done every day. Keep it up and the prize is yours.
        </p>
    </>
  );

  const tierPanel = (
    <div className="relative z-10 w-full rounded-[26px] bg-white p-2 shadow-[0_5px_0_0_rgba(0,0,0,0.16)] dark:bg-[hsl(var(--card-raised))]">
      <fieldset
        className="w-full"
        aria-labelledby="streak-goal-heading"
        aria-describedby={`streak-goal-hint${error ? ' streak-goal-error' : ''}`}
        disabled={busyDays !== null}
      >
        <legend className="sr-only">Pledge length</legend>
        <div className="flex flex-col gap-1">
          {view.goalTiers.map((tier, index) => {
            const selected = selectedDays === tier.days;
            const badge =
              tier.days === steppingUpTo
                ? 'Next up'
                : tier.days === bestStartDays
                  ? 'Best start'
                  : null;
            return (
              <label
                key={tier.days}
                className={cn(
                  'relative flex cursor-pointer items-center gap-3 rounded-[20px] border-2 py-2 pl-2 pr-2.5 transition-[background-color,border-color,transform] duration-150 ease-out active:scale-[0.985] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:disabled]:cursor-wait short-screen:py-1.5',
                  selected
                    ? 'border-[color:var(--pl-pick)] bg-[color:var(--pl-pick-soft)] dark:border-teal-400/70 dark:bg-teal-400/10'
                    : 'border-transparent hover:bg-[#f5f7fb] dark:hover:bg-white/[0.04]',
                )}
              >
                <input
                  type="radio"
                  name="streak-goal"
                  value={tier.days}
                  checked={selected}
                  onChange={() => choose(tier.days)}
                  className="sr-only"
                />
                {badge && (
                  <span className="absolute left-[36px] top-0 z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-black leading-none text-amber-950 shadow-[0_1px_0_0_#b45309] short-screen:left-[34px]">
                    {badge}
                  </span>
                )}
                <span
                  aria-hidden
                  className={cn(
                    'flex h-[52px] w-[52px] shrink-0 flex-col items-center justify-center rounded-2xl transition-[background-color,color,box-shadow] duration-150 short-screen:h-12 short-screen:w-12',
                    selected
                      ? 'bg-[color:var(--pl-pick)] text-[color:var(--pl-pick-ink)] shadow-[0_3px_0_0_var(--pl-pick-edge)]'
                      : 'bg-[#f1f4f9] text-foreground shadow-[0_3px_0_0_#e1e6ef] dark:bg-white/[0.07] dark:shadow-[0_3px_0_0_rgba(0,0,0,0.35)]',
                  )}
                >
                  <span className="font-display text-[24px] leading-none tracking-wide">
                    {tier.days}
                  </span>
                  <span
                    className={cn(
                      'mt-0.5 text-[9.5px] font-black leading-none',
                      selected ? 'opacity-85' : 'text-muted-foreground',
                    )}
                  >
                    days
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[15px] font-black leading-tight text-foreground">
                      {pledgeName(tier.days)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'mt-1 block truncate text-[12px] font-bold leading-tight',
                      selected
                        ? 'text-[color:var(--pl-pick)] dark:text-teal-300'
                        : 'text-muted-foreground',
                    )}
                  >
                    {selected
                      ? `Ends ${formatPledgeEnd(tier.days)}`
                      : tier.payoutPercent < 100
                        ? `Flies pay ${tier.payoutPercent}%`
                        : `${tier.days} days in a row`}
                  </span>
                </span>
                <PledgeRewardTiles
                  rewards={tier.rewards}
                  rewardCatalog={rewardCatalog}
                  isPremium={isPremium}
                  hydrateDelayMs={300 + index * 110}
                  paused={!selected}
                  still={!selected}
                  flatLimit={3}
                />
              </label>
            );
          })}
        </div>
      </fieldset>
      {selectedTier && (
        <p
          aria-live="polite"
          className="px-3 pb-1.5 pt-2.5 text-center text-[12.5px] font-semibold leading-snug text-muted-foreground short-screen:pt-2"
        >
          <span className="font-black text-foreground">
            {pledgeName(selectedTier.days)} prize:
          </span>{' '}
          {pledgePrizeSummary(selectedTier.rewards, rewardCatalog, isPremium)}
          {selectedTier.payoutPercent < 100 &&
            `. Kept before, so flies pay ${selectedTier.payoutPercent}%`}
        </p>
      )}
    </div>
  );

  const actions = (
    <div className={cn('mx-auto flex w-full flex-col items-center', !wide && 'max-w-sm')}>
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
        className="flex h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-[color:var(--pl-cta)] px-4 text-base font-black text-[color:var(--pl-cta-ink)] shadow-[0_5px_0_0_var(--pl-cta-edge)] transition-[transform,box-shadow,filter] hover:brightness-105 active:translate-y-1 active:shadow-none disabled:translate-y-0 disabled:bg-white/20 disabled:text-[color:var(--pl-on-bg-muted)] disabled:shadow-none disabled:hover:brightness-100"
      >
        {selectedDays !== null && <SolidFlame className="h-[22px] w-[22px] -translate-y-px text-[#ea580c]" />}
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
        className="mt-1 min-h-11 px-4 text-sm font-bold text-[color:var(--pl-on-bg-muted)] hover:text-[color:var(--pl-on-bg)] focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
      >
        Skip the prize
      </button>
    </div>
  );

  if (wide) {
    return (
      <div className="flex min-h-0 flex-1 bg-[color:var(--pl-bg)] dark:[background-image:linear-gradient(rgba(0,0,0,0.3),rgba(0,0,0,0.3))]">
        <div className="relative flex w-[42%] shrink-0 items-center justify-center overflow-hidden px-7">
          <PondBackdrop className="absolute inset-0 h-full w-full" />
          <div className="pointer-events-none relative flex w-full -translate-y-8 flex-col items-center">
            <div className="relative z-10 -mb-3.5" style={{ width: frogWidth, height: frogHeight }}>
              {frog}
              {frogLanded && (
                <OnboardingSpeechBubble
                  key={selectedDays ?? 'ask'}
                  message={pledgeFrogLine(selectedDays)}
                  positionClassName="inset-0"
                />
              )}
            </div>
            <div
              className={cn(
                'flex h-14 w-full items-center justify-center',
                ONBOARDING_DOCK_SURFACE_CLASS,
              )}
            >
              <span className="flex translate-y-[5px] items-center gap-2 text-lg font-black text-foreground">
                <Flame className="h-5 w-5 fill-amber-300 text-amber-500" />
                {selectedDays !== null
                  ? `${pledgeName(selectedDays)} pledge`
                  : `${view.count}-day streak`}
              </span>
            </div>
          </div>
        </div>
        <div className="no-scrollbar flex min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-8 py-10 short-screen:py-6">
          <div className="m-auto flex w-full flex-col items-center">
            {heading}
            <div className="mt-6 w-full short-screen:mt-4">{tierPanel}</div>
            <div className="mt-5 w-full short-screen:mt-4">{actions}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[color:var(--pl-bg)] dark:[background-image:linear-gradient(rgba(0,0,0,0.3),rgba(0,0,0,0.3))]">
      <div
        className="no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
        style={{ contain: 'paint' }}
      >
        <div className="flex min-h-full flex-col px-4 pb-6 pt-[calc(env(safe-area-inset-top)+3.75rem)] sm:px-6 short-screen:pb-4 short-screen:pt-[calc(env(safe-area-inset-top)+3rem)] md:px-8 md:pt-14">
          <div className="mx-auto my-auto flex w-full max-w-sm flex-col items-center">
            {heading}

            <div className="relative mt-[80px] w-full short-screen:mt-[74px]">
              <div
                className="pointer-events-none absolute bottom-[calc(100%-11px)] left-[-22px] z-20"
                style={{ width: frogWidth, height: frogHeight }}
              >
                {frog}
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

              {tierPanel}
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 sm:px-6 short-screen:pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:px-8 md:pb-6">
        {actions}
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
  const wide = useWideStage();

  const view = liveView ?? celebration?.view ?? null;
  const hasRewardEvents = !!celebration?.goalEvent;

  const [step, setStep] = useState<Step>('home');
  const wideCommit = wide && step === 'commit';
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
    if (celebration || commitIntent) close();
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
                style={PLEDGE_COLORS}
                className={cn(
                  'relative mx-auto flex h-full w-full transform-gpu flex-col overflow-hidden will-change-transform [backface-visibility:hidden] md:h-auto md:max-h-[min(40rem,calc(100dvh-3rem))] md:rounded-[32px] md:shadow-2xl',
                  wideCommit ? 'md:w-[min(100%,60rem)]' : 'md:w-[min(100%,40rem)]',
                )}
              >
                <SheetEnteredContext.Provider value={enteredStep === step}>
                {(step === 'home' || step === 'commit') && (
                  <button
                    type="button"
                    aria-label="Close streak"
                    onClick={() =>
                      step === 'commit' ? finishCommit() : onOpenChange(false)
                    }
                    className={cn(
                      'absolute right-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-40 grid h-11 w-11 place-items-center rounded-full backdrop-blur transition-colors active:scale-95 md:top-4',
                      step === 'commit'
                        ? 'bg-white/20 text-[color:var(--pl-on-bg)] ring-1 ring-white/30'
                        : 'bg-muted/70 text-muted-foreground hover:bg-muted',
                    )}
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
                    wide={wideCommit}
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
