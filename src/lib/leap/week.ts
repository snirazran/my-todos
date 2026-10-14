import type { TaskDoc } from '@/lib/models/Task';
import {
  addDaysYMD,
  habitGroupKey as sharedHabitKey,
  movedInOn,
  ruleOccursOn,
} from '@/lib/taskOccurrence';
import { isWithinStreakCreditWindow } from '@/lib/streak/taskStreaks';
import { startOfWeekYMD, weekDatesFor, type WeekStartDay } from '@/lib/weekStart';
import type { LeapDayState, LeapHabitView } from './types';

export const HOP_KEY_SEPARATOR = '|';

export const LEAP_TASK_FIELDS = {
  id: 1,
  type: 1,
  text: 1,
  dayOfWeek: 1,
  completedDates: 1,
  lateCompletedDates: 1,
  suppressedDates: 1,
  movedDates: 1,
  repeatGroupId: 1,
  habitKey: 1,
  repeatRule: 1,
  repeatStartDate: 1,
  repeatEndDate: 1,
  repeatMode: 1,
  repeatDayOfMonth: 1,
  createdAt: 1,
  isTutorial: 1,
  deletedAt: 1,
} as const;

export function leapHabitFilter(userId: string) {
  return {
    userId,
    type: 'weekly',
    deletedAt: { $exists: false },
    isTutorial: { $ne: true },
  };
}

export function weekKeyFor(dateKey: string, weekStartsOn: WeekStartDay) {
  return startOfWeekYMD(dateKey, weekStartsOn);
}

export function hopKey(groupKey: string, date: string) {
  return `${groupKey}${HOP_KEY_SEPARATOR}${date}`;
}

export function hopKeyDate(key: string) {
  const index = key.lastIndexOf(HOP_KEY_SEPARATOR);
  return index < 0 ? '' : key.slice(index + 1);
}

export function hopKeyGroup(key: string) {
  const index = key.lastIndexOf(HOP_KEY_SEPARATOR);
  return index < 0 ? key : key.slice(0, index);
}

export function habitGroupKey(
  task: Pick<TaskDoc, 'id' | 'repeatGroupId' | 'habitKey'>,
) {
  return sharedHabitKey(task);
}

export type HabitGroup = { key: string; sibs: TaskDoc[] };

export function groupHabits(tasks: TaskDoc[]): HabitGroup[] {
  const groups = new Map<string, TaskDoc[]>();
  for (const task of tasks) {
    if (task.type !== 'weekly' || task.deletedAt || task.isTutorial) continue;
    const key = habitGroupKey(task);
    const list = groups.get(key);
    if (list) list.push(task);
    else groups.set(key, [task]);
  }
  const out: HabitGroup[] = [];
  groups.forEach((sibs, key) => out.push({ key, sibs }));
  return out;
}

function doneOn(task: TaskDoc, date: string) {
  return (
    (task.completedDates ?? []).includes(date) &&
    !(task.lateCompletedDates ?? []).includes(date)
  );
}

export type GroupDayRead = {
  scheduled: boolean;
  done: boolean;
  skipped: boolean;
};

export function readGroupDay(
  sibs: TaskDoc[],
  date: string,
  tz: string,
): GroupDayRead {
  let scheduled = false;
  let done = false;
  let skipped = false;
  let live = false;
  for (const sib of sibs) {
    if (doneOn(sib, date)) done = true;
    if (movedInOn(sib, date)) {
      scheduled = true;
      live = true;
    } else if (ruleOccursOn(sib, date, tz)) {
      scheduled = true;
      if ((sib.suppressedDates ?? []).includes(date)) skipped = true;
      else live = true;
    }
  }
  return {
    scheduled: scheduled || done,
    done,
    skipped: skipped && !live && !done,
  };
}

export type LeapLedger = {
  weekKey: string;
  dates: string[];
  habits: LeapHabitView[];
  scheduled: number;
  hops: number;
  activeDays: number;
  scheduledDays: number;
  open: number;
  openToday: number;
  catchable: number;
  doneKeys: string[];
  hopKeys: string[];
};

export function readLeapWeek(args: {
  tasks: TaskDoc[];
  weekKey: string;
  weekStartsOn: WeekStartDay;
  todayKey: string;
  timezone: string;
  bankedKeys?: string[];
}): LeapLedger {
  const { tasks, weekKey, weekStartsOn, todayKey, timezone } = args;
  const dates = weekDatesFor(weekKey, weekStartsOn);
  const groups = groupHabits(tasks);
  const habits: LeapHabitView[] = [];
  const doneKeys: string[] = [];
  const scheduledDates = new Set<string>();
  let scheduled = 0;
  let open = 0;
  let openToday = 0;
  let catchable = 0;

  for (const group of groups) {
    const days: LeapHabitView['days'] = [];
    let groupScheduled = 0;
    let groupDone = 0;
    for (const date of dates) {
      const read = readGroupDay(group.sibs, date, timezone);
      let state: LeapDayState = 'none';
      if (read.done) {
        state = 'done';
        groupDone += 1;
        groupScheduled += 1;
        doneKeys.push(hopKey(group.key, date));
        scheduledDates.add(date);
      } else if (read.skipped) {
        state = 'skipped';
      } else if (read.scheduled) {
        groupScheduled += 1;
        scheduledDates.add(date);
        if (date >= todayKey) {
          state = 'open';
          open += 1;
          if (date === todayKey) openToday += 1;
        } else {
          state = 'missed';
          if (isWithinStreakCreditWindow(date, todayKey)) {
            catchable += 1;
            open += 1;
          }
        }
      }
      days.push({ date, state });
    }
    if (groupScheduled === 0) continue;
    scheduled += groupScheduled;
    const head =
      group.sibs.find((s) => !s.repeatEndDate || s.repeatEndDate >= todayKey) ??
      group.sibs[0];
    habits.push({
      key: group.key,
      taskId: head.id,
      text: head.text,
      scheduled: groupScheduled,
      done: groupDone,
      days,
    });
  }

  const doneSet = new Set(doneKeys);
  const hopSet = new Set(doneKeys);
  const dateSet = new Set(dates);
  for (const key of args.bankedKeys ?? []) {
    if (hopSet.has(key)) continue;
    const date = hopKeyDate(key);
    if (!dateSet.has(date)) continue;
    hopSet.add(key);
    scheduled += 1;
    scheduledDates.add(date);
  }
  const hopKeys: string[] = [];
  const activeDates = new Set<string>();
  hopSet.forEach((key) => {
    hopKeys.push(key);
    activeDates.add(hopKeyDate(key));
  });

  habits.sort((a, b) => {
    const aLeft = a.scheduled - a.done;
    const bLeft = b.scheduled - b.done;
    if (aLeft !== bLeft) return bLeft - aLeft;
    return a.text.localeCompare(b.text);
  });

  return {
    weekKey,
    dates,
    habits,
    scheduled,
    hops: hopKeys.length,
    activeDays: activeDates.size,
    scheduledDays: scheduledDates.size,
    open,
    openToday,
    catchable,
    doneKeys: Array.from(doneSet),
    hopKeys,
  };
}

export {
  lineGoal,
  markTargets,
  marksMet,
  targetBasis,
  type MarkTarget,
} from './targets';

export function lastScheduledBefore(
  sibs: TaskDoc[],
  date: string,
  tz: string,
  lookbackDays: number,
): { date: string; done: boolean } | null {
  for (let step = 1; step <= lookbackDays; step += 1) {
    const day = addDaysYMD(date, -step);
    const read = readGroupDay(sibs, day, tz);
    if (read.skipped) continue;
    if (read.scheduled) return { date: day, done: read.done };
  }
  return null;
}
