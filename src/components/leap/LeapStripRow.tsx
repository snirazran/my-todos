'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { QuestTrack } from '@/components/ui/QuestTrack';
import { statusDockRowClass } from '@/components/home/StatusDock';
import { QuestRewardTileBadge } from '@/lib/questClaims';
import { tileRewards } from '@/lib/leap/format';
import type { LeapView } from '@/lib/leap/types';
import {
  leagueArt,
  leagueName,
  leapStatus,
  leapTarget,
  leapWeekRewards,
} from './leapCopy';

export function LeapStripRow({ view }: { view: LeapView }) {
  const router = useRouter();
  const open = () => router.push('/quests#leap');

  return (
    <div
      role="button"
      tabIndex={0}
      data-dock-row
      onClick={open}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      }}
      className={statusDockRowClass(view.week.leap.reached ? 'ready' : 'idle')}
    >
      <span className="min-h-11 min-w-11 shrink-0 rounded-xl">
        <QuestRewardTileBadge
          rewards={tileRewards(leapWeekRewards(view))}
          catalog={view.rewardCatalog as never}
          isPremium={view.isPremium}
          small
        />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <Icon name="leap" className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate text-[14px] font-bold leading-tight text-foreground">
            {leapStatus(view)}
          </span>
        </span>
        <QuestTrack progress={view.week.hops} target={leapTarget(view)} />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={leagueArt(view.league)}
        alt={leagueName(view)}
        title={leagueName(view)}
        draggable={false}
        className="-mr-1 h-9 w-11 shrink-0 select-none object-contain"
      />
    </div>
  );
}
