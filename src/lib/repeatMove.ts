import type { TaskDoc, Weekday } from '@/lib/models/Task';
import {
  customOccursOn,
  daysBetweenYMD,
  domFromYMD,
  dowFromYMD,
  weekStartYMD,
} from '@/lib/taskOccurrence';

export type RepeatMoveScope = 'one' | 'future';

type RepeatMode = NonNullable<TaskDoc['repeatMode']>;
type RepeatRule = NonNullable<TaskDoc['repeatRule']>;

export type RepeatShape = {
  repeatMode?: RepeatMode | null;
  repeatRule?: RepeatRule | null;
  repeatDayOfMonth?: number | null;
  dayOfWeek?: number | null;
  repeatEndDate?: string | null;
  repeatGroupId?: string | null;
  bondId?: string | null;
};

export type RulePlan = {
  cut: string;
  start: string;
  set: {
    repeatMode: RepeatMode;
    dayOfWeek?: Weekday;
    repeatDayOfMonth?: number;
    repeatRule?: RepeatRule;
  };
  groupMode?: RepeatMode;
  from: string;
  to: string;
};

const MULTI_DAY_MODES: ReadonlyArray<RepeatMode> = [
  'daily',
  'weekdays',
  'weekend',
];

export function modeForDays(days: number[]): RepeatMode {
  const set = Array.from(new Set(days)).sort((a, b) => a - b);
  if (set.length === 7) return 'daily';
  if (set.length === 5 && [1, 2, 3, 4, 5].every((d) => set.indexOf(d) !== -1))
    return 'weekdays';
  if (set.length === 2 && set[0] === 0 && set[1] === 6) return 'weekend';
  return 'weekly';
}

export function impliedGroupDays(mode?: RepeatMode | null): number[] | null {
  if (mode === 'daily') return [0, 1, 2, 3, 4, 5, 6];
  if (mode === 'weekdays') return [1, 2, 3, 4, 5];
  if (mode === 'weekend') return [0, 6];
  return null;
}

function sameWeek(a: string, b: string) {
  return weekStartYMD(a) === weekStartYMD(b);
}

function replaceIn(list: number[], from: number, to: number) {
  return list
    .filter((v) => v !== from)
    .concat(to)
    .sort((a, b) => a - b);
}

export function planRuleMove(
  task: RepeatShape,
  from: string,
  to: string,
  today: string,
  groupDays?: number[] | null,
): RulePlan | null {
  if (task.bondId || from === to) return null;
  if (task.repeatEndDate && to > task.repeatEndDate) return null;
  const earliest = from < to ? from : to;
  const cut = earliest > today ? earliest : today;
  if (to < cut) return null;

  const rule = task.repeatRule ?? null;
  const fromDow = dowFromYMD(from);
  const toDow = dowFromYMD(to) as Weekday;
  let plan: RulePlan | null = null;

  if (rule) {
    const interval = Math.max(1, rule.interval || 1);
    if (rule.freq === 'daily') {
      if (interval <= 1) return null;
      if (daysBetweenYMD(from, to) % interval === 0) return null;
      plan = {
        cut,
        start: to,
        set: { repeatMode: 'custom', repeatRule: { ...rule } },
        from,
        to,
      };
    } else if (rule.freq === 'weekly') {
      const days = rule.byWeekday?.length ? rule.byWeekday : [fromDow];
      let next: number[];
      if (toDow === fromDow) {
        if (interval <= 1 || days.length !== 1) return null;
        next = days.slice();
      } else {
        if (days.indexOf(toDow) !== -1) return null;
        next = replaceIn(days, fromDow, toDow);
      }
      const start =
        interval <= 1 || (toDow !== fromDow && sameWeek(from, to))
          ? cut
          : days.length === 1
            ? to
            : null;
      if (!start) return null;
      plan = {
        cut,
        start,
        set: { repeatMode: 'custom', repeatRule: { ...rule, byWeekday: next } },
        from,
        to,
      };
    } else {
      const fromDom = domFromYMD(from);
      const toDom = domFromYMD(to);
      const days = rule.byMonthday?.length ? rule.byMonthday : [fromDom];
      let next: number[];
      if (toDom === fromDom) {
        if (interval <= 1 || days.length !== 1) return null;
        next = days.slice();
      } else {
        if (days.indexOf(toDom) !== -1) return null;
        next = replaceIn(days, fromDom, toDom);
      }
      const start =
        interval <= 1 || (toDom !== fromDom && from.slice(0, 7) === to.slice(0, 7))
          ? cut
          : days.length === 1
            ? to
            : null;
      if (!start) return null;
      plan = {
        cut,
        start,
        set: { repeatMode: 'custom', repeatRule: { ...rule, byMonthday: next } },
        from,
        to,
      };
    }
  } else if (task.repeatMode === 'monthly') {
    const fromDom = task.repeatDayOfMonth ?? domFromYMD(from);
    const toDom = domFromYMD(to);
    if (toDom === fromDom) return null;
    plan = {
      cut,
      start: cut,
      set: { repeatMode: 'monthly', repeatDayOfMonth: toDom },
      from,
      to,
    };
  } else {
    const ownDow = typeof task.dayOfWeek === 'number' ? task.dayOfWeek : fromDow;
    if (toDow === ownDow) return null;
    if (task.repeatGroupId) {
      const days =
        groupDays && groupDays.length
          ? groupDays
          : impliedGroupDays(task.repeatMode) ?? [ownDow];
      if (days.indexOf(toDow) !== -1) return null;
      const nextDays = replaceIn(days, ownDow, toDow);
      plan = {
        cut,
        start: cut,
        set: { repeatMode: modeForDays(nextDays), dayOfWeek: toDow },
        groupMode: modeForDays(nextDays),
        from,
        to,
      };
    } else {
      const mode =
        task.repeatMode && MULTI_DAY_MODES.indexOf(task.repeatMode) === -1
          ? task.repeatMode
          : 'weekly';
      plan = {
        cut,
        start: cut,
        set: { repeatMode: mode, dayOfWeek: toDow },
        from,
        to,
      };
    }
  }

  if (!plan || !planLandsOn(plan, to)) return null;
  return plan;
}

function planLandsOn(plan: RulePlan, date: string) {
  if (date < plan.start) return false;
  const { set } = plan;
  if (set.repeatRule)
    return customOccursOn(
      { repeatRule: set.repeatRule, repeatStartDate: plan.start },
      date,
    );
  if (set.repeatMode === 'monthly') return domFromYMD(date) === set.repeatDayOfMonth;
  return dowFromYMD(date) === set.dayOfWeek;
}

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function ordinal(n: number) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
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

function cadence(interval: number, unit: 'week' | 'month') {
  if (interval <= 1) return '';
  if (interval === 2) return 'other ';
  return `${interval} ${unit}s on `;
}

export function describeRepeatMove(
  task: RepeatShape,
  plan: RulePlan | null,
  from: string,
): { oneDetail: string; futureTitle?: string; futureDetail?: string } {
  const fromDow = dowFromYMD(from);
  const rule = task.repeatRule ?? null;
  const usualDay = (() => {
    if (rule?.freq === 'daily') return null;
    if (rule?.freq === 'monthly' || (!rule && task.repeatMode === 'monthly')) {
      const dom =
        !rule && typeof task.repeatDayOfMonth === 'number'
          ? task.repeatDayOfMonth
          : domFromYMD(from);
      return `the ${ordinal(dom)}`;
    }
    return WEEKDAY_NAMES[fromDow];
  })();
  const oneDetail = usualDay
    ? `Back on ${usualDay} next time`
    : 'The rest stays on schedule';
  if (!plan) return { oneDetail };

  const set = plan.set;
  if (set.repeatRule?.freq === 'daily') {
    const n = set.repeatRule.interval;
    return {
      oneDetail,
      futureTitle: `Every ${n} days from ${WEEKDAY_NAMES[dowFromYMD(plan.to)]}`,
      futureDetail: 'The whole schedule shifts with it',
    };
  }
  if (set.repeatRule?.freq === 'monthly' || set.repeatMode === 'monthly') {
    const toDom = domFromYMD(plan.to);
    const every = set.repeatRule ? cadence(set.repeatRule.interval, 'month') : '';
    return {
      oneDetail,
      futureTitle: every
        ? `Every ${every}${every.endsWith('on ') ? '' : 'month on '}the ${ordinal(toDom)}`
        : `Every month on the ${ordinal(toDom)}`,
      futureDetail: `Instead of ${usualDay}, from now on`,
    };
  }
  const toName = WEEKDAY_NAMES[dowFromYMD(plan.to)];
  const every = set.repeatRule ? cadence(set.repeatRule.interval, 'week') : '';
  const sameDay = dowFromYMD(plan.to) === fromDow;
  return {
    oneDetail,
    futureTitle: `Every ${every}${toName}`,
    futureDetail: sameDay
      ? 'The cadence restarts from here'
      : `Instead of ${WEEKDAY_NAMES[fromDow]}, from now on`,
  };
}
