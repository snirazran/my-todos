import TaskModel, { type TaskDoc } from '@/lib/models/Task';
import {
  addDaysYMD,
  repeatStartForDoc,
  siblingOccursOn,
} from '@/lib/taskOccurrence';
import type { TaskStreakAtRisk } from './types';

export const MAX_CONSECUTIVE_SKIPS = 2;

/**
 * How far back a completion may be ticked and still count toward a streak.
 * 1 = today plus yesterday: forgetting to log yesterday is recoverable all of
 * today, anything older records for history but cannot revive a streak.
 */
export const STREAK_CREDIT_WINDOW_DAYS = 1;

export function isWithinStreakCreditWindow(date: string, today: string) {
  return date >= addDaysYMD(today, -STREAK_CREDIT_WINDOW_DAYS);
}

export type GroupStreakOptions = {
  protectedDays?: ReadonlySet<string>;
  /**
   * Set when `today` is a day that has already closed. The "not done yet"
   * grace only applies to a day still in progress — without this, asking for a
   * streak as of a past date silently forgives that date's miss.
   */
  todayIsOver?: boolean;
};

/**
 * Consecutive-completion streak for a repeating habit, as of `today`. A
 * daily/weekdays/weekend habit is stored as several sibling docs (one per
 * weekday, linked by repeatGroupId), each holding its own completedDates — so
 * the streak is computed across the WHOLE group: the habit is "scheduled" on a
 * date if any sibling is, and "done" if any sibling recorded it. Walks backward
 * from today until the first missed scheduled date.
 *
 * Four things bridge a scheduled date without breaking the run:
 * - today not being done yet (the day isn't over)
 * - a date in `protectedDays` (a Streak Freeze or ad rescue shielded that day)
 * - up to MAX_CONSECUTIVE_SKIPS suppressed/skipped occurrences in a row
 * Completions recorded outside the streak-credit window (lateCompletedDates)
 * are deliberately NOT treated as done — they are history, not streak fuel.
 */
export function computeGroupStreak(
  sibs: TaskDoc[],
  today: string,
  tz: string,
  options: GroupStreakOptions = {},
) {
  if (sibs.length === 0) return 0;
  const protectedDays = options.protectedDays;
  const completed = new Set<string>();
  const late = new Set<string>();
  const suppressed = new Set<string>();
  let earliestStart: string | undefined;
  for (const s of sibs) {
    for (const d of s.completedDates ?? []) completed.add(d);
    for (const d of s.lateCompletedDates ?? []) late.add(d);
    for (const d of s.suppressedDates ?? []) suppressed.add(d);
    const rs = repeatStartForDoc(s, tz);
    if (rs && (!earliestStart || rs < earliestStart)) earliestStart = rs;
  }
  let streak = 0;
  let skipRun = 0;
  let d = today;
  for (let guard = 0; guard < 2000; guard++) {
    if (earliestStart && d < earliestStart) break;
    if (sibs.some((s) => siblingOccursOn(s, d))) {
      if (completed.has(d) && !late.has(d)) {
        skipRun = 0;
        streak++;
      } else if (d === today && !options.todayIsOver) {
        skipRun = 0;
      } else if (protectedDays?.has(d)) {
        skipRun = 0;
      } else if (suppressed.has(d)) {
        skipRun++;
        if (skipRun > MAX_CONSECUTIVE_SKIPS) break;
      } else {
        break;
      }
    }
    d = addDaysYMD(d, -1);
  }
  return streak;
}

const STREAK_SELECT = {
  id: 1,
  text: 1,
  type: 1,
  dayOfWeek: 1,
  completedDates: 1,
  lateCompletedDates: 1,
  suppressedDates: 1,
  repeatGroupId: 1,
  repeatRule: 1,
  repeatStartDate: 1,
  repeatEndDate: 1,
  repeatMode: 1,
  repeatDayOfMonth: 1,
  createdAt: 1,
} as const;

function groupSiblings(docs: TaskDoc[]) {
  const groups = new Map<string, TaskDoc[]>();
  for (const doc of docs) {
    const key = doc.repeatGroupId || `solo:${doc.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(doc);
  }
  return groups;
}

/**
 * Habit streaks that `missedDayKey` is about to break: scheduled that day,
 * not completed, not skipped, not already shielded, and carrying a live streak
 * going into it. Used to build the one-tap rescue offer.
 */
export async function findTaskStreaksAtRisk(args: {
  userId: string;
  missedDayKey: string;
  timezone: string;
  protectedDays: ReadonlySet<string>;
  minStreak: number;
}): Promise<TaskStreakAtRisk[]> {
  const { userId, missedDayKey, timezone, protectedDays, minStreak } = args;
  if (protectedDays.has(missedDayKey)) return [];

  const docs = await TaskModel.find(
    { userId, type: 'weekly', deletedAt: { $exists: false } },
    STREAK_SELECT,
  )
    .lean<TaskDoc[]>()
    .exec();
  if (docs.length === 0) return [];

  const dayBefore = addDaysYMD(missedDayKey, -1);
  const atRisk: TaskStreakAtRisk[] = [];

  for (const sibs of Array.from(groupSiblings(docs).values())) {
    if (!sibs.some((s) => siblingOccursOn(s, missedDayKey))) continue;
    if (sibs.some((s) => (s.completedDates ?? []).includes(missedDayKey)))
      continue;
    if (sibs.some((s) => (s.suppressedDates ?? []).includes(missedDayKey)))
      continue;

    const count = computeGroupStreak(sibs, dayBefore, timezone, {
      protectedDays,
      todayIsOver: true,
    });
    if (count < minStreak) continue;

    atRisk.push({
      taskId: sibs[0].id,
      text: sibs[0].text,
      count,
    });
  }

  return atRisk.sort((a, b) => b.count - a.count).slice(0, 12);
}
