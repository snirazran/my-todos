import TaskModel, { type TaskDoc } from '@/lib/models/Task';
import UserModel from '@/lib/models/User';
import connectMongo from '@/lib/mongoose';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import { isPremiumUser } from '@/lib/quests/engine';
import { getZonedToday } from '@/lib/utils';
import { normalizeWeekStart, weekDatesFor, weekOrder } from '@/lib/weekStart';
import type { Weekday } from '@/lib/models/Task';
import {
  ensurePactConfig,
  findLivePact,
  pactMoveAllowance,
  pactMoveTargets,
  readPactSessionStates,
} from './engine';

export class PactMoveError extends Error {}

export type PactMoveResult = {
  taskId: string;
  fromDay: number;
  toDay: number;
  movesLeft: number;
};

/**
 * Moves one unfinished session of the running week onto another day.
 *
 * Every rule here exists to keep this from becoming a way to earn more than
 * the work is worth: the session count never changes, so the week's price
 * never changes, and a moved session still has to be done. A completed session
 * cannot move (there would be nothing to reschedule), and nothing can move
 * into the past (that is the catch-up window's job, and it asks a different
 * question — "did you do it?" rather than "when will you?").
 */
export async function movePactSession(args: {
  userId: string;
  timezone: string;
  taskId: string;
  toDay: number;
}): Promise<PactMoveResult> {
  const { userId, timezone, taskId } = args;
  await connectMongo();

  const toDay = Math.floor(Number(args.toDay));
  if (!Number.isInteger(toDay) || toDay < 0 || toDay > 6) {
    throw new PactMoveError('That day is not a day of the week');
  }

  const user = await UserModel.findById(userId);
  if (!user) throw new PactMoveError('User not found');
  const weekStartsOn = normalizeWeekStart(user.weekStartsOn);
  const todayKey = getZonedToday(timezone);

  const { pact } = await findLivePact({ userId, timezone });
  if (!pact || pact.status === 'skipped') {
    throw new PactMoveError('No Leap running this week');
  }
  if (!(pact.taskIds ?? []).includes(taskId)) {
    throw new PactMoveError('That session is not part of this Leap');
  }

  const config = await ensurePactConfig();
  const allowance = pactMoveAllowance(config, isPremiumUser(user.toObject()));
  const used = Math.max(0, pact.movesUsed ?? 0);
  if (allowance <= 0) throw new PactMoveError('Moving is switched off');
  if (used >= allowance) {
    throw new PactMoveError('No moves left this week');
  }

  const tasks = await TaskModel.find({
    userId,
    id: { $in: pact.taskIds ?? [] },
    deletedAt: { $exists: false },
  }).lean<TaskDoc[]>();

  const states = readPactSessionStates({
    pact,
    tasks,
    timezone,
    weekStartsOn,
    todayKey,
  });
  const session = states.find((entry) => entry.taskId === taskId);
  if (!session) throw new PactMoveError('That session is no longer on the board');
  if (session.state === 'done') {
    throw new PactMoveError('That one is already done');
  }

  const targets = pactMoveTargets({ pact, weekStartsOn, todayKey });
  if (!targets.includes(toDay)) {
    throw new PactMoveError('That day is already taken or already gone');
  }

  const order = weekOrder(weekStartsOn);
  const dates = weekDatesFor(pact.weekKey, weekStartsOn);
  const toDate = dates[order.indexOf(toDay as Weekday)];
  const fromDay = session.dayOfWeek;

  // Occurrence is decided by `dayOfWeek` for every non-custom repeat, so the
  // day and its anchor date are the whole move. The end date still bounds the
  // task to this week, which is what keeps a moved session from reappearing.
  const last = await TaskModel.findOne(
    {
      userId,
      deletedAt: { $exists: false },
      $or: [
        { type: 'weekly', dayOfWeek: toDay as Weekday },
        { type: 'regular', date: toDate },
      ],
    },
    { order: 1 },
  )
    .sort({ order: -1 })
    .lean<{ order?: number } | null>();

  await TaskModel.updateOne(
    { userId, id: taskId },
    {
      $set: {
        dayOfWeek: toDay,
        repeatStartDate: toDate,
        order: (last?.order ?? 0) + 1,
        updatedAt: new Date(),
      },
    },
  );

  pact.days = Array.from(
    new Set([...(pact.days ?? []).filter((day) => day !== fromDay), toDay]),
  ).sort((a, b) => a - b);
  pact.movesUsed = used + 1;
  await pact.save();

  await recordAnalyticsEvent({
    userId,
    name: 'pact_session_moved',
    properties: {
      week_key: pact.weekKey,
      category_id: pact.categoryId,
      from_day: fromDay,
      to_day: toDay,
      // The case the feature exists for, kept apart from planning ahead.
      was_missed: session.state === 'missed',
      moves_used: pact.movesUsed,
    },
  });

  return {
    taskId,
    fromDay,
    toDay,
    movesLeft: Math.max(0, allowance - pact.movesUsed),
  };
}
