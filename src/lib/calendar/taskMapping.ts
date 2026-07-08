import type { TaskDoc } from '@/lib/models/Task';
import {
  addDaysYMD,
  siblingOccursOn,
  repeatStartForDoc,
} from '@/lib/taskOccurrence';
import { appRepeatToNeutral } from './recurrence';
import { reminderToMinutes } from './reminders';
import { defaultEnd } from './time';
import type { NeutralEvent, NeutralRecurrence } from './types';

/** A sync unit: one dated task, one lone repeating doc, or a sibling group. */
export type TaskUnit = {
  key: { taskId?: string; repeatGroupId?: string };
  docs: TaskDoc[];
};

/** Group task docs into sync units (sibling groups collapse into one unit). */
export function groupIntoUnits(docs: TaskDoc[]): TaskUnit[] {
  const byGroup = new Map<string, TaskDoc[]>();
  const units: TaskUnit[] = [];
  for (const doc of docs) {
    if (doc.repeatGroupId) {
      if (!byGroup.has(doc.repeatGroupId)) byGroup.set(doc.repeatGroupId, []);
      byGroup.get(doc.repeatGroupId)!.push(doc);
    } else {
      units.push({ key: { taskId: doc.id }, docs: [doc] });
    }
  }
  byGroup.forEach((group, groupId) => {
    units.push({ key: { repeatGroupId: groupId }, docs: group });
  });
  return units;
}

function firstOccurrenceOnOrAfter(
  docs: TaskDoc[],
  fromDate: string,
  maxDays = 366,
): string | undefined {
  let d = fromDate;
  for (let i = 0; i < maxDays; i++) {
    if (docs.some((doc) => siblingOccursOn(doc, d))) return d;
    d = addDaysYMD(d, 1);
  }
  return undefined;
}

function unionSorted(values: (string[] | undefined)[]): string[] {
  const set = new Set<string>();
  for (const arr of values) for (const v of arr ?? []) set.add(v);
  return Array.from(set).sort();
}

/**
 * Build the NeutralEvent for a sync unit. Returns null when the unit has no
 * exportable shape (no upcoming occurrence, backlog, etc.). `todayYMD` anchors
 * recurring DTSTART to the first occurrence >= max(repeatStart, today) so past
 * occurrences (which deleteSeries may have materialized) are never re-exported.
 */
export function taskUnitToNeutral(
  unit: TaskUnit,
  tz: string,
  todayYMD: string,
): NeutralEvent | null {
  const primary = unit.docs[0];
  if (!primary || primary.type === 'backlog') return null;

  const startTime = primary.startTime || undefined;
  // Calendars require an end; default to +30min so the fingerprint matches
  // what a round trip through the provider produces. Cross-midnight ends
  // stay unset on both sides for the same reason.
  let endTime = primary.endTime || undefined;
  if (startTime && endTime && endTime <= startTime) endTime = undefined;
  if (startTime && !endTime) {
    const end = defaultEnd('2000-01-01', startTime);
    endTime = end.ymd === '2000-01-01' ? end.hm : undefined;
  }

  const base: Omit<NeutralEvent, 'startDate' | 'allDay'> = {
    title: primary.text.trim(),
    notes: primary.notes?.trim() || undefined,
    startTime,
    endTime,
    timezone: tz,
    reminderMinutes: reminderToMinutes(primary.reminder),
    appTaskId: unit.key.taskId,
    appGroupId: unit.key.repeatGroupId,
  };
  const allDay = !startTime;

  if (primary.type === 'regular') {
    if (!primary.date) return null;
    return { ...base, allDay, startDate: primary.date };
  }

  // weekly / repeating unit
  const repeatMode = primary.repeatMode ?? 'weekly';
  const repeatStart =
    unit.docs
      .map((d) => repeatStartForDoc(d, tz))
      .filter((s): s is string => !!s)
      .sort()[0] ?? todayYMD;

  const recurrence = appRepeatToNeutral({
    repeatMode,
    dayOfWeek: primary.dayOfWeek,
    byWeekday:
      unit.docs.length > 1
        ? Array.from(
            new Set(
              unit.docs
                .map((d) => d.dayOfWeek)
                .filter((d): d is NonNullable<TaskDoc['dayOfWeek']> => d !== undefined),
            ),
          ).sort((a, b) => a - b)
        : undefined,
    repeatDayOfMonth: primary.repeatDayOfMonth,
    repeatRule: primary.repeatRule,
    repeatStartDate: repeatStart,
    repeatEndDate: primary.repeatEndDate,
  });
  if (!recurrence) return null;

  const anchorFrom = repeatStart > todayYMD ? repeatStart : todayYMD;
  const startDate = firstOccurrenceOnOrAfter(unit.docs, anchorFrom);
  if (!startDate) return null;
  if (recurrence.until && recurrence.until < startDate) return null;

  const exdates = unionSorted(unit.docs.map((d) => d.suppressedDates)).filter(
    (d) =>
      d >= startDate &&
      (!recurrence.until || d <= recurrence.until) &&
      unit.docs.some((doc) => siblingOccursOn(doc, d)),
  );

  return {
    ...base,
    allDay,
    startDate,
    recurrence,
    exdates: exdates.length ? exdates : undefined,
  };
}

/** Body for createTasksForUser matching an inbound recurring NeutralEvent. */
export function neutralRecurrenceToCreateBody(
  event: NeutralEvent,
  rec: NeutralRecurrence,
  appShape:
    | { kind: 'daily' | 'weekdays' | 'weekend' }
    | { kind: 'weekly'; dayOfWeek: number }
    | { kind: 'monthly'; repeatDayOfMonth: number }
    | { kind: 'custom'; rule: NonNullable<TaskDoc['repeatRule']> },
): Record<string, unknown> {
  const common = {
    text: event.title,
    notes: event.notes,
    startTime: event.startTime,
    endTime: event.endTime,
    dates: [event.startDate],
    repeatEndDate: rec.until,
  };
  switch (appShape.kind) {
    case 'daily':
      return { ...common, repeat: 'weekly', days: [0, 1, 2, 3, 4, 5, 6] };
    case 'weekdays':
      return { ...common, repeat: 'weekly', days: [1, 2, 3, 4, 5] };
    case 'weekend':
      return { ...common, repeat: 'weekly', days: [0, 6] };
    case 'weekly':
      return { ...common, repeat: 'weekly', days: [appShape.dayOfWeek] };
    case 'monthly':
      return { ...common, repeat: 'monthly' };
    case 'custom':
      return { ...common, repeatRule: appShape.rule };
  }
}
