'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  HintButton,
  ObjectiveProgressBar,
  QuestRewardTileBadge,
  objectiveCardTone,
} from '@/lib/questClaims';
import { useUIStore } from '@/lib/uiStore';
import { usePactView } from './PactCard';
import { pactWeekRewardTiles } from '@/lib/pact/format';
import type { PactView } from '@/lib/pact/types';

/**
 * The active pact, wearing the home strip's clothes.
 *
 * It is the same one-line surface the strip already uses for quests, because
 * home only ever answers one question — what is the single next thing — and
 * two competing answers is what made the full card feel like an interruption.
 * The pact takes that slot whenever it is claimable or running; quests keep it
 * the rest of the time.
 */
export function PactStripRow({ view }: { view: PactView }) {
  const router = useRouter();
  const { mutate } = usePactView();
  const startHintGuide = useUIStore((state) => state.startHintGuide);
  const [claiming, setClaiming] = useState(false);
  const active = view.active;
  if (!active) return null;

  const ready = active.claimable && !active.claimed;
  // A guide that says "tap the fly" on a day with no session sends the user
  // hunting for a task that is not there. On those days the hint reports when
  // the next one lands and drops Show me entirely.
  const sessionToday = active.openToday;

  const claim = async () => {
    if (claiming) return;
    setClaiming(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch('/api/pact/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone }),
      });
      const payload = await res.json();
      if (res.ok) mutate(payload.view, { revalidate: false });
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push('/quests#pact')}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          router.push('/quests#pact');
        }
      }}
      className={cn(
        'group relative mx-1.5 flex w-[calc(100%-0.75rem)] cursor-pointer items-center text-left transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 md:mx-4 md:w-[calc(100%-2rem)]',
        ready
          ? `mb-2 gap-3 rounded-2xl border p-3 shadow-sm md:mb-3 md:p-3.5 ${objectiveCardTone(true)}`
          : 'mb-1.5 gap-2.5 rounded-xl px-1 py-1 hover:bg-muted/30 md:mb-0 md:gap-3 md:px-4 md:py-1.5',
      )}
    >
      {/* Same leading slot as a quest row: what the week pays. The area art
          said where the work happens, which the commitment text already says
          — the reward is the thing this slot exists to answer. */}
      <QuestRewardTileBadge
        rewards={pactWeekRewardTiles(active)}
        catalog={view.rewardCatalog as never}
        isPremium={view.isPremium}
        small={!ready}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1 leading-tight md:gap-1.5">
        <span
          className={cn(
            'flex items-center gap-1.5 text-[11px] font-black',
            ready
              ? 'text-lime-700 dark:text-lime-400'
              : 'text-muted-foreground',
          )}
        >
          {ready ? (
            'Week finished'
          ) : (
            <>
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-primary"
              />
              This week
              {view.streak.weeks > 0 && (
                <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                  <Flame className="h-3 w-3" strokeWidth={2.75} />
                  {view.streak.weeks}
                </span>
              )}
            </>
          )}
        </span>

        <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-black leading-tight text-foreground md:text-[13px]">
          <span className="min-w-0 flex-1 truncate">
            {active.commitmentText}
          </span>
          {!ready && (
            <span
              className={cn(
                'hidden shrink-0 whitespace-nowrap text-[10px] font-bold min-[400px]:inline',
                view.streak.atRisk
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-muted-foreground',
              )}
            >
              {view.streak.atRisk
                ? 'Streak at risk!'
                : `${active.daysLeft}d left`}
            </span>
          )}
        </span>

        {!ready && (
          <ObjectiveProgressBar
            heightClassName="h-4 md:h-3.5"
            progress={active.progress}
            target={active.target}
          />
        )}
      </div>

      {ready ? (
        <span
          className="inline-flex shrink-0"
          onClick={(event) => event.stopPropagation()}
        >
          <span
            className={claiming ? 'inline-flex' : 'claim-wobble inline-flex'}
          >
            <button
              type="button"
              disabled={claiming}
              onClick={claim}
              className="inline-flex h-9 min-w-[7rem] items-center justify-center rounded-xl bg-amber-500 px-4 text-[13px] font-black text-white shadow-[0_3px_0_0_#b45309] transition-[transform,box-shadow,opacity] hover:translate-y-[-1px] hover:shadow-[0_4px_0_0_#b45309] active:translate-y-[2px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {claiming ? 'Claiming…' : 'Claim'}
            </button>
          </span>
        </span>
      ) : (
        <span className="shrink-0" onClick={(event) => event.stopPropagation()}>
          <HintButton
            text={
              sessionToday
                ? `Today's is on your list, tagged ${active.categoryName}. Finish all ${active.target} days this week.`
                : active.nextTaskLabel
                  ? `Next up: ${active.nextTaskLabel}. ${active.progress} of ${active.target} days done this week.`
                  : `No days left. ${active.progress} of ${active.target} done this week.`
            }
            onShowMe={
              sessionToday
                ? () =>
                    startHintGuide(
                      'pact-session',
                      active.tagId ? { tagIds: [active.tagId] } : undefined,
                    )
                : undefined
            }
          />
        </span>
      )}
    </div>
  );
}
