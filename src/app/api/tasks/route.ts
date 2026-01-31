// src/app/api/tasks/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
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
import { calculateHunger, MAX_HUNGER_MS, TASK_HUNGER_REWARD_MS } from '@/lib/hungerLogic';

type Origin = 'weekly' | 'regular';
type BoardItem = { id: string; text: string; order: number; type: TaskType };
type LeanUser = (UserDoc & { _id: Types.ObjectId }) | null;
type FlyStatus = {
  balance: number;
  earnedToday: number;
  limit: number;
  limitHit: boolean;
  justHitLimit?: boolean;
};

type HungerStatus = {
  hunger: number;
  stolenFlies: number;
  maxHunger: number;
};

const DAILY_FLY_LIMIT = 15;

const isWeekday = (n: number): n is Weekday =>
  Number.isInteger(n) && n >= 0 && n <= 6;

async function currentUserId() {
  const s = await getServerSession(authOptions);
  return s?.user?.id ? new Types.ObjectId(s.user.id) : null;
}

function unauth() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

// --- Timezone Helpers ---

function getZonedYMD(d: Date, tz: string) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch (e) {
    console.warn('Invalid timezone:', tz);
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  }
}

function getZonedToday(tz: string) {
  return getZonedYMD(new Date(), tz);
}

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

function isBoardMode(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  return (
    params.get('view') === 'board' ||
    params.has('day') ||
    params.get('fullWeek') === '1'
  );
}

const initDailyFly = (date: string): DailyFlyProgress => ({
  date,
  earned: 0,
  taskIds: [],
  limitNotified: false,
});

function normalizeDailyFly(
  today: string,
  flyDaily?: DailyFlyProgress
): DailyFlyProgress {
  if (flyDaily?.date === today) {
    return {
      ...flyDaily,
      taskIds: flyDaily.taskIds ?? [],
      limitNotified: flyDaily.limitNotified ?? false,
    };
  }
  return initDailyFly(today);
}

async function currentFlyStatus(userId: Types.ObjectId, tz: string): Promise<{ flyStatus: FlyStatus; hungerStatus: HungerStatus }> {
  const today = getZonedToday(tz);
  const user = (await UserModel.findById(userId, {
    wardrobe: 1,
  }).lean()) as LeanUser;

  if (!user) {
    return {
      flyStatus: { balance: 0, earnedToday: 0, limit: DAILY_FLY_LIMIT, limitHit: false },
      hungerStatus: { hunger: MAX_HUNGER_MS, stolenFlies: 0, maxHunger: MAX_HUNGER_MS }
    };
  }

  const { updates, status: hungerStatus } = calculateHunger(user);
  const wardrobe = user.wardrobe ?? { equipped: {}, inventory: {}, flies: 0 };
  const daily = normalizeDailyFly(today, wardrobe.flyDaily as DailyFlyProgress | undefined);

  const pendingUpdates: Record<string, any> = { ...updates };
  let needsUpdate = Object.keys(updates).length > 0;

  if (!user?.wardrobe || wardrobe.flyDaily?.date !== today) {
    pendingUpdates['wardrobe.flyDaily'] = daily;
    if (!wardrobe.equipped) pendingUpdates['wardrobe.equipped'] = {};
    if (!wardrobe.inventory) pendingUpdates['wardrobe.inventory'] = {};
    if (wardrobe.flies === undefined) pendingUpdates['wardrobe.flies'] = 0;

    // Ensure hunger fields are initialized if missing
    if (wardrobe.hunger === undefined) pendingUpdates['wardrobe.hunger'] = MAX_HUNGER_MS;
    if (!wardrobe.lastHungerUpdate) pendingUpdates['wardrobe.lastHungerUpdate'] = new Date();

    needsUpdate = true;
  }

  if (needsUpdate) {
    await UserModel.updateOne({ _id: userId }, { $set: pendingUpdates });
  }

  const currentBalance = pendingUpdates['wardrobe.flies'] ?? wardrobe.flies ?? 0;

  return {
    flyStatus: {
      balance: currentBalance,
      earnedToday: daily.earned,
      limit: DAILY_FLY_LIMIT,
      limitHit: daily.earned >= DAILY_FLY_LIMIT,
    },
    hungerStatus
  };
}

async function awardFlyForTask(
  userId: Types.ObjectId,
  taskId: string,
  tz: string
): Promise<{ awarded: boolean; flyStatus: FlyStatus; hungerStatus: HungerStatus }> {
  const today = getZonedToday(tz);
  const user = (await UserModel.findById(userId, {
    wardrobe: 1,
    statistics: 1, // Include statistics
  }).lean()) as LeanUser;

  if (!user) {
    return {
      awarded: false,
      flyStatus: { balance: 0, earnedToday: 0, limit: DAILY_FLY_LIMIT, limitHit: false },
      hungerStatus: { hunger: MAX_HUNGER_MS, stolenFlies: 0, maxHunger: MAX_HUNGER_MS }
    };
  }

  const { updates: hungerUpdates, status: currentHungerState } = calculateHunger(user);
  const wardrobe = user.wardrobe ?? { equipped: {}, inventory: {}, flies: 0 };
  const daily = normalizeDailyFly(today, wardrobe.flyDaily as DailyFlyProgress | undefined);
  const alreadyRewarded = (daily.taskIds ?? []).includes(taskId);
  const atLimit = daily.earned >= DAILY_FLY_LIMIT;
  const limitNotified = daily.limitNotified ?? false;
  let currentBalance = hungerUpdates['wardrobe.flies'] ?? wardrobe.flies ?? 0;

  // --- Statistics Logic (Merged from /api/statistics) ---
  const currentStats = user.statistics?.daily ?? {
    date: '',
    dailyTasksCount: 0,
    dailyMilestoneGifts: 0,
    completedTaskIds: [],
    taskCountAtLastGift: 0,
  };
  const isNewDay = currentStats.date !== today;
  const alreadyCountedInStats = !isNewDay && currentStats.completedTaskIds.includes(taskId);

  const statsUpdates: Record<string, any> = {};

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
      statsUpdates['statistics.daily.dailyTasksCount'] = currentStats.dailyTasksCount + 1;
      // We use $push in the actual query construction if possible, or just set the new array/count?
      // Since we are building a big $set object usually, let's try to use specific operators if we can, 
      // or just compute the new values. 
      // `awardFlyForTask` implementation below primarily builds a `setFields` object for `$set`.
      // Mixing $set and $push in the same update is fine.
    }
  }
  // -----------------------------------------------------

  if (alreadyRewarded) {
    // Even if already rewarded (fly-wise), we might still need to update stats (if they drifted?).
    // But usually if already rewarded, it implies we processed it.
    // However, the user might be toggling completion. 
    // If 'alreadyCountedInStats' is false (e.g. maybe different logic), we should still update stats.

    const finalUpdates = { ...hungerUpdates };

    // Merge stat updates
    if (Object.keys(statsUpdates).length > 0) {
      // We have strict sets for isNewDay
      Object.assign(finalUpdates, statsUpdates);
    }

    const ops: any = { $set: finalUpdates };
    if (!isNewDay && !alreadyCountedInStats) {
      // If not new day, we need $inc and $push which are safer for concurrency
      // But here we are operating inside a specific logic block.
      // Let's just use $push for completedTaskIds if we aren't resetting the whole object.
      ops.$inc = { ...(ops.$inc || {}), 'statistics.daily.dailyTasksCount': 1 };
      ops.$push = { 'statistics.daily.completedTaskIds': taskId };

      // Remove $set collisions if any
      delete finalUpdates['statistics.daily.dailyTasksCount'];
    }

    if (Object.keys(finalUpdates).length > 0 || ops.$inc || ops.$push) {
      await UserModel.updateOne({ _id: user._id }, ops);
    }

    return {
      awarded: false,
      flyStatus: { balance: currentBalance, earnedToday: daily.earned, limit: DAILY_FLY_LIMIT, limitHit: atLimit },
      hungerStatus: currentHungerState
    };
  }

  // Calculate new hunger
  let newHunger = Math.min(MAX_HUNGER_MS, Math.max(0, currentHungerState.hunger) + TASK_HUNGER_REWARD_MS);
  const finalHungerStatus = { ...currentHungerState, hunger: newHunger };

  const setFields: Record<string, any> = {
    ...hungerUpdates,
    'wardrobe.hunger': newHunger,
    'wardrobe.lastHungerUpdate': new Date()
  };

  // Merge simple stat sets (like new day reset)
  if (statsUpdates['statistics.daily']) {
    setFields['statistics.daily'] = statsUpdates['statistics.daily'];
  }

  let nextEarned = daily.earned;
  let nextBalance = currentBalance;
  let awardedFly = false;

  if (!atLimit) {
    nextEarned += 1;
    nextBalance += 1;
    awardedFly = true;
    setFields['wardrobe.flies'] = nextBalance;
  }

  const hitLimit = nextEarned >= DAILY_FLY_LIMIT;
  const nextDaily: DailyFlyProgress = {
    date: today,
    earned: nextEarned,
    taskIds: Array.from(new Set([...(daily.taskIds ?? []), taskId])),
    limitNotified: limitNotified || hitLimit,
  };

  setFields['wardrobe.flyDaily'] = nextDaily;
  if (!user.wardrobe?.equipped) setFields['wardrobe.equipped'] = {};
  if (!user.wardrobe?.inventory) setFields['wardrobe.inventory'] = {};

  const ops: any = { $set: setFields };

  // Handle incremental stats update
  if (!isNewDay && !alreadyCountedInStats) {
    ops.$inc = { ...(ops.$inc || {}), 'statistics.daily.dailyTasksCount': 1 };
    ops.$push = { ...(ops.$push || {}), 'statistics.daily.completedTaskIds': taskId };
  }

  await UserModel.updateOne({ _id: user._id }, ops);

  return {
    awarded: awardedFly,
    flyStatus: {
      balance: nextBalance,
      earnedToday: nextEarned,
      limit: DAILY_FLY_LIMIT,
      limitHit: hitLimit,
      justHitLimit: hitLimit && !limitNotified ? true : undefined
    },
    hungerStatus: finalHungerStatus
  };
}

export async function GET(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();
  await connectMongo();
  const tz = req.nextUrl.searchParams.get('timezone') || 'UTC';
  if (isBoardMode(req)) return handleBoardGet(req, uid, tz);
  return handleDailyGet(req, uid, tz);
}

export async function POST(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();
  await connectMongo();
  const body = await req.json();
  const tz = body.timezone || 'UTC';
  const text = String(body?.text ?? '').trim();
  const rawDays: number[] = Array.isArray(body?.days) ? body.days : [];
  const tags: string[] = Array.isArray(body?.tags) ? body.tags.map(String) : [];
  const repeat = body?.repeat === 'backlog' ? 'backlog' : body?.repeat === 'this-week' ? 'this-week' : 'weekly';
  if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 });
  const days = repeat === 'backlog' ? [-1] : rawDays.map(Number).filter(Number.isInteger).filter((d) => d === -1 || isWeekday(d));
  if (days.length === 0) return NextResponse.json({ error: 'days must include -1 or 0..6' }, { status: 400 });
  const { weekStart, weekDates } = getRollingWeekDatesZoned(tz);
  const createdIds: string[] = [];
  const now = new Date();
  if (repeat === 'weekly') {
    if (days.some((d) => d === -1)) return NextResponse.json({ error: 'Repeating tasks target weekdays 0..6' }, { status: 400 });
    for (const d of days) {
      const dayOfWeek: Weekday = d as Weekday;
      const id = uuid();
      createdIds.push(id);
      const order = await nextOrderForDay(uid, dayOfWeek, weekDates[dayOfWeek]);
      await TaskModel.create({ userId: uid, type: 'weekly', id, text, order, dayOfWeek, createdAt: now, updatedAt: now, tags });
    }
    return NextResponse.json({ ok: true, ids: createdIds });
  }
  for (const d of days) {
    const id = uuid();
    createdIds.push(id);
    if (d === -1) {
      const order = await nextOrderBacklog(uid, weekStart);
      await TaskModel.create({ userId: uid, type: 'backlog', id, text, order, weekStart, completed: false, createdAt: now, updatedAt: now, tags });
    } else {
      const weekday = d as Weekday;
      const date = weekDates[weekday];
      const order = await nextOrderForDay(uid, weekday, date);
      await TaskModel.create({ userId: uid, type: 'regular', id, text, order, date, completed: false, createdAt: now, updatedAt: now, tags });
    }
  }
  return NextResponse.json({ ok: true, ids: createdIds });
}

export async function PUT(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();
  await connectMongo();
  const body = await req.json();
  const tz = body.timezone || 'UTC';
  if (body && Object.prototype.hasOwnProperty.call(body, 'day')) return handleBoardPut(uid, body, tz);
  // New: Handle "move" operation (atomic move between lists)
  if (body.move) {
    const { type, date: moveDate } = body.move;
    const { taskId } = body; // Extract taskId here

    if (!taskId) return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
    if (!type || (type === 'regular' && !moveDate)) return NextResponse.json({ error: 'Invalid move payload' }, { status: 400 });

    const doc = await TaskModel.findOne({ userId: uid, id: taskId }).lean<TaskDoc>();
    if (!doc) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

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
            completed: false // Reset completion on move to backlog? Usually safer.
          },
          $unset: {
            date: 1,
            dayOfWeek: 1,
            completedDates: 1,
            suppressedDates: 1
          }
        }
      );
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
            updatedAt: now
            // We keep 'completed' state? If moving back to today, maybe keep it as is if it was completed? 
            // Usually 'Do Later' implies it wasn't done. 'Move to Today' implies we want to do it.
            // Let's assume we keep provided 'completed' or default to current.
            // For now, let's NOT reset completed unless specified, but usually backlog items are not completed.
          },
          $unset: {
            weekStart: 1,
            dayOfWeek: 1,
            suppressedDates: 1
          }
        }
      );
      return NextResponse.json({ ok: true });
    }
  }

  const { date, taskId, completed, tags, toggleType, order, text } = body ?? {};
  // Relaxed validation to allow text updates
  if ((!date && !tags && !text && typeof completed === 'undefined' && !toggleType && typeof order === 'undefined') || !taskId) return NextResponse.json({ error: 'taskId and update fields are required' }, { status: 400 });
  const doc = await TaskModel.findOne({ userId: uid, id: taskId }).lean<TaskDoc>();
  if (!doc) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  if (toggleType) {
    if (doc.type === 'weekly') {
      const isCompletedToday = (doc.completedDates ?? []).includes(date);
      await TaskModel.updateOne({ userId: uid, id: taskId }, { $set: { type: 'regular', date, completed: isCompletedToday }, $unset: { dayOfWeek: 1, suppressedDates: 1, completedDates: 1 } });
    } else {
      const dow = dowFromYMD(date);
      await TaskModel.updateOne({ userId: uid, id: taskId }, { $set: { type: 'weekly', dayOfWeek: dow, completedDates: doc.completed ? [date] : [] }, $unset: { date: 1, weekStart: 1, completed: 1 } });
    }
    return NextResponse.json({ ok: true });
  }
  if (tags) {
    await TaskModel.updateOne({ userId: uid, id: taskId }, { $set: { tags } });
    return NextResponse.json({ ok: true });
  }
  // New: Handle text update
  if (body.text) {
    await TaskModel.updateOne({ userId: uid, id: taskId }, { $set: { text: body.text } });
    return NextResponse.json({ ok: true });
  }

  if (typeof completed !== 'boolean') return NextResponse.json({ error: 'completed must be boolean' }, { status: 400 });
  const alreadyCompletedForDate = (doc.completedDates ?? []).includes(date) || (!!doc.completed && doc.type === 'regular');
  const update = completed === true ? { $addToSet: { completedDates: date } } : { $pull: { completedDates: date } };
  if (doc.type === 'regular') (update as any).$set = { ...(update as any).$set, completed };
  if (completed === false && alreadyCompletedForDate) {
    const dow = dowFromYMD(date);
    const newOrder = await nextOrderForDay(uid, dow, date);
    (update as any).$set = { ...((update as any).$set || {}), order: newOrder };
  }
  if (typeof order === 'number') (update as any).$set = { ...((update as any).$set || {}), order };
  await TaskModel.updateOne({ userId: uid, id: taskId }, update);
  let flyStatus: FlyStatus | undefined;
  let hungerStatus: HungerStatus | undefined;
  if (completed && !alreadyCompletedForDate) ({ flyStatus, hungerStatus } = await awardFlyForTask(uid, taskId, tz));
  else ({ flyStatus, hungerStatus } = await currentFlyStatus(uid, tz));
  return NextResponse.json({ ok: true, flyStatus, hungerStatus });
}

export async function DELETE(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();
  await connectMongo();
  const body = await req.json();
  const tz = body.timezone || 'UTC';
  if (body && Object.prototype.hasOwnProperty.call(body, 'day')) return handleBoardDelete(uid, body, tz);
  const { date, taskId } = body ?? {};
  if (!date || !taskId) return NextResponse.json({ error: 'date and taskId are required' }, { status: 400 });
  const doc = await TaskModel.findOne({ userId: uid, id: taskId }).lean<TaskDoc>();
  if (!doc) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  if (doc.type === 'weekly') {
    await TaskModel.updateOne({ userId: uid, id: taskId }, { $addToSet: { suppressedDates: date } });
    return NextResponse.json({ ok: true });
  }
  if (doc.type === 'regular') {
    await TaskModel.deleteOne({ userId: uid, id: taskId, date });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: true });
}

async function handleDailyGet(req: NextRequest, userId: Types.ObjectId, tz: string) {
  const url = new URL(req.url);
  const dateParam = url.searchParams.get('date');
  const todayLocal = getZonedToday(tz);
  const date = dateParam ?? todayLocal;
  const dow = dowFromYMD(date);
  const tasks: TaskDoc[] = await TaskModel.find({ userId, deletedAt: { $exists: false }, $or: [{ type: 'weekly', dayOfWeek: dow }, { type: 'regular', date }] }).sort({ order: 1 }).lean<TaskDoc[]>().exec();
  const weeklyIdsForUI = new Set(tasks.filter((t: TaskDoc) => t.type === 'weekly').map((t: TaskDoc) => t.id));
  const filtered = tasks.filter((t: TaskDoc) => !(t.suppressedDates ?? []).includes(date));
  const output = filtered.map((t: TaskDoc) => ({ id: t.id, text: t.text, order: t.order ?? 0, completed: (t.completedDates ?? []).includes(date) || (!!t.completed && t.type === 'regular'), origin: t.type as Origin, tags: t.tags ?? [] })).sort((a, b) => { if (!!a.completed !== !!b.completed) return a.completed ? 1 : -1; return (a.order ?? 0) - (b.order ?? 0); });
  const { flyStatus, hungerStatus } = await currentFlyStatus(userId, tz);
  const userForStats = (await UserModel.findById(userId, { statistics: 1 }).lean()) as LeanUser;
  let dailyGiftCount = 0;
  if (userForStats?.statistics?.daily?.date === todayLocal) dailyGiftCount = userForStats.statistics.daily.dailyMilestoneGifts ?? 0;
  return NextResponse.json({ date, tasks: output, weeklyIds: Array.from(weeklyIdsForUI), flyStatus, hungerStatus, dailyGiftCount });
}

async function handleBoardGet(req: NextRequest, uid: Types.ObjectId, tz: string) {
  const { weekStart, weekDates } = getRollingWeekDatesZoned(tz);
  const dayParam = req.nextUrl.searchParams.get('day');
  if (dayParam !== null) {
    const dayNum = Number(dayParam);
    if (dayNum === -1) {
      const later: TaskDoc[] = await TaskModel.find({ userId: uid, type: 'backlog', weekStart }).sort({ order: 1 }).lean<TaskDoc[]>().exec();
      const out = later.map((t: TaskDoc) => ({ id: t.id, text: t.text, order: t.order, type: t.type, completed: !!t.completed, tags: t.tags ?? [] })).sort((a, b) => { if (!!a.completed !== !!b.completed) return a.completed ? 1 : -1; return (a.order ?? 0) - (b.order ?? 0); });
      return NextResponse.json(out);
    }
    if (!isWeekday(dayNum)) return NextResponse.json({ error: 'day must be -1 or 0..6' }, { status: 400 });
    const docs: TaskDoc[] = await TaskModel.find({ userId: uid, deletedAt: { $exists: false }, $or: [{ type: 'weekly', dayOfWeek: dayNum }, { type: 'regular', date: weekDates[dayNum] }] }).sort({ order: 1 }).lean<TaskDoc[]>().exec();
    const out = docs.map((t: TaskDoc) => ({ id: t.id, text: t.text, order: t.order, type: t.type, completed: (t.completedDates ?? []).includes(weekDates[dayNum]) || (!!t.completed && t.type === 'regular'), tags: t.tags ?? [] })).sort((a, b) => { if (!!a.completed !== !!b.completed) return a.completed ? 1 : -1; return (a.order ?? 0) - (b.order ?? 0); });
    return NextResponse.json(out);
  }
  const week: any[][] = Array.from({ length: 8 }, () => []);
  for (let d: Weekday = 0; d <= 6; d = (d + 1) as Weekday) {
    const docs: TaskDoc[] = await TaskModel.find({ userId: uid, deletedAt: { $exists: false }, $or: [{ type: 'weekly', dayOfWeek: d }, { type: 'regular', date: weekDates[d] }] }).sort({ order: 1 }).lean<TaskDoc[]>().exec();
    week[d] = docs.map((t: TaskDoc) => ({ id: t.id, text: t.text, order: t.order, type: t.type, completed: (t.completedDates ?? []).includes(weekDates[d]) || (!!t.completed && t.type === 'regular'), tags: t.tags ?? [] })).sort((a, b) => { if (!!a.completed !== !!b.completed) return a.completed ? 1 : -1; return (a.order ?? 0) - (b.order ?? 0); });
  }
  const backlogDocs: TaskDoc[] = await TaskModel.find({ userId: uid, type: 'backlog', weekStart }).sort({ order: 1 }).lean<TaskDoc[]>().exec();
  week[7] = backlogDocs.map((t: TaskDoc) => ({ id: t.id, text: t.text, order: t.order, type: t.type, completed: !!t.completed, tags: t.tags ?? [] })).sort((a, b) => { if (!!a.completed !== !!b.completed) return a.completed ? 1 : -1; return (a.order ?? 0) - (b.order ?? 0); });
  return NextResponse.json(week);
}

async function handleBoardPut(uid: Types.ObjectId, body: { day: number; tasks: Array<{ id: string; text?: string; tags?: string[] }> }, tz: string) {
  const { day, tasks } = body;
  if (!Number.isInteger(day) || (day !== -1 && !isWeekday(day))) return NextResponse.json({ error: 'day must be -1 or 0..6' }, { status: 400 });
  const now = new Date();
  const { weekStart, weekDates } = getRollingWeekDatesZoned(tz);
  if (day === -1) {
    const ids = (tasks as Array<{ id: string }>).map((t) => t.id);
    if (ids.length === 0) { await TaskModel.deleteMany({ userId: uid, type: 'backlog', weekStart }); return NextResponse.json({ ok: true }); }
    await TaskModel.deleteMany({ userId: uid, type: 'backlog', weekStart, id: { $nin: ids } });
    const docs: TaskDoc[] = await TaskModel.find({ userId: uid, id: { $in: ids } }, { id: 1, text: 1, type: 1, tags: 1 }).lean<TaskDoc[]>().exec();
    const textFromReq = new Map((tasks as Array<{ id: string; text?: string }>).map((t) => [t.id, t.text ?? '']));
    const tagsFromReq = new Map((tasks as Array<{ id: string; tags?: string[] }>).map((t) => [t.id, t.tags]));
    const textById = new Map<string, string>();
    const tagsById = new Map<string, string[]>();
    for (const d of docs) { textById.set(d.id, d.text ?? ''); tagsById.set(d.id, d.tags ?? []); }
    await Promise.all(ids.map((id, i) => TaskModel.updateOne({ userId: uid, type: 'backlog', weekStart, id }, { $set: { order: i + 1, text: textById.get(id) ?? textFromReq.get(id) ?? '', tags: tagsFromReq.get(id) ?? tagsById.get(id) ?? [], weekStart, updatedAt: now }, $setOnInsert: { userId: uid, type: 'backlog', createdAt: now, completed: false, completedDates: [], suppressedDates: [] } }, { upsert: true })));
    await TaskModel.deleteMany({ userId: uid, id: { $in: ids }, type: { $in: ['weekly', 'regular'] } });
    return NextResponse.json({ ok: true });
  }
  const weekday: Weekday = day as Weekday;
  const batch = tasks as Array<{ id: string; text?: string; tags?: string[] }>;
  const ids = batch.map((t) => t.id);
  await TaskModel.deleteMany({ userId: uid, type: 'regular', date: weekDates[weekday], id: { $nin: ids } });
  const docs: TaskDoc[] = await TaskModel.find({ userId: uid, id: { $in: ids } }, { id: 1, type: 1, text: 1, tags: 1 }).lean<TaskDoc[]>().exec();
  const typeById = new Map(docs.map((d) => [d.id, d.type]));
  const textById = new Map(docs.map((d) => [d.id, d.text]));
  const tagsById = new Map(docs.map((d) => [d.id, d.tags ?? []]));
  await Promise.all(batch.map((t, i) => {
    const ttype = typeById.get(t.id);
    const textFromReq = t.text ?? textById.get(t.id) ?? '';
    const tags = t.tags ?? tagsById.get(t.id) ?? [];
    if (ttype === 'weekly') return TaskModel.updateOne({ userId: uid, type: 'weekly', id: t.id }, { $set: { dayOfWeek: weekday, order: i + 1, updatedAt: now, tags } });
    if (ttype === 'regular') return TaskModel.updateOne({ userId: uid, type: 'regular', id: t.id }, { $set: { date: weekDates[weekday], order: i + 1, updatedAt: now, tags } });
    if (ttype === 'backlog') return Promise.all([TaskModel.deleteOne({ userId: uid, type: 'backlog', weekStart, id: t.id }), TaskModel.updateOne({ userId: uid, type: 'regular', id: t.id }, { $set: { text: textFromReq, tags, date: weekDates[weekday], order: i + 1, completed: false, updatedAt: now }, $setOnInsert: { userId: uid, type: 'regular', createdAt: now } }, { upsert: true })]);
    return TaskModel.updateOne({ userId: uid, type: 'regular', id: t.id }, { $set: { text: textFromReq, tags, date: weekDates[weekday], order: i + 1, completed: false, updatedAt: now }, $setOnInsert: { userId: uid, type: 'regular', createdAt: now } }, { upsert: true });
  }));
  return NextResponse.json({ ok: true });
}

// Ensure PUT handles simple text updates for single task edit
// We add a check for 'text' in the main PUT body handler, which was missing in the original file view for the single-task update block.
// The original code:
//   const { date, taskId, completed, tags, toggleType, order } = body ?? {};
//   if ((!date && !tags) || !taskId) ...
// We need to allow text updates now.

async function handleBoardDelete(uid: Types.ObjectId, body: { day: number; taskId: string }, tz: string) {
  const { day, taskId } = body;
  if (!taskId) return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
  if (!Number.isInteger(day) || (day !== -1 && !isWeekday(day))) return NextResponse.json({ error: 'day must be -1 or 0..6' }, { status: 400 });
  if (day === -1) {
    const { weekStart } = getRollingWeekDatesZoned(tz);
    await TaskModel.deleteOne({ userId: uid, type: 'backlog', weekStart, id: taskId });
    return NextResponse.json({ ok: true });
  }
  const doc = await TaskModel.findOne({ userId: uid, id: taskId }, { type: 1 }).lean<TaskDoc>().exec();
  if (doc?.type === 'regular') { await TaskModel.deleteOne({ userId: uid, type: 'regular', id: taskId }); return NextResponse.json({ ok: true }); }
  await TaskModel.updateOne({ userId: uid, type: 'weekly', id: taskId }, { $set: { deletedAt: new Date() } });
  const today = getZonedToday(tz);
  await TaskModel.deleteMany({ userId: uid, type: 'regular', id: taskId, date: { $gte: today } });
  return NextResponse.json({ ok: true });
}

async function nextOrderForDay(userId: Types.ObjectId, weekday: Weekday, date: string) {
  const doc = await TaskModel.findOne({ userId, $or: [{ type: 'weekly', dayOfWeek: weekday }, { type: 'regular', date }] }, { order: 1 }).sort({ order: -1 }).lean<TaskDoc>().exec();
  return (doc?.order ?? 0) + 1;
}

async function nextOrderBacklog(userId: Types.ObjectId, weekStart: string) {
  const doc = await TaskModel.findOne({ userId, type: 'backlog', weekStart }, { order: 1 }).sort({ order: -1 }).lean<TaskDoc>().exec();
  return (doc?.order ?? 0) + 1;
}
