'use client';

import { QuestTrack } from '@/components/ui/QuestTrack';
import { LilyInk } from '@/components/ui/TaskAdornments';
import type { LeapView } from '@/lib/leap/types';
import { leagueName, leapStayMark, leapTarget } from './leapCopy';

export function LeapTrack({ view }: { view: LeapView }) {
  const target = leapTarget(view);
  if (target <= 0) return null;
  const goal = Math.min(view.league + 1, Math.max(0, view.leagues.length - 1));
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="min-w-0 flex-1">
        <QuestTrack
          progress={view.week.hops}
          target={target}
          notch={leapStayMark(view)}
        />
      </span>
      <LilyInk index={goal} ink={18} title={leagueName(view, goal)} className="mt-0.5" />
    </span>
  );
}
