import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import TaskModel, { type TaskDoc } from '@/lib/models/Task';
import LeapWeekModel, { type LeapWeekDoc } from '@/lib/models/LeapWeek';
import { isPremiumUser } from '@/lib/quests/engine';
import { getZonedToday } from '@/lib/utils';
import { normalizeWeekStart, shiftYMD, type WeekStartDay } from '@/lib/weekStart';
import { loadLeapConfig } from './config';
import { settleLeapWeeks } from './settle';
import { ensureLeapState, leagueMultiplier, type LeapState } from './state';
import {
  LEAP_TASK_FIELDS,
  leapHabitFilter,
  readLeapWeek,
  weekKeyFor,
  type LeapLedger,
} from './week';
import type { LeapConfigView } from './types';

export type LeapContext = {
  userId: string;
  timezone: string;
  config: LeapConfigView;
  user: any;
  isPremium: boolean;
  weekStartsOn: WeekStartDay;
  todayKey: string;
  currentWeek: string;
  state: LeapState;
  tasks: TaskDoc[];
  weekDoc: LeapWeekDoc;
  ledger: LeapLedger;
};

export async function loadLeapContext(args: {
  userId: string;
  timezone: string;
}): Promise<LeapContext | null> {
  const { userId, timezone } = args;
  await connectMongo();
  const config = await loadLeapConfig();
  if (!config.isActive) return null;

  const user = await UserModel.findById(userId)
    .select('quests premiumUntil weekStartsOn')
    .lean<any>();
  if (!user) return null;
  const isPremium = isPremiumUser(user);
  const weekStartsOn = normalizeWeekStart(user.weekStartsOn);
  const todayKey = getZonedToday(timezone);
  const currentWeek = weekKeyFor(todayKey, weekStartsOn);

  let state = await ensureLeapState({ userId, user, currentWeek, config });
  const tasks = await TaskModel.find(leapHabitFilter(userId), LEAP_TASK_FIELDS)
    .lean<TaskDoc[]>()
    .exec();

  state = await settleLeapWeeks({
    userId,
    config,
    state,
    tasks,
    todayKey,
    currentWeek,
    weekStartsOn,
    timezone,
    isPremium,
  });

  let weekDoc = await LeapWeekModel.findOne({
    userId,
    weekKey: currentWeek,
  }).lean<LeapWeekDoc>();
  if (!weekDoc) {
    const overlap = await LeapWeekModel.findOne({
      userId,
      weekKey: { $gte: shiftYMD(currentWeek, -6), $lte: shiftYMD(currentWeek, 6) },
    }).lean<LeapWeekDoc>();
    weekDoc = await LeapWeekModel.findOneAndUpdate(
      { userId, weekKey: currentWeek },
      {
        $setOnInsert: {
          multiplier:
            overlap?.multiplier ?? leagueMultiplier(config, state.league),
          league: overlap?.league ?? state.league,
          ...(overlap
            ? {
                hopKeys: overlap.hopKeys ?? [],
                marks: overlap.marks ?? [],
                hopsPaidByDay: overlap.hopsPaidByDay ?? {},
                luckyByDay: overlap.luckyByDay ?? {},
                comebacksByDay: overlap.comebacksByDay ?? {},
              }
            : {}),
        },
      },
      { upsert: true, new: true },
    ).lean<LeapWeekDoc>();
  }
  if (!weekDoc) return null;

  const ledger = readLeapWeek({
    tasks,
    weekKey: currentWeek,
    weekStartsOn,
    todayKey,
    timezone,
    bankedKeys: weekDoc.hopKeys ?? [],
  });

  return {
    userId,
    timezone,
    config,
    user,
    isPremium,
    weekStartsOn,
    todayKey,
    currentWeek,
    state,
    tasks,
    weekDoc,
    ledger,
  };
}
