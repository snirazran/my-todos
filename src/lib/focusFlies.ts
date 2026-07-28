export const FOCUS_FLY_RATE_SECONDS = 15 * 60;
export const FOCUS_FLY_DAILY_CAP = 5;
export const DEEP_FOCUS_MIN_SECONDS = 15 * 60;
export const DEEP_FOCUS_BONUS_FLIES = 1;
export const DEEP_FOCUS_DAILY_CAP = 1;
export const SCENE_FLY_RATE_SECONDS = 5 * 60;

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

// The ambient swarm every surface renders for a focus session, sized by the
// session's PLANNED length: 5-min sessions get 1 fly, 10-min get 2, 15-min
// and up get 3. Decorative only — payout uses FOCUS_FLY_RATE_SECONDS. Both the
// timer sheet and the home hero derive their count from here so they always agree.
export function sceneFlyCount(plannedFocusSeconds: number, max = 3): number {
  return Math.min(
    Math.min(3, max),
    Math.max(1, Math.floor(plannedFocusSeconds / SCENE_FLY_RATE_SECONDS)),
  );
}
