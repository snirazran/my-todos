export const FOCUS_FLY_RATE_SECONDS = 5 * 60;
export const FOCUS_FLY_DAILY_CAP = 12;
export const DEEP_FOCUS_MIN_SECONDS = 15 * 60;
export const DEEP_FOCUS_BONUS_FLIES = 1;

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

export function fliesCaughtFor(focusSeconds: number): number {
  return Math.max(0, Math.floor(focusSeconds / FOCUS_FLY_RATE_SECONDS));
}

// The ambient swarm every surface renders for a focus session, sized by the
// session's PLANNED length: 5-min sessions get 1 fly, 10-min get 2, 15-min
// and up get 3. Both the timer sheet and the home hero derive their count
// from here so they always agree.
export function sceneFlyCount(plannedFocusSeconds: number, max = 3): number {
  return Math.min(
    Math.min(3, max),
    Math.max(1, Math.floor(plannedFocusSeconds / FOCUS_FLY_RATE_SECONDS)),
  );
}
