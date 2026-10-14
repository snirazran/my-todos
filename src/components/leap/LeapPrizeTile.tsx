'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import {
  RewardTile,
  SweepRewardTile,
  type QuestRewardCatalogItem,
  type SweepRewardInfo,
} from '@/components/ui/QuestCards';
import type { QuestReward } from '@/lib/quests/types';
import type { BonusReward, LeapPrizePreview, LeapView } from '@/lib/leap/types';
import { cn } from '@/lib/utils';

type Catalog = Record<string, QuestRewardCatalogItem>;

const SIZES = {
  sm: { box: 'h-10 w-10 rounded-[11px]', fly: 26, plus: 'h-5 w-5 -left-1.5 -top-1.5', plusIcon: 'h-3.5 w-3.5' },
  md: { box: 'h-[52px] w-[52px] rounded-[14px]', fly: 34, plus: 'h-6 w-6 -left-2 -top-2', plusIcon: 'h-4 w-4' },
  lg: { box: 'h-[58px] w-[58px] rounded-[15px]', fly: 38, plus: 'h-7 w-7 -left-2 -top-2', plusIcon: 'h-5 w-5' },
} as const;

export type LeapPrizeSize = keyof typeof SIZES;

const FROG_FIT = 'h-[150%] w-[150%] -translate-y-[30%]';

const RARITY_PILL: Record<string, string> = {
  common: 'bg-slate-500',
  uncommon: 'bg-emerald-500',
  rare: 'bg-sky-500',
  epic: 'bg-violet-500',
  legendary: 'bg-amber-500',
};

function prizeRarity(reward: BonusReward, catalog: Catalog): string | null {
  if (reward.type === 'RARITY_ITEM') return reward.rarity;
  if (reward.type === 'FLIES' || reward.type === 'SHIELD' || reward.type === 'BOX') return null;
  const id = reward.itemId ?? reward.backgroundId;
  const item = id ? catalog[id] : null;
  if (!item || item.slot === 'container') return null;
  return item.rarity || null;
}

function shuffled<T>(list: T[]) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = copy[i];
    copy[i] = copy[j];
    copy[j] = swap;
  }
  return copy;
}

function RotatingPrize({
  entries,
  catalog,
  isPremium,
  offset,
  box,
}: {
  entries: LeapPrizePreview[];
  catalog: Catalog;
  isPremium: boolean;
  offset: number;
  box: string;
}) {
  const reduceMotion = useReducedMotion();
  const [order] = useState(() => shuffled(entries));
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduceMotion || order.length < 2) return;
    let interval = 0;
    const advance = () => setIndex((value) => (value + 1) % order.length);
    const start = window.setTimeout(() => {
      advance();
      interval = window.setInterval(advance, 2200);
    }, 900 + (offset % 4) * 420);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(interval);
    };
  }, [order.length, offset, reduceMotion]);

  const entry = order[index % order.length];
  const reward: QuestReward =
    entry.kind === 'background'
      ? { type: 'BACKGROUND', backgroundId: entry.id }
      : { type: 'ITEM', itemId: entry.id };

  return (
    <span className={cn('relative block', box)}>
      <AnimatePresence initial={false}>
        <motion.span
          key={`${entry.kind}:${entry.id}`}
          className="absolute inset-0"
          initial={{ opacity: 0, scale: 0.84 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.84 }}
          transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
        >
          <RewardTile
            reward={reward}
            rewardCatalog={catalog}
            isPremium={isPremium}
            still
            paused
            hideBadge
            frogClassName={FROG_FIT}
            className={box}
          />
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function quantity(reward: BonusReward) {
  if (reward.type === 'FLIES') return reward.amount ? String(reward.amount) : null;
  const amount = 'amount' in reward ? reward.amount ?? 1 : 1;
  return amount > 1 ? `×${amount}` : null;
}

export function LeapPrizeTile({
  reward,
  view,
  size = 'md',
  offset = 0,
  plus = false,
  done = false,
  className,
}: {
  reward: BonusReward;
  view: LeapView;
  size?: LeapPrizeSize;
  offset?: number;
  plus?: boolean;
  done?: boolean;
  className?: string;
}) {
  const spec = SIZES[size];
  const catalog = view.rewardCatalog as Catalog;
  const preview =
    reward.type === 'RARITY_ITEM' ? view.rarityPreview?.[reward.rarity] ?? [] : [];
  const amount = quantity(reward);
  const rarity = prizeRarity(reward, catalog);

  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <span className={cn('block', done && 'opacity-45 grayscale-[30%]')}>
        {preview.length ? (
          <RotatingPrize
            entries={preview}
            catalog={catalog}
            isPremium={view.isPremium}
            offset={offset}
            box={spec.box}
          />
        ) : (
          <SweepRewardTile
            reward={reward as SweepRewardInfo}
            rewardCatalog={catalog}
            isPremium={view.isPremium}
            paused
            hideBadge
            flySize={spec.fly}
            flyOversample={1.25}
            frogClassName={FROG_FIT}
            className={cn(spec.box, 'shadow-none')}
          />
        )}
      </span>
      {!done && rarity && (
        <span
          className={cn(
            'absolute -bottom-1.5 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/15 px-1 text-[9.5px] font-black capitalize leading-[15px] tabular-nums text-white shadow-sm',
            RARITY_PILL[rarity] ?? 'bg-slate-500',
          )}
        >
          {rarity}
        </span>
      )}
      {!done && !rarity && amount && (
        <span className="absolute -right-1.5 -top-1.5 z-20 whitespace-nowrap rounded-md border border-white/15 bg-black/65 px-1 text-[9.5px] font-black leading-[15px] tabular-nums text-white shadow-sm">
          {amount}
        </span>
      )}
      {plus && (
        <span
          className={cn(
            'absolute z-20 grid place-items-center rounded-full bg-amber-400 shadow-sm ring-2 ring-white dark:ring-card',
            spec.plus,
          )}
        >
          <Icon name="frogPlus" label="Plus" className={spec.plusIcon} />
        </span>
      )}
      {done && (
        <span className="absolute -right-1 -top-1 z-20 grid h-4 w-4 place-items-center rounded-full bg-[#4f9149] text-white ring-2 ring-card">
          <Check className="h-2.5 w-2.5" strokeWidth={4} />
        </span>
      )}
    </span>
  );
}

export function plusBonusLeague(view: LeapView) {
  const next = view.leagues[view.league + 1];
  if (next?.plusReachRewards.length) return next;
  return null;
}

export function waitingPlusLeagues(view: LeapView) {
  if (view.isPremium) return [];
  return view.leagues.filter(
    (league, index) => index > 0 && league.reached && league.plusReachRewards.length > 0,
  );
}
