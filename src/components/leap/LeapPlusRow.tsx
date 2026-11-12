'use client';

import { ChevronRight } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import type { LeapView } from '@/lib/leap/types';
import { cn } from '@/lib/utils';
import { leapPlusChestWaiting } from './leapCopy';
import { LeapPrizeTile } from './LeapPrizeTile';

export function LeapPlusRow({
  view,
  onClick,
  className,
}: {
  view: LeapView;
  onClick: () => void;
  className?: string;
}) {
  const waiting = leapPlusChestWaiting(view);
  const rewards = view.week.chest.plusRewards;
  const tiles = [
    ...rewards.filter((reward) => reward.type !== 'FLIES'),
    ...rewards.filter((reward) => reward.type === 'FLIES'),
  ].slice(0, 2);
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        'plus-upgrade-button relative flex min-h-[60px] w-full touch-manipulation items-center gap-2.5 rounded-[18px] py-1 pl-2 pr-3 text-left',
        waiting ? 'plus-club' : 'plus-club-soft',
        className,
      )}
    >
      <span className="-my-3 shrink-0">
        <Icon name="frogPlus" label="Plus" className="plus-cta-frog h-[54px] w-[54px]" />
      </span>
      <span className="min-w-0 flex-1 text-[15px] font-black leading-tight tracking-tight">
        {waiting ? 'Your Plus gift is waiting' : 'Open a second gift with Plus'}
      </span>
      <span className="flex shrink-0 items-center gap-2.5 pb-0.5 pt-2.5">
        {tiles.map((reward, index) => (
          <LeapPrizeTile key={index} reward={reward} view={view} size="md" offset={index + 2} lane="plus" className="w-[3.1rem]" />
        ))}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={3} aria-hidden />
    </button>
  );
}
