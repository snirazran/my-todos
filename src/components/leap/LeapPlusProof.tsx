'use client';

import type { ReactNode } from 'react';
import { Check, Flag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { leagueTitle } from './leapCopy';
import { LeapPrizeTile, plusBonusLeague, waitingPlusLeagues } from './LeapPrizeTile';
import { useLeapView } from './useLeapView';

export function LeapPlusProof({
  fallback,
  className,
}: {
  fallback: ReactNode;
  className?: string;
}) {
  const { data: view } = useLeapView();
  if (!view?.enabled) return <>{fallback}</>;
  const waiting = waitingPlusLeagues(view);
  const target = waiting[0] ?? plusBonusLeague(view);
  if (!target) return <>{fallback}</>;
  const earned = waiting.length > 0;

  return (
    <div className={cn('min-w-0 rounded-2xl border border-white/15 bg-white/[0.08] p-3', className)}>
      <p className="flex items-center gap-1.5 text-[11px] font-bold leading-tight text-[#e0eadb]">
        {earned ? (
          <Check className="h-3.5 w-3.5 shrink-0 text-[#ffe399]" strokeWidth={3} aria-hidden />
        ) : (
          <Flag className="h-3.5 w-3.5 shrink-0 text-[#ffe399]" strokeWidth={2.75} aria-hidden />
        )}
        <span className="min-w-0">
          {earned ? `${leagueTitle(target.label)} reached` : `Reach the ${leagueTitle(target.label)}`}
        </span>
      </p>
      <div className="mt-2.5 space-y-2">
        {!earned && target.reachRewards.length > 0 && (
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-[10px] font-bold text-[#d1dfca]">FREE</span>
            <span className="flex items-center gap-1.5">
              {target.reachRewards.slice(0, 2).map((reward, i) => (
                <LeapPrizeTile key={i} reward={reward} view={view} size="sm" offset={i} />
              ))}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 rounded-xl bg-[#ffe399] px-2 py-1.5 text-[#493610]">
          <span className="text-[10px] font-black leading-tight">
            PLUS
            <br />
            ADDS
          </span>
          <span className="flex items-center gap-1.5">
            {target.plusReachRewards.slice(0, 2).map((reward, i) => (
              <LeapPrizeTile key={i} reward={reward} view={view} size="sm" offset={i + 2} bonus />
            ))}
          </span>
        </div>
      </div>
      <p className="mt-2 text-[11px] font-medium leading-snug text-[#e0eadb]">
        {earned
          ? `${waiting.length === 1 ? 'Already earned' : `${waiting.length} leagues earned`}. Yours the moment you join.`
          : 'A bonus at every league'}
      </p>
    </div>
  );
}
