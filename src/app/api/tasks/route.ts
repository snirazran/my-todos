// src/app/api/tasks/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import { Types } from 'mongoose';
import { v4 as uuid } from 'uuid';
import connectMongo from '@/lib/mongoose';
import UserModel, { type UserDoc } from '@/lib/models/User';
import TaskModel, {
  type TaskDoc,
  type TaskType,
  type Weekday,
} from '@/lib/models/Task';
import type { DailyFlyProgress } from '@/lib/types/UserDoc';
import {
  calculateHunger,
  MAX_HUNGER_MS,
  TASK_HUNGER_REWARD_MS,
} from '@/lib/hungerLogic';
import { syncQuestState, isPremiumUser } from '@/lib/quests/engine';
import { getZonedToday, getZonedYMD } from '@/lib/utils';
import { notifyTaskChanged } from '@/lib/taskSync';
import { severBond, handleBuddyCompletion } from '@/lib/buddy/server';
import { bumpQuestMetric, taskStreakMetric } from '@/lib/quests/metrics';

type Origin = 'weekly' | 'regular';
type BoardItem = { id: string; text: string; order: number; type: TaskType };
type LeanUser = (UserDoc & { _id: string }) | null;
type FlyStatus = {
  balance: number;
  earnedToday: number;
  limit: number;
  limitHit: boolean;
  justHitLimit?: boolean;
  isPremium?: boolean;
};

type HungerStatus = {
  hunger: number;
  stolenFlies: number;
  maxHunger: number;
};

const DAILY_FLY_LIMIT_FREE = 50;
const DAILY_FLY_LIMIT_PREMIUM = 100;

const isWeekday = (n: number): n is Weekday =>
  Number.isInteger(n) && n >= 0 && n <= 6;

async function currentUserId() {
  try {
    return await requireUserId();
  } catch {
    return null;
  }
}

function unauth() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

// --- Timezone Helpers ---

function getRollingWeekDatesZoned(tz: string) {
  const todayYMD = getZonedToday(tz);
  const todayDate = new Date(`${todayYMD}T12:00:00Z`);
  const dow = todayDate.getUTCDay();
  const sundayDate = new Date(todayDate);
  sundayDate.setUTCDate(todayDate.getUTCDate() - dow);
  const weekStart = sundayDate.toISOString().split('T')[0];
  const weekDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(sundayDate);
    d.setUTCDate(sundayDate.getUTCDate() + i);
    weekDates.push(d.toISOString().split('T')[0]);
  }
  const rollingDates = weekDates.map((date) => {
    if (date < todayYMD) {
      const d = new Date(`${date}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 7);
      return d.toISOString().split('T')[0];
    }
    return date;
  });
  return { weekStart, weekDates: rollingDates, todayYMD };
}

function dowFromYMD(ymd: string) {
  return new Date(`${ymd}T12:00:00Z`).getUTCDay() as Weekday;
}

function repeatStartForDoc(task: TaskDoc, tz: string) {
  if (task.repeatStartDate) return task.repeatStartDate;
  if (task.type !== 'weekly') return undefined;
  return getZonedYMD(new Date(task.createdAt), tz);
}

/** Validate/normalize a YYYY-MM-DD repeat end date; returns null when absent/invalid. */
function normalizeRepeatEnd(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : null;
}

/** True when `date` falls after the repeat's end date (i.e. the occurrence should be hidden). */
function isAfterRepeatEnd(task: Pick<TaskDoc, 'repeatEndDate'>, date: string) {
  return !!task.repeatEndDate && date > task.repeatEndDate;
}

/** Day-of-month (1..31) from a YYYY-MM-DD string. */
function domFromYMD(ymd: string) {
  return Number(ymd.slice(8, 10));
}

/**
 * True when a monthly-repeat doc does NOT occur on `date` (its anchor
 * day-of-month differs). For non-monthly docs this is always false.
 */
function monthlyExcludesDate(
  task: Pick<TaskDoc, 'repeatMode' | 'repeatDayOfMonth'>,
  date: string,
) {
  return (
    task.repeatMode === 'monthly' &&
    typeof task.repeatDayOfMonth === 'number' &&
    task.repeatDayOfMonth !== domFromYMD(date)
  );
}

/** Add `n` days to a YYYY-MM-DD string (UTC-noon anchored to dodge DST). */
function addDaysYMD(ymd: string, n: number) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whether a single repeating doc is scheduled on `date` (rule + end-date only;
 *  start-date and suppression are handled by the group-level walker). */
function siblingOccursOn(task: TaskDoc, date: string) {
  if (isAfterRepeatEnd(task, date)) return false;
  if (task.repeatRule) return customOccursOn(task, date);
  if (task.repeatMode === 'monthly' && typeof task.repeatDayOfMonth === 'number')
    return domFromYMD(date) === task.repeatDayOfMonth;
  if (typeof task.dayOfWeek === 'number') return dowFromYMD(date) === task.dayOfWeek;
  return false;
}

/**
 * Consecutive-completion streak for a repeating habit, as of `today`. A
 * daily/weekdays/weekend habit is stored as several sibling docs (one per
 * weekday, linked by repeatGroupId), each holding its own completedDates — so
 * the streak is computed across the WHOLE group: the habit is "scheduled" on a
 * date if any sibling is, and "done" if any sibling recorded it. Walks backward
 * from today until the first missed scheduled date. Today not being done yet
 * doesn't break the streak (the day isn't over); suppressed/skipped dates are
 * ignored, but more than MAX_CONSECUTIVE_SKIPS suppressed occurrences in a row
 * break the streak.
 */
const MAX_CONSECUTIVE_SKIPS = 2;

function computeGroupStreak(sibs: TaskDoc[], today: string, tz: string) {
  if (sibs.length === 0) return 0;
  const completed = new Set<string>();
  const suppressed = new Set<string>();
  let earliestStart: string | undefined;
  for (const s of sibs) {
    for (const d of s.completedDates ?? []) completed.add(d);
    for (const d of s.suppressedDates ?? []) suppressed.add(d);
    const rs = repeatStartForDoc(s, tz);
    if (rs && (!earliestStart || rs < earliestStart)) earliestStart = rs;
  }
  let streak = 0;
  let skipRun = 0;
  let d = today;
  for (let guard = 0; guard < 2000; guard++) {
    if (earliestStart && d < earliestStart) break;
    if (sibs.some((s) => siblingOccursOn(s, d))) {
      if (suppressed.has(d)) {
        skipRun++;
        if (skipRun > MAX_CONSECUTIVE_SKIPS) break;
      } else {
        skipRun = 0;
        const done = completed.has(d);
        if (d === today && !done) {
          // Today's occurrence isn't done yet — neither count nor break.
        } else if (done) {
          streak++;
        } else {
          break;
        }
      }
    }
    d = addDaysYMD(d, -1);
  }
  return streak;
}

/**
 * Build a map of taskId -> streak for the given weekly docs, resolving each
 * doc's full repeat group (fetching siblings not present in `weeklyDocs`) so
 * grouped habits share one streak across weekdays.
 */
async function streakMapForWeeklyDocs(
  uid: string,
  weeklyDocs: TaskDoc[],
  today: string,
  tz: string,
) {
  const map = new Map<string, number>();
  if (weeklyDocs.length === 0) return map;

  const groupIds = Array.from(
    new Set(
      weeklyDocs
        .map((d) => d.repeatGroupId)
        .filter((g): g is string => !!g),
    ),
  );

  const byGroup = new Map<string, TaskDoc[]>();
  if (groupIds.length > 0) {
    const sibs = await TaskModel.find(
      { userId: uid, repeatGroupId: { $in: groupIds } },
      {
        id: 1,
        type: 1,
        dayOfWeek: 1,
        completedDates: 1,
        suppressedDates: 1,
        repeatGroupId: 1,
        repeatRule: 1,
        repeatStartDate: 1,
        repeatEndDate: 1,
        repeatMode: 1,
        repeatDayOfMonth: 1,
        createdAt: 1,
      },
    )
      .lean<TaskDoc[]>()
      .exec();
    for (const s of sibs) {
      const k = s.repeatGroupId!;
      if (!byGroup.has(k)) byGroup.set(k, []);
      byGroup.get(k)!.push(s);
    }
  }

  for (const d of weeklyDocs) {
    const sibs =
      d.repeatGroupId && byGroup.has(d.repeatGroupId)
        ? byGroup.get(d.repeatGroupId)!
        : [d];
    map.set(d.id, computeGroupStreak(sibs, today, tz));
  }
  return map;
}

// --- Custom recurrence (interval-based, RRULE-like) -------------------------

/** Whole days between two YYYY-MM-DD dates (b - a). */
function daysBetweenYMD(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

/** YYYY-MM-DD of the Sunday that begins the week containing `ymd`. */
function weekStartYMD(ymd: string) {
  const dow = dowFromYMD(ymd);
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/**
 * Whether a custom-rule doc occurs on `date`. Anchored to `repeatStartDate`;
 * start/end-date bounds are checked by the caller.
 */
function customOccursOn(
  task: Pick<TaskDoc, 'repeatRule' | 'repeatStartDate'>,
  date: string,
) {
  const rule = task.repeatRule;
  const start = task.repeatStartDate;
  if (!rule || !start) return false;
  if (date < start) return false;
  const interval = Math.max(1, rule.interval || 1);

  if (rule.freq === 'daily') {
    const diff = daysBetweenYMD(start, date);
    return diff >= 0 && diff % interval === 0;
  }
  if (rule.freq === 'weekly') {
    const days = rule.byWeekday ?? [];
    if (!days.includes(dowFromYMD(date))) return false;
    const weekDiff = Math.round(
      daysBetweenYMD(weekStartYMD(start), weekStartYMD(date)) / 7,
    );
    return weekDiff >= 0 && weekDiff % interval === 0;
  }
  // monthly
  const dom = rule.byMonthday ?? [];
  if (!dom.includes(domFromYMD(date))) return false;
  const [sy, sm] = start.split('-').map(Number);
  const [dy, dm] = date.split('-').map(Number);
  const monthDiff = (dy - sy) * 12 + (dm - sm);
  return monthDiff >= 0 && monthDiff % interval === 0;
}

/** Validate/clamp a custom repeat rule from request input, anchored to a date. */
function normalizeRepeatRule(
  raw: unknown,
  anchor: string,
): TaskDoc['repeatRule'] | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const freq = r.freq;
  if (freq !== 'daily' && freq !== 'weekly' && freq !== 'monthly') return null;
  const max = freq === 'daily' ? 100 : freq === 'weekly' ? 52 : 12;
  let interval = Math.round(Number(r.interval));
  if (!Number.isFinite(interval)) interval = 1;
  interval = Math.min(max, Math.max(1, interval));
  const rule: NonNullable<TaskDoc['repeatRule']> = { freq, interval };
  if (freq === 'weekly') {
    const days = Array.isArray(r.byWeekday)
      ? Array.from(
          new Set(
            r.byWeekday.map(Number).filter((d: number) => d >= 0 && d <= 6),
          ),
        ).sort((a, b) => a - b)
      : [];
    rule.byWeekday = days.length ? days : [dowFromYMD(anchor)];
  } else if (freq === 'monthly') {
    const dom = Array.isArray(r.byMonthday)
      ? Array.from(
          new Set(
            r.byMonthday.map(Number).filter((d: number) => d >= 1 && d <= 31),
          ),
        ).sort((a, b) => a - b)
      : [];
    rule.byMonthday = dom.length ? dom : [domFromYMD(anchor)];
  }
  return rule;
}

function isBoardMode(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  return (
    params.get('view') === 'board' ||
    params.get('view') === 'dateRange' ||
    params.has('day') ||
    params.get('fullWeek') === '1'
  );
}

function isDateRangeMode(req: NextRequest) {
  return req.nextUrl.searchParams.get('view') === 'dateRange';
}

const initDailyFly = (date: string): DailyFlyProgress => ({
  date,
  earned: 0,
  taskIds: [],
  taskFlies: {},
  limitNotified: false,
});

function normalizeDailyFly(
  today: string,
  flyDaily?: DailyFlyProgress,
): DailyFlyProgress {
  if (flyDaily?.date === today) {
    return {
      ...flyDaily,
      taskIds: flyDaily.taskIds ?? [],
      taskFlies: flyDaily.taskFlies ?? {},
      limitNotified: flyDaily.limitNotified ?? false,
    };
  }
  return initDailyFly(today);
}

const STREAK_FLY_TIERS: ReadonlyArray<readonly [number, number]> = [
  [30, 5],
  [14, 4],
  [7, 3],
  [3, 2],
];

/** Base flies for a completion at the given streak length (1 below the first tier). */
function streakFlyBase(streak: number): number {
  for (const [minDays, flies] of STREAK_FLY_TIERS) {
    if (streak >= minDays) return flies;
  }
  return 1;
}

/** Flies a task is worth: a streak-tiered base plus one per completed checklist item. */
function taskFlyValue(
  task: Pick<TaskDoc, 'checklist'>,
  streak: number = 0,
): number {
  const done = (task.checklist ?? []).filter((c) => c.done).length;
  return streakFlyBase(streak) + done;
}

async function currentFlyStatus(
  userId: string,
  tz: string,
): Promise<{
  flyStatus: FlyStatus;
  hungerStatus: HungerStatus;
  dailyTasksCount: number;
}> {
  const today = getZonedToday(tz);
  const user = (await UserModel.findById(userId, {
    wardrobe: 1,
    statistics: 1,
    premiumUntil: 1,
  }).lean()) as LeanUser;

  if (!user) {
    return {
      flyStatus: {
        balance: 0,
        earnedToday: 0,
        limit: DAILY_FLY_LIMIT_FREE,
        limitHit: false,
        isPremium: false,
      },
      hungerStatus: {
        hunger: MAX_HUNGER_MS,
        stolenFlies: 0,
        maxHunger: MAX_HUNGER_MS,
      },
      dailyTasksCount: 0,
    };
  }

  const premium = isPremiumUser(user);
  const limit = premium ? DAILY_FLY_LIMIT_PREMIUM : DAILY_FLY_LIMIT_FREE;
  const { updates, status: hungerStatus } = calculateHunger(user);
  const wardrobe = user.wardrobe ?? { equipped: {}, inventory: {}, flies: 0 };
  const daily = normalizeDailyFly(
    today,
    wardrobe.flyDaily as DailyFlyProgress | undefined,
  );

  const pendingUpdates: Record<string, any> = { ...updates };
  let needsUpdate = Object.keys(updates).length > 0;

  if (!user?.wardrobe || wardrobe.flyDaily?.date !== today) {
    pendingUpdates['wardrobe.flyDaily'] = daily;
    if (!wardrobe.equipped) pendingUpdates['wardrobe.equipped'] = {};
    if (!wardrobe.inventory) pendingUpdates['wardrobe.inventory'] = {};
    if (wardrobe.flies === undefined) pendingUpdates['wardrobe.flies'] = 0;

    // Ensure hunger fields are initialized if missing
    if (wardrobe.hunger === undefined)
      pendingUpdates['wardrobe.hunger'] = MAX_HUNGER_MS;
    if (!wardrobe.lastHungerUpdate)
      pendingUpdates['wardrobe.lastHungerUpdate'] = new Date();

    needsUpdate = true;
  }

  if (needsUpdate) {
    await UserModel.updateOne({ _id: userId }, { $set: pendingUpdates });
  }

  const currentBalance =
    pendingUpdates['wardrobe.flies'] ?? wardrobe.flies ?? 0;

  const dailyTasksCount =
    user.statistics?.daily?.date === today
      ? user.statistics.daily.dailyTasksCount ?? 0
      : 0;

  return {
    flyStatus: {
      balance: currentBalance,
      earnedToday: daily.earned,
      limit,
      limitHit: daily.earned >= limit,
      isPremium: premium,
    },
    hungerStatus,
    dailyTasksCount,
  };
}

function syncGamification(userId: string, timezone: string) {
  return syncQuestState({ userId, timezone }).catch((error) => {
    console.error('Quest sync failed:', error);
  });
}

async function awardFlyForTask(
  userId: string,
  taskId: string,
  tz: string,
  countTowardDaily: boolean = true,
  value: number = 1,
): Promise<{
  awarded: boolean;
  flyStatus: FlyStatus;
  hungerStatus: HungerStatus;
  dailyTasksCount: number;
}> {
  const today = getZonedToday(tz);
  const user = (await UserModel.findById(userId, {
    wardrobe: 1,
    statistics: 1, // Include statistics
    premiumUntil: 1,
  }).lean()) as LeanUser;

  if (!user) {
    return {
      awarded: false,
      flyStatus: {
        balance: 0,
        earnedToday: 0,
        limit: DAILY_FLY_LIMIT_FREE,
        limitHit: false,
        isPremium: false,
      },
      hungerStatus: {
        hunger: MAX_HUNGER_MS,
        stolenFlies: 0,
        maxHunger: MAX_HUNGER_MS,
      },
      dailyTasksCount: 0,
    };
  }

  const premium = isPremiumUser(user);
  const limit = premium ? DAILY_FLY_LIMIT_PREMIUM : DAILY_FLY_LIMIT_FREE;
  const { updates: hungerUpdates, status: currentHungerState } =
    calculateHunger(user);
  const wardrobe = user.wardrobe ?? { equipped: {}, inventory: {}, flies: 0 };
  const daily = normalizeDailyFly(
    today,
    wardrobe.flyDaily as DailyFlyProgress | undefined,
  );
  const alreadyRewarded = (daily.taskIds ?? []).includes(taskId);
  const atLimit = daily.earned >= limit;
  const limitNotified = daily.limitNotified ?? false;
  let currentBalance = hungerUpdates['wardrobe.flies'] ?? wardrobe.flies ?? 0;

  // --- Daily task statistics for fly tracking ---
  const currentStats = user.statistics?.daily ?? {
    date: '',
    dailyTasksCount: 0,
    dailyMilestoneGifts: 0,
    completedTaskIds: [],
    taskCountAtLastGift: 0,
  };
  const isNewDay = currentStats.date !== today;
  const alreadyCountedInStats =
    !isNewDay && currentStats.completedTaskIds.includes(taskId);

  const statsUpdates: Record<string, any> = {};

  let nextDailyTasksCount = isNewDay ? 0 : currentStats.dailyTasksCount;
  if (countTowardDaily) {
    nextDailyTasksCount = isNewDay ? 1 : currentStats.dailyTasksCount;
    if (!alreadyCountedInStats && !isNewDay) nextDailyTasksCount += 1;

    if (!alreadyCountedInStats) {
      if (isNewDay) {
        statsUpdates['statistics.daily'] = {
          date: today,
          dailyTasksCount: 1,
          dailyMilestoneGifts: 0,
          completedTaskIds: [taskId],
          taskCountAtLastGift: 0,
        };
      } else {
        statsUpdates['statistics.daily.dailyTasksCount'] =
          currentStats.dailyTasksCount + 1;
      }
    }
  }

  if (alreadyRewarded) {
    // Merge stat updates
    const finalUpdates = { ...hungerUpdates };

    if (Object.keys(statsUpdates).length > 0) {
      Object.assign(finalUpdates, statsUpdates);
    }

    const ops: any = { $set: finalUpdates };
    if (countTowardDaily && !isNewDay && !alreadyCountedInStats) {
      ops.$inc = { ...(ops.$inc || {}), 'statistics.daily.dailyTasksCount': 1 };
      ops.$push = { 'statistics.daily.completedTaskIds': taskId };
      delete finalUpdates['statistics.daily.dailyTasksCount'];
    }

    if (Object.keys(finalUpdates).length > 0 || ops.$inc || ops.$push) {
      await UserModel.updateOne({ _id: user._id }, ops);
    }

    return {
      awarded: false,
      flyStatus: {
        balance: currentBalance,
        earnedToday: daily.earned,
        limit,
        limitHit: atLimit,
        isPremium: premium,
      },
      hungerStatus: currentHungerState,
      dailyTasksCount: nextDailyTasksCount,
    };
  }

  // Calculate new hunger
  let newHunger = Math.min(
    MAX_HUNGER_MS,
    Math.max(0, currentHungerState.hunger) + TASK_HUNGER_REWARD_MS,
  );
  const finalHungerStatus = { ...currentHungerState, hunger: newHunger };
  if (
    newHunger >= MAX_HUNGER_MS &&
    Math.max(0, currentHungerState.hunger) < MAX_HUNGER_MS
  ) {
    await bumpQuestMetric({ userId, metric: 'frog_fed_full', timezone: tz });
  }

  const setFields: Record<string, any> = {
    ...hungerUpdates,
    'wardrobe.hunger': newHunger,
    'wardrobe.lastHungerUpdate': new Date(),
  };

  if (statsUpdates['statistics.daily']) {
    setFields['statistics.daily'] = statsUpdates['statistics.daily'];
  }

  const desired = Math.max(1, Math.floor(value));
  let grant = desired;
  if (countTowardDaily) {
    grant = Math.min(desired, Math.max(0, limit - daily.earned));
  }

  let nextEarned = daily.earned;
  let nextBalance = currentBalance;
  let awardedFly = false;

  if (grant > 0) {
    if (countTowardDaily) nextEarned += grant;
    nextBalance += grant;
    awardedFly = true;
    setFields['wardrobe.flies'] = nextBalance;
  }

  const hitLimit = nextEarned >= limit;
  const nextDaily: DailyFlyProgress = {
    date: today,
    earned: nextEarned,
    taskIds: Array.from(new Set([...(daily.taskIds ?? []), taskId])),
    taskFlies: { ...(daily.taskFlies ?? {}), [taskId]: grant },
    limitNotified: limitNotified || hitLimit,
  };

  setFields['wardrobe.flyDaily'] = nextDaily;
  if (!user.wardrobe?.equipped) setFields['wardrobe.equipped'] = {};
  if (!user.wardrobe?.inventory) setFields['wardrobe.inventory'] = {};

  const ops: any = { $set: setFields };

  if (countTowardDaily && !isNewDay && !alreadyCountedInStats) {
    ops.$inc = { ...(ops.$inc || {}), 'statistics.daily.dailyTasksCount': 1 };
    ops.$push = {
      ...(ops.$push || {}),
      'statistics.daily.completedTaskIds': taskId,
    };
  }

  await UserModel.updateOne({ _id: user._id }, ops);

  return {
    awarded: awardedFly,
    flyStatus: {
      balance: nextBalance,
      earnedToday: nextEarned,
      limit,
      limitHit: hitLimit,
      justHitLimit:
        countTowardDaily && hitLimit && !limitNotified ? true : undefined,
      isPremium: premium,
    },
    hungerStatus: finalHungerStatus,
    dailyTasksCount: nextDailyTasksCount,
  };
}

async function unawardFlyForTask(
  userId: string,
  taskId: string,
  tz: string,
  countTowardDaily: boolean = true,
): Promise<{
  flyStatus: FlyStatus;
  hungerStatus: HungerStatus;
  dailyTasksCount: number;
}> {
  const today = getZonedToday(tz);
  const user = (await UserModel.findById(userId, {
    wardrobe: 1,
    statistics: 1,
    premiumUntil: 1,
  }).lean()) as LeanUser;

  if (!user) {
    return {
      flyStatus: {
        balance: 0,
        earnedToday: 0,
        limit: DAILY_FLY_LIMIT_FREE,
        limitHit: false,
        isPremium: false,
      },
      hungerStatus: {
        hunger: MAX_HUNGER_MS,
        stolenFlies: 0,
        maxHunger: MAX_HUNGER_MS,
      },
      dailyTasksCount: 0,
    };
  }

  const premium = isPremiumUser(user);
  const limit = premium ? DAILY_FLY_LIMIT_PREMIUM : DAILY_FLY_LIMIT_FREE;
  const { updates: hungerUpdates, status: hungerStatus } = calculateHunger(user);
  const wardrobe = user.wardrobe ?? { equipped: {}, inventory: {}, flies: 0 };
  const daily = normalizeDailyFly(
    today,
    wardrobe.flyDaily as DailyFlyProgress | undefined,
  );
  const balance = hungerUpdates['wardrobe.flies'] ?? wardrobe.flies ?? 0;
  const dailyTasksCount =
    user.statistics?.daily?.date === today
      ? user.statistics.daily.dailyTasksCount ?? 0
      : 0;

  const wasRewarded = (daily.taskIds ?? []).includes(taskId);
  const setFields: Record<string, any> = { ...hungerUpdates };

  let nextEarned = daily.earned;
  let nextBalance = balance;

  if (wasRewarded) {
    const granted = daily.taskFlies?.[taskId] ?? 1;
    if (countTowardDaily) nextEarned = Math.max(0, daily.earned - granted);
    nextBalance = Math.max(0, balance - granted);
    const nextTaskFlies = { ...(daily.taskFlies ?? {}) };
    delete nextTaskFlies[taskId];
    const nextDaily: DailyFlyProgress = {
      date: today,
      earned: nextEarned,
      taskIds: (daily.taskIds ?? []).filter((id) => id !== taskId),
      taskFlies: nextTaskFlies,
      limitNotified: nextEarned >= limit ? daily.limitNotified : false,
    };
    setFields['wardrobe.flies'] = nextBalance;
    setFields['wardrobe.flyDaily'] = nextDaily;
  }

  if (Object.keys(setFields).length > 0) {
    await UserModel.updateOne({ _id: user._id }, { $set: setFields });
  }

  return {
    flyStatus: {
      balance: nextBalance,
      earnedToday: nextEarned,
      limit,
      limitHit: nextEarned >= limit,
      isPremium: premium,
    },
    hungerStatus,
    dailyTasksCount,
  };
}

export async function GET(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();
  await connectMongo();
  const tz = req.nextUrl.searchParams.get('timezone') || 'UTC';
  if (isDateRangeMode(req)) return handleDateRangeGet(req, uid, tz);
  if (isBoardMode(req)) return handleBoardGet(req, uid, tz);
  return handleDailyGet(req, uid, tz);
}

export async function POST(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();
  await connectMongo();
  const body = await req.json();
  const tz = body.timezone || 'UTC';

  // Duplicate an existing task onto a target date (used for completed tasks).
  if (body.duplicateFrom && body.date) {
    const src = await TaskModel.findOne({
      userId: uid,
      id: body.duplicateFrom,
    }).lean<TaskDoc>();
    if (!src)
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    const dupDate = String(body.date);
    const weekday = dowFromYMD(dupDate);
    const dupNow = new Date();
    const dupId = uuid();
    const dupOrder = await nextOrderForDay(uid, weekday as Weekday, dupDate);
    const created = await TaskModel.create({
      userId: uid,
      type: 'regular',
      id: dupId,
      text: src.text,
      order: dupOrder,
      date: dupDate,
      completed: false,
      createdAt: dupNow,
      updatedAt: dupNow,
      tags: src.tags ?? [],
      notes: src.notes,
      checklist: src.checklist,
      startTime: src.startTime,
      endTime: src.endTime,
      reminder: src.reminder,
    });
    void syncGamification(uid, tz);
    await notifyTaskChanged(uid);
    return NextResponse.json({
      ok: true,
      id: dupId,
      tasks: [
        {
          id: created.id,
          text: created.text,
          order: created.order,
          completed: false,
          type: 'regular',
          tags: created.tags || [],
          notes: created.notes ?? '',
          checklist: created.checklist ?? [],
          date: created.date,
          startTime: created.startTime,
          endTime: created.endTime,
          reminder: created.reminder,
        },
      ],
    });
  }

  const result = await createTasksForUser(uid, body, tz);
  if (!result.ok)
    return NextResponse.json({ error: result.error }, { status: result.status });
  void syncGamification(uid, tz);
  await notifyTaskChanged(uid);
  return NextResponse.json({ ok: true, ids: result.ids, tasks: result.tasks });
}

export type CreateTasksResult =
  | { ok: true; ids: string[]; tasks: any[]; repeatGroupId?: string }
  | { ok: false; error: string; status: number };

/**
 * Shared task-creation logic used by POST /api/tasks and the buddy-accept flow.
 * When `opts.bondId` is provided, every created doc (and returned task) is
 * stamped with the buddy bond so both sides stay linked. Does NOT run
 * syncGamification / notify — callers do that after.
 */
export async function createTasksForUser(
  uid: string,
  body: any,
  tz: string,
  opts?: { bondId?: string; buddyUserId?: string },
): Promise<CreateTasksResult> {
  const buddyFields = opts?.bondId
    ? { bondId: opts.bondId, buddyUserId: opts.buddyUserId }
    : {};

  const text = String(body?.text ?? '').trim();
  const rawDays: number[] = Array.isArray(body?.days) ? body.days : [];
  const tags: string[] = Array.isArray(body?.tags) ? body.tags.map(String) : [];
  const startTime = body.startTime;
  const endTime = body.endTime;
  const reminder = body.reminder;
  // Carried over when restoring a saved (backlog) task so notes/checklist survive.
  const notes = typeof body?.notes === 'string' ? body.notes : undefined;
  const checklist = Array.isArray(body?.checklist)
    ? body.checklist
        .filter(
          (it: unknown): it is Record<string, unknown> =>
            !!it && typeof it === 'object',
        )
        .map((it: Record<string, unknown>) => ({
          id: String(it.id ?? ''),
          text: String(it.text ?? ''),
          done: Boolean(it.done),
        }))
    : undefined;

  const repeat =
    body?.repeat === 'backlog'
      ? 'backlog'
      : body?.repeat === 'this-week'
        ? 'this-week'
        : body?.repeat === 'monthly'
          ? 'monthly'
          : 'weekly';
  if (!text) return { ok: false, error: 'text is required', status: 400 };
  const explicitDates: string[] = Array.isArray(body?.dates)
    ? body.dates
        .map(String)
        .filter((s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s))
    : [];
  const days =
    repeat === 'backlog'
      ? [-1]
      : rawDays
          .map(Number)
          .filter(Number.isInteger)
          .filter((d) => d === -1 || isWeekday(d));
  if (days.length === 0 && explicitDates.length === 0)
    return { ok: false, error: 'days must include -1 or 0..6', status: 400 };
  const { weekStart, weekDates } = getRollingWeekDatesZoned(tz);
  const createdIds: string[] = [];
  const now = new Date();
  const createdTasks: any[] = [];

  // Monthly repeat: a single persistent doc anchored to a day-of-month.
  if (repeat === 'monthly') {
    const anchor = explicitDates.slice().sort()[0];
    if (!anchor)
      return { ok: false, error: 'monthly repeat requires a date', status: 400 };
    const repeatDayOfMonth = domFromYMD(anchor);
    const repeatEndDate = normalizeRepeatEnd(body?.repeatEndDate) ?? undefined;
    const dayOfWeek = dowFromYMD(anchor);
    const id = uuid();
    const order = await nextOrderForDay(uid, dayOfWeek, anchor);
    const task = await TaskModel.create({
      userId: uid,
      type: 'weekly',
      id,
      text,
      order,
      createdAt: now,
      updatedAt: now,
      tags,
      notes,
      checklist,
      startTime,
      endTime,
      reminder,
      repeatMode: 'monthly',
      repeatStartDate: anchor,
      repeatEndDate,
      repeatDayOfMonth,
      ...buddyFields,
    });
    return {
      ok: true,
      ids: [id],
      tasks: [
        {
          id: task.id,
          text: task.text,
          order: task.order,
          completed: false,
          type: 'weekly',
          tags: task.tags || [],
          startTime: task.startTime,
          endTime: task.endTime,
          reminder: task.reminder,
          repeatMode: 'monthly',
          repeatStartDate: anchor,
          repeatEndDate,
          repeatDayOfMonth,
          ...buddyFields,
        },
      ],
    };
  }

  // Custom interval recurrence (the "Custom…" builder).
  if (body?.repeatRule) {
    const anchor = explicitDates.slice().sort()[0];
    if (!anchor)
      return { ok: false, error: 'custom repeat requires a date', status: 400 };
    const rule = normalizeRepeatRule(body.repeatRule, anchor);
    if (!rule) return { ok: false, error: 'invalid repeatRule', status: 400 };
    const repeatEndDate = normalizeRepeatEnd(body?.repeatEndDate) ?? undefined;
    const dow = dowFromYMD(anchor);
    const id = uuid();
    const order = await nextOrderForDay(uid, dow, anchor);
    const task = await TaskModel.create({
      userId: uid,
      type: 'weekly',
      id,
      text,
      order,
      createdAt: now,
      updatedAt: now,
      tags,
      notes,
      checklist,
      startTime,
      endTime,
      reminder,
      repeatMode: 'custom',
      repeatStartDate: anchor,
      repeatEndDate,
      repeatRule: rule,
      ...buddyFields,
    });
    return {
      ok: true,
      ids: [id],
      tasks: [
        {
          id: task.id,
          text: task.text,
          order: task.order,
          completed: false,
          type: 'weekly',
          tags: task.tags || [],
          startTime: task.startTime,
          endTime: task.endTime,
          reminder: task.reminder,
          repeatMode: 'custom',
          repeatStartDate: anchor,
          repeatEndDate,
          repeatRule: rule,
          ...buddyFields,
        },
      ],
    };
  }
  if (repeat === 'weekly') {
    if (days.some((d) => d === -1))
      return {
        ok: false,
        error: 'Repeating tasks target weekdays 0..6',
        status: 400,
      };
    // Multi-day repeats (daily / weekdays) become a linked group so later
    // edits/deletes can apply to the whole series.
    const isMulti = days.length > 1;
    const repeatGroupId = isMulti ? uuid() : undefined;
    const isWeekdaysSet =
      days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d));
    const isWeekendSet =
      days.length === 2 && [0, 6].every((d) => days.includes(d));
    const repeatMode: 'daily' | 'weekdays' | 'weekend' | 'weekly' =
      days.length === 7
        ? 'daily'
        : isWeekdaysSet
          ? 'weekdays'
          : isWeekendSet
            ? 'weekend'
            : 'weekly';
    const explicitStartDate =
      explicitDates.length > 0 ? explicitDates.slice().sort()[0] : undefined;
    const repeatEndDate = normalizeRepeatEnd(body?.repeatEndDate) ?? undefined;
    for (const d of days) {
      const dayOfWeek: Weekday = d as Weekday;
      const repeatStartDate = explicitStartDate ?? weekDates[dayOfWeek];
      const id = uuid();
      const order = await nextOrderForDay(uid, dayOfWeek, weekDates[dayOfWeek]);
      const task = await TaskModel.create({
        userId: uid,
        type: 'weekly',
        id,
        text,
        order,
        dayOfWeek,
        createdAt: now,
        updatedAt: now,
        tags,
        notes,
        checklist,
        startTime,
        endTime,
        reminder,
        repeatMode,
        repeatGroupId,
        repeatStartDate,
        repeatEndDate,
        ...buddyFields,
      });
      createdIds.push(id);
      createdTasks.push({
        id: task.id,
        text: task.text,
        order: task.order,
        completed: false,
        type: 'weekly',
        tags: task.tags || [],
        dayOfWeek: dayOfWeek,
        startTime: task.startTime,
        endTime: task.endTime,
        reminder: task.reminder,
        repeatMode,
        repeatGroupId,
        repeatStartDate,
        repeatEndDate,
        ...buddyFields,
      });
    }
    return { ok: true, ids: createdIds, tasks: createdTasks, repeatGroupId };
  }
  // Explicit-date creation (for date-slider UI). Always creates 'regular' tasks on those dates.
  for (const date of explicitDates) {
    const weekday = dowFromYMD(date);
    const id = uuid();
    const order = await nextOrderForDay(uid, weekday, date);
    const task = await TaskModel.create({
      userId: uid,
      type: 'regular',
      id,
      text,
      order,
      date,
      completed: false,
      createdAt: now,
      updatedAt: now,
      tags,
      notes,
      checklist,
      startTime,
      endTime,
      reminder,
      ...buddyFields,
    });
    createdIds.push(id);
    createdTasks.push({
      id: task.id,
      text: task.text,
      order: task.order,
      completed: false,
      type: 'regular',
      tags: task.tags || [],
      notes: task.notes ?? '',
      checklist: task.checklist ?? [],
      date: task.date,
      startTime: task.startTime,
      endTime: task.endTime,
      reminder: task.reminder,
      ...buddyFields,
    });
  }
  for (const d of days) {
    const id = uuid();
    createdIds.push(id);
    if (d === -1) {
      const order = await nextOrderBacklog(uid, weekStart);
      const task = await TaskModel.create({
        userId: uid,
        type: 'backlog',
        id,
        text,
        order,
        weekStart,
        completed: false,
        createdAt: now,
        updatedAt: now,
        tags,
        notes,
        checklist,
        startTime,
        endTime,
        reminder,
        ...buddyFields,
      });
      createdTasks.push({
        id: task.id,
        text: task.text,
        order: task.order,
        completed: false,
        type: 'backlog',
        tags: task.tags || [],
        notes: task.notes ?? '',
        checklist: task.checklist ?? [],
        startTime: task.startTime,
        endTime: task.endTime,
        reminder: task.reminder,
        ...buddyFields,
      });
    } else {
      const weekday = d as Weekday;
      const date = weekDates[weekday];
      const order = await nextOrderForDay(uid, weekday, date);
      const task = await TaskModel.create({
        userId: uid,
        type: 'regular',
        id,
        text,
        order,
        date,
        completed: false,
        createdAt: now,
        updatedAt: now,
        tags,
        notes,
        checklist,
        startTime,
        endTime,
        reminder,
        ...buddyFields,
      });
      createdTasks.push({
        id: task.id,
        text: task.text,
        order: task.order,
        completed: false,
        type: 'regular',
        tags: task.tags || [],
        notes: task.notes ?? '',
        checklist: task.checklist ?? [],
        date: task.date,
        startTime: task.startTime,
        endTime: task.endTime,
        reminder: task.reminder,
        ...buddyFields,
      });
    }
  }
  return { ok: true, ids: createdIds, tasks: createdTasks };
}

/**
 * Change a task's repeat schedule in place (preserving the primary doc's
 * personal fields). Shared by PUT /api/tasks (setRepeat) and the buddy
 * repeat-change approval, which applies the same change to both copies.
 */
export async function applySetRepeat(
  uid: string,
  taskId: string,
  setRepeat: any,
  date: string | undefined,
  tz: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const mode:
    | 'none'
    | 'daily'
    | 'weekdays'
    | 'weekend'
    | 'weekly'
    | 'monthly'
    | 'custom' =
    setRepeat.mode ?? (setRepeat.weekly ? 'weekly' : 'none');
  const doc = await TaskModel.findOne({
    userId: uid,
    id: taskId,
  }).lean<TaskDoc>();
  if (!doc) return { ok: false, error: 'Task not found', status: 404 };

  // Drop any sibling tasks created by a previous daily/weekdays choice.
  if (doc.repeatGroupId) {
    await TaskModel.deleteMany({
      userId: uid,
      repeatGroupId: doc.repeatGroupId,
      id: { $ne: taskId },
    });
  }

  const repeatEndDate = normalizeRepeatEnd(setRepeat.endDate);

  if (mode === 'none') {
    const targetDate =
      date ||
      new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
    await TaskModel.updateOne(
      { userId: uid, id: taskId },
      {
        $set: { type: 'regular', date: targetDate, completed: false, repeatMode: 'none' },
        $unset: {
          dayOfWeek: 1,
          weekStart: 1,
          completedDates: 1,
          repeatGroupId: 1,
          repeatStartDate: 1,
          repeatEndDate: 1,
          repeatDayOfMonth: 1,
          repeatRule: 1,
        },
      },
    );
  } else if (mode === 'monthly') {
    const repeatStartDate =
      typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? date
        : doc.date || getZonedToday(tz);
    const set: Record<string, unknown> = {
      type: 'weekly',
      repeatMode: 'monthly',
      repeatStartDate,
      repeatDayOfMonth: domFromYMD(repeatStartDate),
    };
    const unset: Record<string, unknown> = {
      date: 1,
      weekStart: 1,
      completed: 1,
      dayOfWeek: 1,
      repeatGroupId: 1,
      repeatRule: 1,
    };
    if (repeatEndDate) set.repeatEndDate = repeatEndDate;
    else unset.repeatEndDate = 1;
    await TaskModel.updateOne(
      { userId: uid, id: taskId },
      { $set: set, $unset: unset },
    );
  } else if (mode === 'custom') {
    const repeatStartDate =
      typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? date
        : doc.date || getZonedToday(tz);
    const rule = normalizeRepeatRule(setRepeat.rule, repeatStartDate);
    if (!rule) return { ok: false, error: 'invalid repeatRule', status: 400 };
    const set: Record<string, unknown> = {
      type: 'weekly',
      repeatMode: 'custom',
      repeatStartDate,
      repeatRule: rule,
    };
    const unset: Record<string, unknown> = {
      date: 1,
      weekStart: 1,
      completed: 1,
      dayOfWeek: 1,
      repeatGroupId: 1,
      repeatDayOfMonth: 1,
    };
    if (repeatEndDate) set.repeatEndDate = repeatEndDate;
    else unset.repeatEndDate = 1;
    await TaskModel.updateOne(
      { userId: uid, id: taskId },
      { $set: set, $unset: unset },
    );
  } else {
    const requested = Number(setRepeat.dayOfWeek);
    const dow = isWeekday(requested) ? requested : new Date().getDay();
    const isMulti =
      mode === 'daily' || mode === 'weekdays' || mode === 'weekend';
    // Weekdays must land on Mon–Fri; weekend on Sat/Sun.
    const weeklyDay = (
      mode === 'weekdays' && (dow === 0 || dow === 6)
        ? 1
        : mode === 'weekend' && dow !== 0 && dow !== 6
          ? 6
          : dow
    ) as Weekday;
    const groupId = isMulti ? doc.repeatGroupId || uuid() : undefined;
    const repeatStartDate =
      typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? date
        : doc.date || getZonedToday(tz);

    const set: Record<string, unknown> = {
      type: 'weekly',
      dayOfWeek: weeklyDay,
      repeatMode: mode,
      repeatStartDate,
    };
    const unset: Record<string, unknown> = {
      date: 1,
      weekStart: 1,
      completed: 1,
      repeatDayOfMonth: 1,
      repeatRule: 1,
    };
    if (repeatEndDate) set.repeatEndDate = repeatEndDate;
    else unset.repeatEndDate = 1;
    if (isMulti) set.repeatGroupId = groupId;
    else unset.repeatGroupId = 1;
    await TaskModel.updateOne(
      { userId: uid, id: taskId },
      { $set: set, $unset: unset },
    );

    if (isMulti) {
      const allDays =
        mode === 'daily'
          ? [0, 1, 2, 3, 4, 5, 6]
          : mode === 'weekend'
            ? [0, 6]
            : [1, 2, 3, 4, 5];
      const { weekDates } = getRollingWeekDatesZoned(tz);
      const now = new Date();
      for (const d of allDays.filter((day) => day !== weeklyDay)) {
        const order = await nextOrderForDay(uid, d as Weekday, weekDates[d]);
        await TaskModel.create({
          userId: uid,
          type: 'weekly',
          id: uuid(),
          text: doc.text,
          order,
          dayOfWeek: d as Weekday,
          createdAt: now,
          updatedAt: now,
          tags: doc.tags ?? [],
          // Notes & checklist are intentionally NOT copied to sibling repeats —
          // they belong to the original task instance, not the whole series.
          repeatMode: mode,
          repeatGroupId: groupId,
          repeatStartDate,
          repeatEndDate: repeatEndDate ?? undefined,
          startTime: doc.startTime,
          endTime: doc.endTime,
          reminder: doc.reminder,
          ...(doc.bondId ? { bondId: doc.bondId, buddyUserId: doc.buddyUserId } : {}),
        });
      }
    }
  }
  await syncGamification(uid, tz);
  await notifyTaskChanged(uid);
  return { ok: true };
}

export async function PUT(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();
  await connectMongo();
  const body = await req.json();
  const tz = body.timezone || 'UTC';
  if (body && Object.prototype.hasOwnProperty.call(body, 'day'))
    return handleBoardPut(uid, body, tz);
  if (
    body &&
    Object.prototype.hasOwnProperty.call(body, 'dateKey') &&
    Array.isArray(body.tasks)
  )
    return handleBoardPutByDate(uid, body, tz);
  // Move a single occurrence of a repeating task to a different day. The series
  // is left intact: the source date is suppressed (that one occurrence hidden)
  // and a standalone one-off regular task is materialized on the target date.
  if (body.moveInstance) {
    const { taskId, newId, fromDate, toDate, order } = body.moveInstance;
    const ymd = /^\d{4}-\d{2}-\d{2}$/;
    if (!taskId || !newId || !ymd.test(fromDate) || !ymd.test(toDate))
      return NextResponse.json(
        { error: 'Invalid moveInstance payload' },
        { status: 400 },
      );
    const doc = await TaskModel.findOne({
      userId: uid,
      id: taskId,
    }).lean<TaskDoc>();
    if (!doc)
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    const now = new Date();
    // Hide the occurrence on its original date without touching the rule.
    await TaskModel.updateOne(
      { userId: uid, id: taskId },
      { $addToSet: { suppressedDates: fromDate } },
    );
    // Materialize the moved occurrence as a standalone one-off.
    const weekday = dowFromYMD(toDate);
    const newOrder =
      typeof order === 'number'
        ? order
        : await nextOrderForDay(uid, weekday, toDate);
    // Carry the focus/break logged on the original occurrence's day onto the
    // new one-off, re-stamped to the destination date (sessions are date-keyed).
    const movedSession = doc.frogodoroSessions?.find((s) => s.date === fromDate);
    await TaskModel.updateOne(
      { userId: uid, type: 'regular', id: newId },
      {
        $set: {
          text: doc.text,
          date: toDate,
          order: newOrder,
          tags: doc.tags ?? [],
          notes: doc.notes ?? '',
          checklist: doc.checklist ?? [],
          startTime: doc.startTime,
          endTime: doc.endTime,
          reminder: doc.reminder,
          ...(movedSession
            ? {
                frogodoroSessions: [
                  {
                    date: toDate,
                    focusTime: movedSession.focusTime ?? 0,
                    breakTime: movedSession.breakTime ?? 0,
                  },
                ],
              }
            : {}),
          updatedAt: now,
        },
        $setOnInsert: {
          userId: uid,
          type: 'regular',
          id: newId,
          createdAt: now,
          completed: false,
        },
      },
      { upsert: true },
    );
    await syncGamification(uid, tz);
    await notifyTaskChanged(uid);
    return NextResponse.json({ ok: true, id: newId });
  }

  // New: Handle "move" operation (atomic move between lists)
  if (body.move) {
    const { type, date: moveDate } = body.move;
    const { taskId } = body; // Extract taskId here

    if (!taskId)
      return NextResponse.json(
        { error: 'taskId is required' },
        { status: 400 },
      );
    if (!type || (type === 'regular' && !moveDate))
      return NextResponse.json(
        { error: 'Invalid move payload' },
        { status: 400 },
      );

    const doc = await TaskModel.findOne({
      userId: uid,
      id: taskId,
    }).lean<TaskDoc>();
    if (!doc)
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    const now = new Date();
    const { weekStart, weekDates } = getRollingWeekDatesZoned(tz);

    // MOVING TO BACKLOG
    if (type === 'backlog') {
      const newOrder = await nextOrderBacklog(uid, weekStart);
      await TaskModel.updateOne(
        { userId: uid, id: taskId },
        {
          $set: {
            type: 'backlog',
            weekStart,
            order: newOrder,
            updatedAt: now,
            completed: false, // Reset completion on move to backlog? Usually safer.
          },
          $unset: {
            date: 1,
            dayOfWeek: 1,
            completedDates: 1,
            suppressedDates: 1,
          },
        },
      );
      await syncGamification(uid, tz);
      await notifyTaskChanged(uid);
      await bumpQuestMetric({ userId: uid, metric: 'task_saved_later', timezone: tz });
      return NextResponse.json({ ok: true });
    }

    // MOVING TO REGULAR (Today/Date)
    if (type === 'regular') {
      const weekday = dowFromYMD(moveDate); // 0..6
      const newOrder = await nextOrderForDay(uid, weekday, moveDate);

      // Pipeline update so we can re-stamp the date-keyed frogodoro sessions
      // onto the new day in the same write — a regular task lives on one date,
      // so all its sessions belong to moveDate after the move.
      await TaskModel.updateOne(
        { userId: uid, id: taskId },
        [
          {
            $set: {
              type: 'regular',
              date: moveDate,
              order: newOrder,
              updatedAt: now,
              frogodoroSessions: {
                $map: {
                  input: { $ifNull: ['$frogodoroSessions', []] },
                  as: 's',
                  in: { $mergeObjects: ['$$s', { date: moveDate }] },
                },
              },
            },
          },
          { $unset: ['weekStart', 'dayOfWeek', 'suppressedDates'] },
        ],
        { updatePipeline: true } as never,
      );
      await syncGamification(uid, tz);
      await notifyTaskChanged(uid);
      return NextResponse.json({ ok: true });
    }
  }

  const { date, taskId, completed, tags, toggleType, order, text } = body ?? {};

  // Apply a Mongo update to just this task, or to its whole repeat group when
  // the client asked for scope:'all' (recurring-task "this / all repeats").
  const scopeApply = async (update: Record<string, unknown>) => {
    if (body.scope === 'all' && taskId) {
      const d = await TaskModel.findOne(
        { userId: uid, id: taskId },
        { repeatGroupId: 1 },
      ).lean<{ repeatGroupId?: string }>();
      if (d?.repeatGroupId) {
        await TaskModel.updateMany(
          { userId: uid, repeatGroupId: d.repeatGroupId },
          update,
        );
        return;
      }
    }
    await TaskModel.updateOne({ userId: uid, id: taskId }, update);
  };

  // Handle schedule update (startTime, endTime, reminder) — before general
  // validation. Empty values clear the field so the reminder can be removed.
  if (body.schedule !== undefined && taskId) {
    const set: Record<string, unknown> = {};
    const unset: Record<string, unknown> = {};
    const apply = (key: string, value: unknown) => {
      if (value === undefined) return;
      if (value) set[key] = value;
      else unset[key] = 1;
    };
    apply('startTime', body.schedule.startTime);
    apply('endTime', body.schedule.endTime);
    apply('reminder', body.schedule.reminder);

    const update: Record<string, unknown> = {};
    if (Object.keys(set).length) update.$set = set;
    if (Object.keys(unset).length) update.$unset = unset;
    if (Object.keys(update).length) await scopeApply(update);
    await syncGamification(uid, tz);
    await notifyTaskChanged(uid);
    return NextResponse.json({ ok: true });
  }

  // Handle detail update (notes + checklist) — the Trello-like task card
  if (body.details !== undefined && taskId) {
    const update: Record<string, unknown> = {};
    if (typeof body.details.notes === 'string')
      update.notes = body.details.notes;
    if (Array.isArray(body.details.checklist)) {
      update.checklist = body.details.checklist
        .filter((it: unknown): it is Record<string, unknown> => !!it && typeof it === 'object')
        .map((it: Record<string, unknown>) => ({
          id: String(it.id ?? ''),
          text: String(it.text ?? ''),
          done: Boolean(it.done),
        }));
    }
    await TaskModel.updateOne({ userId: uid, id: taskId }, { $set: update });
    await notifyTaskChanged(uid);
    return NextResponse.json({ ok: true });
  }

  // Handle explicit repeat change from the task detail card, using the same
  // modes as QuickAdd. daily/weekdays expand into linked sibling weekly tasks
  // (a repeat group) so a task can appear on multiple days.
  if (body.setRepeat !== undefined && taskId) {
    // A shared buddy task's schedule can only change via mutual approval.
    const owner = await TaskModel.findOne({ userId: uid, id: taskId })
      .select('bondId')
      .lean<{ bondId?: string }>();
    if (owner?.bondId)
      return NextResponse.json(
        { error: 'buddy_repeat_needs_approval', bondId: owner.bondId },
        { status: 409 },
      );
    const res = await applySetRepeat(uid, taskId, body.setRepeat, date, tz);
    if (!res.ok)
      return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json({ ok: true });
  }

  // Relaxed validation to allow text updates
  if (
    (!date &&
      typeof tags === 'undefined' &&
      !text &&
      typeof completed === 'undefined' &&
      !toggleType &&
      typeof order === 'undefined') ||
    !taskId
  )
    return NextResponse.json(
      { error: 'taskId and update fields are required' },
      { status: 400 },
    );
  const doc = await TaskModel.findOne({
    userId: uid,
    id: taskId,
  }).lean<TaskDoc>();
  if (!doc)
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  if (toggleType) {
    if (doc.type === 'weekly') {
      const isCompletedToday = (doc.completedDates ?? []).includes(date);
      await TaskModel.updateOne(
        { userId: uid, id: taskId },
        {
          $set: { type: 'regular', date, completed: isCompletedToday },
          $unset: {
            dayOfWeek: 1,
            suppressedDates: 1,
            completedDates: 1,
            repeatStartDate: 1,
          },
        },
      );
    } else {
      const dow = dowFromYMD(date);
      await TaskModel.updateOne(
        { userId: uid, id: taskId },
        {
          $set: {
            type: 'weekly',
            dayOfWeek: dow,
            completedDates: doc.completed ? [date] : [],
            repeatStartDate: date,
          },
          $unset: { date: 1, weekStart: 1, completed: 1 },
        },
      );
    }
    await syncGamification(uid, tz);
    await notifyTaskChanged(uid);
    return NextResponse.json({ ok: true });
  }
  if (Array.isArray(tags)) {
    await scopeApply({ $set: { tags } });
    await syncGamification(uid, tz);
    await notifyTaskChanged(uid);
    return NextResponse.json({ ok: true });
  }
  // New: Handle text update
  if (typeof body.text === 'string' && body.text.trim()) {
    await scopeApply({ $set: { text: body.text } });
    await syncGamification(uid, tz);
    await notifyTaskChanged(uid);
    return NextResponse.json({ ok: true });
  }

  if (typeof completed !== 'boolean')
    return NextResponse.json(
      { error: 'completed must be boolean' },
      { status: 400 },
    );
  const alreadyCompletedForDate =
    (doc.completedDates ?? []).includes(date) ||
    (!!doc.completed && doc.type === 'regular');
  const update =
    completed === true
      ? { $addToSet: { completedDates: date } }
      : { $pull: { completedDates: date } };
  if (doc.type === 'regular')
    (update as any).$set = { ...(update as any).$set, completed };

  if (typeof order === 'number')
    (update as any).$set = { ...((update as any).$set || {}), order };
  await TaskModel.updateOne({ userId: uid, id: taskId }, update);
  let flyStatus: FlyStatus | undefined;
  let hungerStatus: HungerStatus | undefined;
  let dailyTasksCount: number | undefined;
  let awarded = false;
  const isTodayCompletion = date === getZonedToday(tz);
  let freshWeekly: TaskDoc | null = null;
  let streakNow = 0;
  if (doc.type === 'weekly' && isTodayCompletion) {
    freshWeekly = await TaskModel.findOne({
      userId: uid,
      id: taskId,
    }).lean<TaskDoc>();
    if (freshWeekly) {
      const streakMap = await streakMapForWeeklyDocs(
        uid,
        [freshWeekly],
        date,
        tz,
      );
      streakNow = streakMap.get(freshWeekly.id) ?? 0;
    }
  }
  if (completed && !alreadyCompletedForDate) {
    const res = await awardFlyForTask(
      uid,
      taskId,
      tz,
      isTodayCompletion,
      taskFlyValue(doc, streakNow),
    );
    flyStatus = res.flyStatus;
    hungerStatus = res.hungerStatus;
    dailyTasksCount = res.dailyTasksCount;
    awarded = res.awarded;
  } else if (!completed) {
    ({ flyStatus, hungerStatus, dailyTasksCount } = await unawardFlyForTask(
      uid,
      taskId,
      tz,
      isTodayCompletion,
    ));
  } else {
    ({ flyStatus, hungerStatus, dailyTasksCount } = await currentFlyStatus(
      uid,
      tz,
    ));
  }
  if (doc.bondId) {
    await handleBuddyCompletion({
      bondId: doc.bondId,
      userId: uid,
      date,
      completed,
      ownFlyValue: taskFlyValue(doc),
      tz,
    });
  }
  if (freshWeekly) {
    if (completed && !alreadyCompletedForDate && streakNow >= 2) {
      await bumpQuestMetric({
        userId: uid,
        metric: taskStreakMetric(streakNow),
        timezone: tz,
        tagIds: freshWeekly.tags ?? [],
      });
    } else if (!completed && streakNow >= 1) {
      await bumpQuestMetric({
        userId: uid,
        metric: taskStreakMetric(streakNow + 1),
        amount: -1,
        timezone: tz,
        tagIds: freshWeekly.tags ?? [],
      });
    }
  }
  void syncGamification(uid, tz);
  await notifyTaskChanged(uid, {
    eventKind: completed ? 'task-completed' : 'task-uncompleted',
    taskId,
    completed,
    date,
  });
  return NextResponse.json({
    ok: true,
    awarded,
    flyStatus,
    hungerStatus,
    dailyTasksCount,
  });
}

export async function DELETE(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();
  await connectMongo();
  const body = await req.json();
  const tz = body.timezone || 'UTC';

  // Delete a whole repeat series (the linked group, or a lone weekly task):
  // stop it going forward, but preserve every PAST occurrence as a standalone
  // one-off task — completed and missed alike — so history isn't lost and the
  // past tasks no longer read as repeating.
  if (body.deleteSeries && body.taskId) {
    const doc = await TaskModel.findOne(
      { userId: uid, id: body.taskId },
      { repeatGroupId: 1, type: 1, bondId: 1 },
    ).lean<TaskDoc>();
    const today = getZonedToday(tz);
    const cutoff = addDaysYMD(today, -1);
    const seriesFilter = doc?.repeatGroupId
      ? { userId: uid, repeatGroupId: doc.repeatGroupId }
      : { userId: uid, id: body.taskId };
    const seriesDocs = await TaskModel.find(seriesFilter).lean<TaskDoc[]>();
    const now = new Date();
    const toInsert: Record<string, unknown>[] = [];
    for (const s of seriesDocs) {
      if (s.type !== 'weekly') continue;
      const start = repeatStartForDoc(s, tz);
      if (!start) continue;
      const suppressed = new Set(s.suppressedDates ?? []);
      const completed = new Set(s.completedDates ?? []);
      let d = start;
      for (let guard = 0; guard < 1000 && d <= cutoff; guard++, d = addDaysYMD(d, 1)) {
        if (suppressed.has(d)) continue;
        if (!siblingOccursOn(s, d)) continue;
        const session = s.frogodoroSessions?.find((x) => x.date === d);
        const isOriginal = d === start;
        toInsert.push({
          userId: uid,
          id: uuid(),
          type: 'regular',
          text: s.text,
          date: d,
          order: s.orderOverrides?.[d] ?? s.order ?? 0,
          completed: completed.has(d),
          completedDates: completed.has(d) ? [d] : [],
          tags: s.tags ?? [],
          notes: isOriginal ? s.notes ?? '' : '',
          checklist: isOriginal ? s.checklist ?? [] : [],
          startTime: s.startTime,
          endTime: s.endTime,
          reminder: s.reminder,
          frogodoroSettings: isOriginal ? s.frogodoroSettings : undefined,
          frogodoroSessions: session ? [session] : [],
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    if (toInsert.length) await TaskModel.insertMany(toInsert);
    const seriesIds = seriesDocs.map((s) => s.id);
    await TaskModel.deleteMany({
      userId: uid,
      type: 'weekly',
      id: { $in: seriesIds },
    });
    await TaskModel.deleteMany({
      userId: uid,
      type: 'regular',
      id: { $in: seriesIds },
      date: { $gte: today },
    });
    if (doc?.bondId) await severBond(doc.bondId, uid);
    await syncGamification(uid, tz);
    await notifyTaskChanged(uid);
    return NextResponse.json({ ok: true });
  }

  if (body && Object.prototype.hasOwnProperty.call(body, 'day'))
    return handleBoardDelete(uid, body, tz);
  if (body && Object.prototype.hasOwnProperty.call(body, 'dateKey')) {
    const { dateKey, taskId } = body;
    if (!taskId)
      return NextResponse.json(
        { error: 'taskId is required' },
        { status: 400 },
      );
    const doc = await TaskModel.findOne(
      { userId: uid, id: taskId },
      { type: 1 },
    )
      .lean<TaskDoc>()
      .exec();
    if (doc?.type === 'regular') {
      await TaskModel.deleteOne({ userId: uid, type: 'regular', id: taskId });
    } else if (doc?.type === 'weekly') {
      await TaskModel.updateOne(
        { userId: uid, type: doc.type, id: taskId },
        { $addToSet: { suppressedDates: dateKey } },
      );
    }
    await syncGamification(uid, tz);
    await notifyTaskChanged(uid);
    return NextResponse.json({ ok: true });
  }
  const { date, taskId } = body ?? {};
  if (!date || !taskId)
    return NextResponse.json(
      { error: 'date and taskId are required' },
      { status: 400 },
    );
  const doc = await TaskModel.findOne({
    userId: uid,
    id: taskId,
  }).lean<TaskDoc>();
  if (!doc)
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  if (doc.type === 'weekly') {
    await TaskModel.updateOne(
      { userId: uid, id: taskId },
      { $addToSet: { suppressedDates: date } },
    );
    await syncGamification(uid, tz);
    await notifyTaskChanged(uid);
    return NextResponse.json({ ok: true });
  }
  if (doc.type === 'regular') {
    await TaskModel.deleteOne({ userId: uid, id: taskId, date });
    await syncGamification(uid, tz);
    await notifyTaskChanged(uid);
    return NextResponse.json({ ok: true });
  }
  await syncGamification(uid, tz);
  await notifyTaskChanged(uid);
  return NextResponse.json({ ok: true });
}

async function handleDailyGet(req: NextRequest, userId: string, tz: string) {
  const url = new URL(req.url);
  const dateParam = url.searchParams.get('date');
  const todayLocal = getZonedToday(tz);
  const date = dateParam ?? todayLocal;
  const dow = dowFromYMD(date);
  const tasks: TaskDoc[] = await TaskModel.find({
    userId,
    deletedAt: { $exists: false },
    $or: [
      { type: 'weekly', dayOfWeek: dow },
      { type: 'weekly', repeatMode: 'monthly' },
      { type: 'weekly', repeatRule: { $exists: true } },
      { type: 'regular', date },
    ],
  })
    .sort({ order: 1 })
    .lean<TaskDoc[]>()
    .exec();
  const filtered = tasks.filter(
    (t: TaskDoc) => {
      const repeatStart = repeatStartForDoc(t, tz);
      return (
        !(t.suppressedDates ?? []).includes(date) &&
        !(repeatStart && date < repeatStart) &&
        !isAfterRepeatEnd(t, date) &&
        !monthlyExcludesDate(t, date) &&
        !(t.repeatRule && !customOccursOn(t, date))
      );
    },
  );
  const weeklyIdsForUI = new Set(
    filtered
      .filter((t: TaskDoc) => t.type === 'weekly')
      .map((t: TaskDoc) => t.id),
  );
  const streakMap = await streakMapForWeeklyDocs(
    userId,
    filtered.filter((t) => t.type === 'weekly'),
    todayLocal,
    tz,
  );
  const output = filtered
    .map((t: TaskDoc) => ({
      id: t.id,
      text: t.text,
      order: t.orderOverrides?.[date] ?? t.order ?? 0,
      completed:
        (t.completedDates ?? []).includes(date) ||
        (!!t.completed && t.type === 'regular'),
      type: t.type,
      origin: t.type as Origin,
      tags: t.tags ?? [],
      notes: t.notes ?? '',
      checklist: t.checklist ?? [],
      repeatMode: t.repeatMode,
      repeatGroupId: t.repeatGroupId,
      repeatStartDate: repeatStartForDoc(t, tz),
      repeatEndDate: t.repeatEndDate,
      repeatDayOfMonth: t.repeatDayOfMonth,
      repeatRule: t.repeatRule,
      dayOfWeek: t.dayOfWeek,
      completedDates: t.completedDates ?? [],
      streak: t.type === 'weekly' ? streakMap.get(t.id) ?? 0 : 0,
      frogodoroSettings: t.frogodoroSettings,
      frogodoroSession: t.frogodoroSessions?.find((s) => s.date === date) ?? null,
      calendarEventId: t.calendarEventId,
      startTime: t.startTime,
      endTime: t.endTime,
      reminder: t.reminder,
    }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const { flyStatus, hungerStatus, dailyTasksCount } = await currentFlyStatus(
    userId,
    tz,
  );
  return NextResponse.json({
    date,
    tasks: output,
    weeklyIds: Array.from(weeklyIdsForUI),
    flyStatus,
    hungerStatus,
    dailyTasksCount,
  });
}

async function handleBoardGet(req: NextRequest, uid: string, tz: string) {
  const { weekStart, weekDates } = getRollingWeekDatesZoned(tz);
  const dayParam = req.nextUrl.searchParams.get('day');
  if (dayParam !== null) {
    const dayNum = Number(dayParam);
    if (dayNum === -1) {
      const later: TaskDoc[] = await TaskModel.find({
        userId: uid,
        type: 'backlog',
        weekStart,
      })
        .sort({ order: 1 })
        .lean<TaskDoc[]>()
        .exec();
      const out = later
        .map((t: TaskDoc) => ({
          id: t.id,
          text: t.text,
          order: t.order,
          type: t.type,
          completed: !!t.completed,
          tags: t.tags ?? [],
          notes: t.notes ?? '',
          checklist: t.checklist ?? [],
          repeatMode: t.repeatMode,
          repeatGroupId: t.repeatGroupId,
          frogodoroSettings: t.frogodoroSettings,
          calendarEventId: t.calendarEventId,
          startTime: t.startTime,
          endTime: t.endTime,
          reminder: t.reminder,
        }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      return NextResponse.json(out);
    }
    if (!isWeekday(dayNum))
      return NextResponse.json(
        { error: 'day must be -1 or 0..6' },
        { status: 400 },
      );
    const docs: TaskDoc[] = await TaskModel.find({
      userId: uid,
      deletedAt: { $exists: false },
      $or: [
        { type: 'weekly', dayOfWeek: dayNum },
        { type: 'weekly', repeatMode: 'monthly' },
        { type: 'weekly', repeatRule: { $exists: true } },
        { type: 'regular', date: weekDates[dayNum] },
      ],
    })
      .sort({ order: 1 })
      .lean<TaskDoc[]>()
      .exec();
    const out = docs
      .filter(
        (t: TaskDoc) => {
          const repeatStart = repeatStartForDoc(t, tz);
          return (
            !(t.suppressedDates ?? []).includes(weekDates[dayNum]) &&
            !(repeatStart && weekDates[dayNum] < repeatStart) &&
            !isAfterRepeatEnd(t, weekDates[dayNum]) &&
            !monthlyExcludesDate(t, weekDates[dayNum]) &&
            !(t.repeatRule && !customOccursOn(t, weekDates[dayNum]))
          );
        },
      )
      .map((t: TaskDoc) => ({
        id: t.id,
        text: t.text,
        order: t.orderOverrides?.[weekDates[dayNum]] ?? t.order,
        type: t.type,
        completed:
          (t.completedDates ?? []).includes(weekDates[dayNum]) ||
          (!!t.completed && t.type === 'regular'),
        tags: t.tags ?? [],
        frogodoroSession: t.frogodoroSessions?.find((s) => s.date === weekDates[dayNum]) ?? null,
        calendarEventId: t.calendarEventId,
        startTime: t.startTime,
        endTime: t.endTime,
        reminder: t.reminder,
        repeatStartDate: repeatStartForDoc(t, tz),
        repeatEndDate: t.repeatEndDate,
        repeatMode: t.repeatMode,
        repeatDayOfMonth: t.repeatDayOfMonth,
        repeatRule: t.repeatRule,
      }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return NextResponse.json(out);
  }
  const week: any[][] = Array.from({ length: 8 }, () => []);

  const dateToDay = new Map(
    weekDates.map((date, index) => [date, index as Weekday]),
  );
  const boardDocs: TaskDoc[] = await TaskModel.find({
    userId: uid,
    $or: [
      {
        type: 'weekly',
        deletedAt: { $exists: false },
        dayOfWeek: { $in: [0, 1, 2, 3, 4, 5, 6] },
      },
      {
        type: 'weekly',
        deletedAt: { $exists: false },
        repeatMode: 'monthly',
      },
      {
        type: 'weekly',
        deletedAt: { $exists: false },
        repeatRule: { $exists: true },
      },
      {
        type: 'regular',
        deletedAt: { $exists: false },
        date: { $in: weekDates },
      },
      {
        type: 'backlog',
        weekStart,
      },
    ],
  })
    .sort({ order: 1 })
    .lean<TaskDoc[]>()
    .exec();

  for (const doc of boardDocs) {
    if (doc.type === 'backlog') {
      week[7].push({
        id: doc.id,
        text: doc.text,
        order: doc.order,
        type: doc.type,
        completed: !!doc.completed,
        tags: doc.tags ?? [],
        notes: doc.notes ?? '',
        checklist: doc.checklist ?? [],
        frogodoroSettings: doc.frogodoroSettings,
        calendarEventId: doc.calendarEventId,
        startTime: doc.startTime,
        endTime: doc.endTime,
        reminder: doc.reminder,
      });
      continue;
    }

    // Custom rules can land on several days within the week — push each match.
    if (doc.repeatRule) {
      const repeatStart = repeatStartForDoc(doc, tz);
      for (let di = 0; di < weekDates.length; di++) {
        const date = weekDates[di];
        if (!customOccursOn(doc, date)) continue;
        if (repeatStart && date < repeatStart) continue;
        if (isAfterRepeatEnd(doc, date)) continue;
        if ((doc.suppressedDates ?? []).includes(date)) continue;
        week[di].push({
          id: doc.id,
          text: doc.text,
          order: doc.orderOverrides?.[date] ?? doc.order,
          type: doc.type,
          completed: (doc.completedDates ?? []).includes(date),
          tags: doc.tags ?? [],
          repeatStartDate: repeatStart,
          repeatEndDate: doc.repeatEndDate,
          repeatMode: doc.repeatMode,
          repeatRule: doc.repeatRule,
          frogodoroSession:
            doc.frogodoroSessions?.find((session) => session.date === date) ??
            null,
          calendarEventId: doc.calendarEventId,
          startTime: doc.startTime,
          endTime: doc.endTime,
          reminder: doc.reminder,
        });
      }
      continue;
    }

    const day =
      doc.repeatMode === 'monthly' && typeof doc.repeatDayOfMonth === 'number'
        ? (weekDates.findIndex((wd) => domFromYMD(wd) === doc.repeatDayOfMonth) as
            | Weekday
            | -1)
        : doc.type === 'weekly'
          ? doc.dayOfWeek
          : doc.date
            ? dateToDay.get(doc.date)
            : undefined;
    if (day === undefined || day === -1) continue;

    const date = weekDates[day];
    const repeatStart = repeatStartForDoc(doc, tz);
    if (repeatStart && date < repeatStart) continue;
    if (isAfterRepeatEnd(doc, date)) continue;
    if ((doc.suppressedDates ?? []).includes(date)) continue;

    week[day].push({
      id: doc.id,
      text: doc.text,
      order: doc.orderOverrides?.[date] ?? doc.order,
      type: doc.type,
      completed:
        (doc.completedDates ?? []).includes(date) ||
        (!!doc.completed && doc.type === 'regular'),
      tags: doc.tags ?? [],
      repeatStartDate: repeatStart,
      repeatEndDate: doc.repeatEndDate,
      repeatMode: doc.repeatMode,
      repeatDayOfMonth: doc.repeatDayOfMonth,
      frogodoroSession:
        doc.frogodoroSessions?.find((session) => session.date === date) ??
        null,
      calendarEventId: doc.calendarEventId,
      startTime: doc.startTime,
      endTime: doc.endTime,
      reminder: doc.reminder,
    });
  }

  week.forEach((items) =>
    items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  );

  return NextResponse.json(week);
}

function enumerateDates(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().split('T')[0]);
  }
  return out;
}

async function handleDateRangeGet(req: NextRequest, uid: string, tz: string) {
  const params = req.nextUrl.searchParams;
  const from = params.get('from');
  const to = params.get('to');
  if (!from || !to)
    return NextResponse.json(
      { error: 'from and to (YYYY-MM-DD) required' },
      { status: 400 },
    );

  const dates = enumerateDates(from, to);
  const dateSet = new Set(dates);
  const dowSet = new Set(dates.map((d) => dowFromYMD(d)));

  const { weekStart } = getRollingWeekDatesZoned(tz);

  const docs: TaskDoc[] = await TaskModel.find({
    userId: uid,
    $or: [
      {
        type: 'weekly',
        deletedAt: { $exists: false },
        dayOfWeek: { $in: Array.from(dowSet) },
      },
      {
        type: 'weekly',
        deletedAt: { $exists: false },
        repeatMode: 'monthly',
      },
      {
        type: 'weekly',
        deletedAt: { $exists: false },
        repeatRule: { $exists: true },
      },
      {
        type: 'regular',
        deletedAt: { $exists: false },
        date: { $in: dates },
      },
      { type: 'backlog', weekStart },
    ],
  })
    .sort({ order: 1 })
    .lean<TaskDoc[]>()
    .exec();

  const byDate: Record<string, any[]> = {};
  for (const d of dates) byDate[d] = [];
  const backlog: any[] = [];

  for (const doc of docs) {
    if (doc.type === 'backlog') {
      backlog.push({
        id: doc.id,
        text: doc.text,
        order: doc.order,
        type: doc.type,
        completed: !!doc.completed,
        tags: doc.tags ?? [],
        notes: doc.notes ?? '',
        checklist: doc.checklist ?? [],
        repeatMode: doc.repeatMode,
        repeatGroupId: doc.repeatGroupId,
        dayOfWeek: doc.dayOfWeek,
        frogodoroSettings: doc.frogodoroSettings,
        calendarEventId: doc.calendarEventId,
        startTime: doc.startTime,
        endTime: doc.endTime,
        reminder: doc.reminder,
      });
      continue;
    }
    if (doc.type === 'regular') {
      if (!doc.date || !dateSet.has(doc.date)) continue;
      if ((doc.suppressedDates ?? []).includes(doc.date)) continue;
      byDate[doc.date].push({
        id: doc.id,
        text: doc.text,
        order: doc.order,
        type: doc.type,
        completed:
          (doc.completedDates ?? []).includes(doc.date) || !!doc.completed,
        tags: doc.tags ?? [],
        notes: doc.notes ?? '',
        checklist: doc.checklist ?? [],
        repeatMode: doc.repeatMode,
        repeatGroupId: doc.repeatGroupId,
        dayOfWeek: doc.dayOfWeek,
        frogodoroSession:
          doc.frogodoroSessions?.find((s) => s.date === doc.date) ?? null,
        calendarEventId: doc.calendarEventId,
        startTime: doc.startTime,
        endTime: doc.endTime,
        reminder: doc.reminder,
      });
      continue;
    }
    // A weekly doc is expanded by exactly ONE rule, in priority order:
    // custom repeatRule → monthly → legacy dayOfWeek. These must be mutually
    // exclusive — a custom/monthly doc can still carry a stale `dayOfWeek`
    // field, and evaluating both would emit the same occurrence twice (the
    // planner duplicate bug). Mirrors siblingOccursOn's precedence.
    if (doc.repeatRule) {
      // custom interval recurrence — evaluate each date in the window
      const repeatStart = repeatStartForDoc(doc, tz);
      for (const d of dates) {
        if (!customOccursOn(doc, d)) continue;
        if (repeatStart && d < repeatStart) continue;
        if (isAfterRepeatEnd(doc, d)) continue;
        if ((doc.suppressedDates ?? []).includes(d)) continue;
        byDate[d].push({
          id: doc.id,
          text: doc.text,
          order: doc.orderOverrides?.[d] ?? doc.order,
          type: doc.type,
          completed: (doc.completedDates ?? []).includes(d),
          tags: doc.tags ?? [],
          notes: doc.notes ?? '',
          checklist: doc.checklist ?? [],
          repeatMode: doc.repeatMode,
          repeatStartDate: repeatStart,
          repeatEndDate: doc.repeatEndDate,
          repeatRule: doc.repeatRule,
          dayOfWeek: dowFromYMD(d),
          frogodoroSession:
            doc.frogodoroSessions?.find((s) => s.date === d) ?? null,
          calendarEventId: doc.calendarEventId,
          startTime: doc.startTime,
          endTime: doc.endTime,
          reminder: doc.reminder,
        });
      }
    } else if (doc.repeatMode === 'monthly' && typeof doc.repeatDayOfMonth === 'number') {
      // expand monthly repeat onto the matching day-of-month in each month
      const repeatStart = repeatStartForDoc(doc, tz);
      for (const d of dates) {
        if (domFromYMD(d) !== doc.repeatDayOfMonth) continue;
        if (repeatStart && d < repeatStart) continue;
        if (isAfterRepeatEnd(doc, d)) continue;
        if ((doc.suppressedDates ?? []).includes(d)) continue;
        byDate[d].push({
          id: doc.id,
          text: doc.text,
          order: doc.orderOverrides?.[d] ?? doc.order,
          type: doc.type,
          completed: (doc.completedDates ?? []).includes(d),
          tags: doc.tags ?? [],
          notes: doc.notes ?? '',
          checklist: doc.checklist ?? [],
          repeatMode: doc.repeatMode,
          repeatStartDate: repeatStart,
          repeatEndDate: doc.repeatEndDate,
          repeatDayOfMonth: doc.repeatDayOfMonth,
          dayOfWeek: dowFromYMD(d),
          frogodoroSession:
            doc.frogodoroSessions?.find((s) => s.date === d) ?? null,
          calendarEventId: doc.calendarEventId,
          startTime: doc.startTime,
          endTime: doc.endTime,
          reminder: doc.reminder,
        });
      }
    } else if (doc.type === 'weekly' && typeof doc.dayOfWeek === 'number') {
      // legacy weekly (dayOfWeek) — expand into every matching date in the window
      const repeatStart = repeatStartForDoc(doc, tz);
      for (const d of dates) {
        if (dowFromYMD(d) !== doc.dayOfWeek) continue;
        if (repeatStart && d < repeatStart) continue;
        if (isAfterRepeatEnd(doc, d)) continue;
        if ((doc.suppressedDates ?? []).includes(d)) continue;
        byDate[d].push({
          id: doc.id,
          text: doc.text,
          order: doc.orderOverrides?.[d] ?? doc.order,
          type: doc.type,
          completed: (doc.completedDates ?? []).includes(d),
          tags: doc.tags ?? [],
          notes: doc.notes ?? '',
          checklist: doc.checklist ?? [],
          repeatMode: doc.repeatMode,
          repeatGroupId: doc.repeatGroupId,
          repeatStartDate: repeatStart,
          repeatEndDate: doc.repeatEndDate,
          dayOfWeek: doc.dayOfWeek,
          frogodoroSession:
            doc.frogodoroSessions?.find((s) => s.date === d) ?? null,
          calendarEventId: doc.calendarEventId,
          startTime: doc.startTime,
          endTime: doc.endTime,
          reminder: doc.reminder,
        });
      }
    }
  }
  for (const d of dates)
    byDate[d].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  backlog.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  // Attach the (as-of-today) repeat streak to every occurrence of a repeating
  // task — shown on every column. The streak is a group-level, as-of-today
  // value identical across an occurrence's dates.
  const todayLocal = getZonedToday(tz);
  const streakByDocId = await streakMapForWeeklyDocs(
    uid,
    docs.filter((d) => d.type === 'weekly'),
    todayLocal,
    tz,
  );
  for (const d of dates) {
    for (const occ of byDate[d]) {
      const s = streakByDocId.get(occ.id);
      if (s !== undefined) occ.streak = s;
    }
  }

  // expose user account creation date for slider lower bound
  const user = (await UserModel.findById(uid, { createdAt: 1 }).lean()) as any;
  const accountCreatedAt = user?.createdAt
    ? new Date(user.createdAt).toISOString().split('T')[0]
    : null;

  return NextResponse.json({
    byDate,
    backlog,
    accountCreatedAt,
  });
}

type ChecklistItemInput = { id: string; text: string; done: boolean };

/** Coerce a request-provided checklist into the stored shape, or undefined. */
function sanitizeChecklistInput(
  value: unknown,
): ChecklistItemInput[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter(
      (it: unknown): it is Record<string, unknown> =>
        !!it && typeof it === 'object',
    )
    .map((it: Record<string, unknown>) => ({
      id: String(it.id ?? ''),
      text: String(it.text ?? ''),
      done: Boolean(it.done),
    }));
}

type BoardTaskInput = {
  id: string;
  text?: string;
  tags?: string[];
  notes?: string;
  checklist?: unknown;
  calendarEventId?: string;
  startTime?: string;
  endTime?: string;
  reminder?: string;
  frogodoroSession?: {
    date?: string;
    focusTime?: number;
    breakTime?: number;
  } | null;
};

async function handleBoardPut(
  uid: string,
  body: {
    day: number;
    tasks: BoardTaskInput[];
  },
  tz: string,
) {
  const { day, tasks } = body;
  if (!Number.isInteger(day) || (day !== -1 && !isWeekday(day)))
    return NextResponse.json(
      { error: 'day must be -1 or 0..6' },
      { status: 400 },
    );
  const now = new Date();
  const { weekStart, weekDates } = getRollingWeekDatesZoned(tz);
  if (day === -1) {
    const ids = (tasks as Array<{ id: string }>).map((t) => t.id);
    if (ids.length === 0) {
      await TaskModel.deleteMany({ userId: uid, type: 'backlog', weekStart });
      await syncGamification(uid, tz);
      await notifyTaskChanged(uid);
      return NextResponse.json({ ok: true });
    }
    await TaskModel.deleteMany({
      userId: uid,
      type: 'backlog',
      weekStart,
      id: { $nin: ids },
    });
    const docs: TaskDoc[] = await TaskModel.find(
      { userId: uid, id: { $in: ids } },
      { id: 1, text: 1, type: 1, tags: 1, notes: 1, checklist: 1, calendarEventId: 1, startTime: 1, endTime: 1, reminder: 1 },
    )
      .lean<TaskDoc[]>()
      .exec();
    const textFromReq = new Map(
      (tasks as Array<{ id: string; text?: string }>).map((t) => [
        t.id,
        t.text ?? '',
      ]),
    );
    const tagsFromReq = new Map(
      (tasks as Array<{ id: string; tags?: string[] }>).map((t) => [
        t.id,
        t.tags,
      ]),
    );
    const textById = new Map<string, string>();
    const tagsById = new Map<string, string[]>();
    const notesById = new Map<string, string | undefined>();
    const checklistById = new Map<string, TaskDoc['checklist']>();
    const calIdById = new Map<string, string | undefined>();
    const startById = new Map<string, string | undefined>();
    const endById = new Map<string, string | undefined>();
    const reminderById = new Map<string, string | undefined>();

    for (const d of docs) {
      textById.set(d.id, d.text ?? '');
      tagsById.set(d.id, d.tags ?? []);
      notesById.set(d.id, d.notes);
      checklistById.set(d.id, d.checklist);
      calIdById.set(d.id, d.calendarEventId);
      startById.set(d.id, d.startTime);
      endById.set(d.id, d.endTime);
      reminderById.set(d.id, d.reminder);
    }
    await Promise.all(
      ids.map((id, i) => {
        const t = tasks.find((item) => item.id === id);
        // Prefer request-provided details: a concurrent move (the source day's
        // save) may delete the doc before this read, so the DB can't be trusted.
        const notes =
          typeof t?.notes === 'string' ? t.notes : notesById.get(id) ?? '';
        const checklist =
          sanitizeChecklistInput(t?.checklist) ?? checklistById.get(id) ?? [];
        return TaskModel.updateOne(
          { userId: uid, type: 'backlog', weekStart, id },
          {
            $set: {
              order: i + 1,
              text: textById.get(id) ?? textFromReq.get(id) ?? '',
              tags: tagsFromReq.get(id) ?? tagsById.get(id) ?? [],
              notes,
              checklist,
              weekStart,
              updatedAt: now,
              calendarEventId: t?.calendarEventId ?? calIdById.get(id),
              startTime: t?.startTime ?? startById.get(id),
              endTime: t?.endTime ?? endById.get(id),
              reminder: t?.reminder ?? reminderById.get(id),
            },
            $setOnInsert: {
              userId: uid,
              type: 'backlog',
              createdAt: now,
              completed: false,
              completedDates: [],
              suppressedDates: [],
            },
          },
          { upsert: true },
        );
      }),
    );
    await TaskModel.deleteMany({
      userId: uid,
      id: { $in: ids },
      type: { $in: ['weekly', 'regular'] },
    });
    await syncGamification(uid, tz);
    await notifyTaskChanged(uid);
    return NextResponse.json({ ok: true });
  }
  const weekday: Weekday = day as Weekday;
  const batch = tasks;
  const ids = batch.map((t) => t.id);

  // 1. Remove regular tasks that are no longer in this day's list
  await TaskModel.deleteMany({
    userId: uid,
    type: 'regular',
    date: weekDates[weekday],
    id: { $nin: ids },
  });

  const docs: TaskDoc[] = await TaskModel.find(
    { userId: uid, id: { $in: ids } },
    { id: 1, type: 1, text: 1, tags: 1, notes: 1, checklist: 1, calendarEventId: 1, startTime: 1, endTime: 1, reminder: 1 },
  )
    .lean<TaskDoc[]>()
    .exec();
  const typeById = new Map(docs.map((d) => [d.id, d.type]));
  const textById = new Map(docs.map((d) => [d.id, d.text]));
  const tagsById = new Map(docs.map((d) => [d.id, d.tags ?? []]));
  const notesById = new Map(docs.map((d) => [d.id, d.notes]));
  const checklistById = new Map(docs.map((d) => [d.id, d.checklist]));
  const calIdById = new Map(docs.map((d) => [d.id, d.calendarEventId]));
  const startById = new Map(docs.map((d) => [d.id, d.startTime]));
  const endById = new Map(docs.map((d) => [d.id, d.endTime]));
  const reminderById = new Map(docs.map((d) => [d.id, d.reminder]));

  await Promise.all(
    batch.map((t, i) => {
      const ttype = typeById.get(t.id);
      const textFromReq = t.text ?? textById.get(t.id) ?? '';
      const tags = t.tags ?? tagsById.get(t.id) ?? [];
      // Prefer request-provided details: a concurrent move may already have
      // deleted the source doc, so the DB lookup can't be trusted here.
      const notes =
        typeof t.notes === 'string' ? t.notes : notesById.get(t.id) ?? '';
      const checklist =
        sanitizeChecklistInput(t.checklist) ?? checklistById.get(t.id) ?? [];

      // Use request values if they exist, otherwise fallback to DB values
      const calendarEventId = t.calendarEventId ?? calIdById.get(t.id);
      const startTime = t.startTime ?? startById.get(t.id);
      const endTime = t.endTime ?? endById.get(t.id);
      const reminderVal = t.reminder ?? reminderById.get(t.id);

      if (ttype === 'weekly')
        return TaskModel.updateOne(
          { userId: uid, type: 'weekly', id: t.id },
          {
            $set: {
              dayOfWeek: weekday,
              order: i + 1,
              [`orderOverrides.${weekDates[weekday]}`]: i + 1,
              updatedAt: now,
              tags,
            },
          },
        );
      if (ttype === 'regular')
        return TaskModel.updateOne(
          { userId: uid, type: 'regular', id: t.id },
          {
            $set: {
              date: weekDates[weekday],
              order: i + 1,
              updatedAt: now,
              tags,
              calendarEventId,
              startTime,
              endTime,
              reminder: reminderVal,
            },
          },
        );
      if (ttype === 'backlog')
        return Promise.all([
          TaskModel.deleteOne({
            userId: uid,
            type: 'backlog',
            weekStart,
            id: t.id,
          }),
          TaskModel.updateOne(
            { userId: uid, type: 'regular', id: t.id },
            {
              $set: {
                text: textFromReq,
                tags,
                notes,
                checklist,
                date: weekDates[weekday],
                order: i + 1,
                completed: false,
                updatedAt: now,
                calendarEventId,
                startTime,
                endTime,
                reminder: reminderVal,
              },
              $setOnInsert: { userId: uid, type: 'regular', createdAt: now },
            },
            { upsert: true },
          ),
        ]);
      return TaskModel.updateOne(
        { userId: uid, type: 'regular', id: t.id },
        {
          $set: {
            text: textFromReq,
            tags,
            notes,
            checklist,
            date: weekDates[weekday],
            order: i + 1,
            completed: false,
            updatedAt: now,
            calendarEventId,
            startTime,
            endTime,
            reminder: reminderVal,
          },
          $setOnInsert: { userId: uid, type: 'regular', createdAt: now },
        },
        { upsert: true },
      );
    }),
  );
  await syncGamification(uid, tz);
  await notifyTaskChanged(uid);
  return NextResponse.json({ ok: true });
}

async function handleBoardPutByDate(
  uid: string,
  body: {
    dateKey: string;
    tasks: BoardTaskInput[];
  },
  tz: string,
) {
  const { dateKey, tasks } = body;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey))
    return NextResponse.json({ error: 'invalid dateKey' }, { status: 400 });
  const now = new Date();
  const ids = tasks.map((t) => t.id);

  // 1. Remove regular tasks for this date that are no longer in the list
  await TaskModel.deleteMany({
    userId: uid,
    type: 'regular',
    date: dateKey,
    id: { $nin: ids },
  });

  const docs: TaskDoc[] = await TaskModel.find(
    { userId: uid, id: { $in: ids } },
    {
      id: 1,
      type: 1,
      text: 1,
      tags: 1,
      notes: 1,
      checklist: 1,
      calendarEventId: 1,
      startTime: 1,
      endTime: 1,
      reminder: 1,
      repeatMode: 1,
      dayOfWeek: 1,
      repeatDayOfMonth: 1,
      repeatRule: 1,
      repeatStartDate: 1,
    },
  )
    .lean<TaskDoc[]>()
    .exec();
  const typeById = new Map(docs.map((d) => [d.id, d.type]));
  const docById = new Map(docs.map((d) => [d.id, d]));
  const textById = new Map(docs.map((d) => [d.id, d.text]));
  const tagsById = new Map(docs.map((d) => [d.id, d.tags ?? []]));
  const notesById = new Map(docs.map((d) => [d.id, d.notes]));
  const checklistById = new Map(docs.map((d) => [d.id, d.checklist]));
  const weekday = dowFromYMD(dateKey);
  const { weekStart } = getRollingWeekDatesZoned(tz);

  await Promise.all(
    tasks.map((t, i) => {
      const ttype = typeById.get(t.id);
      const textFromReq = t.text ?? textById.get(t.id) ?? '';
      const tags = t.tags ?? tagsById.get(t.id) ?? [];
      // Prefer request-provided details: a concurrent move may already have
      // deleted the source doc, so the DB lookup can't be trusted here.
      const notes =
        typeof t.notes === 'string' ? t.notes : notesById.get(t.id) ?? '';
      const checklist =
        sanitizeChecklistInput(t.checklist) ?? checklistById.get(t.id) ?? [];
      const srcDoc = docById.get(t.id);
      const startTime = t.startTime ?? srcDoc?.startTime;
      const endTime = t.endTime ?? srcDoc?.endTime;
      const reminder = t.reminder ?? srcDoc?.reminder;
      const calendarEventId = t.calendarEventId ?? srcDoc?.calendarEventId;
      const scheduleFields = {
        ...(startTime !== undefined ? { startTime } : {}),
        ...(endTime !== undefined ? { endTime } : {}),
        ...(reminder !== undefined ? { reminder } : {}),
        ...(calendarEventId !== undefined ? { calendarEventId } : {}),
      };
      // The frogodoro session is stored in an array keyed by date; a moved
      // regular task must carry its focus/break onto the new day, so re-stamp
      // the request's session to this column's date. (Regular tasks live on one
      // day, so collapsing to the single current-date entry is correct.)
      const fsess = t.frogodoroSession;
      const frogodoroFields =
        fsess &&
        (typeof fsess.focusTime === 'number' ||
          typeof fsess.breakTime === 'number')
          ? {
              frogodoroSessions: [
                {
                  date: dateKey,
                  focusTime: fsess.focusTime ?? 0,
                  breakTime: fsess.breakTime ?? 0,
                },
              ],
            }
          : {};
      if (ttype === 'weekly') {
        // `type: 'weekly'` covers every repeat kind (weekly / monthly / custom).
        // When the task is being reordered within a column that is a *natural*
        // occurrence of its rule, only persist the new order — never detach it
        // into a one-off, which would strip the repeat (and, for monthly/custom,
        // wipe every other generated occurrence). Only when the task lands on a
        // day the rule doesn't fall on do we convert it to a one-off regular.
        const doc = docById.get(t.id);
        const occursHere =
          doc?.repeatMode === 'monthly'
            ? domFromYMD(dateKey) === doc.repeatDayOfMonth
            : doc?.repeatRule
              ? customOccursOn(doc, dateKey)
              : typeof doc?.dayOfWeek === 'number'
                ? dowFromYMD(dateKey) === doc.dayOfWeek
                : false;
        if (occursHere) {
          return TaskModel.updateOne(
            { userId: uid, id: t.id },
            {
              $set: {
                [`orderOverrides.${dateKey}`]: i + 1,
                updatedAt: now,
                tags,
              },
            },
          );
        }
        // Lands on a non-occurrence day: detach into a one-off regular task.
        return TaskModel.updateOne(
          { userId: uid, id: t.id },
          {
            $set: {
              type: 'regular',
              date: dateKey,
              order: i + 1,
              updatedAt: now,
              tags,
              notes,
              checklist,
              ...scheduleFields,
            },
            $unset: {
              dayOfWeek: 1,
              repeatMode: 1,
              repeatGroupId: 1,
              repeatRule: 1,
              repeatDayOfMonth: 1,
              repeatStartDate: 1,
              repeatEndDate: 1,
            },
          },
        );
      }
      if (ttype === 'backlog')
        return Promise.all([
          TaskModel.deleteOne({
            userId: uid,
            type: 'backlog',
            weekStart,
            id: t.id,
          }),
          TaskModel.updateOne(
            { userId: uid, type: 'regular', id: t.id },
            {
              $set: {
                text: textFromReq,
                tags,
                notes,
                checklist,
                ...scheduleFields,
                ...frogodoroFields,
                date: dateKey,
                order: i + 1,
                completed: false,
                updatedAt: now,
              },
              $setOnInsert: { userId: uid, type: 'regular', createdAt: now },
            },
            { upsert: true },
          ),
        ]);
      // regular or unknown -> upsert as regular on this date
      return TaskModel.updateOne(
        { userId: uid, type: 'regular', id: t.id },
        {
          $set: {
            text: textFromReq,
            tags,
            notes,
            checklist,
            ...scheduleFields,
            ...frogodoroFields,
            date: dateKey,
            order: i + 1,
            updatedAt: now,
          },
          $setOnInsert: {
            userId: uid,
            type: 'regular',
            createdAt: now,
            completed: false,
          },
        },
        { upsert: true },
      );
    }),
  );
  await syncGamification(uid, tz);
  await notifyTaskChanged(uid);
  return NextResponse.json({ ok: true });
}

// Ensure PUT handles simple text updates for single task edit
// We add a check for 'text' in the main PUT body handler, which was missing in the original file view for the single-task update block.
// The original code:
//   const { date, taskId, completed, tags, toggleType, order } = body ?? {};
//   if ((!date && !tags) || !taskId) ...
// We need to allow text updates now.

async function handleBoardDelete(
  uid: string,
  body: { day: number; taskId: string },
  tz: string,
) {
  const { day, taskId } = body;
  if (!taskId)
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
  if (!Number.isInteger(day) || (day !== -1 && !isWeekday(day)))
    return NextResponse.json(
      { error: 'day must be -1 or 0..6' },
      { status: 400 },
    );
  if (day === -1) {
    const { weekStart } = getRollingWeekDatesZoned(tz);
    await TaskModel.deleteOne({
      userId: uid,
      type: 'backlog',
      weekStart,
      id: taskId,
    });
    await syncGamification(uid, tz);
    await notifyTaskChanged(uid);
    return NextResponse.json({ ok: true });
  }
  const doc = await TaskModel.findOne({ userId: uid, id: taskId }, { type: 1 })
    .lean<TaskDoc>()
    .exec();
  if (doc?.type === 'regular') {
    await TaskModel.deleteOne({ userId: uid, type: 'regular', id: taskId });
    await syncGamification(uid, tz);
    await notifyTaskChanged(uid);
    return NextResponse.json({ ok: true });
  }
  if (doc?.type === 'weekly') {
    await TaskModel.updateOne(
      { userId: uid, type: doc.type, id: taskId },
      { $set: { deletedAt: new Date() } },
    );
  }
  const today = getZonedToday(tz);
  await TaskModel.deleteMany({
    userId: uid,
    type: 'regular',
    id: taskId,
    date: { $gte: today },
  });
  await syncGamification(uid, tz);
  await notifyTaskChanged(uid);
  return NextResponse.json({ ok: true });
}

async function nextOrderForDay(userId: string, weekday: Weekday, date: string) {
  const dayQuery = {
    userId,
    $or: [
      { type: 'weekly', dayOfWeek: weekday },
      { type: 'regular', date },
    ],
  };
  // Append to the very end (highest order). New tasks should always land at the
  // end of the unfinished list; the UI sorts completed tasks to the bottom
  // regardless of their stored order, so a max-order active task renders after
  // all other unfinished tasks and above the finished ones.
  const last = await TaskModel.findOne(dayQuery, { order: 1 })
    .sort({ order: -1 })
    .lean<TaskDoc>()
    .exec();
  return (last?.order ?? 0) + 1;
}

async function nextOrderBacklog(userId: string, weekStart: string) {
  const doc = await TaskModel.findOne(
    { userId, type: 'backlog', weekStart },
    { order: 1 },
  )
    .sort({ order: -1 })
    .lean<TaskDoc>()
    .exec();
  return (doc?.order ?? 0) + 1;
}
