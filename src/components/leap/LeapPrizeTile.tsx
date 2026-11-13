'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { SeasonRewardTile } from '@/components/ui/QuestsPanel';
import type { QuestReward } from '@/lib/quests/types';
import type { BonusReward, LeapPrizePreview, LeapView } from '@/lib/leap/types';
import { cn } from '@/lib/utils';

type Catalog = Parameters<typeof SeasonRewardTile>[0]['rewardCatalog'];
type Lane = 'free' | 'plus';

const SIZES = {
  sm: 'w-11',
  md: 'w-14',
  lg: 'w-16',
} as const;

export type LeapPrizeSize = keyof typeof SIZES;

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
  lane,
  offset,
  compact,
}: {
  entries: LeapPrizePreview[];
  catalog: Catalog;
  lane: Lane;
  offset: number;
  compact: boolean;
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
      interval = window.setInterval(advance, 2400);
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
    <span className="grid">
      <AnimatePresence initial={false}>
        <motion.span
          key={`${entry.kind}:${entry.id}`}
          className="[grid-area:1/1]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
        >
          <SeasonRewardTile reward={reward} rewardCatalog={catalog} lane={lane} paused compact={compact} oversample={2} />
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function LeapPrizeTile({
  reward,
  view,
  size = 'md',
  offset = 0,
  lane = 'free',
  done = false,
  compact = false,
  className,
}: {
  reward: BonusReward;
  view: LeapView;
  size?: LeapPrizeSize;
  offset?: number;
  lane?: Lane;
  done?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const catalog = view.rewardCatalog as unknown as Catalog;
  const preview =
    reward.type === 'RARITY_ITEM' ? view.rarityPreview?.[reward.rarity] ?? [] : [];
  const shown: QuestReward =
    reward.type === 'RARITY_ITEM' ? { type: 'BOX' } : (reward as unknown as QuestReward);

  return (
    <span className={cn('relative block shrink-0', SIZES[size], className)}>
      <span className={cn('block', done && 'opacity-45 grayscale-[30%]')}>
        {preview.length ? (
          <RotatingPrize entries={preview} catalog={catalog} lane={lane} offset={offset} compact={compact} />
        ) : (
          <SeasonRewardTile
            reward={shown}
            rewardCatalog={catalog}
            lane={lane}
            paused
            compact={done || compact}
            flyScale={0.86}
            oversample={2}
          />
        )}
      </span>
      {done && (
        <span className="absolute -right-1.5 -top-1.5 z-20 grid h-5 w-5 place-items-center rounded-full bg-[#4f9149] text-white ring-2 ring-card">
          <Check className="h-3 w-3" strokeWidth={4} />
        </span>
      )}
    </span>
  );
}
