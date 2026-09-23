import type { TaskDoc, Weekday } from '@/lib/models/Task';
import { getZonedYMD } from '@/lib/utils';

export function dowFromYMD(ymd: string) {
  return new Date(`${ymd}T12:00:00Z`).getUTCDay() as Weekday;
}

export function repeatStartForDoc(task: TaskDoc, tz: string) {
  if (task.repeatStartDate) return task.repeatStartDate;
  if (task.type !== 'weekly') return undefined;
  return getZonedYMD(new Date(task.createdAt), tz);
}

/** Validate/normalize a YYYY-MM-DD repeat end date; returns null when absent/invalid. */
export function normalizeRepeatEnd(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : null;
}

/** True when `date` falls after the repeat's end date (i.e. the occurrence should be hidden). */
export function isAfterRepeatEnd(
  task: Pick<TaskDoc, 'repeatEndDate'>,
  date: string,
) {
  return !!task.repeatEndDate && date > task.repeatEndDate;
}

/** Day-of-month (1..31) from a YYYY-MM-DD string. */
export function domFromYMD(ymd: string) {
  return Number(ymd.slice(8, 10));
}

/**
 * True when a monthly-repeat doc does NOT occur on `date` (its anchor
 * day-of-month differs). For non-monthly docs this is always false.
 */
export function monthlyExcludesDate(
  task: Pick<TaskDoc, 'repeatMode' | 'repeatDayOfMonth'>,
  date: string,
) {
  return (
    task.repeatMode === 'monthly' &&
    typeof task.repeatDayOfMonth === 'number' &&
    task.repeatDayOfMonth !== domFromYMD(date)
  );
}

/** Add `n` days to a YYYY-MM-DD string (UTC-noon anchored to dodge DST). */
export function addDaysYMD(ymd: string, n: number) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whether a single repeating doc is scheduled on `date` (rule + end-date only;
 *  start-date and suppression are handled by the group-level walker). */
export function siblingOccursOn(task: TaskDoc, date: string) {
  if (isAfterRepeatEnd(task, date)) return false;
  if (task.repeatRule) return customOccursOn(task, date);
  if (task.repeatMode === 'monthly' && typeof task.repeatDayOfMonth === 'number')
    return domFromYMD(date) === task.repeatDayOfMonth;
  if (typeof task.dayOfWeek === 'number') return dowFromYMD(date) === task.dayOfWeek;
  return false;
}

/** Whole days between two YYYY-MM-DD dates (b - a). */
export function daysBetweenYMD(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

/** YYYY-MM-DD of the Sunday that begins the week containing `ymd`. */
export function weekStartYMD(ymd: string) {
  const dow = dowFromYMD(ymd);
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/**
 * Whether a custom-rule doc occurs on `date`. Anchored to `repeatStartDate`;
 * start/end-date bounds are checked by the caller.
 */
export function customOccursOn(
  task: Pick<TaskDoc, 'repeatRule' | 'repeatStartDate'>,
  date: string,
) {
  const rule = task.repeatRule;
  const start = task.repeatStartDate;
  if (!rule || !start) return false;
  if (date < start) return false;
  const interval = Math.max(1, rule.interval || 1);

  if (rule.freq === 'daily') {
    const diff = daysBetweenYMD(start, date);
    return diff >= 0 && diff % interval === 0;
  }
  if (rule.freq === 'weekly') {
    const days = rule.byWeekday ?? [];
    if (!days.includes(dowFromYMD(date))) return false;
    const weekDiff = Math.round(
      daysBetweenYMD(weekStartYMD(start), weekStartYMD(date)) / 7,
    );
    return weekDiff >= 0 && weekDiff % interval === 0;
  }
  // monthly
  const dom = rule.byMonthday ?? [];
  if (!dom.includes(domFromYMD(date))) return false;
  const [sy, sm] = start.split('-').map(Number);
  const [dy, dm] = date.split('-').map(Number);
  const monthDiff = (dy - sy) * 12 + (dm - sm);
  return monthDiff >= 0 && monthDiff % interval === 0;
}

/** Validate/clamp a custom repeat rule from request input, anchored to a date. */
export function normalizeRepeatRule(
  raw: unknown,
  anchor: string,
): TaskDoc['repeatRule'] | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const freq = r.freq;
  if (freq !== 'daily' && freq !== 'weekly' && freq !== 'monthly') return null;
  const max = freq === 'daily' ? 100 : freq === 'weekly' ? 52 : 12;
  let interval = Math.round(Number(r.interval));
  if (!Number.isFinite(interval)) interval = 1;
  interval = Math.min(max, Math.max(1, interval));
  const rule: NonNullable<TaskDoc['repeatRule']> = { freq, interval };
  if (freq === 'weekly') {
    const days = Array.isArray(r.byWeekday)
      ? Array.from(
          new Set(
            r.byWeekday.map(Number).filter((d: number) => d >= 0 && d <= 6),
          ),
        ).sort((a, b) => a - b)
      : [];
    rule.byWeekday = days.length ? days : [dowFromYMD(anchor)];
  } else if (freq === 'monthly') {
    const dom = Array.isArray(r.byMonthday)
      ? Array.from(
          new Set(
            r.byMonthday.map(Number).filter((d: number) => d >= 1 && d <= 31),
          ),
        ).sort((a, b) => a - b)
      : [];
    rule.byMonthday = dom.length ? dom : [domFromYMD(anchor)];
  }
  return rule;
}

/**
 * Whether a task doc has a live occurrence on `date`: the repeat rule matches,
 * the date sits inside the repeat's start/end bounds, and the occurrence has
 * not been suppressed. The one answer every "what is on this day" surface
 * should ask — list, reminder cron, count.
 */
export function occursOnDate(task: TaskDoc, date: string, tz: string) {
  if ((task.suppressedDates ?? []).includes(date)) return false;
  if (isAfterRepeatEnd(task, date)) return false;

  const repeatStart = repeatStartForDoc(task, tz);
  if (repeatStart && date < repeatStart) return false;

  if (task.type === 'regular') return task.date === date;
  if (task.type !== 'weekly') return false;

  if (task.repeatRule) return customOccursOn(task, date);
  if (task.repeatMode === 'monthly') {
    const anchor =
      typeof task.repeatDayOfMonth === 'number'
        ? task.repeatDayOfMonth
        : repeatStart
          ? domFromYMD(repeatStart)
          : null;
    return anchor !== null && domFromYMD(date) === anchor;
  }
  return typeof task.dayOfWeek === 'number' && dowFromYMD(date) === task.dayOfWeek;
}

/** Whether the occurrence on `date` is already ticked off. */
export function isCompletedOnDate(
  task: Pick<TaskDoc, 'type' | 'completed' | 'completedDates'>,
  date: string,
) {
  return (
    (task.completedDates ?? []).includes(date) ||
    (!!task.completed && task.type === 'regular')
  );
}

/**
 * Mongo filter for every doc that could occur on `date`. Monthly and custom
 * repeats carry no `dayOfWeek`, so they need their own branches; the rule
 * itself is still decided by `occursOnDate`.
 */
export function dayCandidateFilter(userId: string, date: string) {
  return {
    userId,
    deletedAt: { $exists: false },
    $or: [
      { type: 'weekly', dayOfWeek: dowFromYMD(date) },
      { type: 'weekly', repeatMode: 'monthly' },
      { type: 'weekly', repeatRule: { $exists: true } },
      { type: 'regular', date },
    ],
  };
}
