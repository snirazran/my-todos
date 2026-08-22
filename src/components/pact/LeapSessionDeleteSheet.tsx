'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import {
  CalendarX2,
  CheckCircle2,
  Flame,
  ListX,
  Loader2,
  ShieldCheck,
  Target,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { Icon } from '@/components/ui/Icon';
import { FlyWorth } from '@/components/ui/QuestCards';
import { cn } from '@/lib/utils';
import type { PactSessionView, PactView } from '@/lib/pact/types';
import { usePactView } from './PactCard';

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export type LeapDeleteImpact = {
  view: PactView;
  removing: PactSessionView[];
  removedOpen: number;
  removedDone: number;
  removedMissed: number;
  targetBefore: number;
  targetAfter: number;
  fliesBefore: number;
  fliesAfter: number;
  /** Nothing worth doing would be left, so the whole Leap ends. */
  cancels: boolean;
  /** The week is already won — a tidy-up cannot take it back. */
  finished: boolean;
  usesToken: boolean;
  streakAtStake: number;
};

function fliesFor(view: PactView, sessions: number) {
  if (sessions <= 0) return 0;
  const row =
    view.weekPreview.find((entry) => entry.sessions === sessions) ??
    view.weekPreview[view.weekPreview.length - 1];
  return row?.flies ?? 0;
}

/**
 * What deleting these tasks would do to the running Leap, or null when they
 * are ordinary tasks. Mirrors `applyPactTaskRemoval` on the server: sessions
 * still ahead lower the week's goal, spent days do not.
 */
function impactFor(view: PactView, taskIds: string[]): LeapDeleteImpact | null {
  if (!view.enabled || !view.active) return null;
  const removing = view.active.sessions.filter((session) =>
    taskIds.includes(session.taskId),
  );
  if (removing.length === 0) return null;

  const removedOpen = removing.filter((s) => s.state === 'open').length;
  const removedDone = removing.filter((s) => s.state === 'done').length;
  const removedMissed = removing.filter((s) => s.state === 'missed').length;
  const finished = view.active.progress >= view.active.target;
  const targetBefore = view.active.target;
  const targetAfter = finished
    ? targetBefore
    : Math.max(0, targetBefore - removedOpen);
  const keptDone = view.active.sessions.filter(
    (s) => !taskIds.includes(s.taskId) && s.state === 'done',
  ).length;
  const nothingLeft =
    view.active.sessions.every((s) => taskIds.includes(s.taskId)) &&
    keptDone + removedDone < targetAfter;

  return {
    view,
    removing,
    removedOpen,
    removedDone,
    removedMissed,
    targetBefore,
    targetAfter,
    fliesBefore: fliesFor(view, targetBefore),
    fliesAfter: fliesFor(view, targetAfter),
    cancels: !finished && (nothingLeft || targetAfter <= 0),
    finished,
    usesToken: view.swapTokens > 0,
    streakAtStake: view.swapTokens > 0 ? 0 : view.streak.weeks,
  };
}

/**
 * Resolves a delete into its Leap consequence at the moment it is asked for.
 * Every entry point that can remove a task — the delete dialog, "skip today",
 * the detail sheet — goes through this, so none of them can quietly end a week.
 */
export function useLeapDelete(): {
  impactFor: (taskIds: string[]) => LeapDeleteImpact | null;
  /** The sibling sessions "stop repeating" would take with it. */
  seriesIdsFor: (taskId: string, repeatGroupId?: string) => string[];
} {
  const { data } = usePactView();
  return useMemo(
    () => ({
      impactFor: (taskIds: string[]) =>
        data ? impactFor(data, taskIds) : null,
      seriesIdsFor: (taskId: string, repeatGroupId?: string) => {
        const sessions = data?.active?.sessions ?? [];
        const group =
          repeatGroupId ??
          sessions.find((s) => s.taskId === taskId)?.repeatGroupId;
        if (!group) return [taskId];
        return Array.from(
          new Set([
            taskId,
            ...sessions
              .filter((s) => s.repeatGroupId === group)
              .map((s) => s.taskId),
          ]),
        );
      },
    }),
    [data],
  );
}

function sessionLabel(sessions: PactSessionView[]) {
  const days = sessions.map((s) => DAY_NAMES[s.dayOfWeek] ?? 'that day');
  if (days.length === 1) return days[0];
  if (days.length === 2) return `${days[0]} and ${days[1]}`;
  return `${days.slice(0, -1).join(', ')} and ${days[days.length - 1]}`;
}

/**
 * The one thing standing between a tap on Delete and a streak the user cannot
 * get back. Deleting a Leap task is the only place in the app where removing a
 * task changes a reward and a streak, so it states both before it happens —
 * naming the sessions, the new goal and what the week is now worth.
 *
 * Same shape as {@link PactChangeSheet}: one consequence list, one accent, and
 * the Plus pitch under the decision rather than beside the button.
 */
export function LeapSessionDeleteSheet({
  open,
  impact,
  busy,
  onClose,
  onConfirm,
  onUpgrade,
}: {
  open: boolean;
  impact: LeapDeleteImpact | null;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onUpgrade?: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const titleId = useId();
  const bodyId = useId();
  useEffect(() => {
    if (open) setConfirmed(false);
  }, [open]);

  if (!impact) return null;
  const {
    view,
    removing,
    removedOpen,
    removedDone,
    removedMissed,
    targetBefore,
    targetAfter,
    fliesBefore,
    fliesAfter,
    cancels,
    finished,
    usesToken,
    streakAtStake,
  } = impact;
  const active = view.active;
  const danger = cancels && !usesToken && streakAtStake > 0;
  const needsSecondTap = danger && !confirmed;

  const title = cancels
    ? 'Delete this and your Leap ends'
    : removedOpen > 0
      ? 'Drop a session from your Leap?'
      : 'Remove this from your board?';
  const subtitle = cancels
    ? 'This is the last session of the week.'
    : removedOpen > 0
      ? `${sessionLabel(removing)} leaves this week's plan.`
      : 'Your goal for the week stays where it is.';

  const consequences: {
    icon: typeof Flame;
    text: string;
    tone: 'danger' | 'good' | 'plain';
  }[] = [];

  if (cancels) {
    consequences.push({
      icon: ListX,
      text: 'The rest of this week’s sessions leave your list',
      tone: 'plain',
    });
    if (usesToken) {
      consequences.push({
        icon: ShieldCheck,
        text: `Uses 1 of your ${view.swapTokens} swap${view.swapTokens === 1 ? '' : 's'}`,
        tone: 'good',
      });
      consequences.push({
        icon: Flame,
        text:
          view.streak.weeks > 0
            ? `Your ${view.streak.weeks}-week streak stays`
            : 'Your streak is untouched',
        tone: 'good',
      });
    } else if (streakAtStake > 0) {
      consequences.push({
        icon: Flame,
        text: `Your ${streakAtStake}-week streak resets to 0`,
        tone: 'danger',
      });
    }
  } else {
    if (finished) {
      consequences.push({
        icon: CheckCircle2,
        text: 'This week is already finished — nothing changes',
        tone: 'good',
      });
    } else if (removedOpen > 0) {
      consequences.push({
        icon: Target,
        text: `This week now asks for ${targetAfter} session${targetAfter === 1 ? '' : 's'}, not ${targetBefore}`,
        tone: 'plain',
      });
    } else {
      consequences.push({
        icon: CalendarX2,
        text: `${removedMissed > 0 ? 'That day has already gone by' : 'Already done'}, so the goal stays at ${targetBefore}`,
        tone: 'plain',
      });
    }
    if (removedDone > 0) {
      consequences.push({
        icon: CheckCircle2,
        text: `The ${removedDone} session${removedDone === 1 ? '' : 's'} you already did still count`,
        tone: 'good',
      });
    }
    consequences.push({
      icon: Flame,
      text:
        view.streak.weeks > 0
          ? `Your ${view.streak.weeks}-week streak keeps running`
          : 'Your streak is safe',
      tone: 'good',
    });
  }

  const showRewardChange = !cancels && fliesAfter !== fliesBefore;

  return (
    <BaseSheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      zIndex={10001}
      className="bg-background ring-1 ring-border/70 sm:max-w-[420px]"
    >
      {() => (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={bodyId}
          className="flex flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3"
        >
          <div className="flex items-start gap-3">
            <span
              className={cn(
                'mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl',
                cancels
                  ? usesToken
                    ? 'bg-primary/12 text-primary'
                    : 'bg-destructive/10 text-destructive'
                  : 'bg-amber-400/15 text-amber-600 dark:text-amber-400',
              )}
            >
              {cancels ? (
                usesToken ? (
                  <ShieldCheck className="h-5 w-5" strokeWidth={2.5} />
                ) : (
                  <TriangleAlert className="h-5 w-5" strokeWidth={2.5} />
                )
              ) : (
                <CalendarX2 className="h-5 w-5" strokeWidth={2.5} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <h2
                id={titleId}
                className="text-[19px] font-black leading-tight text-foreground"
              >
                {title}
              </h2>
              <p className="mt-1 text-[13px] font-semibold leading-snug text-muted-foreground">
                {subtitle}
              </p>
            </div>
          </div>

          {active && (
            <div className="mt-4 rounded-2xl border border-border/60 bg-muted/30 px-3.5 py-3">
              <p className="text-[12px] font-black text-muted-foreground">
                {cancels ? 'Ending' : 'Your Leap'}
              </p>
              <p className="mt-1 text-[14.5px] font-black leading-snug text-foreground">
                {active.commitmentText}
              </p>
              <p className="mt-0.5 text-[12px] font-semibold text-muted-foreground">
                {active.scheduleLabel} · {active.progress} of {targetBefore} done
              </p>
            </div>
          )}

          {showRewardChange && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/[0.07] px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="text-[12px] font-black text-amber-600 dark:text-amber-400">
                  Week now pays
                </p>
                {!view.isPremium && (
                  <p className="mt-0.5 inline-flex items-center gap-1 text-[11.5px] font-black text-amber-600 dark:text-amber-400">
                    <Icon name="frogPlus" className="h-5 w-5 shrink-0" />
                    Plus doubles it
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-[13px] font-black text-muted-foreground line-through">
                  {fliesBefore}
                </span>
                <FlyWorth amount={fliesAfter} flySize={26} />
              </div>
            </div>
          )}

          <ul id={bodyId} className="mt-3 flex flex-col gap-1.5">
            {consequences.map(({ icon: ConsequenceIcon, text, tone }) => (
              <li
                key={text}
                className={cn(
                  'flex items-center gap-2.5 text-[13px] font-bold leading-snug',
                  tone === 'danger'
                    ? 'text-destructive'
                    : tone === 'good'
                      ? 'text-[#4f9149] dark:text-emerald-400'
                      : 'text-muted-foreground',
                )}
              >
                <ConsequenceIcon
                  className="h-4 w-4 shrink-0"
                  strokeWidth={2.5}
                  aria-hidden
                />
                {text}
              </li>
            ))}
          </ul>

          <div className="mt-5 flex flex-col gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (needsSecondTap) {
                  setConfirmed(true);
                  return;
                }
                onConfirm();
              }}
              className={cn(
                'inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-black text-white transition-transform active:translate-y-[2px] active:shadow-none disabled:opacity-60',
                danger
                  ? 'bg-destructive shadow-[0_4px_0_0_rgba(0,0,0,0.28)]'
                  : 'bg-[#4f9149] shadow-[0_4px_0_0_#34631f]',
              )}
            >
              {busy ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Trash2 className="h-4 w-4" strokeWidth={2.75} />
                  {cancels
                    ? usesToken
                      ? 'Use a swap and delete'
                      : needsSecondTap
                        ? 'Delete anyway'
                        : 'Yes, reset my streak'
                    : removedOpen > 0
                      ? `Drop to ${targetAfter} session${targetAfter === 1 ? '' : 's'}`
                      : 'Remove it'}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-11 w-full rounded-2xl text-[14px] font-black text-muted-foreground transition-colors hover:text-foreground"
            >
              Keep my Leap
            </button>
          </div>

          {cancels && !usesToken && !view.isPremium && onUpgrade && (
            <button
              type="button"
              onClick={onUpgrade}
              className="mt-2 flex w-full items-center justify-center gap-1.5 border-t border-border/50 pt-3 text-[12px] font-bold text-muted-foreground transition-colors hover:text-foreground"
            >
              <Icon name="frogPlus" className="h-6 w-6 shrink-0" />
              <span>Plus includes swaps that keep your streak</span>
              <span className="inline-flex items-center rounded-md bg-gradient-to-b from-emerald-600 to-emerald-800 px-1.5 py-0.5 text-[11px] font-black leading-none text-amber-100">
                Plus
              </span>
            </button>
          )}
        </div>
      )}
    </BaseSheet>
  );
}
