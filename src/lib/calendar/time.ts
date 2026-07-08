import { addDaysYMD } from '@/lib/taskOccurrence';

export const DEFAULT_EVENT_MINUTES = 30;

/** Wall-clock date + time of an instant in a given IANA timezone. */
export function instantToZoned(iso: string, tz: string): { ymd: string; hm: string } {
  const d = new Date(iso);
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(d);
  } catch {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(d);
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return {
    ymd: `${get('year')}-${get('month')}-${get('day')}`,
    hm: `${get('hour')}:${get('minute')}`,
  };
}

/** UTC offset (e.g. "+03:00") of `tz` at the given wall-clock moment. */
export function zonedOffset(ymd: string, hm: string, tz: string): string {
  const guess = new Date(`${ymd}T${hm}:00Z`);
  let asZone: { ymd: string; hm: string };
  try {
    asZone = instantToZoned(guess.toISOString(), tz);
  } catch {
    return '+00:00';
  }
  const wallMs = Date.parse(`${asZone.ymd}T${asZone.hm}:00Z`);
  const offsetMin = Math.round((wallMs - guess.getTime()) / 60000);
  const sign = offsetMin < 0 ? '-' : '+';
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${sign}${hh}:${mm}`;
}

/** Convert a wall-clock moment in `tz` to a UTC Date. */
export function zonedToUtc(ymd: string, hm: string, tz: string): Date {
  const offset = zonedOffset(ymd, hm, tz);
  return new Date(`${ymd}T${hm}:00${offset}`);
}

export function addMinutesHM(ymd: string, hm: string, minutes: number) {
  const [h, m] = hm.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const dayShift = Math.floor(total / 1440);
  const rem = ((total % 1440) + 1440) % 1440;
  return {
    ymd: dayShift === 0 ? ymd : addDaysYMD(ymd, dayShift),
    hm: `${String(Math.floor(rem / 60)).padStart(2, '0')}:${String(rem % 60).padStart(2, '0')}`,
  };
}

export function defaultEnd(ymd: string, hm: string) {
  return addMinutesHM(ymd, hm, DEFAULT_EVENT_MINUTES);
}

/** RRULE UNTIL value (UTC) for the end of `ymd` in `tz`. */
export function untilUtcForDate(ymd: string, tz: string): string {
  const utc = zonedToUtc(ymd, '23:59', tz);
  return `${utc.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`;
}
