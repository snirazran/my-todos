'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Flame } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  HintButton,
  QuestRewardTileBadge,
  objectiveCardTone,
} from '@/lib/questClaims';
import { Icon } from '@/components/ui/Icon';
import { QuestTrack } from '@/components/ui/QuestTrack';
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

  const hint = (
    <HintButton
      compact
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
      onClick={() => router.push('/quests#pact')}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          router.push('/quests#pact');
        }
      }}
      className={cn(
        'group relative mx-1.5 mb-2 flex w-[calc(100%-0.75rem)] cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-[border-color,background-color,transform] duration-500 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 md:mx-4 md:mb-3 md:w-[calc(100%-2rem)] md:px-4 md:py-3',
        ready
          ? `${objectiveCardTone(true)} [@media(hover:hover)]:hover:bg-lime-100 dark:[@media(hover:hover)]:hover:bg-lime-500/20`
          : 'border-primary/15 bg-primary/[0.06] dark:bg-primary/[0.09] [@media(hover:hover)]:hover:border-primary/30 [@media(hover:hover)]:hover:bg-primary/[0.09]',
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span
          className={cn(
            'flex min-w-0 items-center gap-1.5 text-[11px] font-black uppercase tracking-wide transition-colors duration-500',
            ready ? 'text-lime-700 dark:text-lime-400' : 'text-primary',
          )}
        >
          <Icon name="leap" className="h-4 w-4 shrink-0" />
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={ready ? 'ready' : 'leap'}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
              className="shrink-0"
            >
              {ready ? 'Week finished' : 'Leap'}
            </motion.span>
          </AnimatePresence>
          {view.streak.weeks > 0 && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-amber-600 dark:text-amber-400">
              <Flame className="h-3 w-3" strokeWidth={2.75} />
              {view.streak.weeks}
            </span>
          )}
          {!ready && (
            <>
              <span
                className={cn(
                  'min-w-0 truncate font-bold normal-case tracking-normal',
                  view.streak.atRisk
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-muted-foreground',
                )}
              >
                ·{' '}
                {view.streak.atRisk
                  ? 'Streak at risk!'
                  : `${active.daysLeft}d left`}
              </span>
              <span
                className="-my-1 ml-auto shrink-0"
                onClick={(event) => event.stopPropagation()}
              >
                {hint}
              </span>
            </>
          )}
        </span>
        <span className="min-w-0 text-[14px] font-black leading-tight text-foreground md:text-[15px]">
          <span className="line-clamp-2 md:line-clamp-1">
            {active.commitmentText}
          </span>
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
    </div>
  );
}
