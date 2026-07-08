import ICAL from 'ical.js';
import { addDaysYMD } from '@/lib/taskOccurrence';
import { neutralToRRule, parseRRule, countToEndDate } from '../recurrence';
import { defaultEnd, instantToZoned } from '../time';
import type { NeutralEvent } from '../types';
import type { RemoteParse } from '../engine';

export const X_TASK_ID = 'X-FROGTASK-ID';
export const X_GROUP_ID = 'X-FROG-GROUP-ID';
export const X_FP = 'X-FROG-FP';
const PRODID = '-//Calendar Sync//EN';

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function foldLine(line: string): string {
  if (line.length <= 74) return line;
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    parts.push(rest.slice(0, 74));
    rest = ' ' + rest.slice(74);
  }
  parts.push(rest);
  return parts.join('\r\n');
}

function icsStamp(date: Date): string {
  return `${date.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`;
}

/**
 * Build a single-VEVENT ICS document. Timed values are emitted as floating
 * local times (the user's wall clock) so recurring events stay DST-stable
 * without shipping VTIMEZONE definitions.
 */
export function buildVEVENT(event: NeutralEvent, uid: string, fp: string): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `SUMMARY:${escapeText(event.title)}`,
  ];

  if (event.notes) lines.push(`DESCRIPTION:${escapeText(event.notes)}`);

  const dateBasic = event.startDate.replace(/-/g, '');
  if (event.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${dateBasic}`);
    lines.push(`DTEND;VALUE=DATE:${addDaysYMD(event.startDate, 1).replace(/-/g, '')}`);
  } else {
    const startTime = event.startTime!;
    const end = event.endTime
      ? { ymd: event.startDate, hm: event.endTime }
      : defaultEnd(event.startDate, startTime);
    lines.push(`DTSTART:${dateBasic}T${startTime.replace(':', '')}00`);
    lines.push(`DTEND:${end.ymd.replace(/-/g, '')}T${end.hm.replace(':', '')}00`);
  }

  if (event.recurrence) {
    lines.push(
      `RRULE:${neutralToRRule(event.recurrence, {
        allDay: event.allDay,
        untilUtc: event.recurrence.until
          ? `${event.recurrence.until.replace(/-/g, '')}T235959`
          : undefined,
      })}`,
    );
    for (const exdate of event.exdates ?? []) {
      if (event.allDay) {
        lines.push(`EXDATE;VALUE=DATE:${exdate.replace(/-/g, '')}`);
      } else {
        lines.push(`EXDATE:${exdate.replace(/-/g, '')}T${event.startTime!.replace(':', '')}00`);
      }
    }
  }

  if (event.reminderMinutes !== undefined) {
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:DISPLAY');
    lines.push('DESCRIPTION:Reminder');
    lines.push(
      event.reminderMinutes === 0
        ? 'TRIGGER:PT0S'
        : `TRIGGER:-PT${event.reminderMinutes}M`,
    );
    lines.push('END:VALARM');
  }

  if (event.appTaskId) lines.push(`${X_TASK_ID}:${event.appTaskId}`);
  if (event.appGroupId) lines.push(`${X_GROUP_ID}:${event.appGroupId}`);
  lines.push(`${X_FP}:${fp}`);
  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');

  return lines.map(foldLine).join('\r\n') + '\r\n';
}

function icalTimeToZoned(
  time: ICAL.Time,
  userTz: string,
): { ymd: string; hm: string } {
  const zone = time.zone;
  const isFloating = !time.isDate && (!zone || zone === ICAL.Timezone.localTimezone);
  if (time.isDate || isFloating) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      ymd: `${time.year}-${pad(time.month)}-${pad(time.day)}`,
      hm: `${pad(time.hour)}:${pad(time.minute)}`,
    };
  }
  return instantToZoned(time.toJSDate().toISOString(), userTz);
}

/** Expand a recurring VEVENT's occurrence dates within a window (local, via ical.js). */
export function expandInstances(
  ics: string,
  windowStart: string,
  windowEnd: string,
  userTz: string,
): { date: string }[] {
  try {
    const jcal = ICAL.parse(ics);
    const comp = new ICAL.Component(jcal);
    const vevent = comp.getFirstSubcomponent('vevent');
    if (!vevent) return [];
    const dtstart = vevent.getFirstProperty('dtstart')?.getFirstValue() as
      | ICAL.Time
      | undefined;
    if (!dtstart) return [];

    const expansion = new ICAL.RecurExpansion({ component: vevent, dtstart });
    const out: { date: string }[] = [];
    for (let guard = 0; guard < 1000; guard++) {
      const next = expansion.next();
      if (!next) break;
      const { ymd } = icalTimeToZoned(next, userTz);
      if (ymd > windowEnd) break;
      if (ymd >= windowStart) out.push({ date: ymd });
    }
    return out;
  } catch {
    return [];
  }
}

/** Parse the first VEVENT of an ICS document into the engine's shape. */
export function parseVEVENT(
  ics: string,
  userTz: string,
): (RemoteParse & { uid?: string }) | { kind: 'skip'; reason: string } {
  let vevent: ICAL.Component | null = null;
  let uid: string | undefined;
  try {
    const jcal = ICAL.parse(ics);
    const comp = new ICAL.Component(jcal);
    for (const tzComp of comp.getAllSubcomponents('vtimezone')) {
      try {
        const tz = new ICAL.Timezone(tzComp);
        if (tz.tzid && !ICAL.TimezoneService.has(tz.tzid)) {
          ICAL.TimezoneService.register(tz);
        }
      } catch {
        // unregisterable timezone — instants fall back to UTC parse
      }
    }
    vevent = comp.getFirstSubcomponent('vevent');
  } catch (err) {
    return { kind: 'skip', reason: `ics parse: ${(err as Error).message}` };
  }
  if (!vevent) return { kind: 'skip', reason: 'no VEVENT' };

  uid = vevent.getFirstPropertyValue('uid')?.toString();
  const title = (vevent.getFirstPropertyValue('summary')?.toString() ?? '').trim();
  if (!title) return { kind: 'skip', reason: 'empty summary' };

  const dtstart = vevent.getFirstProperty('dtstart')?.getFirstValue() as
    | ICAL.Time
    | undefined;
  if (!dtstart) return { kind: 'skip', reason: 'no DTSTART' };

  const allDay = !!dtstart.isDate;
  const start = icalTimeToZoned(dtstart, userTz);

  let endTime: string | undefined;
  if (!allDay) {
    const dtend = vevent.getFirstProperty('dtend')?.getFirstValue() as
      | ICAL.Time
      | undefined;
    if (dtend) {
      const end = icalTimeToZoned(dtend, userTz);
      if (end.ymd === start.ymd && end.hm !== start.hm) endTime = end.hm;
    }
  }

  let reminderMinutes: number | undefined;
  for (const alarm of vevent.getAllSubcomponents('valarm')) {
    const trigger = alarm.getFirstPropertyValue('trigger');
    if (!trigger) continue;
    try {
      const dur = trigger as ICAL.Duration;
      if (typeof dur.toSeconds === 'function') {
        const seconds = dur.toSeconds();
        if (seconds <= 0) {
          const mins = Math.round(-seconds / 60);
          if (reminderMinutes === undefined || mins < reminderMinutes) {
            reminderMinutes = mins;
          }
        }
      }
    } catch {
      // absolute-time or malformed trigger — ignore
    }
  }

  const neutral: NeutralEvent = {
    title,
    notes:
      (vevent.getFirstPropertyValue('description')?.toString() ?? '').trim() ||
      undefined,
    allDay,
    startDate: start.ymd,
    startTime: allDay ? undefined : start.hm,
    endTime,
    timezone: userTz,
    reminderMinutes,
    appTaskId: vevent.getFirstPropertyValue(X_TASK_ID.toLowerCase())?.toString(),
    appGroupId: vevent.getFirstPropertyValue(X_GROUP_ID.toLowerCase())?.toString(),
  };

  const rrule = vevent.getFirstProperty('rrule')?.getFirstValue() as
    | ICAL.Recur
    | undefined;
  if (rrule) {
    if (vevent.getFirstProperty('rdate'))
      return { kind: 'unsupported-recurrence', neutral, reason: 'RDATE', uid };
    const parsed = parseRRule(rrule.toString(), userTz);
    if (!parsed.supported)
      return { kind: 'unsupported-recurrence', neutral, reason: parsed.reason, uid };
    const rec = parsed.recurrence;
    if (parsed.count !== undefined) {
      rec.until = countToEndDate(rec, start.ymd, parsed.count);
      if (!rec.until)
        return { kind: 'unsupported-recurrence', neutral, reason: 'COUNT overflow', uid };
    }
    neutral.recurrence = rec;

    const exdates: string[] = [];
    for (const prop of vevent.getAllProperties('exdate')) {
      for (const value of prop.getValues()) {
        const t = value as ICAL.Time;
        const zoned = icalTimeToZoned(t, userTz);
        exdates.push(zoned.ymd);
      }
    }
    if (exdates.length) neutral.exdates = Array.from(new Set(exdates)).sort();
  }

  return { kind: 'event', neutral, uid };
}
