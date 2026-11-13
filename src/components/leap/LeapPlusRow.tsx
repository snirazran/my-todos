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
        'plus-upgrade-button relative flex min-h-[76px] w-full touch-manipulation items-center gap-2 rounded-[18px] px-2.5 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground narrow:gap-1.5',
        waiting ? 'plus-club' : 'plus-club-soft',
        className,
      )}
    >
      <span className="shrink-0">
        <Icon name="frogPlus" label="Plus" className="plus-cta-frog h-11 w-11 narrow:h-9 narrow:w-9" />
      </span>
      <span className="min-w-0 flex-1 text-[15px] font-black leading-tight tracking-tight narrow:text-[13px]">
        {waiting ? 'Your Plus gift is waiting' : 'Open a second gift with Plus'}
      </span>
      <span className="flex shrink-0 items-center gap-1.5 rounded-[14px] bg-black/[0.07] p-1.5 dark:bg-black/20">
        {tiles.map((reward, index) => (
          <LeapPrizeTile key={index} reward={reward} view={view} size="sm" offset={index + 2} lane="plus" compact className="w-10 narrow:w-8" />
        ))}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={3} aria-hidden />
    </button>
  );
}
