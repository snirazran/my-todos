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
    <div ref={ref} id="pact" className="flex flex-col gap-2 pb-6 md:pb-0">
      <div className="px-1">
        {/* Section label left, the week's clock right — the same row shape the
            daily quests use for "Resets in 8h". A countdown belongs to the
            section, not to one line inside the card, and down there it was
            competing with the next session for the same glance. */}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <p className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[13px] font-black text-muted-foreground">
            <Icon name="leap" className="-my-1.5 h-7 w-7 shrink-0" />
            This week&apos;s Leap
          </p>
          {data.active && !data.active.claimed && (
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] font-black tracking-wide',
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
        {/* The pitch for picking one area, shown only while there is still a
            pick to make. Once the week is committed it argues for a decision
            already taken, and pushes the thing the user came here to see —
            their commitment — further down the page. */}
        {!data.active && (
          <>
            <p className="mt-1.5 text-lg font-black leading-tight text-foreground">
              One area at a time
            </p>
            <p className="mt-0.5 text-xs font-bold text-muted-foreground/80">
              Pick one area a week. The others wait their turn.
            </p>
          </>
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
