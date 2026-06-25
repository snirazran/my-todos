export const pad = (n: number) => String(n).padStart(2, '0');

export const nowHm = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function ymdLocal(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseYmdLocal(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatTimeDisplay(t: string) {
  if (!t) return '--:--';
  const [hh, mm] = t.split(':').map(Number);
  const suffix = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 || 12;
  return `${h12}:${pad(mm)} ${suffix}`;
}

export const fetcher = (url: string) => fetch(url).then((r) => r.json());

/** Friendly label for a repeat end date, e.g. "Jun 11, 2026". */
export function formatEndDateLabel(value: string) {
  return parseYmdLocal(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

import { apiDayFromDisplay, type ApiDay, type DisplayDay } from '@/components/board/helpers';

export type RepeatMode =
  | 'none'
  | 'daily'
  | 'weekdays'
  | 'weekend'
  | 'weekly'
  | 'monthly'
  | 'custom';

export type RepeatFreq = 'daily' | 'weekly' | 'monthly';

/** A custom recurrence rule (interval-based, RRULE-like). */
export type RepeatRule = {
  freq: RepeatFreq;
  /** Repeat every N days/weeks/months. */
  interval: number;
  /** Weekly: weekdays (0=Sun..6=Sat) the task lands on. */
  byWeekday?: number[];
  /** Monthly: days-of-month (1..31) the task lands on. */
  byMonthday?: number[];
};

const ALL_DISPLAY_DAYS: DisplayDay[] = [0, 1, 2, 3, 4, 5, 6];

export function allDisplayDays(): DisplayDay[] {
  return [...ALL_DISPLAY_DAYS];
}

export function weekdayDisplayDays(
  daysOrder?: ReadonlyArray<Exclude<ApiDay, -1>>,
): DisplayDay[] {
  return ALL_DISPLAY_DAYS.filter((d) => {
    const api = apiDayFromDisplay(d, daysOrder);
    return api >= 1 && api <= 5;
  });
}

export function weekendDisplayDays(
  daysOrder?: ReadonlyArray<Exclude<ApiDay, -1>>,
): DisplayDay[] {
  return ALL_DISPLAY_DAYS.filter((d) => {
    const api = apiDayFromDisplay(d, daysOrder);
    return api === 0 || api === 6;
  });
}

export function repeatModeFor(
  pickedDays: ReadonlyArray<DisplayDay>,
  repeat: 'this-week' | 'weekly',
  daysOrder?: ReadonlyArray<Exclude<ApiDay, -1>>,
): RepeatMode {
  if (repeat !== 'weekly') return 'none';
  const real = pickedDays.filter((d) => d !== 7);
  if (real.length >= 7) return 'daily';
  const apiDays = real.map((d) => apiDayFromDisplay(d, daysOrder));
  const set = new Set(apiDays);
  const isWeekdays =
    apiDays.length === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d as ApiDay));
  if (isWeekdays) return 'weekdays';
  const isWeekend =
    apiDays.length === 2 && set.has(0 as ApiDay) && set.has(6 as ApiDay);
  if (isWeekend) return 'weekend';
  return 'weekly';
}

/** Ordinal suffix, e.g. 1 -> "1st", 11 -> "11th", 22 -> "22nd". */
export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Day-of-month (1..31) from a YYYY-MM-DD string. */
export function dayOfMonthFromYmd(ymd: string): number {
  return Number(ymd.slice(8, 10));
}

/** "Every month on the 11th" label anchored to a YYYY-MM-DD date. */
export function monthlyRepeatLabel(ymd: string): string {
  return `Every month on the ${ordinal(dayOfMonthFromYmd(ymd))}`;
}

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Short human summary of a custom recurrence rule, e.g. "Every 2 weeks on Mon, Thu". */
export function customRepeatLabel(rule: RepeatRule): string {
  const n = rule.interval;
  if (rule.freq === 'daily') {
    return n === 1 ? 'Every day' : `Every ${n} days`;
  }
  if (rule.freq === 'weekly') {
    const base = n === 1 ? 'Every week' : `Every ${n} weeks`;
    const days = (rule.byWeekday ?? [])
      .slice()
      .sort((a, b) => a - b)
      .map((d) => SHORT_DAYS[d])
      .join(', ');
    return days ? `${base} on ${days}` : base;
  }
  const base = n === 1 ? 'Every month' : `Every ${n} months`;
  const dom = (rule.byMonthday ?? [])
    .slice()
    .sort((a, b) => a - b)
    .map((d) => ordinal(d))
    .join(', ');
  return dom ? `${base} on the ${dom}` : base;
}
