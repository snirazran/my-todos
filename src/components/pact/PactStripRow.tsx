'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HintButton, QuestRewardTileBadge } from '@/lib/questClaims';
import { Icon } from '@/components/ui/Icon';
import { QuestTrack } from '@/components/ui/QuestTrack';
import { useUIStore } from '@/lib/uiStore';
import { usePactView } from './PactCard';
import { pactWeekRewardTiles } from '@/lib/pact/format';
import type { PactView } from '@/lib/pact/types';
import { statusDockRowClass } from '@/components/home/StatusDock';

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

  const hint = (
    <HintButton
      iconOnly
      placement="bottom"
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
  );

  return (
    <div
      role="button"
      tabIndex={0}
      data-dock-row
      onClick={() => router.push('/quests#pact')}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          router.push('/quests#pact');
        }
      }}
      className={statusDockRowClass(ready ? 'ready' : 'idle')}
    >
      <span
        className={cn(
          'shrink-0',
          ready && !claiming && 'animate-quest-pulse motion-reduce:animate-none',
        )}
      >
        <QuestRewardTileBadge
          rewards={pactWeekRewardTiles(active)}
          catalog={view.rewardCatalog as never}
          isPremium={view.isPremium}
          small
        />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <Icon name="leap" className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate text-[14px] font-bold leading-tight text-foreground">
            {active.commitmentText}
          </span>
          {view.streak.weeks > 0 && (
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-px text-[11px] font-black tabular-nums',
                view.streak.atRisk && !ready
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                  : 'text-amber-600 dark:text-amber-400',
              )}
            >
              <Flame className="h-3 w-3" strokeWidth={2.75} />
              {view.streak.weeks}
            </span>
          )}
        </span>
        <QuestTrack
          progress={active.progress}
          target={active.target}
          action={
            ready
              ? {
                  label: claiming ? 'Claiming…' : 'Claim',
                  disabled: claiming,
                  onPress: () => void claim(),
                }
              : null
          }
        />
      </div>
      {!ready && (
        <span
          className="-mr-1.5 shrink-0 self-center"
          onClick={(event) => event.stopPropagation()}
        >
          {hint}
        </span>
      )}
    </div>
  );
}
