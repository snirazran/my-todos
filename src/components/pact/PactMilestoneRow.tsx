'use client';

import { cn } from '@/lib/utils';
import { BareRewardIcon, FlyWorth } from '@/components/ui/QuestCards';
import type { PactMilestone } from '@/lib/pact/types';

const MAX_PIPS = 8;

/**
 * The next rung, never the whole ladder. Motivation rises as a goal gets
 * closer, so the card names one target within reach and shows exactly how far
 * away it is; a new one appears the moment this one is cleared, so there is
 * always something to accelerate toward.
 */
export function PactMilestoneRow({
  milestone,
  rewardCatalog,
  isPremium,
}: {
  milestone: PactMilestone;
  rewardCatalog: Record<string, unknown>;
  isPremium: boolean;
}) {
  const toGo = Math.max(1, milestone.weeks - milestone.weeksDone);
  const flies = milestone.rewards
    .filter((reward) => reward.type === 'FLIES')
    .reduce((sum, reward) => sum + Math.max(0, reward.amount ?? 0), 0);
  const items = milestone.rewards.filter((reward) => reward.type !== 'FLIES');

  // Long ladders would need 12 pips; past a point they stop reading as
  // countable and become texture, so we show the tail and a "+N" instead.
  const pipStart = Math.max(0, milestone.weeks - MAX_PIPS);
  const pips = Array.from(
    { length: Math.min(milestone.weeks, MAX_PIPS) },
    (_, index) => pipStart + index < milestone.weeksDone,
  );

  return (
    <div className="mt-2 flex items-center gap-3 rounded-2xl border border-border/50 bg-card/60 px-3 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-[12px] font-black leading-tight text-foreground">
          {toGo} more week{toGo === 1 ? '' : 's'}
          <span className="font-bold text-muted-foreground">
            {milestone.kind === 'mastery' && milestone.areaName
              ? ` of ${milestone.areaName}`
              : ' in a row'}
          </span>
        </span>
        <div className="flex items-center gap-1" aria-hidden="true">
          {pipStart > 0 && (
            <span className="mr-0.5 text-[10px] font-black text-muted-foreground">
              +{pipStart}
            </span>
          )}
          {pips.map((done, index) => (
            <span
              key={index}
              className={cn(
                'h-1.5 flex-1 rounded-full',
                done ? 'bg-primary' : 'bg-muted',
              )}
            />
          ))}
        </div>
      </div>

      <span className="flex shrink-0 items-center gap-1.5">
        {flies > 0 && <FlyWorth amount={flies} flySize={22} />}
        {items.map((reward, index) => (
          <BareRewardIcon
            key={`${reward.type}-${reward.itemId ?? index}`}
            reward={reward}
            rewardCatalog={rewardCatalog as never}
            isPremium={isPremium}
          />
        ))}
      </span>
    </div>
  );
}
