import type { TaskDoc } from '@/lib/models/Task';
import { addDaysYMD, dowFromYMD } from '@/lib/taskOccurrence';
import { instantToZoned } from './time';
import type { NeutralRecurrence } from './types';

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const BYDAY_INDEX: Record<string, number> = Object.fromEntries(
  BYDAY.map((d, i) => [d, i]),
);

const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [0, 6];

export type AppRepeat = {
  repeatMode: NonNullable<TaskDoc['repeatMode']>;
  dayOfWeek?: number;
  byWeekday?: number[];
  repeatDayOfMonth?: number;
  repeatRule?: TaskDoc['repeatRule'];
  repeatStartDate: string;
  repeatEndDate?: string;
};

function sameSet(a: number[], b: number[]) {
  return a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',');
}

export function appRepeatToNeutral(repeat: AppRepeat): NeutralRecurrence | null {
  const { repeatMode, repeatRule, repeatEndDate } = repeat;
  const until = repeatEndDate || undefined;

  switch (repeatMode) {
    case 'daily':
      return { freq: 'daily', interval: 1, until };
    case 'weekdays':
      return { freq: 'weekly', interval: 1, byWeekday: [...WEEKDAYS], until };
    case 'weekend':
      return { freq: 'weekly', interval: 1, byWeekday: [...WEEKEND], until };
    case 'weekly': {
      const days =
        repeat.byWeekday && repeat.byWeekday.length > 0
          ? repeat.byWeekday
          : typeof repeat.dayOfWeek === 'number'
            ? [repeat.dayOfWeek]
            : [dowFromYMD(repeat.repeatStartDate)];
      return { freq: 'weekly', interval: 1, byWeekday: [...days].sort(), until };
    }
    case 'monthly': {
      const dom = repeat.repeatDayOfMonth ?? Number(repeat.repeatStartDate.slice(8, 10));
      return { freq: 'monthly', interval: 1, byMonthday: [dom], until };
    }
    case 'custom': {
      if (!repeatRule) return null;
      const rec: NeutralRecurrence = {
        freq: repeatRule.freq,
        interval: Math.max(1, repeatRule.interval || 1),
        until,
      };
      if (repeatRule.freq === 'weekly') {
        rec.byWeekday = [...(repeatRule.byWeekday ?? [dowFromYMD(repeat.repeatStartDate)])].sort();
      }
      if (repeatRule.freq === 'monthly') {
        rec.byMonthday = [
          ...(repeatRule.byMonthday ?? [Number(repeat.repeatStartDate.slice(8, 10))]),
        ].sort((a, b) => a - b);
      }
      return rec;
    }
    default:
      return null;
  }
}

export type NeutralToAppResult =
  | { kind: 'daily'; repeatEndDate?: string }
  | { kind: 'weekdays'; repeatEndDate?: string }
  | { kind: 'weekend'; repeatEndDate?: string }
  | { kind: 'weekly'; dayOfWeek: number; repeatEndDate?: string }
  | { kind: 'monthly'; repeatDayOfMonth: number; repeatEndDate?: string }
  | {
      kind: 'custom';
      rule: NonNullable<TaskDoc['repeatRule']>;
      repeatEndDate?: string;
    };

const INTERVAL_CAPS = { daily: 100, weekly: 52, monthly: 12 } as const;

export function neutralToAppRepeat(
  rec: NeutralRecurrence,
  startDate: string,
): NeutralToAppResult | null {
  const interval = Math.max(1, rec.interval || 1);
  if (interval > INTERVAL_CAPS[rec.freq]) return null;
  const repeatEndDate = rec.until;

  if (rec.freq === 'daily') {
    if (interval === 1) return { kind: 'daily', repeatEndDate };
    return { kind: 'custom', rule: { freq: 'daily', interval }, repeatEndDate };
  }

  if (rec.freq === 'weekly') {
    const days =
      rec.byWeekday && rec.byWeekday.length > 0
        ? Array.from(new Set(rec.byWeekday)).sort((a, b) => a - b)
        : [dowFromYMD(startDate)];
    if (interval === 1) {
      if (sameSet(days, WEEKDAYS)) return { kind: 'weekdays', repeatEndDate };
      if (sameSet(days, WEEKEND)) return { kind: 'weekend', repeatEndDate };
      if (days.length === 7) return { kind: 'daily', repeatEndDate };
      if (days.length === 1)
        return { kind: 'weekly', dayOfWeek: days[0], repeatEndDate };
    }
    return {
      kind: 'custom',
      rule: { freq: 'weekly', interval, byWeekday: days },
      repeatEndDate,
    };
  }

  // monthly
  const dom =
    rec.byMonthday && rec.byMonthday.length > 0
      ? Array.from(new Set(rec.byMonthday)).sort((a, b) => a - b)
      : [Number(startDate.slice(8, 10))];
  if (interval === 1 && dom.length === 1)
    return { kind: 'monthly', repeatDayOfMonth: dom[0], repeatEndDate };
  return {
    kind: 'custom',
    rule: { freq: 'monthly', interval, byMonthday: dom },
    repeatEndDate,
  };
}

const FREQ_MAP: Record<string, NeutralRecurrence['freq']> = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
};

/**
 * Neutral recurrence -> RRULE value (without the "RRULE:" prefix).
 * `until` is emitted as an end-of-day UTC timestamp for timed events, or a
 * plain date for all-day events (matching a DATE-valued DTSTART).
 */
export function neutralToRRule(
  rec: NeutralRecurrence,
  opts: { allDay: boolean; untilUtc?: string },
): string {
  const parts = [`FREQ=${rec.freq.toUpperCase()}`];
  if (rec.interval > 1) parts.push(`INTERVAL=${rec.interval}`);
  if (rec.freq === 'weekly' && rec.byWeekday?.length) {
    parts.push(`BYDAY=${rec.byWeekday.map((d) => BYDAY[d]).join(',')}`);
    parts.push('WKST=SU');
  }
  if (rec.freq === 'monthly' && rec.byMonthday?.length) {
    parts.push(`BYMONTHDAY=${rec.byMonthday.join(',')}`);
  }
  if (rec.until) {
    if (opts.allDay) {
      parts.push(`UNTIL=${rec.until.replace(/-/g, '')}`);
    } else {
      parts.push(`UNTIL=${opts.untilUtc ?? `${rec.until.replace(/-/g, '')}T235959Z`}`);
    }
  }
  return parts.join(';');
}

export type ParsedRRule =
  | { supported: true; recurrence: NeutralRecurrence; count?: number }
  | { supported: false; reason: string };

/** Parse an RRULE value (no "RRULE:" prefix). Returns unsupported for shapes
 *  the app's repeat system cannot represent (caller expands those to dated tasks).
 *  A timestamped UNTIL is converted to a date in `tz` (UTC when omitted). */
export function parseRRule(rrule: string, tz?: string): ParsedRRule {
  const fields = new Map<string, string>();
  for (const part of rrule.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) fields.set(part.slice(0, eq).toUpperCase(), part.slice(eq + 1));
  }

  const freqRaw = fields.get('FREQ') ?? '';
  const freq = FREQ_MAP[freqRaw];
  if (!freq) return { supported: false, reason: `FREQ=${freqRaw}` };
  if (fields.has('BYSETPOS')) return { supported: false, reason: 'BYSETPOS' };

  const interval = Math.max(1, Number(fields.get('INTERVAL') ?? '1') || 1);
  if (interval > INTERVAL_CAPS[freq])
    return { supported: false, reason: `INTERVAL=${interval}` };

  const rec: NeutralRecurrence = { freq, interval };

  const byday = fields.get('BYDAY');
  if (byday) {
    if (freq !== 'weekly')
      return { supported: false, reason: `BYDAY with FREQ=${freqRaw}` };
    const days: number[] = [];
    for (const token of byday.split(',')) {
      if (!(token in BYDAY_INDEX))
        return { supported: false, reason: `BYDAY=${token}` };
      days.push(BYDAY_INDEX[token]);
    }
    rec.byWeekday = Array.from(new Set(days)).sort((a, b) => a - b);
  }

  const bymonthday = fields.get('BYMONTHDAY');
  if (bymonthday) {
    if (freq !== 'monthly')
      return { supported: false, reason: `BYMONTHDAY with FREQ=${freqRaw}` };
    const dom = bymonthday.split(',').map(Number);
    if (dom.some((d) => !Number.isInteger(d) || d < 1 || d > 31))
      return { supported: false, reason: `BYMONTHDAY=${bymonthday}` };
    rec.byMonthday = Array.from(new Set(dom)).sort((a, b) => a - b);
  }

  for (const key of ['BYMONTH', 'BYYEARDAY', 'BYWEEKNO', 'BYHOUR', 'BYMINUTE']) {
    if (fields.has(key)) return { supported: false, reason: key };
  }

  const until = fields.get('UNTIL');
  if (until) {
    const stamp = until.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
    const dateOnly = until.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (stamp && tz && until.endsWith('Z')) {
      const iso = `${stamp[1]}-${stamp[2]}-${stamp[3]}T${stamp[4]}:${stamp[5]}:${stamp[6]}Z`;
      rec.until = instantToZoned(iso, tz).ymd;
    } else if (stamp) {
      rec.until = `${stamp[1]}-${stamp[2]}-${stamp[3]}`;
    } else if (dateOnly) {
      rec.until = `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`;
    } else {
      return { supported: false, reason: `UNTIL=${until}` };
    }
  }

  const countRaw = fields.get('COUNT');
  let count: number | undefined;
  if (countRaw) {
    count = Number(countRaw);
    if (!Number.isInteger(count) || count < 1)
      return { supported: false, reason: `COUNT=${countRaw}` };
  }

  return { supported: true, recurrence: rec, count };
}

/** Resolve COUNT=n to a concrete inclusive end date by walking occurrences. */
export function countToEndDate(
  rec: NeutralRecurrence,
  startDate: string,
  count: number,
): string | undefined {
  const occursOn = (date: string) => {
    if (rec.freq === 'daily') {
      const diff = Math.round((Date.parse(date) - Date.parse(startDate)) / 86400000);
      return diff >= 0 && diff % rec.interval === 0;
    }
    if (rec.freq === 'weekly') {
      const days = rec.byWeekday ?? [dowFromYMD(startDate)];
      if (!days.includes(dowFromYMD(date))) return false;
      const weekStart = (ymd: string) => addDaysYMD(ymd, -dowFromYMD(ymd));
      const weekDiff = Math.round(
        (Date.parse(weekStart(date)) - Date.parse(weekStart(startDate))) /
          (7 * 86400000),
      );
      return weekDiff >= 0 && weekDiff % rec.interval === 0;
    }
    const dom = rec.byMonthday ?? [Number(startDate.slice(8, 10))];
    if (!dom.includes(Number(date.slice(8, 10)))) return false;
    const [sy, sm] = startDate.split('-').map(Number);
    const [dy, dm] = date.split('-').map(Number);
    const monthDiff = (dy - sy) * 12 + (dm - sm);
    return monthDiff >= 0 && monthDiff % rec.interval === 0;
  };

  let remaining = count;
  let d = startDate;
  for (let guard = 0; guard < 40000; guard++) {
    if (occursOn(d)) {
      remaining--;
      if (remaining === 0) return d;
    }
    d = addDaysYMD(d, 1);
  }
  return undefined;
}
