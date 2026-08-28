'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { QuestRewardCatalogItem } from '@/components/ui/QuestCards';
import { QuestRewardTileBadge } from '@/lib/questClaims';
import { cn } from '@/lib/utils';
import type { PactWeekPreview } from '@/lib/pact/types';
import type { QuestReward } from '@/lib/quests/types';

/**
 * The week's price, cycled one day-count at a time.
 *
 * Rotating content is normally a mistake — people miss whatever is not on the
 * first frame — so the structure never moves: the same "N days -> reward" line
 * stays put and only its values change, it opens on the default the button
 * actually leads to, and it holds still entirely under reduced motion. The
 * Rive icons are deliberately not keyed: remounting a canvas every couple of
 * seconds is the expensive way to draw a number change.
 */
export function RotatingWeekPrice({
  previews,
  startIndex,
  catalog,
  isPremium,
  dense = false,
}: {
  previews: PactWeekPreview[];
  startIndex: number;
  catalog: Record<string, QuestRewardCatalogItem>;
  isPremium: boolean;
  /** Trailing-slot sizing: one overlapping stack instead of a row of tiles. */
  dense?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(startIndex);

  useEffect(() => {
    setIndex(startIndex);
  }, [startIndex]);

  useEffect(() => {
    if (reduceMotion || previews.length < 2) return;
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % previews.length);
    }, 2400);
    return () => window.clearInterval(timer);
  }, [reduceMotion, previews.length]);

  const entry = previews[Math.min(index, previews.length - 1)];
  if (!entry) return null;
  const widest = previews.reduce(
    (most, preview) => Math.max(most, preview.sessions),
    1,
  );
  const labelSize = dense
    ? 'text-[12px]'
    : 'text-[12px] min-[400px]:text-[13px]';
  const tiles: QuestReward[] = [
    { type: 'FLIES', amount: entry.flies },
    ...(entry.rewards.filter(
      (reward) => reward.type !== 'FLIES',
    ) as QuestReward[]),
  ];

  return (
    <span className={cn('flex min-w-0 items-center', dense ? 'gap-1.5' : 'gap-2')}>
      {/* A slot sized by its own widest value, not by a guessed width.
          "1 day" and "7 days" are different widths, and letting the label
          size itself nudged every tile beside it on each tick — but a
          hardcoded width is worse: too small and the label wraps inside an
          overflow-hidden box and loses its second line. The invisible sizer
          holds the box open at exactly the longest string this ladder can
          produce, in whatever font size the breakpoint chose. */}
      <span className="relative block shrink-0 overflow-hidden">
        <span
          aria-hidden="true"
          className={cn(
            'invisible block whitespace-nowrap font-black tabular-nums',
            labelSize,
          )}
        >
          Do it {widest} day{widest === 1 ? '' : 's'}
        </span>
        <AnimatePresence initial={false}>
          <motion.span
            key={entry.sessions}
            initial={reduceMotion ? false : { y: '115%' }}
            animate={{ y: '0%' }}
            exit={reduceMotion ? undefined : { y: '-115%' }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'absolute inset-0 flex items-center whitespace-nowrap font-black tabular-nums text-foreground',
              labelSize,
            )}
          >
            Do it {entry.sessions} day{entry.sessions === 1 ? '' : 's'}
          </motion.span>
        </AnimatePresence>
      </span>
      <span
        className={cn(
          'shrink-0 font-black text-muted-foreground/50',
          dense ? 'text-[11px]' : 'hidden text-[12px] min-[400px]:inline',
        )}
      >
        &rarr;
      </span>
      {/* Fixed floor, not a fixed tile count: the gift tier gains a second
          box at six days, and a stack that grows mid-rotation would flip the
          buttons onto a second line every few seconds. */}
      <span
        className={cn(
          'flex shrink-0 items-center',
          dense ? 'min-w-[4.75rem] justify-end' : 'min-w-[7.25rem]',
        )}
      >
        <QuestRewardTileBadge
          rewards={tiles}
          catalog={catalog as never}
          isPremium={isPremium}
          small={dense}
        />
      </span>
    </span>
  );
}
