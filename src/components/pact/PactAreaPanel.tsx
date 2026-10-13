'use client';

import { useEffect, useRef } from 'react';
import { Clock } from 'lucide-react';
import { PactCard, usePactView } from './PactCard';
import { PactStreakLadder } from './PactStreakLadder';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

/**
 * The "Your areas" slot on the quests page. The pact answers the same question
 * the old chooser did — which area am I on — so only one of them is ever shown.
 */
export function PactAreaPanel() {
  const ref = useRef<HTMLDivElement | null>(null);
  const { data } = usePactView();

  // Arriving from the home strip's row: land on the pact, not the top of the
  // quests page. The hash survives the client nav, so it is read once here.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash !== '#pact') return;
    const timer = window.setTimeout(() => {
      ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      history.replaceState(null, '', window.location.pathname);
    }, 250);
    return () => window.clearTimeout(timer);
  }, []);

  // PactCard renders nothing when the pact is off or no areas are picked yet;
  // without this the section heading would sit above an empty slot.
  if (!data || !data.enabled || data.needsAreas) return null;

  return (
    <div ref={ref} id="pact" className="flex flex-col gap-2">
      <div>
        <div className="flex min-h-9 items-center justify-between gap-2 pb-1.5 pl-3.5 pr-1">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="self-center">
              <Icon name="leap" className="-my-1 h-7 w-7 shrink-0" />
            </span>
            <span className="truncate text-[19px] font-black tracking-tight text-foreground">
              This week&apos;s Leap
            </span>
          </span>
          {data.active && !data.active.claimed && (
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[12px] font-black tabular-nums',
                data.streak.atRisk
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-muted-foreground',
              )}
            >
              <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={2.75} />
              {data.streak.atRisk
                ? 'Streak at risk'
                : `${data.active.daysLeft} day${data.active.daysLeft === 1 ? '' : 's'} left`}
            </span>
          )}
        </div>
        {!data.active && (
          <p className="-mt-1 pb-1 pl-3.5 text-[13px] font-semibold text-muted-foreground">
            Pick one area a week. The others wait their turn.
          </p>
        )}
      </div>
      <div className="-mx-1.5 mt-1 md:-mx-4">
        <PactCard variant="panel" />
      </div>
      <div className="-mx-1.5 md:-mx-4">
        <PactStreakLadder />
      </div>
    </div>
  );
}
