export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import TaskModel, { type TaskDoc, type Weekday } from '@/lib/models/Task';
import UserModel, { type UserDoc } from '@/lib/models/User';
import { syncQuestState } from '@/lib/quests/engine';
import { getZonedToday, getZonedYMD } from '@/lib/utils';
import {
  calculateHunger,
  MAX_HUNGER_MS,
  TASK_HUNGER_REWARD_MS,
} from '@/lib/hungerLogic';

type MissedAction = 'dismiss' | 'complete' | 'save-later' | 'do-today';
type RepeatMoveMode = 'change-repeat' | 'just-once';

function unauth() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function addDaysYMD(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function dowFromYMD(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay() as Weekday;
}

function weekStartForYMD(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().split('T')[0];
}

function isPremium(user: Pick<UserDoc, 'premiumUntil'> | null) {
  return !!user?.premiumUntil && new Date(user.premiumUntil) > new Date();
}

function existedOnDate(task: TaskDoc, date: string, timezone: string) {
  if (task.createdAt && getZonedYMD(task.createdAt, timezone) > date) {
    return false;
  }
  if (task.deletedAt && getZonedYMD(task.deletedAt, timezone) <= date) {
    return false;
  }
  return true;
}

function isCompletedOnDate(task: TaskDoc, date: string) {
  return (
    (task.completedDates ?? []).includes(date) ||
    (!!task.completed && task.type === 'regular')
  );
}

function toMissedItem(task: TaskDoc, date: string) {
  return {
    id: task.id,
    text: task.text,
    type: task.type,
    order: task.order ?? 0,
    completed: false,
    tags: task.tags ?? [],
    completedDates: task.completedDates ?? [],
    date,
    startTime: task.startTime,
    endTime: task.endTime,
    reminder: task.reminder,
  };
}

async function getMissedTasks(
  userId: string,
  date: string,
  timezone: string,
) {
  const dow = dowFromYMD(date);
  const tasks = await TaskModel.find({
    userId,
    $or: [
      { type: 'regular', date },
      { type: 'weekly', dayOfWeek: dow },
    ],
  })
    .sort({ order: 1 })
    .lean<TaskDoc[]>()
    .exec();

  return tasks
    .filter((task) => !(task.suppressedDates ?? []).includes(date))
    .filter((task) => existedOnDate(task, date, timezone))
    .filter((task) => !isCompletedOnDate(task, date))
    .map((task) => toMissedItem(task, date))
    .sort((a, b) => a.order - b.order);
}

async function getMissedTaskDoc(
  userId: string,
  taskId: string,
  date: string,
  timezone: string,
) {
  const dow = dowFromYMD(date);
  const task = await TaskModel.findOne({
    userId,
    id: taskId,
    $or: [
      { type: 'regular', date },
      { type: 'weekly', dayOfWeek: dow },
    ],
  })
    .lean<TaskDoc>()
    .exec();

  if (!task) return null;
  if ((task.suppressedDates ?? []).includes(date)) return null;
  if (!existedOnDate(task, date, timezone)) return null;
  if (isCompletedOnDate(task, date)) return null;
  return task;
}

async function nextOrderForDay(
  userId: string,
  weekday: Weekday,
  date: string,
) {
  const doc = await TaskModel.findOne(
    {
      userId,
      $or: [
        { type: 'weekly', dayOfWeek: weekday },
        { type: 'regular', date },
      ],
    },
    { order: 1 },
  )
    .sort({ order: -1 })
    .lean<TaskDoc>()
    .exec();
  return (doc?.order ?? 0) + 1;
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

async function getUserStatus(userId: string) {
  const user = await UserModel.findById(userId, {
    wardrobe: 1,
    premiumUntil: 1,
    missedReview: 1,
  }).lean<UserDoc>();

  if (!user) return null;

  const { updates } = calculateHunger(user);
  if (Object.keys(updates).length > 0) {
    await UserModel.updateOne({ _id: userId }, { $set: updates });
  }

  return {
    user,
    premium: isPremium(user),
    flyBalance: updates['wardrobe.flies'] ?? user.wardrobe?.flies ?? 0,
  };
}

async function raiseHungerForMissedCompletion(userId: string) {
  const user = await UserModel.findById(userId, {
    wardrobe: 1,
  }).lean<UserDoc>();

  if (!user) return { balance: 0, awarded: false };

  const { updates: hungerUpdates, status: hungerStatus } =
    calculateHunger(user);
  const wardrobe = user.wardrobe ?? { equipped: {}, inventory: {}, flies: 0 };
  const nextBalance = hungerUpdates['wardrobe.flies'] ?? wardrobe.flies ?? 0;

  const nextHunger = Math.min(
    MAX_HUNGER_MS,
    Math.max(0, hungerStatus.hunger) + TASK_HUNGER_REWARD_MS,
  );

  const setFields: Record<string, unknown> = {
    ...hungerUpdates,
    'wardrobe.hunger': nextHunger,
    'wardrobe.lastHungerUpdate': new Date(),
  };
  if (!user.wardrobe?.equipped) setFields['wardrobe.equipped'] = {};
  if (!user.wardrobe?.inventory) setFields['wardrobe.inventory'] = {};

  await UserModel.updateOne({ _id: userId }, { $set: setFields });

  return { balance: nextBalance, awarded: false };
}

async function completeMissedTask(userId: string, task: TaskDoc, date: string) {
  const update =
    task.type === 'regular'
      ? {
          $set: { completed: true, updatedAt: new Date() },
          $addToSet: { completedDates: date },
        }
      : {
          $set: { updatedAt: new Date() },
          $addToSet: { completedDates: date },
        };

  await TaskModel.updateOne({ userId, id: task.id }, update);
}

async function saveMissedTaskForLater(
  userId: string,
  task: TaskDoc,
  missedDate: string,
  today: string,
) {
  const now = new Date();
  const weekStart = weekStartForYMD(today);
  const order = await nextOrderBacklog(userId, weekStart);

  if (task.type === 'regular') {
    await TaskModel.updateOne(
      { userId, id: task.id, type: 'regular' },
      {
        $set: {
          type: 'backlog',
          weekStart,
          order,
          completed: false,
          updatedAt: now,
        },
        $unset: {
          date: 1,
          dayOfWeek: 1,
          completedDates: 1,
          suppressedDates: 1,
        },
      },
    );
    return task.id;
  }

  const newId = uuid();
  await Promise.all([
    TaskModel.updateOne(
      { userId, id: task.id, type: task.type },
      { $addToSet: { suppressedDates: missedDate }, $set: { updatedAt: now } },
    ),
    TaskModel.create({
      userId,
      type: 'backlog',
      id: newId,
      text: task.text,
      order,
      weekStart,
      completed: false,
      createdAt: now,
      updatedAt: now,
      tags: task.tags ?? [],
      startTime: task.startTime,
      endTime: task.endTime,
      reminder: task.reminder,
      frogodoroSettings: task.frogodoroSettings,
    }),
  ]);
  return newId;
}

async function moveMissedTaskToToday(
  userId: string,
  task: TaskDoc,
  missedDate: string,
  today: string,
  mode?: RepeatMoveMode,
) {
  const now = new Date();
  const todayDow = dowFromYMD(today);
  const order = await nextOrderForDay(userId, todayDow, today);

  if (task.type === 'regular') {
    await TaskModel.updateOne(
      { userId, id: task.id, type: 'regular' },
      {
        $set: {
          date: today,
          order,
          completed: false,
          updatedAt: now,
        },
        $pull: { completedDates: missedDate },
      },
    );
    return task.id;
  }

  if (task.type !== 'weekly') {
    throw new Error('Only tasks can be moved to today');
  }

  if (mode === 'change-repeat') {
    await TaskModel.updateOne(
      { userId, id: task.id, type: 'weekly' },
      {
        $set: {
          dayOfWeek: todayDow,
          order,
          updatedAt: now,
        },
      },
    );
    return task.id;
  }

  const newId = uuid();
  await Promise.all([
    TaskModel.updateOne(
      { userId, id: task.id, type: 'weekly' },
      { $addToSet: { suppressedDates: missedDate }, $set: { updatedAt: now } },
    ),
    TaskModel.create({
      userId,
      type: 'regular',
      id: newId,
      text: task.text,
      order,
      date: today,
      completed: false,
      createdAt: now,
      updatedAt: now,
      tags: task.tags ?? [],
      startTime: task.startTime,
      endTime: task.endTime,
      reminder: task.reminder,
      frogodoroSettings: task.frogodoroSettings,
    }),
  ]);
  return newId;
}

export async function GET(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return unauth();
  }

  await connectMongo();
  const timezone = req.nextUrl.searchParams.get('timezone') || 'UTC';
  const today = getZonedToday(timezone);
  const yesterday = addDaysYMD(today, -1);
  const status = await getUserStatus(userId);

  if (!status) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const reviewedToday = status.user.missedReview?.lastShownDate === today;
  const items = reviewedToday
    ? []
    : await getMissedTasks(userId, yesterday, timezone);

  return NextResponse.json({
    today,
    yesterday,
    reviewedToday,
    items,
    isPremium: status.premium,
    flyBalance: status.flyBalance,
    completionCost: 0,
  });
}

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return unauth();
  }

  await connectMongo();
  const body = await req.json();
  const timezone = body?.timezone || 'UTC';
  const today = getZonedToday(timezone);
  const yesterday = addDaysYMD(today, -1);
  const action = body?.action as MissedAction | undefined;

  if (action === 'dismiss') {
    await UserModel.updateOne(
      { _id: userId },
      { $set: { 'missedReview.lastShownDate': today } },
    );
    return NextResponse.json({ ok: true });
  }

  const taskId = String(body?.taskId ?? '');
  if (!action || !taskId) {
    return NextResponse.json(
      { error: 'action and taskId are required' },
      { status: 400 },
    );
  }

  const task = await getMissedTaskDoc(userId, taskId, yesterday, timezone);
  if (!task) {
    return NextResponse.json(
      { error: 'Missed task not found' },
      { status: 404 },
    );
  }

  if (action === 'complete') {
    await completeMissedTask(userId, task, yesterday);
    const reward = await raiseHungerForMissedCompletion(userId);
    await syncQuestState({ userId, timezone }).catch((error) => {
      console.error('Quest sync failed:', error);
    });

    return NextResponse.json({
      ok: true,
      flyBalance: reward.balance,
      awarded: reward.awarded,
    });
  }

  if (action === 'save-later') {
    const newTaskId = await saveMissedTaskForLater(
      userId,
      task,
      yesterday,
      today,
    );
    await syncQuestState({ userId, timezone }).catch((error) => {
      console.error('Quest sync failed:', error);
    });
    return NextResponse.json({ ok: true, taskId: newTaskId });
  }

  if (action === 'do-today') {
    const mode =
      body?.mode === 'change-repeat' ? 'change-repeat' : 'just-once';
    const newTaskId = await moveMissedTaskToToday(
      userId,
      task,
      yesterday,
      today,
      mode,
    );
    await syncQuestState({ userId, timezone }).catch((error) => {
      console.error('Quest sync failed:', error);
    });
    return NextResponse.json({ ok: true, taskId: newTaskId });
  }

  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
}
