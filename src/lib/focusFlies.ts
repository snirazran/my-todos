export const FOCUS_FLY_RATE_SECONDS = 15 * 60;
export const FOCUS_FIRST_FLY_SECONDS = 2 * 60;
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

// Flies the server has credited for a whole day of focused seconds: one for
// the day's first FOCUS_FIRST_FLY_SECONDS, then one per FOCUS_FLY_RATE_SECONDS.
// The daily cap lives here, so every "caught" count a surface shows is the
// difference between two points on this curve and can never promise more than
// the payout.
export function focusFliesEarnedForDay(dayFocusSeconds: number): number {
  const seconds = Math.max(0, dayFocusSeconds);
  return Math.min(
    FOCUS_FLY_DAILY_CAP,
    (seconds >= FOCUS_FIRST_FLY_SECONDS ? 1 : 0) +
      Math.floor(seconds / FOCUS_FLY_RATE_SECONDS),
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

type PhaseSchedule = {
  before: number;
  potential: number;
  owed: number;
  full: number;
  elapsed: number;
  early: number | null;
};

type PhaseInput = {
  /** Live focused seconds this session, the running phase included. */
  sessionFocusSeconds: number;
  /** Seconds elapsed in the running focus phase. */
  phaseElapsedSeconds: number;
  /** Full length of the focus phase. */
  phaseFullSeconds: number;
  /** Focused seconds banked earlier today, outside this session. */
  priorFocusSeconds: number;
};

function phaseSchedule({
  sessionFocusSeconds,
  phaseElapsedSeconds,
  phaseFullSeconds,
  priorFocusSeconds,
}: PhaseInput): PhaseSchedule {
  const prior = Math.max(0, priorFocusSeconds);
  const sessionFocus = Math.max(0, sessionFocusSeconds);
  const full = Math.max(1, Math.round(phaseFullSeconds));
  const elapsed = Math.min(full, Math.max(0, Math.round(phaseElapsedSeconds)));
  // Focus banked by earlier phases of this session. Derived by subtraction so
  // it holds still as the phase runs and the count never ticks backwards.
  const bankedInSession = Math.max(0, sessionFocus - elapsed);
  const before = fliesCaughtFor(bankedInSession, prior);
  const potential = fliesCaughtFor(bankedInSession + full, prior);
  const owed = potential - before;
  const banked = prior + bankedInSession;
  return {
    before,
    potential,
    owed,
    full,
    elapsed,
    early:
      owed > 0 && banked < FOCUS_FIRST_FLY_SECONDS
        ? FOCUS_FIRST_FLY_SECONDS - banked
        : null,
  };
}

function markSecond(schedule: PhaseSchedule, index: number): number {
  const { owed, full, early } = schedule;
  if (early === null) return (index * full) / owed;
  if (index <= 1 || owed <= 1) return early;
  return early + ((index - 1) * (full - early)) / (owed - 1);
}

function marksReached(schedule: PhaseSchedule, second: number): number {
  const { owed, full, early } = schedule;
  if (early === null) {
    return Math.min(owed, Math.floor((second * owed) / full));
  }
  if (second < early) return 0;
  return Math.min(
    owed,
    1 +
      Math.floor(
        ((second - early) * Math.max(0, owed - 1)) / Math.max(1, full - early),
      ),
  );
}

/**
 * WHEN a focus phase's flies are caught, as opposed to how many it pays.
 *
 * `focusFliesEarnedForDay` decides what the server credits; this decides the
 * rhythm. The day's first fly lands on its own boundary, two minutes in, so a
 * new session pays before the user has had time to wonder whether it will.
 * Every other fly the phase owes is spread evenly across what is left of it,
 * the last one landing as the timer runs out. 5 min → one catch at 2:00.
 * 25 min → 2:00 and the end. 45 min → 2:00, then three more to the end.
 *
 * A mark is never earlier than the boundary that pays for it, so the frog can
 * only ever catch a fly the server has already credited — never the reverse.
 */
export function focusPhaseCatches({
  onFocusPhase,
  ...input
}: PhaseInput & {
  /** False on a break or once the phase has finished. */
  onFocusPhase: boolean;
}): FocusPhaseCatches {
  if (!onFocusPhase) {
    const done = fliesCaughtFor(
      Math.max(0, input.sessionFocusSeconds),
      Math.max(0, input.priorFocusSeconds),
    );
    return { caught: done, potential: done, nextCatchIn: null };
  }
  const schedule = phaseSchedule(input);
  const { before, potential, owed, elapsed } = schedule;
  if (owed <= 0) return { caught: before, potential, nextCatchIn: null };

  const hit = marksReached(schedule, elapsed + CATCH_LEAD_SECONDS);
  return {
    caught: before + hit,
    potential,
    nextCatchIn:
      hit >= owed
        ? null
        : Math.ceil(markSecond(schedule, hit + 1)) -
          CATCH_LEAD_SECONDS -
          elapsed,
  };
}

export function focusPhaseMarks(input: PhaseInput): number[] {
  const schedule = phaseSchedule(input);
  const marks: number[] = [];
  for (let index = 1; index <= schedule.owed; index += 1) {
    marks.push(Math.min(1, markSecond(schedule, index) / schedule.full));
  }
  return marks;
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
