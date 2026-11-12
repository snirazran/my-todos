'use client';

import type { ReactNode } from 'react';
import { Check, Flag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { habitsWord, leapLeft, leapPlusChestWaiting } from './leapCopy';
import { LeapPrizeTile } from './LeapPrizeTile';
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
  const { chest } = view.week;
  if (!chest.plusRewards.length) return <>{fallback}</>;
  const earned = leapPlusChestWaiting(view);
  const left = leapLeft(view);

  return (
    <div className={cn('min-w-0 rounded-2xl border border-white/15 bg-white/[0.08] p-3', className)}>
      <p className="flex items-center gap-1.5 text-[11px] font-bold leading-tight text-[#e0eadb]">
        {earned ? (
          <Check className="h-3.5 w-3.5 shrink-0 text-[#ffe399]" strokeWidth={3} aria-hidden />
        ) : (
          <Flag className="h-3.5 w-3.5 shrink-0 text-[#ffe399]" strokeWidth={2.75} aria-hidden />
        )}
        <span className="min-w-0">
          {earned
            ? 'You landed this week’s Leap'
            : left > 0
              ? `${habitsWord(left)} to this week’s gift`
              : 'This week’s Leap gift'}
        </span>
      </p>
      <div className="mt-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="text-[10px] font-bold text-[#d1dfca]">FREE</span>
          <span className="flex items-center gap-2.5 pt-2">
            {chest.rewards.slice(0, 2).map((reward, i) => (
              <LeapPrizeTile key={i} reward={reward} view={view} size="sm" offset={i} done={chest.claimed} />
            ))}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-xl bg-[#ffe399] px-2 py-1.5 text-[#493610]">
          <span className="text-[10px] font-black leading-tight">
            PLUS
            <br />
            ADDS
          </span>
          <span className="flex items-center gap-2.5 pt-2">
            {chest.plusRewards.slice(0, 2).map((reward, i) => (
              <LeapPrizeTile key={i} reward={reward} view={view} size="sm" offset={i + 2} lane="plus" />
            ))}
          </span>
        </div>
      </div>
      <p className="mt-2 text-[11px] font-medium leading-snug text-[#e0eadb]">
        {earned ? 'Already earned. Yours the moment you join.' : 'A second gift every week you land it'}
      </p>
    </div>
  );
}
