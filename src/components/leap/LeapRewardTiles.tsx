'use client';

import { Trophy } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import {
  RewardTile,
  type QuestRewardCatalogItem,
} from '@/components/ui/QuestCards';
import { rewardStackTileStyle } from '@/lib/questClaims';
import { bonusRewardLabel, tileRewards } from '@/lib/leap/format';
import type { BonusRewards } from '@/lib/leap/types';
import { cn } from '@/lib/utils';

export function LeapRewardTiles({
  flies,
  rewards,
  catalog,
  isPremium,
  size = 'md',
  className,
}: {
  flies?: number;
  rewards: BonusRewards;
  catalog: Record<string, unknown>;
  isPremium: boolean;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const tiles = [
    ...(flies && flies > 0 ? [{ type: 'FLIES' as const, amount: flies }] : []),
    ...tileRewards(rewards),
  ].slice(0, 3);
  const extras = rewards
    .map((reward) => ({ reward, label: bonusRewardLabel(reward) }))
    .filter((entry): entry is { reward: BonusRewards[number]; label: string } => !!entry.label);
  const tileClass = size === 'sm' ? 'h-9 w-9 rounded-lg' : 'h-11 w-11 rounded-xl';

  if (!tiles.length && !extras.length) return null;
  return (
    <span className={cn('relative flex shrink-0 items-center', className)}>
      {tiles.map((reward, index) => (
        <span
          key={`${index}-${reward.type}-${'itemId' in reward ? reward.itemId ?? '' : ''}`}
          className="relative"
          style={rewardStackTileStyle(index, tiles.length + (extras.length ? 1 : 0))}
        >
          <RewardTile
            reward={reward}
            rewardCatalog={catalog as Record<string, QuestRewardCatalogItem>}
            isPremium={isPremium}
            hideBadge={reward.type !== 'FLIES'}
            hydrateDelayMs={120}
            className={tileClass}
            flySize={size === 'sm' ? 24 : 30}
            giftAnimation={reward.type === 'BOX' && index === 0 ? 'box_shake' : undefined}
          />
        </span>
      ))}
      {extras.length > 0 && (
        <span
          title={extras.map((entry) => entry.label).join(' + ')}
          className={cn(
            'relative grid shrink-0 place-items-center bg-sky-500/12',
            tileClass,
          )}
          style={rewardStackTileStyle(tiles.length, tiles.length + 1)}
        >
          {extras.some((entry) => entry.reward.type === 'SHIELD') ? (
            <Icon name="lilyPad" className={size === 'sm' ? 'h-5 w-5' : 'h-6 w-6'} />
          ) : (
            <Trophy
              className={cn('text-amber-500', size === 'sm' ? 'h-4 w-4' : 'h-5 w-5')}
              strokeWidth={2.25}
            />
          )}
        </span>
      )}
    </span>
  );
}

export function bonusWords(rewards: BonusRewards) {
  return rewards
    .map((reward) => bonusRewardLabel(reward))
    .filter((label): label is string => !!label);
}
