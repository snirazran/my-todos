// src/app/api/tasks/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import { Types } from 'mongoose';
import { v4 as uuid } from 'uuid';
import connectMongo from '@/lib/mongoose';
import { syncPactCommitmentText } from '@/lib/pact/renameCommitment';
import {
  applyPactTaskRemoval,
  type PactTaskRemovalResult,
} from '@/lib/pact/taskLifecycle';
import UserModel, { type UserDoc } from '@/lib/models/User';
import TaskModel, {
  type TaskDoc,
  type TaskType,
  type Weekday,
} from '@/lib/models/Task';
import type { DailyFlyProgress } from '@/lib/types/UserDoc';
import {
  calculateHunger,
  HUNGER_FULL_SNAP_MS,
  MAX_HUNGER_MS,
  TASK_HUNGER_REWARD_MS,
} from '@/lib/hungerLogic';
import { syncQuestState, isPremiumUser } from '@/lib/quests/engine';
import { getZonedToday, getZonedYMD } from '@/lib/utils';
import { normalizeWeekStart, type WeekStartDay } from '@/lib/weekStart';
import { notifyTaskChanged } from '@/lib/taskSync';
import {
  TaskSectionModel,
  isSectionCollapsedOn,
} from '@/lib/models/TaskSection';
import { severBond, handleBuddyCompletion } from '@/lib/buddy/server';
import { bumpQuestMetric, taskStreakMetric } from '@/lib/quests/metrics';
import { reconcilePactSessionFlies } from '@/lib/pact/sessions';
import {
  checklistBonus,
  checklistContent,
  checklistForDate,
  checklistPayoutForDate,
  normalizeChecklistRewards,
  withChecklistBudget,
  type ChecklistTier,
  withChecklistDone,
} from '@/lib/checklist';
import {
  streakFlyBonus,
  taskFlyWorthNow,
  type StreakTier,
} from '@/lib/flyValue';
import {
  FLY_ECONOMY_DEFAULTS,
  loadFlyEconomyConfig,
  taskIncomeCap,
} from '@/lib/economy/config';
import { settleFlyGrant } from '@/lib/economy/ledger';
import {
  isPayableOccurrenceDate,
  resolveEconomyTimezone,
} from '@/lib/economy/guards';
import { accrueOverflowPebbles } from '@/lib/economy/overflowJar';
import {
  creditTaskStreakMilestones,
  drainTaskStreakQueue,
  streakGroupKey,
  type MilestonePayout,
} from '@/lib/economy/taskStreakMilestones';
import {
  dowFromYMD,
  domFromYMD,
  addDaysYMD,
  repeatStartForDoc,
  normalizeRepeatEnd,
  isAfterRepeatEnd,
  monthlyExcludesDate,
  siblingOccursOn,
  customOccursOn,
  normalizeRepeatRule,
} from '@/lib/taskOccurrence';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import { recordHungerBite } from '@/lib/analytics/hunger';
import { taskAnalyticsProperties } from '@/lib/analytics/engagement';
import {
  computeGroupStreak,
  isWithinStreakCreditWindow,
} from '@/lib/streak/taskStreaks';
import { loadProtectedDays } from '@/lib/streak/loginStreak';
import { sessionForRow } from '@/lib/frogodoroSessions';

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
  /** Completions left today that still pay flies rather than pebbles. */
  payingCompletionsLeft?: number;
  /** What the Plus cap is, so the upsell only fires when Plus actually pays more. */
  plusLimit?: number;
  /** Why this completion paid nothing, when it paid nothing. */
  blockedReason?: 'backdated' | 'completions' | 'cap' | 'breaker';
};

type HungerStatus = {
  hunger: number;
  stolenFlies: number;
  maxHunger: number;
};

type JarStatus = {
  pebbles: number;
  pebblesAdded: number;
  giftsEarned: number;
  giftItemId: string;
  pebblesToNextGift: number;
  weeklyGiftLocked: boolean;
};

const DAILY_FLY_LIMIT_FREE = FLY_ECONOMY_DEFAULTS.taskIncome.dailyCapFree;
const DAILY_FLY_LIMIT_PREMIUM = FLY_ECONOMY_DEFAULTS.taskIncome.dailyCapPlus;
const MAX_BULK_TASKS = 50;
const MAX_TASK_TEXT_LENGTH = 100;

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

async function weekStartFor(uid: string): Promise<WeekStartDay> {
  const doc = await UserModel.findById(uid).select('weekStartsOn').lean();
  return normalizeWeekStart((doc as { weekStartsOn?: unknown } | null)?.weekStartsOn);
}

function getRollingWeekDatesZoned(tz: string, weekStartsOn: WeekStartDay = 0) {
  const todayYMD = getZonedToday(tz);
  const todayDate = new Date(`${todayYMD}T12:00:00Z`);
  const dow = todayDate.getUTCDay();
  const back = (dow - weekStartsOn + 7) % 7;
  const sundayDate = new Date(todayDate);
  sundayDate.setUTCDate(todayDate.getUTCDate() - back);
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

  const [protectedDays, economyConfig] = await Promise.all([
    loadProtectedDays(uid),
    loadFlyEconomyConfig(),
  ]);
  const freeSlipEveryDays = economyConfig.taskStreak.freeSlipEveryDays;

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
        lateCompletedDates: 1,
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
    map.set(
      d.id,
      computeGroupStreak(sibs, today, tz, { protectedDays, freeSlipEveryDays }),
    );
  }
  return map;
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
  taskHunger: {},
  limitNotified: false,
  paidCompletions: 0,
  jarTaskIds: [],
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
      taskHunger: flyDaily.taskHunger ?? {},
      limitNotified: flyDaily.limitNotified ?? false,
      paidCompletions: Math.max(
        0,
        flyDaily.paidCompletions ??
          Object.values(flyDaily.taskFlies ?? {}).filter((n) => n > 0).length,
      ),
      jarTaskIds: flyDaily.jarTaskIds ?? [],
    };
  }
  return initDailyFly(today);
}

type FlyValueTask = Pick<
  TaskDoc,
  'type' | 'checklist' | 'checklistDoneByDate' | 'checklistBudgetByDate'
>;

/**
 * Flies a task has earned on `date`. Every task is worth 1 on completion,
 * checklist or not; a checklist adds its step-count bonus on top, paid out
 * marker by marker as steps are checked — completing the task never releases
 * the markers it never reached. The streak tier adds its bonus on top too, but
 * only for an actual completion.
 */
function taskFlyBreakdown(
  task: FlyValueTask,
  date: string,
  streak: number = 0,
  completed: boolean = true,
  tiers?: readonly StreakTier[],
  checklistTiers?: readonly ChecklistTier[],
): { base: number; checklist: number; streak: number; total: number } {
  if ((task as { isTutorial?: boolean }).isTutorial) {
    return { base: 0, checklist: 0, streak: 0, total: 0 };
  }
  const base = completed ? 1 : 0;
  const streakUplift = completed ? streakFlyBonus(streak, tiers) : 0;
  const checklist = checklistPayoutForDate(task, date, checklistTiers).earned;
  return {
    base,
    checklist,
    streak: streakUplift,
    total: base + checklist + streakUplift,
  };
}

/**
 * Pin the fly budget this occurrence pays out at, the first time it pays.
 * Padding a checklist with extra steps afterwards can't raise it.
 */
async function lockChecklistBudget(
  userId: string,
  doc: Pick<TaskDoc, 'id' | 'checklist' | 'checklistBudgetByDate'>,
  date: string,
  checklistTiers?: readonly ChecklistTier[],
) {
  const steps = (doc.checklist ?? []).length;
  if (!steps || typeof doc.checklistBudgetByDate?.[date] === 'number') return;
  await TaskModel.updateOne(
    { userId, id: doc.id },
    {
      $set: {
        checklistBudgetByDate: withChecklistBudget(
          doc.checklistBudgetByDate,
          date,
          checklistBonus(steps, checklistTiers),
        ),
      },
    },
  );
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
  const config = await loadFlyEconomyConfig();
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
  const limit = taskIncomeCap(config, premium);
  const { updates, status: hungerStatus } = calculateHunger(user);
  const wardrobe = user.wardrobe ?? { equipped: {}, inventory: {}, flies: 0 };
  await recordHungerBite({
    userId,
    previousStolen: wardrobe.stolenFlies ?? 0,
    nextStolen: hungerStatus.stolenFlies,
    isPremium: premium,
    dayKey: today,
  });
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
      plusLimit: config.taskIncome.dailyCapPlus,
    },
    hungerStatus,
    dailyTasksCount,
  };
}

function syncGamification(userId: string, timezone: string) {
  // The pact reconciles here rather than at each completion call site: ticking
  // a task arrives from several routes and can be undone, and this is the one
  // hook all of them already share.
  return Promise.all([
    syncQuestState({ userId, timezone }).catch((error) => {
      console.error('Quest sync failed:', error);
    }),
    reconcilePactSessionFlies({ userId, timezone }).catch((error) => {
      console.error('Pact session sync failed:', error);
    }),
  ]);
}

type TaskFlyBreakdown = {
  base: number;
  checklist: number;
  streak: number;
};

async function awardFlyForTask(
  userId: string,
  taskId: string,
  tz: string,
  countTowardDaily: boolean = true,
  value: TaskFlyBreakdown = { base: 1, checklist: 0, streak: 0 },
  opts: {
    topUp?: boolean;
    countTask?: boolean;
    occurrenceDate?: string;
    /** False when the occurrence is too far in the past to earn anything. */
    payable?: boolean;
  } = {},
): Promise<{
  awarded: boolean;
  granted: number;
  flyStatus: FlyStatus;
  hungerStatus: HungerStatus;
  dailyTasksCount: number;
  jar?: JarStatus;
}> {
  const topUp = opts.topUp ?? false;
  const countTask = opts.countTask ?? countTowardDaily;
  const payable = opts.payable ?? true;
  const today = getZonedToday(tz);
  const occurrenceDate = opts.occurrenceDate ?? today;
  const config = await loadFlyEconomyConfig();
  const user = (await UserModel.findById(userId, {
    wardrobe: 1,
    statistics: 1, // Include statistics
    premiumUntil: 1,
  }).lean()) as LeanUser;

  if (!user) {
    return {
      awarded: false,
      granted: 0,
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
  const limit = taskIncomeCap(config, premium);
  const { updates: hungerUpdates, status: currentHungerState } =
    calculateHunger(user);
  const wardrobe = user.wardrobe ?? { equipped: {}, inventory: {}, flies: 0 };
  const daily = normalizeDailyFly(
    today,
    wardrobe.flyDaily as DailyFlyProgress | undefined,
  );
  const alreadyRewarded = (daily.taskIds ?? []).includes(taskId);
  const alreadyGranted = daily.taskFlies?.[taskId] ?? 0;
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
  if (countTask) {
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

  // Three gates decide what a completion is worth, in order. Past the day's
  // paying completions the whole payout — base, checklist and streak alike —
  // turns into pebbles, so the wall is the count of completions rather than a
  // rate that quietly halves. A task that has already been paid today is inside
  // its completion and keeps topping up its markers.
  const isNewPayingCompletion = !alreadyRewarded && alreadyGranted <= 0;
  const completionsAllowance = config.taskIncome.payingCompletionsPerDay;
  const completionsExhausted =
    isNewPayingCompletion && (daily.paidCompletions ?? 0) >= completionsAllowance;
  // The per-completion uplift always applies — it replaces the base fly and
  // stops climbing at the top tier, so it needs no cap of its own beyond the
  // day's task-income budget. Only MILESTONES are rationed (one a day).
  const streakPaid = Math.max(0, value.streak);

  const desired =
    payable && !completionsExhausted
      ? Math.max(topUp ? 0 : 1, value.base + value.checklist + streakPaid)
      : 0;

  const capRemaining = countTowardDaily
    ? Math.max(0, limit - daily.earned)
    : Number.MAX_SAFE_INTEGER;

  const settlement =
    desired > alreadyGranted
      ? await settleFlyGrant({
          userId,
          source: 'task',
          occurrenceKey: `${taskId}:${occurrenceDate}`,
          dayKey: today,
          targetAmount: desired,
          capRemaining,
          meta: {
            taskId,
            occurrenceDate,
            base: value.base,
            checklist: value.checklist,
            streak: streakPaid,
            premium,
          },
        })
      : null;

  const grant = settlement?.delta ?? 0;
  const blockedReason: FlyStatus['blockedReason'] = !payable
    ? 'backdated'
    : completionsExhausted
      ? 'completions'
      : settlement?.breakerTripped
        ? 'breaker'
        : settlement?.capped || (desired > 0 && grant <= 0 && capRemaining <= 0)
          ? 'cap'
          : undefined;

  // Nothing left to pay. A first-time completion still falls through even at
  // the daily cap, so the frog is fed and the task is recorded either way.
  if (alreadyRewarded && (!topUp || grant <= 0)) {
    // Merge stat updates
    const finalUpdates = { ...hungerUpdates };

    if (Object.keys(statsUpdates).length > 0) {
      Object.assign(finalUpdates, statsUpdates);
    }

    const ops: any = { $set: finalUpdates };
    if (countTask && !isNewDay && !alreadyCountedInStats) {
      ops.$inc = { ...(ops.$inc || {}), 'statistics.daily.dailyTasksCount': 1 };
      ops.$push = { 'statistics.daily.completedTaskIds': taskId };
      delete finalUpdates['statistics.daily.dailyTasksCount'];
    }

    if (Object.keys(finalUpdates).length > 0 || ops.$inc || ops.$push) {
      await UserModel.updateOne({ _id: user._id }, ops);
    }

    return {
      awarded: false,
      granted: 0,
      flyStatus: {
        balance: currentBalance,
        earnedToday: daily.earned,
        limit,
        limitHit: atLimit,
        isPremium: premium,
        plusLimit: config.taskIncome.dailyCapPlus,
        payingCompletionsLeft: Math.max(
          0,
          completionsAllowance - (daily.paidCompletions ?? 0),
        ),
        blockedReason,
      },
      hungerStatus: currentHungerState,
      dailyTasksCount: nextDailyTasksCount,
    };
  }

  // The frog is fed once per task, not once per fly — a checklist paying out
  // in instalments must not feed it again on every marker.
  const setFields: Record<string, any> = { ...hungerUpdates };
  let finalHungerStatus = currentHungerState;
  let hungerFed = 0;

  if (!alreadyRewarded) {
    const hungerBefore = Math.max(0, currentHungerState.hunger);
    let newHunger = Math.min(
      MAX_HUNGER_MS,
      hungerBefore + TASK_HUNGER_REWARD_MS,
    );
    if (MAX_HUNGER_MS - newHunger <= HUNGER_FULL_SNAP_MS) {
      newHunger = MAX_HUNGER_MS;
    }
    hungerFed = Math.max(0, newHunger - hungerBefore);
    finalHungerStatus = { ...currentHungerState, hunger: newHunger };
    if (newHunger >= MAX_HUNGER_MS && hungerBefore < MAX_HUNGER_MS) {
      await bumpQuestMetric({ userId, metric: 'frog_fed_full', timezone: tz });
    }
    setFields['wardrobe.hunger'] = newHunger;
    setFields['wardrobe.lastHungerUpdate'] = new Date();
  }

  if (statsUpdates['statistics.daily']) {
    setFields['statistics.daily'] = statsUpdates['statistics.daily'];
  }

  const paidAfter = settlement?.paidAfter ?? alreadyGranted;
  const nextEarned = daily.earned + (countTowardDaily ? grant : 0);
  const nextBalance = currentBalance + grant;
  if (grant > 0) setFields['wardrobe.flies'] = nextBalance;

  const startedPayingCompletion = isNewPayingCompletion && grant > 0;
  const goesToJar =
    payable &&
    countTowardDaily &&
    isNewPayingCompletion &&
    grant <= 0 &&
    config.overflowJar.enabled &&
    config.overflowJar.pebblesPerCompletion > 0;

  const hitLimit = nextEarned >= limit;
  const nextDaily: DailyFlyProgress = {
    date: today,
    earned: nextEarned,
    taskIds: Array.from(new Set([...(daily.taskIds ?? []), taskId])),
    taskFlies: {
      ...(daily.taskFlies ?? {}),
      [taskId]: paidAfter,
    },
    taskHunger: {
      ...(daily.taskHunger ?? {}),
      [taskId]: alreadyRewarded
        ? daily.taskHunger?.[taskId] ?? TASK_HUNGER_REWARD_MS
        : hungerFed,
    },
    limitNotified: limitNotified || hitLimit,
    paidCompletions:
      (daily.paidCompletions ?? 0) + (startedPayingCompletion ? 1 : 0),
    jarTaskIds: goesToJar
      ? Array.from(new Set([...(daily.jarTaskIds ?? []), taskId]))
      : (daily.jarTaskIds ?? []),
  };

  setFields['wardrobe.flyDaily'] = nextDaily;
  if (!user.wardrobe?.equipped) setFields['wardrobe.equipped'] = {};
  if (!user.wardrobe?.inventory) setFields['wardrobe.inventory'] = {};

  const ops: any = { $set: setFields };

  if (countTask && !isNewDay && !alreadyCountedInStats) {
    ops.$inc = { ...(ops.$inc || {}), 'statistics.daily.dailyTasksCount': 1 };
    ops.$push = {
      ...(ops.$push || {}),
      'statistics.daily.completedTaskIds': taskId,
    };
  }

  await UserModel.updateOne({ _id: user._id }, ops);

  let jar: JarStatus | undefined;
  if (goesToJar) {
    const accrual = await accrueOverflowPebbles({
      userId,
      dayKey: today,
      pebbles: config.overflowJar.pebblesPerCompletion,
      meta: { taskId, occurrenceDate },
    });
    if (accrual) {
      jar = {
        pebbles: accrual.jar.pebbles,
        pebblesAdded: accrual.pebblesAdded,
        giftsEarned: accrual.giftsEarned,
        giftItemId: accrual.giftItemId,
        pebblesToNextGift: accrual.pebblesToNextGift,
        weeklyGiftLocked: accrual.weeklyGiftLocked,
      };
    }
  }

  return {
    awarded: grant > 0,
    granted: grant,
    flyStatus: {
      balance: nextBalance,
      earnedToday: nextEarned,
      limit,
      limitHit: hitLimit,
      justHitLimit:
        countTowardDaily && hitLimit && !limitNotified ? true : undefined,
      isPremium: premium,
      plusLimit: config.taskIncome.dailyCapPlus,
      payingCompletionsLeft: Math.max(
        0,
        completionsAllowance - (nextDaily.paidCompletions ?? 0),
      ),
      blockedReason,
    },
    hungerStatus: finalHungerStatus,
    dailyTasksCount: nextDailyTasksCount,
    jar,
  };
}

async function unawardFlyForTask(
  userId: string,
  taskId: string,
  tz: string,
  countTowardDaily: boolean = true,
  occurrenceDate?: string,
): Promise<{
  flyStatus: FlyStatus;
  hungerStatus: HungerStatus;
  dailyTasksCount: number;
}> {
  const today = getZonedToday(tz);
  const config = await loadFlyEconomyConfig();
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
  const limit = taskIncomeCap(config, premium);
  const { updates: hungerUpdates, status: hungerStatus } = calculateHunger(user);
  const wardrobe = user.wardrobe ?? { equipped: {}, inventory: {}, flies: 0 };
  await recordHungerBite({
    userId,
    previousStolen: wardrobe.stolenFlies ?? 0,
    nextStolen: hungerStatus.stolenFlies,
    isPremium: premium,
    dayKey: today,
  });
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
  let nextHunger = Math.max(0, hungerStatus.hunger);

  if (wasRewarded) {
    const hungerBefore = nextHunger;
    const fed = daily.taskHunger?.[taskId] ?? TASK_HUNGER_REWARD_MS;
    nextHunger = Math.max(0, hungerBefore - fed);
    if (nextHunger !== hungerBefore) {
      setFields['wardrobe.hunger'] = nextHunger;
      setFields['wardrobe.lastHungerUpdate'] = new Date();
    }
    if (hungerBefore >= MAX_HUNGER_MS && nextHunger < MAX_HUNGER_MS) {
      await bumpQuestMetric({
        userId,
        metric: 'frog_fed_full',
        amount: -1,
        timezone: tz,
      });
    }

    // The ledger, not the day summary, is what this occurrence actually got
    // paid — settling it back to zero refunds exactly that and leaves the row
    // ready to pay the same amount again if the task is re-completed.
    const refund = await settleFlyGrant({
      userId,
      source: 'task',
      occurrenceKey: `${taskId}:${occurrenceDate ?? today}`,
      dayKey: today,
      targetAmount: 0,
      skipBreaker: true,
      meta: { taskId, occurrenceDate: occurrenceDate ?? today, undone: true },
    });
    const granted = Math.max(
      0,
      refund.paidBefore || daily.taskFlies?.[taskId] || 0,
    );

    if (countTowardDaily) nextEarned = Math.max(0, daily.earned - granted);
    nextBalance = Math.max(0, balance - granted);
    const nextTaskFlies = { ...(daily.taskFlies ?? {}) };
    delete nextTaskFlies[taskId];
    const nextTaskHunger = { ...(daily.taskHunger ?? {}) };
    delete nextTaskHunger[taskId];
    const wasJarred = (daily.jarTaskIds ?? []).includes(taskId);
    const nextDaily: DailyFlyProgress = {
      date: today,
      earned: nextEarned,
      taskIds: (daily.taskIds ?? []).filter((id) => id !== taskId),
      taskFlies: nextTaskFlies,
      taskHunger: nextTaskHunger,
      limitNotified: nextEarned >= limit ? daily.limitNotified : false,
      paidCompletions: Math.max(
        0,
        (daily.paidCompletions ?? 0) - (granted > 0 ? 1 : 0),
      ),
      jarTaskIds: (daily.jarTaskIds ?? []).filter((id) => id !== taskId),
    };
    setFields['wardrobe.flies'] = nextBalance;
    setFields['wardrobe.flyDaily'] = nextDaily;

    if (wasJarred && config.overflowJar.pebblesPerCompletion > 0) {
      await accrueOverflowPebbles({
        userId,
        dayKey: today,
        pebbles: -config.overflowJar.pebblesPerCompletion,
        meta: { taskId, undone: true },
      });
    }
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
      plusLimit: config.taskIncome.dailyCapPlus,
      payingCompletionsLeft: Math.max(
        0,
        config.taskIncome.payingCompletionsPerDay -
          Math.max(0, (daily.paidCompletions ?? 0) - (wasRewarded ? 1 : 0)),
      ),
    },
    hungerStatus: { ...hungerStatus, hunger: nextHunger },
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

  if (Object.prototype.hasOwnProperty.call(body, 'tasks')) {
    if (!Array.isArray(body.tasks) || body.tasks.length === 0) {
      return NextResponse.json(
        { error: 'tasks must be a non-empty array' },
        { status: 400 },
      );
    }
    if (body.tasks.length > MAX_BULK_TASKS) {
      return NextResponse.json(
        { error: `A batch can contain at most ${MAX_BULK_TASKS} tasks` },
        { status: 400 },
      );
    }
    for (const item of body.tasks) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return NextResponse.json(
          { error: 'Every task must be an object' },
          { status: 400 },
        );
      }
      const taskText = typeof item.text === 'string' ? item.text.trim() : '';
      if (!taskText) {
        return NextResponse.json(
          { error: 'Every task needs a name' },
          { status: 400 },
        );
      }
      if (taskText.length > MAX_TASK_TEXT_LENGTH) {
        return NextResponse.json(
          { error: `Task names must be ${MAX_TASK_TEXT_LENGTH} characters or less` },
          { status: 400 },
        );
      }
    }

    const creationBatchId = uuid();
    const ids: string[] = [];
    const tasks: any[] = [];
    try {
      for (const item of body.tasks) {
        const result = await createTasksForUser(uid, item, tz, {
          creationBatchId,
        });
        if (!result.ok) {
          await TaskModel.deleteMany({ userId: uid, creationBatchId });
          return NextResponse.json(
            { error: result.error },
            { status: result.status },
          );
        }
        ids.push(...result.ids);
        tasks.push(...result.tasks);
      }
    } catch (error) {
      await TaskModel.deleteMany({ userId: uid, creationBatchId });
      console.error('Bulk task creation failed:', error);
      return NextResponse.json(
        { error: 'Could not add these tasks. Please try again.' },
        { status: 500 },
      );
    }

    void syncGamification(uid, tz);
    await notifyTaskChanged(uid);
    const analyticsUser = await UserModel.findById(uid).select('focusProfile').lean();
    await recordAnalyticsEvent({
      userId: uid,
      name: 'task_created',
      properties: taskAnalyticsProperties(
        tasks[0] ?? body.tasks[0],
        analyticsUser?.focusProfile,
        { count: body.tasks.length, task_type: 'bulk' },
      ),
    });
    return NextResponse.json({
      ok: true,
      batchId: creationBatchId,
      createdCount: body.tasks.length,
      ids,
      tasks,
    });
  }

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
    const analyticsUser = await UserModel.findById(uid).select('focusProfile').lean();
    await recordAnalyticsEvent({
      userId: uid,
      name: 'task_created',
      properties: taskAnalyticsProperties(created.toObject(), analyticsUser?.focusProfile, {
        count: 1,
        task_type: 'duplicate',
      }),
    });
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
  const [createdTask, analyticsUser] = await Promise.all([
    TaskModel.findOne({ userId: uid, id: { $in: result.ids } }).lean<TaskDoc>(),
    UserModel.findById(uid).select('focusProfile').lean(),
  ]);
  await recordAnalyticsEvent({
    userId: uid,
    name: 'task_created',
    properties: taskAnalyticsProperties(createdTask ?? {
      type: body?.type ?? 'regular',
      tags: body?.tags,
      checklist: body?.checklist,
      startTime: body?.startTime,
      endTime: body?.endTime,
      reminder: body?.reminder,
    }, analyticsUser?.focusProfile, { count: result.ids.length }),
  });
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
  opts?: {
    bondId?: string;
    buddyUserId?: string;
    creationBatchId?: string;
    /** Seeded for the user rather than typed by them, so "add a task" objectives skip it. */
    isSeededPlan?: boolean;
    /** Practice card for the planner tour: earns nothing and is deleted when the tour ends. */
    isTutorial?: boolean;
  },
): Promise<CreateTasksResult> {
  const buddyFields = opts?.bondId
    ? { bondId: opts.bondId, buddyUserId: opts.buddyUserId }
    : {};
  const batchFields = {
    ...(opts?.creationBatchId
      ? { creationBatchId: opts.creationBatchId }
      : {}),
    ...(opts?.isSeededPlan ? { isSeededPlan: true } : {}),
    ...(opts?.isTutorial ? { isTutorial: true } : {}),
  };
  const sectionFields =
    typeof body?.sectionId === 'string' && body.sectionId
      ? { sectionId: body.sectionId }
      : {};

  const text = String(body?.text ?? '').trim();
  const rawDays: number[] = Array.isArray(body?.days) ? body.days : [];
  const tags: string[] = Array.isArray(body?.tags) ? body.tags.map(String) : [];
  const startTime = body.startTime;
  const endTime = body.endTime;
  const reminder = body.reminder;
  // Carried over when restoring a saved (backlog) task so notes/checklist survive.
  const notes = typeof body?.notes === 'string' ? body.notes : undefined;
  const checklist = sanitizeChecklistInput(body?.checklist);

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
  const { weekStart, weekDates } = getRollingWeekDatesZoned(tz, await weekStartFor(uid));
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
      checklist: checklistContent(checklist),
      startTime,
      endTime,
      reminder,
      repeatMode: 'monthly',
      repeatStartDate: anchor,
      repeatEndDate,
      repeatDayOfMonth,
      ...buddyFields,
      ...batchFields,
      ...sectionFields,
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
          ...batchFields,
          ...sectionFields,
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
      checklist: checklistContent(checklist),
      startTime,
      endTime,
      reminder,
      repeatMode: 'custom',
      repeatStartDate: anchor,
      repeatEndDate,
      repeatRule: rule,
      ...buddyFields,
      ...batchFields,
      ...sectionFields,
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
          ...batchFields,
          ...sectionFields,
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
        checklist: checklistContent(checklist),
        startTime,
        endTime,
        reminder,
        repeatMode,
        repeatGroupId,
        repeatStartDate,
        repeatEndDate,
        ...buddyFields,
        ...batchFields,
        ...sectionFields,
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
        ...batchFields,
        ...sectionFields,
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
      ...batchFields,
      ...sectionFields,
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
      ...batchFields,
      ...sectionFields,
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
        ...batchFields,
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
        ...batchFields,
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
        ...batchFields,
        ...sectionFields,
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
        ...batchFields,
        ...sectionFields,
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

  // Converting a one-off into a repeat: its checklist becomes series content
  // and any already-checked items become that start date's checked state.
  const repeatSeedFields = (startDate: string): Record<string, unknown> => {
    if (doc.type === 'weekly' || !doc.checklist?.length) return {};
    const doneIds = doc.checklist.filter((c) => c.done).map((c) => c.id);
    return {
      checklist: checklistContent(doc.checklist),
      ...(doneIds.length
        ? { checklistDoneByDate: { [startDate]: doneIds } }
        : {}),
    };
  };

  if (mode === 'none') {
    const targetDate =
      date ||
      new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
    await TaskModel.updateOne(
      { userId: uid, id: taskId },
      {
        $set: {
          type: 'regular',
          date: targetDate,
          completed: false,
          repeatMode: 'none',
          ...(doc.checklist?.length
            ? { checklist: checklistForDate(doc, targetDate) }
            : {}),
        },
        $unset: {
          dayOfWeek: 1,
          weekStart: 1,
          completedDates: 1,
          repeatGroupId: 1,
          repeatStartDate: 1,
          repeatEndDate: 1,
          repeatDayOfMonth: 1,
          repeatRule: 1,
          checklistDoneByDate: 1,
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
      ...repeatSeedFields(repeatStartDate),
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
      ...repeatSeedFields(repeatStartDate),
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
      ...repeatSeedFields(repeatStartDate),
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
      const { weekDates } = getRollingWeekDatesZoned(tz, await weekStartFor(uid));
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
          notes: doc.notes,
          checklist: checklistContent(doc.checklist),
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

type BulkItem = { taskId: string; fromDate?: string };

type BulkBody = {
  op: 'move' | 'backlog' | 'tags' | 'repeat' | 'delete' | 'duplicate';
  items: BulkItem[];
  date?: string;
  add?: string[];
  remove?: string[];
  setRepeat?: unknown;
  scope?: 'one' | 'all';
  /**
   * Zero-based slot in the target day's column, counted among the tasks that
   * are *not* part of this move. Omitted means "append", which is what every
   * caller but a drag-and-drop bulk move wants.
   */
  atIndex?: number;
};

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * One request for a whole multi-select action. The planner used to fire N
 * single-task writes for this, which raced its own refetch guards and made the
 * board flicker through intermediate states; here the per-task work runs
 * server-side and the expensive tail (gamification sync + the realtime task
 * notification) fires exactly once, so the client gets a single settled state
 * to refetch.
 */
async function handleBulkPut(uid: string, bulk: BulkBody, tz: string) {
  const items = Array.isArray(bulk.items) ? bulk.items.slice(0, 200) : [];
  if (items.length === 0)
    return NextResponse.json({ error: 'items required' }, { status: 400 });

  const ids = Array.from(new Set(items.map((i) => i.taskId).filter(Boolean)));
  if (ids.length === 0)
    return NextResponse.json({ error: 'items required' }, { status: 400 });

  const docs = await TaskModel.find({ userId: uid, id: { $in: ids } })
    .lean<TaskDoc[]>()
    .exec();
  const byId = new Map(docs.map((d) => [d.id, d]));

  // Touched date columns, so the client knows what to re-read.
  const dates = new Set<string>();
  const noteDate = (d?: string) => {
    if (d && YMD_RE.test(d)) dates.add(d);
  };
  let affected = 0;

  /** Expand to whole repeat groups when the caller asked for scope:'all'. */
  const scopedIds = async (): Promise<string[]> => {
    if (bulk.scope !== 'all') return ids;
    const groupIds = Array.from(
      new Set(docs.map((d) => d.repeatGroupId).filter(Boolean) as string[]),
    );
    if (groupIds.length === 0) return ids;
    const siblings = await TaskModel.find(
      { userId: uid, repeatGroupId: { $in: groupIds } },
      { id: 1 },
    )
      .lean<{ id: string }[]>()
      .exec();
    return Array.from(new Set([...ids, ...siblings.map((s) => s.id)]));
  };

  const now = new Date();

  if (bulk.op === 'move' || bulk.op === 'backlog') {
    const toBacklog = bulk.op === 'backlog';
    const target = String(bulk.date ?? '');
    if (!toBacklog && !YMD_RE.test(target))
      return NextResponse.json({ error: 'date required' }, { status: 400 });

    const { weekStart } = getRollingWeekDatesZoned(tz, await weekStartFor(uid));
    const atIndex =
      !toBacklog &&
      typeof bulk.atIndex === 'number' &&
      Number.isFinite(bulk.atIndex)
        ? Math.max(0, Math.trunc(bulk.atIndex))
        : null;
    const landedIds: string[] = [];

    // Placing the bundle renumbers the whole target column at the end, so the
    // per-task append order is throwaway — take the base once and count up
    // instead of paying a sequential max-order query per task. Without a
    // placement we keep the original per-task query, which is what every other
    // caller of this op relies on.
    let appendOrder: number | null = null;
    const orderForTarget = async (): Promise<number> => {
      if (atIndex === null)
        return nextOrderForDay(uid, dowFromYMD(target), target);
      const base =
        appendOrder ?? (await nextOrderForDay(uid, dowFromYMD(target), target));
      appendOrder = base + 1;
      return base;
    };

    for (const item of items) {
      const doc = byId.get(item.taskId);
      if (!doc) continue;
      noteDate(item.fromDate);

      if (toBacklog) {
        const order = await nextOrderBacklog(uid, weekStart);
        await TaskModel.updateOne(
          { userId: uid, id: doc.id },
          {
            $set: {
              type: 'backlog',
              weekStart,
              order,
              updatedAt: now,
              completed: false,
            },
            $unset: {
              date: 1,
              dayOfWeek: 1,
              completedDates: 1,
              suppressedDates: 1,
            },
          },
        );
        affected++;
        continue;
      }

      noteDate(target);

      // A repeating task moves one occurrence only: the series keeps its rule,
      // the source date is suppressed, and the moved copy lands as a one-off.
      if (doc.type === 'weekly' && item.fromDate && YMD_RE.test(item.fromDate)) {
        if (item.fromDate === target) {
          landedIds.push(doc.id);
          continue;
        }
        const newId = uuid();
        await TaskModel.updateOne(
          { userId: uid, id: doc.id },
          { $addToSet: { suppressedDates: item.fromDate } },
        );
        await TaskModel.create({
          userId: uid,
          type: 'regular',
          id: newId,
          text: doc.text,
          date: target,
          order: await orderForTarget(),
          completed: false,
          // Detaching an occurrence is a move, not a new task: keep the series'
          // createdAt so it can't read as a task added today.
          createdAt: doc.createdAt ?? now,
          updatedAt: now,
          tags: doc.tags ?? [],
          notes: doc.notes ?? '',
          checklist: checklistForDate(doc, item.fromDate),
          startTime: doc.startTime,
          endTime: doc.endTime,
          reminder: doc.reminder,
          ...(doc.sectionId ? { sectionId: doc.sectionId } : {}),
        });
        landedIds.push(newId);
        affected++;
        continue;
      }

      if (doc.date === target) {
        landedIds.push(doc.id);
        continue;
      }
      await TaskModel.updateOne(
        { userId: uid, id: doc.id },
        {
          $set: {
            type: 'regular',
            date: target,
            order: await orderForTarget(),
            updatedAt: now,
          },
          $unset: { weekStart: 1, dayOfWeek: 1, suppressedDates: 1 },
        },
      );
      landedIds.push(doc.id);
      affected++;
    }

    if (atIndex !== null && landedIds.length > 0) {
      await placeTasksInDay(uid, target, landedIds, atIndex, now, tz);
    }
  } else if (bulk.op === 'tags') {
    const add = (Array.isArray(bulk.add) ? bulk.add : []).filter(
      (t) => typeof t === 'string',
    );
    const remove = (Array.isArray(bulk.remove) ? bulk.remove : []).filter(
      (t) => typeof t === 'string',
    );
    if (add.length === 0 && remove.length === 0)
      return NextResponse.json({ ok: true, affected: 0, dates: [] });

    const targetIds = await scopedIds();
    // $addToSet and $pull can't touch the same array in one update, so the
    // delta is applied as two passes. Tags the user never toggled are left
    // alone by construction — this is never a whole-array replace.
    if (add.length > 0) {
      const res = await TaskModel.updateMany(
        { userId: uid, id: { $in: targetIds } },
        { $addToSet: { tags: { $each: add } } },
      );
      affected = Math.max(affected, res.modifiedCount ?? 0);
    }
    if (remove.length > 0) {
      const res = await TaskModel.updateMany(
        { userId: uid, id: { $in: targetIds } },
        { $pull: { tags: { $in: remove } } },
      );
      affected = Math.max(affected, res.modifiedCount ?? 0);
    }
    for (const i of items) noteDate(i.fromDate);
  } else if (bulk.op === 'repeat') {
    for (const item of items) {
      const doc = byId.get(item.taskId);
      if (!doc) continue;
      // A shared buddy task's schedule needs mutual approval — skip it here
      // rather than forcing the change through the bulk path.
      if (doc.bondId) continue;
      noteDate(item.fromDate);
      // Each task repeats from the day it currently sits on. Without a per-task
      // dayOfWeek, applySetRepeat falls back to *today's* weekday, which would
      // silently re-anchor every picked task to the same day.
      const anchor =
        item.fromDate && YMD_RE.test(item.fromDate) ? item.fromDate : doc.date;
      const res = await applySetRepeat(
        uid,
        item.taskId,
        {
          ...(bulk.setRepeat as Record<string, unknown>),
          dayOfWeek: anchor ? dowFromYMD(anchor) : undefined,
        },
        anchor,
        tz,
      );
      if (res.ok) affected++;
    }
  } else if (bulk.op === 'delete') {
    for (const item of items) {
      const doc = byId.get(item.taskId);
      if (!doc) continue;
      noteDate(item.fromDate);
      if (doc.type === 'weekly' && item.fromDate && YMD_RE.test(item.fromDate)) {
        // Match the single-task planner delete: hide this occurrence, keep the
        // series. Deleting the whole series stays an explicit, separate choice.
        await TaskModel.updateOne(
          { userId: uid, id: doc.id },
          { $addToSet: { suppressedDates: item.fromDate } },
        );
      } else {
        await TaskModel.deleteOne({ userId: uid, id: doc.id });
        if (doc.bondId) await severBond(doc.bondId, uid);
      }
      affected++;
    }
  } else if (bulk.op === 'duplicate') {
    const target = String(bulk.date ?? '');
    if (!YMD_RE.test(target))
      return NextResponse.json({ error: 'date required' }, { status: 400 });
    noteDate(target);
    for (const item of items) {
      const doc = byId.get(item.taskId);
      if (!doc) continue;
      await TaskModel.create({
        userId: uid,
        type: 'regular',
        id: uuid(),
        text: doc.text,
        order: await nextOrderForDay(uid, dowFromYMD(target), target),
        date: target,
        completed: false,
        createdAt: now,
        updatedAt: now,
        tags: doc.tags ?? [],
        notes: doc.notes,
        checklist: checklistContent(doc.checklist),
        startTime: doc.startTime,
        endTime: doc.endTime,
        reminder: doc.reminder,
      });
      affected++;
    }
  } else {
    return NextResponse.json({ error: 'unknown bulk op' }, { status: 400 });
  }

  await syncGamification(uid, tz);
  await notifyTaskChanged(uid);
  return NextResponse.json({
    ok: true,
    affected,
    dates: Array.from(dates),
  });
}

export async function PUT(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();
  await connectMongo();
  const body = await req.json();
  const tz = body.timezone || 'UTC';
  if (body?.bulk) return handleBulkPut(uid, body.bulk as BulkBody, tz);
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
    await TaskModel.updateOne(
      { userId: uid, type: 'regular', id: newId },
      {
        $set: {
          text: doc.text,
          date: toDate,
          order: newOrder,
          tags: doc.tags ?? [],
          notes: doc.notes ?? '',
          checklist: checklistForDate(doc, fromDate),
          startTime: doc.startTime,
          endTime: doc.endTime,
          reminder: doc.reminder,
          updatedAt: now,
        },
        $setOnInsert: {
          userId: uid,
          type: 'regular',
          id: newId,
          // A detached occurrence is the same task on a new day, not a new one.
          createdAt: doc.createdAt ?? now,
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
    const { weekStart, weekDates } = getRollingWeekDatesZoned(tz, await weekStartFor(uid));

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

      await TaskModel.updateOne(
        { userId: uid, id: taskId },
        {
          $set: {
            type: 'regular',
            date: moveDate,
            order: newOrder,
            updatedAt: now,
          },
          $unset: { weekStart: 1, dayOfWeek: 1, suppressedDates: 1 },
        },
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

  // Handle detail update (notes + checklist) — the Trello-like task card.
  // Repeating tasks share notes + checklist items across the whole series;
  // only the checked state is per-date, stored on the doc owning that occurrence.
  if (body.details !== undefined && taskId) {
    const doc = await TaskModel.findOne({
      userId: uid,
      id: taskId,
    }).lean<TaskDoc>();
    if (!doc)
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    const set: Record<string, unknown> = {};
    if (typeof body.details.notes === 'string') set.notes = body.details.notes;
    const items = sanitizeChecklistInput(body.details.checklist);
    const viewDate =
      typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? date
        : getZonedToday(tz);
    const nextDoc: TaskDoc = { ...doc };
    if (doc.type === 'weekly') {
      const targetDate = viewDate;
      if (items) set.checklist = checklistContent(items);
      if (Object.keys(set).length) {
        const filter = doc.repeatGroupId
          ? { userId: uid, repeatGroupId: doc.repeatGroupId }
          : { userId: uid, id: taskId };
        await TaskModel.updateMany(filter, { $set: set });
      }
      if (items) {
        const doneIds = items.filter((it) => it.done).map((it) => it.id);
        const doneByDate = withChecklistDone(
          doc.checklistDoneByDate,
          targetDate,
          doneIds,
        );
        await TaskModel.updateOne(
          { userId: uid, id: taskId },
          { $set: { checklistDoneByDate: doneByDate } },
        );
        nextDoc.checklist = checklistContent(items);
        nextDoc.checklistDoneByDate = doneByDate;
      }
    } else {
      if (items) set.checklist = items;
      if (Object.keys(set).length)
        await TaskModel.updateOne({ userId: uid, id: taskId }, { $set: set });
      if (items) nextDoc.checklist = items;
    }

    // Checked steps pay their markers straight away and keep them, so an
    // abandoned checklist still earns what it got through. Completing the task
    // releases nothing extra, so steps still pay after it is marked done.
    let flyStatus: FlyStatus | undefined;
    let hungerStatus: HungerStatus | undefined;
    const occurrenceDate = doc.type === 'weekly' ? viewDate : doc.date;
    if (items?.length && occurrenceDate && doc.type !== 'backlog') {
      const economyTz = await resolveEconomyTimezone(uid, tz);
      const economyConfig = await loadFlyEconomyConfig();
      const value = taskFlyBreakdown(
        nextDoc,
        occurrenceDate,
        0,
        false,
        economyConfig.taskStreak.tiers,
        economyConfig.checklist.tiers,
      );
      const payable = isPayableOccurrenceDate(
        occurrenceDate,
        getZonedToday(economyTz),
        economyConfig.taskIncome.backdateGraceHours,
      );
      if (value.total > 0) {
        const res = await awardFlyForTask(
          uid,
          taskId,
          economyTz,
          payable,
          value,
          { topUp: true, countTask: false, occurrenceDate, payable },
        );
        flyStatus = res.flyStatus;
        hungerStatus = res.hungerStatus;
        if (res.awarded) void syncGamification(uid, tz);
      }
    }
    await notifyTaskChanged(uid);
    return NextResponse.json({ ok: true, flyStatus, hungerStatus });
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
          $set: {
            type: 'regular',
            date,
            completed: isCompletedToday,
            ...(doc.checklist?.length
              ? { checklist: checklistForDate(doc, date) }
              : {}),
          },
          $unset: {
            dayOfWeek: 1,
            suppressedDates: 1,
            completedDates: 1,
            repeatStartDate: 1,
            checklistDoneByDate: 1,
          },
        },
      );
    } else {
      const dow = dowFromYMD(date);
      const doneIds = (doc.checklist ?? [])
        .filter((c) => c.done)
        .map((c) => c.id);
      await TaskModel.updateOne(
        { userId: uid, id: taskId },
        {
          $set: {
            type: 'weekly',
            dayOfWeek: dow,
            completedDates: doc.completed ? [date] : [],
            repeatStartDate: date,
            ...(doc.checklist?.length
              ? { checklist: checklistContent(doc.checklist) }
              : {}),
            ...(doneIds.length
              ? { checklistDoneByDate: { [date]: doneIds } }
              : {}),
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
    if (body.scope === 'all' && taskId) {
      await syncPactCommitmentText({ userId: uid, taskId, text: body.text });
    }
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
  const lateForStreak =
    completed === true && !isWithinStreakCreditWindow(date, getZonedToday(tz));
  const update =
    completed === true
      ? lateForStreak
        ? { $addToSet: { completedDates: date, lateCompletedDates: date } }
        : {
            $addToSet: { completedDates: date },
            $pull: { lateCompletedDates: date },
          }
      : { $pull: { completedDates: date, lateCompletedDates: date } };
  if (completed === true)
    (update as any).$set = {
      ...(update as any).$set,
      [`completedAtByDate.${date}`]: new Date(),
    };
  else
    (update as any).$unset = {
      ...(update as any).$unset,
      [`completedAtByDate.${date}`]: 1,
    };
  if (doc.type === 'regular')
    (update as any).$set = { ...(update as any).$set, completed };

  if (typeof order === 'number')
    (update as any).$set = { ...((update as any).$set || {}), order };
  await TaskModel.updateOne({ userId: uid, id: taskId }, update);
  let flyStatus: FlyStatus | undefined;
  let hungerStatus: HungerStatus | undefined;
  let dailyTasksCount: number | undefined;
  let awarded = false;
  let granted = 0;
  let jar: JarStatus | undefined;
  let milestone: MilestonePayout | undefined;
  let milestonesQueued = 0;
  const isTodayCompletion = date === getZonedToday(tz);
  // Fly accounting runs on the zone the server has agreed to, not on whatever
  // the request happens to claim, so a timezone flip can't reopen the day.
  const economyTz = await resolveEconomyTimezone(uid, tz);
  const economyConfig = await loadFlyEconomyConfig();
  const payable = isPayableOccurrenceDate(
    date,
    getZonedToday(economyTz),
    economyConfig.taskIncome.backdateGraceHours,
  );
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
      economyTz,
      payable,
      taskFlyBreakdown(
        doc,
        date,
        streakNow,
        true,
        economyConfig.taskStreak.tiers,
        economyConfig.checklist.tiers,
      ),
      { topUp: true, countTask: isTodayCompletion, occurrenceDate: date, payable },
    );
    await lockChecklistBudget(uid, doc, date, economyConfig.checklist.tiers);
    flyStatus = res.flyStatus;
    hungerStatus = res.hungerStatus;
    dailyTasksCount = res.dailyTasksCount;
    awarded = res.awarded;
    granted = res.granted;
    jar = res.jar;
  } else if (!completed) {
    ({ flyStatus, hungerStatus, dailyTasksCount } = await unawardFlyForTask(
      uid,
      taskId,
      economyTz,
      payable,
      date,
    ));
  } else {
    ({ flyStatus, hungerStatus, dailyTasksCount } = await currentFlyStatus(
      uid,
      economyTz,
    ));
  }
  if (doc.bondId) {
    await handleBuddyCompletion({
      bondId: doc.bondId,
      userId: uid,
      date,
      completed,
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
  // Milestones are their own event: one-time per task, one payout a day across
  // all of them, and outside the day's task-income budget.
  if (completed && !alreadyCompletedForDate && freshWeekly && payable) {
    const result = await creditTaskStreakMilestones({
      userId: uid,
      groupKey: streakGroupKey(freshWeekly),
      taskId: freshWeekly.id,
      taskText: freshWeekly.text,
      streak: streakNow,
      dayKey: getZonedToday(economyTz),
    }).catch((error) => {
      console.error('Streak milestone failed:', error);
      return null;
    });
    milestone = result?.paid ?? undefined;
    milestonesQueued = result?.queued ?? 0;
  }
  void syncGamification(uid, tz);
  await notifyTaskChanged(uid, {
    eventKind: completed ? 'task-completed' : 'task-uncompleted',
    taskId,
    completed,
    date,
  });
  if (completed !== alreadyCompletedForDate) {
    const analyticsUser = await UserModel.findById(uid).select('focusProfile').lean();
    await recordAnalyticsEvent({
      userId: uid,
      name: completed ? 'task_completed' : 'task_reopened',
      properties: taskAnalyticsProperties(doc, analyticsUser?.focusProfile, {
        streak_length: streakNow,
      }),
    });
  }
  if (completed && !alreadyCompletedForDate && awarded) {
    await recordAnalyticsEvent({
      userId: uid,
      name: 'fly_earned',
      properties: {
        source: doc.bondId ? 'buddy_task' : 'task',
        fly_amount: granted,
        is_premium: !!flyStatus?.isPremium,
      },
    });
  }
  return NextResponse.json({
    ok: true,
    awarded,
    granted,
    flyStatus,
    hungerStatus,
    dailyTasksCount,
    jar,
    milestone,
    milestonesQueued: milestonesQueued || undefined,
    lateForStreak: lateForStreak && doc.type === 'weekly' ? true : undefined,
  });
}

async function recordTaskDeleted(
  userId: string,
  docs: Array<Partial<TaskDoc>>,
  scope: string,
) {
  if (!docs.length) return;
  const profile = await UserModel.findById(userId).select('focusProfile').lean();
  const primary = docs[0];
  await recordAnalyticsEvent({
    userId,
    name: 'task_deleted',
    properties: taskAnalyticsProperties(primary, profile?.focusProfile, {
      count: docs.length,
      reason: scope,
    }),
  });
}

export async function DELETE(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();
  await connectMongo();
  const body = await req.json();
  const tz = body.timezone || 'UTC';

  if (typeof body.creationBatchId === 'string') {
    const creationBatchId = body.creationBatchId.trim();
    if (!/^[0-9a-f-]{36}$/i.test(creationBatchId)) {
      return NextResponse.json({ error: 'Invalid batch id' }, { status: 400 });
    }
    const hasProgress = await TaskModel.exists({
      userId: uid,
      creationBatchId,
      $or: [
        { completed: true },
        { 'completedDates.0': { $exists: true } },
        { 'checklist.done': true },
        { 'frogodoroSessions.0': { $exists: true } },
      ],
    });
    if (hasProgress) {
      return NextResponse.json(
        { error: 'This batch can no longer be undone because work has started.' },
        { status: 409 },
      );
    }
    const batchDocs = await TaskModel.find({ userId: uid, creationBatchId })
      .select('type tags repeatMode bondId checklist startTime endTime reminder')
      .lean<TaskDoc[]>();
    const deleted = await TaskModel.deleteMany({ userId: uid, creationBatchId });
    await recordTaskDeleted(uid, batchDocs, 'batch_undo');
    await syncGamification(uid, tz);
    await notifyTaskChanged(uid);
    return NextResponse.json({ ok: true, deletedCount: deleted.deletedCount });
  }

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
    // Before anything is removed: a Leap reads its own tasks to decide what
    // this deletion costs the week, and nothing can be read once they are gone.
    const pactChange = await applyPactTaskRemoval({
      userId: uid,
      timezone: tz,
      taskIds: seriesDocs.map((s) => s.id),
    });
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
          completedAtByDate: s.completedAtByDate?.[d]
            ? { [d]: s.completedAtByDate[d] }
            : undefined,
          tags: s.tags ?? [],
          notes: s.notes ?? '',
          checklist: checklistForDate(s, d),
          startTime: s.startTime,
          endTime: s.endTime,
          reminder: s.reminder,
          frogodoroSettings: isOriginal ? s.frogodoroSettings : undefined,
          frogodoroSessions: session ? [session] : [],
          // Preserving past occurrences of a deleted series adds no new tasks.
          createdAt: s.createdAt ?? now,
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
    await recordTaskDeleted(uid, seriesDocs, 'series');
    await syncGamification(uid, tz);
    await notifyTaskChanged(uid);
    return NextResponse.json({ ok: true, pact: pactChange });
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
      { type: 1, bondId: 1 },
    )
      .lean<TaskDoc>()
      .exec();
    const pactChange = await applyPactTaskRemoval({
      userId: uid,
      timezone: tz,
      taskIds: [taskId],
    });
    if (doc?.type === 'regular') {
      await TaskModel.deleteOne({ userId: uid, type: 'regular', id: taskId });
      if (doc.bondId) await severBond(doc.bondId, uid);
      await recordTaskDeleted(uid, [doc], 'single');
    } else if (doc?.type === 'weekly') {
      await TaskModel.updateOne(
        { userId: uid, type: doc.type, id: taskId },
        { $addToSet: { suppressedDates: dateKey } },
      );
    }
    await syncGamification(uid, tz);
    await notifyTaskChanged(uid);
    return NextResponse.json({ ok: true, pact: pactChange });
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
    const pactChange = await applyPactTaskRemoval({
      userId: uid,
      timezone: tz,
      taskIds: [taskId],
    });
    await TaskModel.updateOne(
      { userId: uid, id: taskId },
      { $addToSet: { suppressedDates: date } },
    );
    await recordTaskDeleted(uid, [doc], 'occurrence');
    await syncGamification(uid, tz);
    await notifyTaskChanged(uid);
    return NextResponse.json({ ok: true, pact: pactChange });
  }
  if (doc.type === 'regular') {
    await TaskModel.deleteOne({ userId: uid, id: taskId, date });
    if (doc.bondId) await severBond(doc.bondId, uid);
    await recordTaskDeleted(uid, [doc], 'single');
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
  const economyConfig = await loadFlyEconomyConfig();
  const output = filtered
    .map((t: TaskDoc) => {
      const completed =
        (t.completedDates ?? []).includes(date) ||
        (!!t.completed && t.type === 'regular');
      const streak = t.type === 'weekly' ? streakMap.get(t.id) ?? 0 : 0;
      // What the row would pay if it were ticked now — the streak rate it is
      // about to reach, not the one it is on. Computed here so every surface
      // shows the same number the completion will actually pay.
      const projectedStreak =
        date === todayLocal && t.type === 'weekly'
          ? streak + (completed ? 0 : 1)
          : 0;
      return {
      id: t.id,
      text: t.text,
      order: t.orderOverrides?.[date] ?? t.order ?? 0,
      completed,
      type: t.type,
      origin: t.type as Origin,
      tags: t.tags ?? [],
      notes: t.notes ?? '',
      checklist: checklistForDate(t, date),
      repeatMode: t.repeatMode,
      repeatGroupId: t.repeatGroupId,
      repeatStartDate: repeatStartForDoc(t, tz),
      repeatEndDate: t.repeatEndDate,
      repeatDayOfMonth: t.repeatDayOfMonth,
      repeatRule: t.repeatRule,
      dayOfWeek: t.dayOfWeek,
      completedDates: t.completedDates ?? [],
      streak,
      flyWorth: taskFlyWorthNow({
        checklist: checklistForDate(t, date),
        streak: projectedStreak,
        budgetLock: t.checklistBudgetByDate?.[date],
        tiers: economyConfig.taskStreak.tiers,
        checklistTiers: economyConfig.checklist.tiers,
      }),
      frogodoroSettings: t.frogodoroSettings,
      frogodoroSession: sessionForRow(t, date),
      calendarEventId: t.calendarEventId,
      startTime: t.startTime,
      endTime: t.endTime,
      reminder: t.reminder,
      isStarter: t.isStarter,
      sectionId: t.sectionId,
      };
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (date === todayLocal) {
    // A queue built up on a busy day drains itself here: no cron, and the user
    // meets yesterday's milestone the next time they open the list.
    void drainTaskStreakQueue({ userId, dayKey: todayLocal }).catch((error) => {
      console.error('Streak milestone drain failed:', error);
    });
  }
  const [{ flyStatus, hungerStatus, dailyTasksCount }, sectionDocs] =
    await Promise.all([
      currentFlyStatus(userId, tz),
      TaskSectionModel.find({ userId }).sort({ order: 1 }).lean(),
    ]);
  return NextResponse.json({
    date,
    tasks: output,
    weeklyIds: Array.from(weeklyIdsForUI),
    sections: sectionDocs.map((s) => ({
      id: s.id,
      name: s.name,
      order: s.order,
      collapsed: isSectionCollapsedOn(s, getZonedToday(tz)),
      tagIds: s.tagIds ?? [],
    })),
    flyStatus,
    hungerStatus,
    dailyTasksCount,
  });
}

async function handleBoardGet(req: NextRequest, uid: string, tz: string) {
  const { weekStart, weekDates } = getRollingWeekDatesZoned(tz, await weekStartFor(uid));
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
        frogodoroSession: sessionForRow(t, weekDates[dayNum]),
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
          frogodoroSession: sessionForRow(doc, date),
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
      frogodoroSession: sessionForRow(doc, date),
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

  const { weekStart } = getRollingWeekDatesZoned(tz, await weekStartFor(uid));

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
        isTutorial: doc.isTutorial,
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
        frogodoroSession: sessionForRow(doc, doc.date!),
        calendarEventId: doc.calendarEventId,
        startTime: doc.startTime,
        endTime: doc.endTime,
        reminder: doc.reminder,
        isTutorial: doc.isTutorial,
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
          checklist: checklistForDate(doc, d),
          repeatMode: doc.repeatMode,
          repeatStartDate: repeatStart,
          repeatEndDate: doc.repeatEndDate,
          repeatRule: doc.repeatRule,
          dayOfWeek: dowFromYMD(d),
          frogodoroSession: sessionForRow(doc, d),
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
          checklist: checklistForDate(doc, d),
          repeatMode: doc.repeatMode,
          repeatStartDate: repeatStart,
          repeatEndDate: doc.repeatEndDate,
          repeatDayOfMonth: doc.repeatDayOfMonth,
          dayOfWeek: dowFromYMD(d),
          frogodoroSession: sessionForRow(doc, d),
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
          checklist: checklistForDate(doc, d),
          repeatMode: doc.repeatMode,
          repeatGroupId: doc.repeatGroupId,
          repeatStartDate: repeatStart,
          repeatEndDate: doc.repeatEndDate,
          dayOfWeek: doc.dayOfWeek,
          frogodoroSession: sessionForRow(doc, d),
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

type ChecklistItemInput = {
  id: string;
  text: string;
  done: boolean;
  reward?: boolean;
};

/** Coerce a request-provided checklist into the stored shape, or undefined. */
function sanitizeChecklistInput(
  value: unknown,
): ChecklistItemInput[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .filter(
      (it: unknown): it is Record<string, unknown> =>
        !!it && typeof it === 'object',
    )
    .map((it: Record<string, unknown>) => ({
      id: String(it.id ?? ''),
      text: String(it.text ?? ''),
      done: Boolean(it.done),
      ...(it.reward ? { reward: true } : {}),
    }));
  return normalizeChecklistRewards(items);
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
  sectionId?: string | null;
};

/**
 * Section assignment for a reordered task. `sectionId: null` explicitly clears
 * the section; an absent property leaves the stored value untouched.
 */
function sectionOps(t: { sectionId?: string | null } | undefined): {
  set: Record<string, unknown>;
  unset: Record<string, 1>;
} {
  if (!t || !('sectionId' in t)) return { set: {}, unset: {} };
  if (typeof t.sectionId === 'string' && t.sectionId)
    return { set: { sectionId: t.sectionId }, unset: {} };
  return { set: {}, unset: { sectionId: 1 } };
}

async function applySectionToSeries(
  userId: string,
  doc: { id: string; repeatGroupId?: string } | undefined,
  sec: { set: Record<string, unknown>; unset: Record<string, 1> },
) {
  if (!doc?.repeatGroupId) return;
  const hasSet = Object.keys(sec.set).length > 0;
  const hasUnset = Object.keys(sec.unset).length > 0;
  if (!hasSet && !hasUnset) return;
  await TaskModel.updateMany(
    { userId, repeatGroupId: doc.repeatGroupId, id: { $ne: doc.id } },
    {
      ...(hasSet ? { $set: sec.set } : {}),
      ...(hasUnset ? { $unset: sec.unset } : {}),
    },
  );
}

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
  const { weekStart, weekDates } = getRollingWeekDatesZoned(tz, await weekStartFor(uid));
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
      { id: 1, text: 1, type: 1, tags: 1, notes: 1, checklist: 1, calendarEventId: 1, startTime: 1, endTime: 1, reminder: 1, isTutorial: 1 },
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
    const tutorialById = new Map<string, boolean | undefined>();

    for (const d of docs) {
      tutorialById.set(d.id, d.isTutorial);
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
              // A fresh backlog doc is inserted and the regular one deleted, so
              // the flag has to be carried across or the practice card is
              // orphaned and can never be cleaned up.
              ...(tutorialById.get(id) ? { isTutorial: true } : {}),
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
    { id: 1, type: 1, text: 1, tags: 1, notes: 1, checklist: 1, calendarEventId: 1, startTime: 1, endTime: 1, reminder: 1, repeatGroupId: 1 },
  )
    .lean<TaskDoc[]>()
    .exec();
  const typeById = new Map(docs.map((d) => [d.id, d.type]));
  const docById = new Map(docs.map((d) => [d.id, d]));
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

      const sec = sectionOps(t);
      const secUnset = Object.keys(sec.unset).length
        ? { $unset: sec.unset }
        : {};
      if (ttype === 'weekly')
        return Promise.all([
          TaskModel.updateOne(
            { userId: uid, type: 'weekly', id: t.id },
            {
              $set: {
                dayOfWeek: weekday,
                order: i + 1,
                [`orderOverrides.${weekDates[weekday]}`]: i + 1,
                updatedAt: now,
                tags,
                ...sec.set,
              },
              ...secUnset,
            },
          ),
          applySectionToSeries(uid, docById.get(t.id), sec),
        ]);
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
              ...sec.set,
            },
            ...secUnset,
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
                ...sec.set,
              },
              ...secUnset,
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
            ...sec.set,
          },
          ...secUnset,
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
      repeatGroupId: 1,
      frogodoroSessions: 1,
      isTutorial: 1,
    },
  )
    .lean<TaskDoc[]>()
    .exec();
  // A cross-day move deletes the task from the source column before the
  // destination column upserts it, so the destination write is an insert and
  // anything not in the payload is lost. The client round-trips this flag.
  const tutorialById = new Map<string, boolean>(
    (tasks as Array<{ id: string; isTutorial?: boolean }>).map((t) => [
      t.id,
      !!t.isTutorial,
    ]),
  );
  const tutorialFields = (id: string, srcDoc?: TaskDoc) =>
    tutorialById.get(id) || srcDoc?.isTutorial ? { isTutorial: true } : {};
  const typeById = new Map(docs.map((d) => [d.id, d.type]));
  const docById = new Map(docs.map((d) => [d.id, d]));
  const textById = new Map(docs.map((d) => [d.id, d.text]));
  const tagsById = new Map(docs.map((d) => [d.id, d.tags ?? []]));
  const notesById = new Map(docs.map((d) => [d.id, d.notes]));
  const checklistById = new Map(docs.map((d) => [d.id, d.checklist]));
  const weekday = dowFromYMD(dateKey);
  const { weekStart } = getRollingWeekDatesZoned(tz, await weekStartFor(uid));

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
      // Sessions record the day the work happened, so they are never rewritten
      // from the client's view of a column. The backlog path replaces the doc,
      // so its log is carried over from the source doc untouched.
      const frogodoroFields = srcDoc?.frogodoroSessions?.length
        ? { frogodoroSessions: srcDoc.frogodoroSessions }
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
          const sec = sectionOps(t);
          return Promise.all([
            TaskModel.updateOne(
              { userId: uid, id: t.id },
              {
                $set: {
                  [`orderOverrides.${dateKey}`]: i + 1,
                  updatedAt: now,
                  tags,
                  ...sec.set,
                },
                ...(Object.keys(sec.unset).length ? { $unset: sec.unset } : {}),
              },
            ),
            applySectionToSeries(uid, doc, sec),
          ]);
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
              ...sectionOps(t).set,
            },
            $unset: {
              dayOfWeek: 1,
              repeatMode: 1,
              repeatGroupId: 1,
              repeatRule: 1,
              repeatDayOfMonth: 1,
              repeatStartDate: 1,
              repeatEndDate: 1,
              checklistDoneByDate: 1,
              ...sectionOps(t).unset,
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
                // The backlog doc is deleted and a fresh regular one inserted,
                // so anything not carried across here is lost — and a practice
                // card that loses this flag can never be cleaned up.
                ...tutorialFields(t.id, srcDoc),
              },
              $setOnInsert: { userId: uid, type: 'regular', createdAt: now },
            },
            { upsert: true },
          ),
        ]);
      // regular or unknown -> upsert as regular on this date
      const sec = sectionOps(t);
      return TaskModel.updateOne(
        { userId: uid, type: 'regular', id: t.id },
        {
          $set: {
            text: textFromReq,
            tags,
            notes,
            checklist,
            ...scheduleFields,
            date: dateKey,
            order: i + 1,
            updatedAt: now,
            ...sec.set,
            ...tutorialFields(t.id, srcDoc),
          },
          ...(Object.keys(sec.unset).length ? { $unset: sec.unset } : {}),
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
    const { weekStart } = getRollingWeekDatesZoned(tz, await weekStartFor(uid));
    const backlogDoc = await TaskModel.findOne(
      { userId: uid, type: 'backlog', weekStart, id: taskId },
      { bondId: 1 },
    )
      .lean<TaskDoc>()
      .exec();
    await TaskModel.deleteOne({
      userId: uid,
      type: 'backlog',
      weekStart,
      id: taskId,
    });
    if (backlogDoc?.bondId) await severBond(backlogDoc.bondId, uid);
    await syncGamification(uid, tz);
    await notifyTaskChanged(uid);
    return NextResponse.json({ ok: true });
  }
  const doc = await TaskModel.findOne(
    { userId: uid, id: taskId },
    { type: 1, bondId: 1 },
  )
    .lean<TaskDoc>()
    .exec();
  if (doc?.type === 'regular') {
    await TaskModel.deleteOne({ userId: uid, type: 'regular', id: taskId });
    if (doc.bondId) await severBond(doc.bondId, uid);
    await syncGamification(uid, tz);
    await notifyTaskChanged(uid);
    return NextResponse.json({ ok: true });
  }
  let pactChange: PactTaskRemovalResult | undefined;
  if (doc?.type === 'weekly') {
    pactChange = await applyPactTaskRemoval({
      userId: uid,
      timezone: tz,
      taskIds: [taskId],
    });
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
  if (doc?.bondId) await severBond(doc.bondId, uid);
  await syncGamification(uid, tz);
  await notifyTaskChanged(uid);
  return NextResponse.json({ ok: true, pact: pactChange });
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

/**
 * Renumbers a day column so `movedIds` sit at slot `atIndex` among the tasks
 * that stayed. A bulk move otherwise appends every task with nextOrderForDay,
 * which is why dropping a multi-selection between two cards used to land it at
 * the bottom once the board refetched — a single-card drag persists the whole
 * column's order (handleBoardPutByDate) and so kept its slot.
 *
 * Repeating occurrences carry a per-date order (`orderOverrides`), one-offs
 * carry a plain `order`; both read back through the same
 * `orderOverrides[date] ?? order` in every GET.
 */
async function placeTasksInDay(
  userId: string,
  date: string,
  movedIds: string[],
  atIndex: number,
  now: Date,
  tz: string,
) {
  const dow = dowFromYMD(date);
  const docs = await TaskModel.find({
    userId,
    $or: [
      { type: 'weekly', deletedAt: { $exists: false }, dayOfWeek: dow },
      { type: 'weekly', deletedAt: { $exists: false }, repeatMode: 'monthly' },
      {
        type: 'weekly',
        deletedAt: { $exists: false },
        repeatRule: { $exists: true },
      },
      { type: 'regular', deletedAt: { $exists: false }, date },
    ],
  })
    .lean<TaskDoc[]>()
    .exec();

  const onThisDay = docs.filter((d) => {
    if ((d.suppressedDates ?? []).includes(date)) return false;
    if (d.type === 'regular') return d.date === date;
    const start = repeatStartForDoc(d, tz);
    if (start && date < start) return false;
    return siblingOccursOn(d, date);
  });

  const orderOf = (d: TaskDoc) => d.orderOverrides?.[date] ?? d.order ?? 0;
  const moved = new Set(movedIds);
  const stayed = onThisDay
    .filter((d) => !moved.has(d.id))
    .sort((a, b) => orderOf(a) - orderOf(b));
  const byId = new Map(onThisDay.map((d) => [d.id, d]));
  const incoming = Array.from(new Set(movedIds))
    .map((id) => byId.get(id))
    .filter((d): d is TaskDoc => !!d);
  if (incoming.length === 0) return;

  const at = Math.max(0, Math.min(atIndex, stayed.length));
  const final = [...stayed.slice(0, at), ...incoming, ...stayed.slice(at)];

  await TaskModel.bulkWrite(
    final.map((d, i) => ({
      updateOne: {
        filter: { userId, id: d.id },
        update: {
          $set:
            d.type === 'weekly'
              ? { [`orderOverrides.${date}`]: i + 1, updatedAt: now }
              : { order: i + 1, updatedAt: now },
        },
      },
    })),
  );
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

