'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Loader2 } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { cn } from '@/lib/utils';
import { refreshQuestHomeView } from '@/lib/questClaims';
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
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

/**
 * Moves one session of the running week onto another day.
 *
 * A week pinned to named days is the thing that actually ends runs: miss
 * Monday and that session dies with six empty days still on the calendar. The
 * move gives the week back its slack without giving anything away — the
 * session count never changes, so the price never changes, and the session
 * still has to be done. It is free for the same reason: this is not a reward,
 * it is permission.
 *
 * Missed days are offered first. That is the case the sheet exists for, and
 * putting a still-upcoming session at the top invites someone to spend their
 * one move on a day they have not lost yet.
 */
export function LeapMoveSheet({
  open,
  onClose,
  view,
}: {
  open: boolean;
  onClose: () => void;
  view: PactView;
}) {
  const { mutate } = usePactView();
  const active = view.active;
  const [taskId, setTaskId] = useState<string | null>(null);
  const [toDay, setToDay] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const movable = useMemo(
    () =>
      (active?.sessions ?? [])
        .filter((session) => session.state !== 'done')
        // Missed first, then by date: the sheet opens on the problem.
        .sort((a, b) => {
          const rank = (s: PactSessionView) => (s.state === 'missed' ? 0 : 1);
          return rank(a) - rank(b) || a.dateKey.localeCompare(b.dateKey);
        }),
    [active?.sessions],
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTaskId(movable[0]?.taskId ?? null);
    setToDay(active?.moveTargets[0] ?? null);
  }, [open, movable, active?.moveTargets]);

  if (!active) return null;

  const chosen = movable.find((session) => session.taskId === taskId);
  const canSave = !!taskId && toDay !== null && !saving;

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/pact/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          toDay,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not move it');
      await mutate(payload, { revalidate: false });
      // The session sits on a different day now, so any board already rendered
      // is showing it in the old place.
      refreshQuestHomeView();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not move it');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BaseSheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      zIndex={1400}
      className="bg-background ring-1 ring-border/70 sm:max-w-[420px]"
    >
      {() => (
        <div className="flex w-full flex-col gap-5 px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-5">
          {/* The close button sits top-right inside the sheet, so the header
              leaves it room rather than running underneath it. */}
          <div className="pr-10">
            <h2 className="text-[19px] font-black leading-tight text-foreground">
              Move a session
            </h2>
            <p className="mt-1.5 text-[13.5px] font-semibold leading-snug text-muted-foreground">
              Same work, same reward — only the day changes.
            </p>
          </div>

          {movable.length > 1 ? (
            <Section label="Move which one">
              <div className="flex flex-col gap-1.5">
                {movable.map((session) => {
                  const picked = session.taskId === taskId;
                  return (
                    <button
                      key={session.taskId}
                      type="button"
                      onClick={() => setTaskId(session.taskId)}
                      className={cn(
                        'flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors',
                        picked
                          ? 'border-[#4f9149] bg-[#4f9149]/10'
                          : 'border-border/60 bg-card/60 hover:bg-muted/60',
                      )}
                    >
                      <span className="min-w-0 truncate text-[14px] font-black text-foreground">
                        {DAY_NAMES[session.dayOfWeek]}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-black',
                          session.state === 'missed'
                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                            : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {session.state === 'missed' ? 'Missed' : 'Upcoming'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Section>
          ) : (
            // One session is not a choice, so it is stated rather than picked.
            chosen && (
              <p className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card/60 px-3.5 py-3 text-[14px] font-black text-foreground">
                Moving {DAY_NAMES[chosen.dayOfWeek]}
                {chosen.state === 'missed' && (
                  <span className="rounded-lg bg-amber-500/15 px-2 py-0.5 text-[11px] font-black text-amber-700 dark:text-amber-400">
                    Missed
                  </span>
                )}
              </p>
            )
          )}

          <Section label="To which day">
            {/* A fixed grid rather than a wrapping row: seven ragged chips
                reflow into a different shape on every pact, and a flex-wrap
                leaves the last row hanging under a half-empty one. */}
            <div className="grid grid-cols-4 gap-1.5 min-[380px]:grid-cols-5">
              {active.moveTargets.map((day) => {
                const picked = day === toDay;
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setToDay(day)}
                    className={cn(
                      'h-11 rounded-xl border text-[13px] font-black transition-colors',
                      picked
                        ? 'border-[#4f9149] bg-[#4f9149] text-white'
                        : 'border-border/60 bg-card/60 text-foreground hover:bg-muted/60',
                    )}
                  >
                    {DAY_SHORT[day]}
                  </button>
                );
              })}
            </div>
          </Section>

          {error && (
            <p className="text-[13px] font-bold text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={!canSave}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#4f9149] text-[15px] font-black text-white shadow-[0_4px_0_0_#34631f] transition-transform active:translate-y-[2px] active:shadow-none disabled:opacity-60 disabled:shadow-none"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <CalendarDays className="h-4 w-4" />
                  {chosen && toDay !== null
                    ? `Move ${DAY_SHORT[chosen.dayOfWeek]} to ${DAY_SHORT[toDay]}`
                    : 'Move it'}
                </>
              )}
            </button>
            {/* The cost of the action, under the button that spends it. */}
            <p className="text-center text-[12px] font-bold text-muted-foreground">
              {active.movesLeft === 1
                ? 'Your one move this week'
                : `${active.movesLeft} moves left this week`}
            </p>
          </div>
        </div>
      )}
    </BaseSheet>
  );
}

/** Whether the card should offer a move at all. */
export function canMoveSession(view: PactView) {
  const active = view.active;
  if (!active || active.claimed) return false;
  if (active.movesLeft <= 0 || active.moveTargets.length === 0) return false;
  return active.sessions.some((session) => session.state !== 'done');
}
