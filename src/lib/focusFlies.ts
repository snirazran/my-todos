export const FOCUS_FLY_RATE_SECONDS = 15 * 60;
export const FOCUS_FLY_DAILY_CAP = 5;
export const DEEP_FOCUS_MIN_SECONDS = 15 * 60;
export const DEEP_FOCUS_BONUS_FLIES = 1;
export const DEEP_FOCUS_DAILY_CAP = 1;
export const SCENE_FLY_MAX = 3;

// The deep-focus pledge is "live" while an unbroken focus phase long enough
// to qualify is selected/running — every surface uses this to show/hide the
// bonus fly and to warn before a pledge-breaking pause.
export function deepFocusPledgeLive(s: {
  deepFocus: boolean;
  pausedThisPhase: boolean;
  phase: string;
  focusDurationMinutes: number;
}): boolean {
  return (
    s.deepFocus &&
    !s.pausedThisPhase &&
    s.phase === 'focus' &&
    s.focusDurationMinutes * 60 >= DEEP_FOCUS_MIN_SECONDS
  );
}

// Flies the server has credited for a whole day of focused seconds. The daily
// cap lives here, so every "caught" count a surface shows is the difference
// between two points on this curve and can never promise more than the payout.
export function focusFliesEarnedForDay(dayFocusSeconds: number): number {
  return Math.min(
    FOCUS_FLY_DAILY_CAP,
    Math.max(0, Math.floor(dayFocusSeconds / FOCUS_FLY_RATE_SECONDS)),
  );
}

export function fliesCaughtFor(
  focusSeconds: number,
  priorDayFocusSeconds = 0,
): number {
  const prior = Math.max(0, priorDayFocusSeconds);
  return Math.max(
    0,
    focusFliesEarnedForDay(prior + Math.max(0, focusSeconds)) -
      focusFliesEarnedForDay(prior),
  );
}

// A catch fires this many seconds before its mark, so the whole grab — tongue
// out, snatch, gulp, "+1" arc into the chip — plays out and finishes as the
// timer reaches zero instead of starting there and colliding with the alarm.
export const CATCH_LEAD_SECONDS = 2;

export type FocusPhaseCatches = {
  caught: number;
  potential: number;
  /** Seconds until the next catch fires; null once the phase owes none. */
  nextCatchIn: number | null;
};

/**
 * WHEN a focus phase's flies are caught, as opposed to how many it pays.
 *
 * The payout curve is untouched — `focusFliesEarnedForDay` still decides what
 * the server credits, and `potential` here is the same number every surface
 * showed before. What changes is the rhythm: instead of landing on raw
 * 15-minute boundaries (which made a 25-minute session catch its only fly at
 * 15:00 and then coast for ten empty minutes), the phase's flies are spread
 * evenly across its own length. 25 min → one catch at the end. 35 min → two,
 * at the halfway mark and the end.
 *
 * A proportional mark is never earlier than the boundary that pays for it
 * (a phase yielding N flies is at least N * 15 minutes long), so the frog can
 * only ever catch a fly the server has already credited — never the reverse.
 */
export function focusPhaseCatches({
  sessionFocusSeconds,
  phaseElapsedSeconds,
  phaseFullSeconds,
  priorFocusSeconds,
  onFocusPhase,
}: {
  /** Live focused seconds this session, the running phase included. */
  sessionFocusSeconds: number;
  /** Seconds elapsed in the running focus phase. */
  phaseElapsedSeconds: number;
  /** Full length of the focus phase. */
  phaseFullSeconds: number;
  /** Focused seconds banked earlier today, outside this session. */
  priorFocusSeconds: number;
  /** False on a break or once the phase has finished. */
  onFocusPhase: boolean;
}): FocusPhaseCatches {
  const prior = Math.max(0, priorFocusSeconds);
  const sessionFocus = Math.max(0, sessionFocusSeconds);
  if (!onFocusPhase) {
    const done = fliesCaughtFor(sessionFocus, prior);
    return { caught: done, potential: done, nextCatchIn: null };
  }
  const full = Math.max(1, Math.round(phaseFullSeconds));
  const elapsed = Math.min(full, Math.max(0, Math.round(phaseElapsedSeconds)));
  // Focus banked by earlier phases of this session. Derived by subtraction so
  // it holds still as the phase runs and the count never ticks backwards.
  const before = fliesCaughtFor(Math.max(0, sessionFocus - elapsed), prior);
  const potential = fliesCaughtFor(
    Math.max(0, sessionFocus - elapsed) + full,
    prior,
  );
  const owed = potential - before;
  if (owed <= 0) return { caught: before, potential, nextCatchIn: null };

  // Integer math throughout: mark k sits at k * full / owed, and the last one
  // lands on the exact tick the phase ends rather than a frame either side.
  const hit = Math.min(
    owed,
    Math.floor(((elapsed + CATCH_LEAD_SECONDS) * owed) / full),
  );
  return {
    caught: before + hit,
    potential,
    nextCatchIn:
      hit >= owed
        ? null
        : Math.ceil(((hit + 1) * full) / owed) - CATCH_LEAD_SECONDS - elapsed,
  };
}

// Focused seconds banked EARLIER today, outside the running session — the
// baseline a session's catch count counts up from. Stays stable as the session
// grows (both totals grow together), so the count never ticks backwards.
export function priorDayFocusSeconds(
  daily: { focusSeconds?: number } | null | undefined,
  sessionFocusSeconds: number,
): number {
  if (!daily) return 0;
  return Math.max(0, (daily.focusSeconds ?? 0) - Math.max(0, sessionFocusSeconds));
}

// The ambient swarm every surface renders for a focus session: exactly the
// flies this session can still catch, capped at SCENE_FLY_MAX so a long
// session doesn't crowd the card. A session that earns nothing shows nothing,
// and each catch removes one unless there are more still owed. Both the timer
// sheet and the home hero derive their count from here so they always agree.
export function sceneFlyCount(fliesRemaining: number, max = SCENE_FLY_MAX): number {
  return Math.max(
    0,
    Math.min(Math.min(SCENE_FLY_MAX, max), Math.floor(fliesRemaining)),
  );
}
