import { checklistPayout, type ChecklistItem } from './checklist';

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
 * What the task pays if it is completed right now: its own fly and the streak
 * bonus, plus only the checklist markers already passed. It climbs as steps are
 * ticked, so it never promises flies that haven't been secured.
 */
export function taskFlyWorthNow(opts: {
  checklist?: ChecklistItem[] | null;
  streak?: number;
  budgetLock?: number | null;
}): number {
  const items = opts.checklist ?? [];
  const earned = items.length
    ? checklistPayout(items, { budgetLock: opts.budgetLock }).earned
    : 0;
  return 1 + earned + streakFlyBonus(opts.streak ?? 0);
}
