'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Coffee, Play } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import Frog from '@/components/ui/frog';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { DurationDial } from '@/components/ui/DurationDial';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { hapticSelect } from '@/lib/haptics';
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

function focusedLabel(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return 'Under a minute';
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} focused`;
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
  const [mode, setMode] = useState<'break' | 'focus'>('break');
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [focusMinutes, setFocusMinutes] = useState(25);

  const { indices: frogIndices } = useWardrobeIndices(open);

  useEffect(() => {
    if (!open) {
      setMode('break');
      return;
    }
    const store = useFrogodoroStore.getState();
    setBreakMinutes(Math.max(1, Math.round(store.settings.breakDuration)) || 5);
    setFocusMinutes(Math.max(1, Math.round(store.settings.focusDuration)) || 25);
  }, [open]);

  // The session still gets closed out, so the same sitting is never offered
  // again the next time the app is opened.
  const settleReview = useCallback(async () => {
    if (!review) return;
    try {
      await fetch('/api/frogodoro/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: review.id, taskIds: [] }),
      });
    } catch {
      // The session keeps its minutes either way.
    }
  }, [review]);

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
            className="shrink-0 px-5 pb-3 pt-3 sm:px-6 sm:pt-5"
            onPointerDown={isDesktop ? undefined : (event) => dragControls.start(event)}
          >
            <p className="text-[12px] font-black text-emerald-600 dark:text-emerald-400">
              {focusedLabel(review.focusSeconds)} · {headline}
            </p>
            <h2 className="mt-0.5 text-balance text-xl font-black tracking-[-0.03em] text-foreground">
              What now?
            </h2>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-16 sm:px-6">
            {/* Wears the timer's own clothes — same green field, same pill
                toggle, same dial — so this reads as one more beat of the timer
                rather than a different screen that happens to follow it. */}
            <div className="rounded-3xl bg-primary px-4 pb-4 pt-3 dark:bg-green-700">
              <div className="mx-auto mb-3 flex w-fit items-center gap-1 rounded-full bg-black/20 p-1">
                {(['break', 'focus'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      hapticSelect();
                      setMode(option);
                    }}
                    aria-pressed={mode === option}
                    className={`min-h-9 rounded-full px-4 text-[13px] font-black transition-all ${
                      mode === option
                        ? 'bg-white text-primary shadow-sm dark:text-green-700'
                        : 'text-white/70 hover:text-white'
                    }`}
                  >
                    {option === 'break' ? 'Take a break' : 'Keep going'}
                  </button>
                ))}
              </div>

              {mode === 'break' ? (
                <DurationDial
                  minutes={breakMinutes}
                  onChange={setBreakMinutes}
                  presets={BREAK_PRESETS}
                  max={60}
                  label="Break length in minutes"
                />
              ) : (
                <DurationDial
                  minutes={focusMinutes}
                  onChange={setFocusMinutes}
                  presets={FOCUS_PRESETS}
                  label="Focus length in minutes"
                />
              )}
            </div>
          </div>

          <div className="shrink-0 border-t border-border/60 bg-background/95 px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 backdrop-blur sm:px-6">
            {/* The frog perches on the primary action, the same way it sits on
                START and DONE in the timer itself. Rive waits for `entered` so
                no canvas is built while the sheet is still animating in. */}
            <div className="relative">
              <div
                className="pointer-events-none absolute left-1/2 z-30 -translate-x-1/2"
                style={{ bottom: 'calc(100% - 7px)' }}
              >
                {entered ? (
                  <Frog
                    width={132}
                    height={149}
                    indices={frogIndices}
                    ignoreIdlePause
                  />
                ) : (
                  <FrogSnapshot indices={frogIndices} width={132} height={149} />
                )}
              </div>

              <button
                type="button"
                onClick={() =>
                  finish(
                    mode === 'break'
                      ? { kind: 'break', seconds: breakMinutes * 60 }
                      : { kind: 'focus', seconds: focusMinutes * 60 },
                  )
                }
                className="relative flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-black text-primary-foreground shadow-md shadow-primary/20 transition-all active:scale-[0.98]"
              >
                {mode === 'break' ? (
                  <>
                    <Coffee className="h-4 w-4" aria-hidden="true" />
                    Take {breakMinutes} min break
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                    Focus {focusMinutes} more min
                  </>
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={() => finish({ kind: 'done' })}
              className="mt-2 min-h-11 w-full rounded-2xl text-[14px] font-bold text-muted-foreground transition-colors hover:bg-muted/40"
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
