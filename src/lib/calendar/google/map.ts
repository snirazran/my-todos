import { addDaysYMD } from '@/lib/taskOccurrence';
import { neutralToRRule, parseRRule, countToEndDate } from '../recurrence';
import { defaultEnd, instantToZoned, untilUtcForDate } from '../time';
import type { NeutralEvent } from '../types';
import type { GoogleEvent } from './client';

export const PRIVATE_TASK_ID = 'frogTaskId';
export const PRIVATE_GROUP_ID = 'frogGroupId';
export const PRIVATE_FP = 'frogFingerprint';

export function neutralToGoogle(
  event: NeutralEvent,
  fp: string,
): Record<string, unknown> {
  const priv: Record<string, string> = { [PRIVATE_FP]: fp };
  if (event.appTaskId) priv[PRIVATE_TASK_ID] = event.appTaskId;
  if (event.appGroupId) priv[PRIVATE_GROUP_ID] = event.appGroupId;

  const body: Record<string, unknown> = {
    summary: event.title,
    description: event.notes ?? '',
    extendedProperties: { private: priv },
    reminders:
      event.reminderMinutes !== undefined
        ? {
            useDefault: false,
            overrides: [{ method: 'popup', minutes: event.reminderMinutes }],
          }
        : { useDefault: false, overrides: [] },
  };

  if (event.allDay) {
    body.start = { date: event.startDate };
    body.end = { date: addDaysYMD(event.startDate, 1) };
  } else {
    const startTime = event.startTime!;
    const end = event.endTime
      ? { ymd: event.startDate, hm: event.endTime }
      : defaultEnd(event.startDate, startTime);
    if (end.ymd === event.startDate && end.hm <= startTime) {
      const rolled = defaultEnd(event.startDate, startTime);
      end.ymd = rolled.ymd;
      end.hm = rolled.hm;
    }
    body.start = {
      dateTime: `${event.startDate}T${startTime}:00`,
      timeZone: event.timezone,
    };
    body.end = {
      dateTime: `${end.ymd}T${end.hm}:00`,
      timeZone: event.timezone,
    };
  }

  const recurrence: string[] = [];
  if (event.recurrence) {
    recurrence.push(
      `RRULE:${neutralToRRule(event.recurrence, {
        allDay: event.allDay,
        untilUtc: event.recurrence.until
          ? untilUtcForDate(event.recurrence.until, event.timezone)
          : undefined,
      })}`,
    );
    for (const exdate of event.exdates ?? []) {
      if (event.allDay) {
        recurrence.push(`EXDATE;VALUE=DATE:${exdate.replace(/-/g, '')}`);
      } else {
        recurrence.push(
          `EXDATE;TZID=${event.timezone}:${exdate.replace(/-/g, '')}T${event.startTime!.replace(':', '')}00`,
        );
      }
    }
  }
  body.recurrence = recurrence;

  return body;
}

export type GoogleParseResult =
  | { kind: 'event'; neutral: NeutralEvent }
  | { kind: 'unsupported-recurrence'; neutral: NeutralEvent; reason: string }
  | { kind: 'skip'; reason: string };

function parseExdates(recurrence: string[], tz: string): string[] {
  const out: string[] = [];
  for (const line of recurrence) {
    if (!line.toUpperCase().startsWith('EXDATE')) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    for (const value of line.slice(colon + 1).split(',')) {
      const m = value.match(/^(\d{4})(\d{2})(\d{2})/);
      if (m) out.push(`${m[1]}-${m[2]}-${m[3]}`);
      void tz;
    }
  }
  return Array.from(new Set(out)).sort();
}

export function googleToNeutral(g: GoogleEvent, userTz: string): GoogleParseResult {
  const title = (g.summary ?? '').trim();
  if (!title) return { kind: 'skip', reason: 'empty summary' };

  const self = g.attendees?.find((a) => a.self);
  if (self?.responseStatus === 'declined')
    return { kind: 'skip', reason: 'declined invitation' };

  let allDay: boolean;
  let startDate: string;
  let startTime: string | undefined;
  let endTime: string | undefined;

  if (g.start?.date) {
    allDay = true;
    startDate = g.start.date;
  } else if (g.start?.dateTime) {
    allDay = false;
    const zoned = instantToZoned(g.start.dateTime, userTz);
    startDate = zoned.ymd;
    startTime = zoned.hm;
    if (g.end?.dateTime) {
      const endZoned = instantToZoned(g.end.dateTime, userTz);
      if (endZoned.ymd === startDate && endZoned.hm !== startTime) {
        endTime = endZoned.hm;
      }
    }
  } else {
    return { kind: 'skip', reason: 'no start' };
  }

  let reminderMinutes: number | undefined;
  if (g.reminders && !g.reminders.useDefault) {
    const popup = (g.reminders.overrides ?? [])
      .filter((o) => o.method === 'popup')
      .sort((a, b) => a.minutes - b.minutes)[0];
    if (popup) reminderMinutes = popup.minutes;
  }

  const neutral: NeutralEvent = {
    title,
    notes: (g.description ?? '').trim() || undefined,
    allDay,
    startDate,
    startTime,
    endTime,
    timezone: userTz,
    reminderMinutes,
    appTaskId: g.extendedProperties?.private?.[PRIVATE_TASK_ID],
    appGroupId: g.extendedProperties?.private?.[PRIVATE_GROUP_ID],
  };

  const rruleLine = (g.recurrence ?? []).find((l) =>
    l.toUpperCase().startsWith('RRULE:'),
  );
  if (rruleLine) {
    if ((g.recurrence ?? []).some((l) => l.toUpperCase().startsWith('RDATE')))
      return { kind: 'unsupported-recurrence', neutral, reason: 'RDATE' };
    const parsed = parseRRule(rruleLine.slice(6), userTz);
    if (!parsed.supported)
      return { kind: 'unsupported-recurrence', neutral, reason: parsed.reason };
    const rec = parsed.recurrence;
    if (parsed.count !== undefined) {
      rec.until = countToEndDate(rec, startDate, parsed.count);
      if (!rec.until)
        return { kind: 'unsupported-recurrence', neutral, reason: 'COUNT overflow' };
    }
    neutral.recurrence = rec;
    const exdates = parseExdates(g.recurrence ?? [], userTz);
    if (exdates.length) neutral.exdates = exdates;
  }

  return { kind: 'event', neutral };
}
