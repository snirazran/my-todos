import { getZonedToday } from '@/lib/utils';
import type { BuddyCreateParams } from '@/lib/models/TaskBond';

const WEEKDAY_SETS: Record<string, number[]> = {
  daily: [0, 1, 2, 3, 4, 5, 6],
  weekdays: [1, 2, 3, 4, 5],
  weekend: [0, 6],
};

export function repeatLabelFor(params: BuddyCreateParams): string {
  if (params.repeatRule) return 'custom';
  if (params.repeat === 'monthly') return 'monthly';
  const days = params.days ?? [];
  if (days.length === 7) return 'daily';
  if (days.length === 5 && WEEKDAY_SETS.weekdays.every((d) => days.includes(d)))
    return 'weekdays';
  if (days.length === 2 && WEEKDAY_SETS.weekend.every((d) => days.includes(d)))
    return 'weekend';
  return 'weekly';
}

function lastDayOfMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

function ymd(year: number, month1: number, day: number): string {
  const mm = String(month1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/** Next calendar date on/after `todayYMD` whose day-of-month is `dom` (clamped). */
function nextDateWithDom(todayYMD: string, dom: number): string {
  const year = Number(todayYMD.slice(0, 4));
  const month1 = Number(todayYMD.slice(5, 7));
  const todayDay = Number(todayYMD.slice(8, 10));
  const thisClamped = Math.min(dom, lastDayOfMonth(year, month1));
  if (thisClamped >= todayDay) return ymd(year, month1, thisClamped);
  let nextY = year;
  let nextM = month1 + 1;
  if (nextM > 12) {
    nextM = 1;
    nextY += 1;
  }
  return ymd(nextY, nextM, Math.min(dom, lastDayOfMonth(nextY, nextM)));
}

/**
 * Build the createTasksForUser body for the recipient, gating out past
 * occurrences: weekly/monthly start on/after the recipient's today; custom
 * preserves the inviter's phase anchor (only today-forward occurrences matter).
 */
export function buildAcceptBody(
  params: BuddyCreateParams,
  tz: string,
): Record<string, unknown> {
  const today = getZonedToday(tz);
  const base: Record<string, unknown> = {
    text: params.text,
    timezone: tz,
    repeatEndDate: params.repeatEndDate,
  };

  if (params.repeatRule) {
    const anchor = params.dates?.[0] || today;
    return { ...base, repeat: 'this-week', repeatRule: params.repeatRule, dates: [anchor] };
  }
  if (params.repeat === 'monthly') {
    const originalDom = params.dates?.[0]
      ? Number(params.dates[0].slice(8, 10))
      : Number(today.slice(8, 10));
    return { ...base, repeat: 'monthly', dates: [nextDateWithDom(today, originalDom)] };
  }
  return { ...base, repeat: 'weekly', days: params.days ?? [], dates: [today] };
}

/** Convert a setRepeat payload (from the repeat picker) into bond createParams. */
export function createParamsFromSetRepeat(
  setRepeat: any,
  text: string,
  date?: string,
): BuddyCreateParams {
  const mode = setRepeat?.mode ?? (setRepeat?.weekly ? 'weekly' : 'none');
  const repeatEndDate = setRepeat?.endDate;
  if (mode === 'monthly')
    return { text, repeat: 'monthly', dates: date ? [date] : undefined, repeatEndDate };
  if (mode === 'custom')
    return { text, repeatRule: setRepeat?.rule, dates: date ? [date] : undefined, repeatEndDate };
  const days =
    mode === 'daily'
      ? [0, 1, 2, 3, 4, 5, 6]
      : mode === 'weekdays'
        ? [1, 2, 3, 4, 5]
        : mode === 'weekend'
          ? [0, 6]
          : Number.isInteger(Number(setRepeat?.dayOfWeek))
            ? [Number(setRepeat.dayOfWeek)]
            : [];
  return { text, repeat: 'weekly', days, repeatEndDate };
}
