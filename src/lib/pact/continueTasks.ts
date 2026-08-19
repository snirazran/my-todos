import { v4 as uuid } from 'uuid';
import PactModel, { type PactDoc } from '@/lib/models/Pact';
import TaskModel, { type TaskDoc } from '@/lib/models/Task';
import {
  dowFromYMD,
  shiftYMD,
  weekDatesFor,
  weekOrder,
  type WeekStartDay,
} from '@/lib/weekStart';
import { checklistContent } from '@/lib/checklist';

type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type ContinuePactInput = {
  userId: string;
  /** The settled pact whose tasks are being carried into the new week. */
  continueFromPactId: string;
  categoryId: string;
  weekKey: string;
  weekStartsOn: WeekStartDay;
  text: string;
  days: number[];
  timeForDay: (day: number) => string;
  tagId: string;
};

function repeatModeFor(days: number[]): NonNullable<TaskDoc['repeatMode']> {
  const set = new Set(days);
  if (set.size === 7) return 'daily';
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d)))
    return 'weekdays';
  if (set.size === 2 && [0, 6].every((d) => set.has(d))) return 'weekend';
  return 'weekly';
}

async function nextOrderForDay(userId: string, dayOfWeek: Weekday, date: string) {
  const last = await TaskModel.findOne(
    {
      userId,
      $or: [{ type: 'weekly', dayOfWeek }, { type: 'regular', date }],
    },
    { order: 1 },
  )
    .sort({ order: -1 })
    .lean<TaskDoc>();
  return (last?.order ?? 0) + 1;
}

/** Dates the carried task would recur on across weeks that ran no Leap. */
function gapDates(doc: TaskDoc, fromExclusive: string, toExclusive: string) {
  if (typeof doc.dayOfWeek !== 'number') return [];
  const out: string[] = [];
  let d = shiftYMD(fromExclusive, 1);
  for (let guard = 0; guard < 400 && d < toExclusive; guard += 1) {
    if (dowFromYMD(d) === doc.dayOfWeek) out.push(d);
    d = shiftYMD(d, 1);
  }
  return out;
}

const minutesOf = (hm: string) =>
  Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/** Keep a carried task's duration when its start time moves. */
function endTimeFor(doc: TaskDoc, startTime: string): string | undefined {
  if (!doc.endTime || !doc.startTime) return doc.endTime;
  if (doc.startTime === startTime) return doc.endTime;
  const span = minutesOf(doc.endTime) - minutesOf(doc.startTime);
  if (span <= 0) return undefined;
  const total = minutesOf(startTime) + span;
  if (total >= 24 * 60) return undefined;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(
    total % 60,
  ).padStart(2, '0')}`;
}

/**
 * Carry a settled Leap's tasks into a new week instead of writing fresh ones,
 * keeping each board row, its history and its calendar event. Returns null
 * when nothing is left to carry, and the caller commits the ordinary way.
 */
export async function continuePactTasks(
  input: ContinuePactInput,
): Promise<string[] | null> {
  const { userId, weekKey, weekStartsOn, text, days, tagId } = input;

  const previous = await PactModel.findOne({
    userId,
    pactId: input.continueFromPactId,
    categoryId: input.categoryId,
    settledAt: { $ne: null },
  }).lean<PactDoc>();
  if (!previous?.taskIds?.length) return null;

  const carried = await TaskModel.find({
    userId,
    id: { $in: previous.taskIds },
    type: 'weekly',
    deletedAt: { $exists: false },
  }).lean<TaskDoc[]>();
  if (carried.length === 0) return null;

  const order = weekOrder(weekStartsOn);
  const weekDates = weekDatesFor(weekKey, weekStartsOn);
  const dateFor = (day: number) => weekDates[order.indexOf(day as Weekday)];
  const weekEnd = shiftYMD(weekKey, 6);

  const byTime = new Map<string, number[]>();
  for (const day of days) {
    const at = input.timeForDay(day);
    byTime.set(at, [...(byTime.get(at) ?? []), day]);
  }
  const timeGroups = Array.from(byTime.entries())
    .map(([at, group]) => ({ at, days: group.sort((a, b) => a - b) }))
    .sort((a, b) => a.days[0] - b.days[0]);

  const keptDays = new Set(days);
  const byDay = new Map<number, TaskDoc>();
  const retired: TaskDoc[] = [];
  for (const doc of carried) {
    const day = doc.dayOfWeek;
    if (typeof day === 'number' && keptDays.has(day) && !byDay.has(day)) {
      byDay.set(day, doc);
    } else {
      retired.push(doc);
    }
  }

  const spareGroups = Array.from(
    new Set(
      carried
        .map((doc) => doc.repeatGroupId)
        .filter((id): id is string => !!id),
    ),
  );
  const claimed = new Set<string>();
  const claim = (preferred?: string) => {
    if (preferred && !claimed.has(preferred)) {
      claimed.add(preferred);
      return preferred;
    }
    const spare = spareGroups.find((id) => !claimed.has(id));
    if (spare) {
      claimed.add(spare);
      return spare;
    }
    const minted = uuid();
    claimed.add(minted);
    return minted;
  };

  const taskIds: string[] = [];
  const now = new Date();

  for (const group of timeGroups) {
    const reused = group.days
      .map((day) => byDay.get(day))
      .filter((doc): doc is TaskDoc => !!doc);
    const repeatGroupId = claim(reused.find((doc) => doc.repeatGroupId)?.repeatGroupId);
    const repeatMode = repeatModeFor(group.days);
    const template = reused[0] ?? carried[0];

    for (const day of group.days) {
      const doc = byDay.get(day);
      if (!doc) {
        const id = uuid();
        await TaskModel.create({
          userId,
          type: 'weekly',
          id,
          text,
          order: await nextOrderForDay(userId, day as Weekday, dateFor(day)),
          dayOfWeek: day as Weekday,
          createdAt: now,
          updatedAt: now,
          tags: Array.from(new Set([...(template.tags ?? []), tagId])),
          notes: template.notes,
          checklist: checklistContent(template.checklist),
          startTime: group.at,
          endTime: endTimeFor(template, group.at),
          reminder: 'at_time',
          repeatMode,
          repeatGroupId,
          repeatStartDate: dateFor(day),
          repeatEndDate: weekEnd,
        });
        taskIds.push(id);
        continue;
      }

      const previousEnd = doc.repeatEndDate;
      const suppress =
        previousEnd && previousEnd < weekKey
          ? gapDates(doc, previousEnd, weekKey)
          : [];

      const endTime = endTimeFor(doc, group.at);

      await TaskModel.updateOne(
        { userId, id: doc.id },
        {
          $set: {
            text,
            startTime: group.at,
            reminder: 'at_time',
            repeatMode,
            repeatGroupId,
            repeatEndDate: weekEnd,
            updatedAt: now,
            ...(endTime ? { endTime } : {}),
          },
          ...(endTime ? {} : { $unset: { endTime: 1 } }),
          $addToSet: {
            tags: tagId,
            ...(suppress.length ? { suppressedDates: { $each: suppress } } : {}),
          },
        },
      );

      if (!doc.repeatGroupId) {
        const { retargetLinksToGroup } = await import('@/lib/calendar/links');
        await retargetLinksToGroup({ userId, taskId: doc.id, repeatGroupId });
      }
      taskIds.push(doc.id);
    }
  }

  if (retired.length) {
    await TaskModel.updateMany(
      { userId, id: { $in: retired.map((doc) => doc.id) } },
      { $set: { deletedAt: now } },
    );
  }

  return taskIds;
}
