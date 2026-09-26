'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { format } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Coffee, Play } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import Frog from '@/components/ui/frog';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { hapticSelect, hapticSuccess, hapticTick } from '@/lib/haptics';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';
import { BREAK_PRESETS, FOCUS_PRESETS, useFrogodoroStore } from '@/lib/frogodoroStore';
import { subjectHeadline, type FocusSubjectKind } from '@/lib/focusSubject';

export type PendingReview = {
  id: string;
  date: string;
  subjectKind: FocusSubjectKind;
  subjectId: string;
  subjectLabel: string;
  subjectTags: string[];
  focusSeconds: number;
  breakSeconds: number;
};

export type ReviewOutcome =
  | { kind: 'break'; seconds: number }
  | { kind: 'focus'; seconds: number }
  | { kind: 'done' };

type ReviewTask = { id: string; text: string; completed: boolean; tags?: string[] };

const TASKS_SHOWN = 4;

function focusedLabel(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return 'Under a minute';
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

function NextCard({
  tone,
  icon,
  title,
  minutes,
  presets,
  onMinutes,
  onStart,
}: {
  tone: 'break' | 'focus';
  icon: React.ReactNode;
  title: string;
  minutes: number;
  presets: number[];
  onMinutes: (m: number) => void;
  onStart: () => void;
}) {
  const base =
    tone === 'break'
      ? 'bg-sky-500 dark:bg-sky-700'
      : 'bg-primary dark:bg-green-700';
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onStart}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onStart();
        }
      }}
      aria-label={`${title}, ${minutes} minutes`}
      className={`flex cursor-pointer flex-col gap-2 rounded-[22px] p-3.5 text-white shadow-sm transition-transform active:scale-[0.97] ${base}`}
    >
      <span className="flex items-center gap-1.5 text-[13px] font-black text-white/90">
        {icon}
        {title}
      </span>
      <span className="flex items-baseline gap-1">
        <span className="text-[34px] font-black leading-none tracking-tight tabular-nums">
          {minutes}
        </span>
        <span className="text-[13px] font-black text-white/75">min</span>
      </span>
      <span className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => {
              hapticTick();
              onMinutes(preset);
            }}
            aria-pressed={minutes === preset}
            className={`h-7 min-w-8 rounded-full px-2 text-[12px] font-black transition-colors ${
              minutes === preset
                ? 'bg-white text-slate-900'
                : 'bg-white/20 text-white hover:bg-white/30'
            }`}
          >
            {preset}
          </button>
        ))}
      </span>
    </div>
  );
}

export function FocusReviewSheet({
  open,
  onOpenChange,
  review,
  onOutcome,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  review: PendingReview | null;
  onOutcome: (outcome: ReviewOutcome) => void;
}>) {
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [finishedIds, setFinishedIds] = useState<Set<string>>(new Set());
  const [showAllTasks, setShowAllTasks] = useState(false);

  const [frogSwap, setFrogSwap] = useState<'snapshot' | 'fading' | 'live'>(
    'snapshot',
  );
  const frogFadeTimersRef = useRef<number[]>([]);
  const handleFrogReady = useCallback(() => {
    if (frogFadeTimersRef.current.length > 0) return;
    frogFadeTimersRef.current.push(
      window.setTimeout(
        () => setFrogSwap((v) => (v === 'snapshot' ? 'fading' : v)),
        200,
      ),
      window.setTimeout(() => setFrogSwap('live'), 430),
    );
  }, []);
  useEffect(() => {
    if (open) return;
    setFrogSwap('snapshot');
    for (const t of frogFadeTimersRef.current) window.clearTimeout(t);
    frogFadeTimersRef.current = [];
  }, [open]);

  const { indices: frogIndices } = useWardrobeIndices(open);

  useEffect(() => {
    if (!open) {
      setFinishedIds(new Set());
      setShowAllTasks(false);
      return;
    }
    const store = useFrogodoroStore.getState();
    setBreakMinutes(Math.max(1, Math.round(store.settings.breakDuration)) || 5);
    setFocusMinutes(Math.max(1, Math.round(store.settings.focusDuration)) || 25);
  }, [open]);

  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    [],
  );
  const today = format(new Date(), 'yyyy-MM-dd');
  const { data: taskData } = useSWR<{ tasks?: ReviewTask[] }>(
    open && review
      ? `/api/tasks?date=${today}&timezone=${encodeURIComponent(timezone)}`
      : null,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );

  const candidates = useMemo(() => {
    if (!review) return [];
    const list = (taskData?.tasks ?? []).filter(
      (t) => !t.completed || finishedIds.has(t.id),
    );
    const rank = (t: ReviewTask) => {
      if (t.id === review.subjectId) return 0;
      if (review.subjectTags.some((tag) => t.tags?.includes(tag))) return 1;
      return 2;
    };
    return [...list].sort((a, b) => rank(a) - rank(b));
  }, [taskData?.tasks, review, finishedIds]);

  const visibleTasks = showAllTasks
    ? candidates
    : candidates.slice(0, TASKS_SHOWN);

  const toggleFinished = async (task: ReviewTask) => {
    const nowDone = !finishedIds.has(task.id);
    if (nowDone) hapticSuccess();
    else hapticTick();
    setFinishedIds((prev) => {
      const next = new Set(prev);
      if (nowDone) next.add(task.id);
      else next.delete(task.id);
      return next;
    });
    try {
      await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id,
          date: today,
          completed: nowDone,
          timezone,
        }),
      });
    } catch {
      setFinishedIds((prev) => {
        const next = new Set(prev);
        if (nowDone) next.delete(task.id);
        else next.add(task.id);
        return next;
      });
    }
  };

  const settleReview = useCallback(async () => {
    if (!review) return;
    try {
      await fetch('/api/frogodoro/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: review.id,
          taskIds: Array.from(finishedIds),
        }),
      });
    } catch {
      // The session keeps its minutes either way.
    }
  }, [review, finishedIds]);

  const finish = (outcome: ReviewOutcome) => {
    hapticSelect();
    void settleReview();
    onOutcome(outcome);
    onOpenChange(false);
  };

  const headline = useMemo(
    () =>
      review ? subjectHeadline(review.subjectKind, review.subjectLabel) : '',
    [review],
  );

  if (!review) return null;

  return (
    <BaseSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          void settleReview();
          onOutcome({ kind: 'done' });
        }
        onOpenChange(next);
      }}
      zIndex={1500}
      className="max-h-[88dvh] rounded-t-[28px] bg-background sm:max-w-lg sm:rounded-[28px]"
      closeAriaLabel="Close session summary"
    >
      {({ dragControls, isDesktop, entered }) => (
        <div className="flex max-h-[88dvh] flex-col">
          <div
            className="flex shrink-0 flex-col items-center px-5 pb-2 pt-2 text-center sm:px-6 sm:pt-4"
            onPointerDown={isDesktop ? undefined : (event) => dragControls.start(event)}
          >
            <div className="relative h-[92px] w-[82px]">
              {entered && (
                <Frog
                  width={82}
                  height={92}
                  indices={{ ...frogIndices, mood: 0 }}
                  emote="love"
                  ignoreIdlePause
                  onDressed={handleFrogReady}
                />
              )}
              {frogSwap !== 'live' && (
                <div
                  className={`transition-opacity duration-200 ${
                    entered ? 'absolute inset-0' : ''
                  } ${frogSwap === 'fading' ? 'opacity-0' : 'opacity-100'}`}
                >
                  <FrogSnapshot indices={frogIndices} width={82} height={92} />
                </div>
              )}
            </div>
            <h2 className="mt-1 text-balance text-[22px] font-black tracking-[-0.03em] text-foreground">
              Nice focus!
            </h2>
            <p className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[13px] font-black text-primary">
              <span className="tabular-nums">{focusedLabel(review.focusSeconds)}</span>
              <span className="opacity-60">on</span>
              <span className="truncate">{headline}</span>
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 pt-3 sm:px-6">
            {candidates.length > 0 && (
              <section className="mb-5">
                <h3 className="mb-2 px-1 text-[12px] font-black uppercase tracking-wide text-muted-foreground">
                  Finished anything?
                </h3>
                <div className="flex flex-col gap-1.5">
                  {visibleTasks.map((task) => {
                    const done = finishedIds.has(task.id);
                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => void toggleFinished(task)}
                        aria-pressed={done}
                        className={`flex min-h-[52px] w-full items-center gap-3 rounded-2xl border px-3.5 py-2 text-left transition-colors active:scale-[0.99] ${
                          done
                            ? 'border-primary/40 bg-primary/10'
                            : 'border-border/60 bg-card hover:bg-muted/40'
                        }`}
                      >
                        <span
                          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors ${
                            done
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-muted-foreground/35'
                          }`}
                        >
                          <AnimatePresence initial={false}>
                            {done && (
                              <motion.span
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                exit={{ scale: 0 }}
                                transition={{ type: 'spring', stiffness: 600, damping: 26 }}
                              >
                                <Check className="h-3.5 w-3.5" strokeWidth={3.5} />
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </span>
                        <span
                          className={`min-w-0 flex-1 truncate text-[15px] font-bold ${
                            done ? 'text-muted-foreground line-through' : 'text-foreground'
                          }`}
                        >
                          {task.text}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {!showAllTasks && candidates.length > TASKS_SHOWN && (
                  <button
                    type="button"
                    onClick={() => setShowAllTasks(true)}
                    className="mt-1.5 w-full rounded-xl py-2 text-[12px] font-black text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                  >
                    Show {candidates.length - TASKS_SHOWN} more
                  </button>
                )}
              </section>
            )}

            <section>
              <h3 className="mb-2 px-1 text-[12px] font-black uppercase tracking-wide text-muted-foreground">
                Up next
              </h3>
              <div className="grid grid-cols-2 gap-2.5">
                <NextCard
                  tone="break"
                  icon={<Coffee className="h-4 w-4" aria-hidden="true" />}
                  title="Take a break"
                  minutes={breakMinutes}
                  presets={BREAK_PRESETS}
                  onMinutes={setBreakMinutes}
                  onStart={() => finish({ kind: 'break', seconds: breakMinutes * 60 })}
                />
                <NextCard
                  tone="focus"
                  icon={<Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />}
                  title="Keep going"
                  minutes={focusMinutes}
                  presets={FOCUS_PRESETS}
                  onMinutes={setFocusMinutes}
                  onStart={() => finish({ kind: 'focus', seconds: focusMinutes * 60 })}
                />
              </div>
            </section>
          </div>

          <div className="shrink-0 px-5 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-1 sm:px-6">
            <button
              type="button"
              onClick={() => finish({ kind: 'done' })}
              className="min-h-11 w-full rounded-2xl text-[14px] font-bold text-muted-foreground transition-colors hover:bg-muted/40"
            >
              I&apos;m done for now
            </button>
          </div>
        </div>
      )}
    </BaseSheet>
  );
}

export default FocusReviewSheet;
