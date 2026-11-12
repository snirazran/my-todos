'use client';

import { Icon } from '@/components/ui/Icon';
import type { BonusRewards, LeapView } from '@/lib/leap/types';
import { cn } from '@/lib/utils';
import { Lock } from 'lucide-react';
import { LeapPlusRow } from './LeapPlusRow';
import { LeapPrizeTile, type LeapPrizeSize } from './LeapPrizeTile';

type Tone = 'card' | 'stage';

const INK: Record<Tone, string> = {
  card: 'text-foreground',
  stage: 'text-[color:var(--leap-ink)]',
};

const MUTED: Record<Tone, string> = {
  card: 'text-muted-foreground',
  stage: 'text-[color:var(--leap-ink-muted)]',
};

function Tiles({
  rewards,
  view,
  size,
  offset,
  done,
  lane = 'free',
}: {
  rewards: BonusRewards;
  view: LeapView;
  size: LeapPrizeSize;
  offset: number;
  done: boolean;
  lane?: 'free' | 'plus';
}) {
  return (
    <span className="flex shrink-0 items-center gap-3 pt-2.5">
      {rewards.slice(0, 3).map((reward, index) => (
        <LeapPrizeTile
          key={index}
          reward={reward}
          view={view}
          size={size}
          offset={offset + index}
          lane={lane}
          done={done}
        />
      ))}
    </span>
  );
}

export function LeapChestLanes({
  view,
  rewards = view.week.chest.rewards,
  plusRewards = view.week.chest.plusRewards,
  opened = view.week.chest.claimed,
  plusOpened = view.week.chest.plusClaimed,
  tone = 'card',
  size = 'md',
  onPlus,
  className,
}: {
  view: LeapView;
  rewards?: BonusRewards;
  plusRewards?: BonusRewards;
  opened?: boolean;
  plusOpened?: boolean;
  tone?: Tone;
  size?: LeapPrizeSize;
  onPlus?: () => void;
  className?: string;
}) {
  const locked = !view.isPremium;
  const waiting = locked && opened && !plusOpened;

  return (
    <div className={cn('flex flex-col pt-2', className)}>
      <div className="flex min-h-[4rem] items-center gap-3 px-1">
        <span className="min-w-0 flex-1">
          <span className={cn('block text-[13.5px] font-black leading-tight', INK[tone])}>
            {opened ? 'Gift opened' : 'Your gift'}
          </span>
          <span className={cn('mt-0.5 block text-[12px] font-semibold leading-snug', MUTED[tone])}>
            {opened ? 'It’s in your closet' : 'With flies on top'}
          </span>
        </span>
        <Tiles rewards={rewards} view={view} size={size} offset={0} done={opened} />
      </div>
      {plusRewards.length > 0 && (
        <div className="mt-3 flex min-h-[4rem] items-center gap-3 border-t border-[color:var(--leap-divider,hsl(var(--border)))] px-1 pt-4">
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <Icon name="frogPlus" label="Plus" className="h-7 w-7 shrink-0" />
            <span className="min-w-0">
              <span className={cn('block text-[13.5px] font-black leading-tight', INK[tone])}>
                {plusOpened ? 'Plus gift opened' : 'Plus gift'}
              </span>
              {locked && (
                <span className={cn('mt-0.5 flex items-center gap-1 text-[12px] font-semibold leading-snug', MUTED[tone])}>
                  <Lock className="h-3 w-3" strokeWidth={3} aria-hidden />
                  {waiting ? 'Earned, waiting for you' : 'A second gift every week'}
                </span>
              )}
            </span>
          </span>
          <Tiles rewards={plusRewards} view={view} size={size} offset={2} done={plusOpened} lane="plus" />
        </div>
      )}
      {plusRewards.length > 0 && locked && onPlus && (
        <LeapPlusRow view={view} onClick={onPlus} className="mt-4" />
      )}
    </div>
  );
}
