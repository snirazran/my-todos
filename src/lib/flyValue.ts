import { checklistBudget } from './checklist';

/** [minimum streak, base flies] — days 3–10 pay +1, 11–15 pay +2, 16+ pay +3. */
export const STREAK_FLY_TIERS: ReadonlyArray<readonly [number, number]> = [
  [16, 4],
  [11, 3],
  [3, 2],
];

/** Base flies for a completion at the given streak length (1 below the first tier). */
export function streakFlyBase(streak: number): number {
  for (const [minDays, flies] of STREAK_FLY_TIERS) {
    if (streak >= minDays) return flies;
  }
  return 1;
}

/** Flies a streak of this length adds on top of the task's own value. */
export function streakFlyBonus(streak: number): number {
  return streakFlyBase(streak) - 1;
}

/**
 * What a task pays for a completion: 1 fly, or the checklist's step-count
 * budget when it has one, plus the streak bonus.
 */
export function taskFlyValue(opts: {
  checklistSteps?: number;
  streak?: number;
}): number {
  const steps = opts.checklistSteps ?? 0;
  return (
    (steps > 0 ? checklistBudget(steps) : 1) + streakFlyBonus(opts.streak ?? 0)
  );
}
