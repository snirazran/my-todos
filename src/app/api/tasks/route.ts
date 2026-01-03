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

// ... (existing helper functions) ...

async function currentFlyStatus(userId: Types.ObjectId, tz: string): Promise<{ flyStatus: FlyStatus; hungerStatus: HungerStatus }> {
  const today = getZonedToday(tz);
  const user = (await UserModel.findById(userId, {
    wardrobe: 1,
  }).lean()) as LeanUser;

  if (!user) {
    return {
      flyStatus: {
        balance: 0,
        earnedToday: 0,
        limit: DAILY_FLY_LIMIT,
        limitHit: false,
      },
      hungerStatus: {
        hunger: MAX_HUNGER_MS,
        stolenFlies: 0,
        maxHunger: MAX_HUNGER_MS,
      }
    };
  }

  // 1. Process Hunger Decay & Penalties
  const { updates, status: hungerStatus } = calculateHunger(user);
  
  // 2. Process Daily Fly Logic
  const wardrobe = user.wardrobe ?? { equipped: {}, inventory: {}, flies: 0 };
  const daily = normalizeDailyFly(
    today,
    wardrobe.flyDaily as DailyFlyProgress | undefined
  );

  const pendingUpdates: Record<string, any> = { ...updates };
  let needsUpdate = Object.keys(updates).length > 0;

  // Check if daily fly object needs initialization/reset
  if (!user?.wardrobe || wardrobe.flyDaily?.date !== today) {
    pendingUpdates['wardrobe.flyDaily'] = daily;
    // Ensure wardrobe structure exists
    if (!wardrobe.equipped) pendingUpdates['wardrobe.equipped'] = {};
    if (!wardrobe.inventory) pendingUpdates['wardrobe.inventory'] = {};
    if (wardrobe.flies === undefined) pendingUpdates['wardrobe.flies'] = 0;
    needsUpdate = true;
  }

  if (needsUpdate) {
    await UserModel.updateOne({ _id: userId }, { $set: pendingUpdates });
  }

  // Use the potentially updated fly balance from hunger logic
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
  }).lean()) as LeanUser;

  if (!user) {
    return {
      awarded: false,
      flyStatus: {
        balance: 0,
        earnedToday: 0,
        limit: DAILY_FLY_LIMIT,
        limitHit: false,
      },
      hungerStatus: {
        hunger: MAX_HUNGER_MS,
        stolenFlies: 0,
        maxHunger: MAX_HUNGER_MS
      }
    };
  }

  // 1. Process Decay First (so we don't apply reward to stale time)
  const { updates: hungerUpdates, status: currentHungerState } = calculateHunger(user);
  
  const wardrobe = user.wardrobe ?? { equipped: {}, inventory: {}, flies: 0 };
  const daily = normalizeDailyFly(
    today,
    wardrobe.flyDaily as DailyFlyProgress | undefined
  );
  const alreadyRewarded = (daily.taskIds ?? []).includes(taskId);
  const atLimit = daily.earned >= DAILY_FLY_LIMIT;
  const limitNotified = daily.limitNotified ?? false;

  // Use the balance from hunger calculation if it changed (due to penalties)
  let currentBalance = hungerUpdates['wardrobe.flies'] ?? wardrobe.flies ?? 0;

  if (alreadyRewarded || atLimit) {
    // If already rewarded or at limit, we ONLY apply the time-based decay updates.
    // We do NOT add the hunger reward (4h).
    
    if (atLimit && !limitNotified) {
      await UserModel.updateOne(
        { _id: user._id },
        { $set: { ...hungerUpdates, 'wardrobe.flyDaily.limitNotified': true } }
      );
    } else {
      // Still need to save hunger updates if any (from decay)
      if (Object.keys(hungerUpdates).length > 0) {
        await UserModel.updateOne({ _id: user._id }, { $set: hungerUpdates });
      }
    }
    
    return {
      awarded: false,
      flyStatus: {
        balance: currentBalance,
        earnedToday: daily.earned,
        limit: DAILY_FLY_LIMIT,
        limitHit: daily.earned >= DAILY_FLY_LIMIT,
        justHitLimit: atLimit && !limitNotified ? true : undefined,
      },
      hungerStatus: currentHungerState
    };
  }

  // 2. Apply Hunger Reward (boost by 4h) ONLY if not already rewarded
  let newHunger = currentHungerState.hunger + TASK_HUNGER_REWARD_MS;
  if (newHunger > MAX_HUNGER_MS) newHunger = MAX_HUNGER_MS;
  
  // Update the status object for return
  const finalHungerStatus = { ...currentHungerState, hunger: newHunger };
  
  // Merge into updates
  const setFields: Record<string, any> = { ...hungerUpdates, 'wardrobe.hunger': newHunger };

  const nextEarned = daily.earned + 1;
  const hitLimit = nextEarned >= DAILY_FLY_LIMIT;
  const nextDaily: DailyFlyProgress = {
    date: today,
    earned: nextEarned,
    taskIds: Array.from(new Set([...(daily.taskIds ?? []), taskId])),
    limitNotified: limitNotified || hitLimit,
  };
  
  const nextBalance = currentBalance + 1;

  setFields['wardrobe.flyDaily'] = nextDaily;
  setFields['wardrobe.flies'] = nextBalance; // Explicitly set final balance
  if (!user.wardrobe?.equipped) setFields['wardrobe.equipped'] = {};
  if (!user.wardrobe?.inventory) setFields['wardrobe.inventory'] = {};

  // We are setting 'wardrobe.flies' instead of incrementing to ensure consistency with hunger penalties
  await UserModel.updateOne(
    { _id: user._id },
    {
      $set: setFields,
    }
  );

  return {
    awarded: true,
    flyStatus: {
      balance: nextBalance,
      earnedToday: nextEarned,
      limit: DAILY_FLY_LIMIT,
      limitHit: hitLimit,
      justHitLimit: hitLimit && !limitNotified ? true : undefined,
    },
    hungerStatus: finalHungerStatus
  };
}

/* ====================================================================== */
/* GET handler                                                            */
/* ====================================================================== */
export async function GET(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();
  await connectMongo();

  const tz = req.nextUrl.searchParams.get('timezone') || 'UTC';

  if (isBoardMode(req)) {
    return handleBoardGet(req, uid, tz);
  }
  return handleDailyGet(req, uid, tz);
}

/* ====================================================================== */
/* POST handler (create tasks)                                            */
/* ====================================================================== */
export async function POST(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();
  await connectMongo();

  const body = await req.json();
  const tz = body.timezone || 'UTC';
  
  const text = String(body?.text ?? '').trim();
  const rawDays: number[] = Array.isArray(body?.days) ? body.days : [];
  const tags: string[] = Array.isArray(body?.tags) ? body.tags.map(String) : [];
  const repeat: 'weekly' | 'this-week' | 'backlog' =
    body?.repeat === 'backlog' ? 'backlog' :
    body?.repeat === 'this-week' ? 'this-week' : 'weekly';

  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  const days = repeat === 'backlog' ? [-1] : rawDays
    .map(Number)
    .filter(Number.isInteger)
    .filter((d) => d === -1 || isWeekday(d));

  if (days.length === 0) {
    return NextResponse.json(
      { error: 'days must include -1 or 0..6' },
      { status: 400 }
    );
  }

  const { weekStart, weekDates } = getRollingWeekDatesZoned(tz);
  const now = new Date();

  if (repeat === 'weekly') {
    if (days.some((d) => d === -1)) {
      return NextResponse.json(
        { error: 'Repeating tasks can only target weekdays 0..6' },
        { status: 400 }
      );
    }
    for (const d of days) {
      const dayOfWeek: Weekday = d as Weekday;
      const id = uuid();
      const order = await nextOrderForDay(uid, dayOfWeek, weekDates[dayOfWeek]);
      await TaskModel.create({
        userId: uid,
        type: 'weekly',
        id,
        text,
        order,
        dayOfWeek,
        createdAt: now,
        updatedAt: now,
        tags,
      });
    }
    return NextResponse.json({ ok: true });
  }

  // One-time tasks
  for (const d of days) {
    const id = uuid();
    if (d === -1) {
      const order = await nextOrderBacklog(uid, weekStart);
      await TaskModel.create({
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
      });
    } else {
      const weekday = d as Weekday;
      const date = weekDates[weekday];
      const order = await nextOrderForDay(uid, weekday, date);
      await TaskModel.create({
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
      });
    }
  }

  return NextResponse.json({ ok: true });
}

/* ====================================================================== */
/* PUT handler (toggle daily or reorder board)                            */
/* ====================================================================== */
export async function PUT(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();
  await connectMongo();

  const body = await req.json();
  const tz = body.timezone || 'UTC';

  // Board reorder/update
  if (body && Object.prototype.hasOwnProperty.call(body, 'day')) {
    return handleBoardPut(uid, body, tz);
  }

  // Daily toggle or update tags
  const { date, taskId, completed, tags, toggleType, order } = body ?? {};
  if ((!date && !tags) || !taskId) {
    return NextResponse.json(
      { error: 'taskId and (date+completed OR tags) are required' },
      { status: 400 }
    );
  }

  const doc = await TaskModel.findOne({
    userId: uid,
    id: taskId,
  }).lean<TaskDoc>();
  if (!doc) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  if (toggleType) {
    if (doc.type === 'weekly') {
      // Convert Weekly -> Regular
      // We freeze the current instance into a regular task
      const isCompletedToday = (doc.completedDates ?? []).includes(date);
      await TaskModel.updateOne(
        { userId: uid, id: taskId },
        {
          $set: {
            type: 'regular',
            date,
            completed: isCompletedToday,
          },
          $unset: {
            dayOfWeek: 1,
            suppressedDates: 1,
            completedDates: 1,
          },
        }
      );
    } else {
      // Convert Regular -> Weekly
      // We assume this task now repeats every week on this weekday
      const dow = dowFromYMD(date);
      await TaskModel.updateOne(
        { userId: uid, id: taskId },
        {
          $set: {
            type: 'weekly',
            dayOfWeek: dow,
            completedDates: doc.completed ? [date] : [],
          },
          $unset: {
            date: 1,
            weekStart: 1,
            completed: 1,
          },
        }
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (tags) {
      await TaskModel.updateOne({ userId: uid, id: taskId }, { $set: { tags } });
      return NextResponse.json({ ok: true });
  }

  if (typeof completed !== 'boolean') {
      return NextResponse.json({ error: 'completed must be boolean' }, { status: 400 });
  }

  const alreadyCompletedForDate =
    (doc.completedDates ?? []).includes(date) ||
    (!!doc.completed && doc.type === 'regular');

  const update =
    completed === true
      ? { $addToSet: { completedDates: date } }
      : { $pull: { completedDates: date } };

  if (doc.type === 'regular') {
    (update as any).$set = { ...(update as any).$set, completed };
  }

  // If un-completing, move to bottom of the list
  if (completed === false && alreadyCompletedForDate) {
    const dow = dowFromYMD(date);
    const newOrder = await nextOrderForDay(uid, dow, date);
    (update as any).$set = { ...((update as any).$set || {}), order: newOrder };
  }
  
  // Explicit order update (e.g. from client for "complete in place")
  if (typeof order === 'number') {
    (update as any).$set = { ...((update as any).$set || {}), order };
  }

  await TaskModel.updateOne({ userId: uid, id: taskId }, update);

  let flyStatus: FlyStatus | undefined;
  let hungerStatus: HungerStatus | undefined;

  if (completed && !alreadyCompletedForDate) {
    ({ flyStatus, hungerStatus } = await awardFlyForTask(uid, taskId, tz));
  } else {
    ({ flyStatus, hungerStatus } = await currentFlyStatus(uid, tz));
  }

  return NextResponse.json({ ok: true, flyStatus, hungerStatus });
}

/* ====================================================================== */
/* DELETE handler (remove daily or board item)                            */
/* ====================================================================== */
export async function DELETE(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();
  await connectMongo();

  const body = await req.json();
  const tz = body.timezone || 'UTC';

  // Board delete
  if (body && Object.prototype.hasOwnProperty.call(body, 'day')) {
    return handleBoardDelete(uid, body, tz);
  }

  // Daily delete/suppress
  const { date, taskId } = body ?? {};
  if (!date || !taskId) {
    return NextResponse.json(
      { error: 'date and taskId are required' },
      { status: 400 }
    );
  }

  const doc = await TaskModel.findOne({
    userId: uid,
    id: taskId,
  }).lean<TaskDoc>();
  if (!doc) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  if (doc.type === 'weekly') {
    await TaskModel.updateOne(
      { userId: uid, id: taskId },
      { $addToSet: { suppressedDates: date } }
    );
    return NextResponse.json({ ok: true });
  }

  if (doc.type === 'regular') {
    await TaskModel.deleteOne({ userId: uid, id: taskId, date });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}

/* ====================================================================== */
/* Helpers: daily view                                                    */
/* ====================================================================== */
async function handleDailyGet(req: NextRequest, userId: Types.ObjectId, tz: string) {
  const url = new URL(req.url);
  const dateParam = url.searchParams.get('date');
  const todayLocal = getZonedToday(tz);
  const date = dateParam ?? todayLocal;
  const dow = dowFromYMD(date);

  const tasks: TaskDoc[] = await TaskModel.find(
    {
      userId,
      deletedAt: { $exists: false },
      $or: [
        { type: 'weekly', dayOfWeek: dow },
        { type: 'regular', date },
      ],
    },
    {
      id: 1,
      text: 1,
      order: 1,
      type: 1,
      completed: 1,
      completedDates: 1,
      suppressedDates: 1,
      tags: 1,
    }
  )
    .sort({ order: 1 })
    .lean<TaskDoc[]>()
    .exec();

  const weeklyIdsForUI = new Set(
    tasks.filter((t: TaskDoc) => t.type === 'weekly').map((t: TaskDoc) => t.id)
  );

  const filtered = tasks.filter(
    (t: TaskDoc) => !(t.suppressedDates ?? []).includes(date)
  );

  const output = filtered
    .map((t: TaskDoc) => ({
      id: t.id,
      text: t.text,
      order: t.order ?? 0,
      completed:
        (t.completedDates ?? []).includes(date) ||
        (!!t.completed && t.type === 'regular'),
      origin: t.type as Origin,
      tags: t.tags ?? [],
    }))
    .sort((a, b) => {
      if (!!a.completed !== !!b.completed) {
        return a.completed ? 1 : -1;
      }
      return (a.order ?? 0) - (b.order ?? 0);
    });

  const { flyStatus, hungerStatus } = await currentFlyStatus(userId, tz);

  // === NEW: FETCH GIFT COUNT ===
  // Use user's today string for stats lookup
  const userForStats = (await UserModel.findById(userId, {
    statistics: 1,
  }).lean()) as LeanUser;

  let dailyGiftCount = 0;
  if (userForStats?.statistics?.daily?.date === todayLocal) {
    dailyGiftCount = userForStats.statistics.daily.dailyMilestoneGifts ?? 0;
  }

  return NextResponse.json({
    date,
    tasks: output,
    weeklyIds: Array.from(weeklyIdsForUI),
    flyStatus,
    hungerStatus,
    dailyGiftCount,
  });
}

/* ====================================================================== */
/* Helpers: board view (weekly/backlog manager)                           */
/* ====================================================================== */
async function handleBoardGet(req: NextRequest, uid: Types.ObjectId, tz: string) {
  const Task = TaskModel;
  const { weekStart, weekDates } = getRollingWeekDatesZoned(tz);

  const dayParam = req.nextUrl.searchParams.get('day');

  // Single-column fetch
  if (dayParam !== null) {
    const dayNum = Number(dayParam);

    // Later (backlog)
    if (dayNum === -1) {
      const later: TaskDoc[] = await Task.find(
        { userId: uid, type: 'backlog', weekStart },
        { id: 1, text: 1, order: 1, type: 1, completed: 1, tags: 1, _id: 0 }
      )
        .sort({ order: 1 })
        .lean<TaskDoc[]>()
        .exec();

      const out: BoardItem[] & { completed?: boolean; tags?: string[] } = later
        .map((t: TaskDoc) => ({
          id: t.id,
          text: t.text,
          order: t.order,
          type: t.type,
          completed: !!t.completed,
          tags: t.tags ?? [],
        }))
        .sort((a, b) => {
          if (!!a.completed !== !!b.completed) {
            return a.completed ? 1 : -1;
          }
          return (a.order ?? 0) - (b.order ?? 0);
        });
      return NextResponse.json(out);
    }

    if (!isWeekday(dayNum)) {
      return NextResponse.json(
        { error: 'day must be -1 or 0..6' },
        { status: 400 }
      );
    }

    // Weekly + Regular for that weekday
    const docs: TaskDoc[] = await Task.find(
      {
        userId: uid,
        deletedAt: { $exists: false },
        $or: [
          { type: 'weekly', dayOfWeek: dayNum },
          { type: 'regular', date: weekDates[dayNum] },
        ],
      },
      {
        id: 1,
        text: 1,
        order: 1,
        type: 1,
        completed: 1,
        completedDates: 1,
        tags: 1,
        _id: 0,
      }
    )
      .sort({ order: 1 })
      .lean<TaskDoc[]>()
      .exec();

    const out: BoardItem[] & { completed?: boolean; tags?: string[] } = docs
      .map((t: TaskDoc) => ({
        id: t.id,
        text: t.text,
        order: t.order,
        type: t.type,
        completed:
          (t.completedDates ?? []).includes(weekDates[dayNum]) ||
          (!!t.completed && t.type === 'regular'),
        tags: t.tags ?? [],
      }))
      .sort((a, b) => {
        if (!!a.completed !== !!b.completed) {
          return a.completed ? 1 : -1;
        }
        return (a.order ?? 0) - (b.order ?? 0);
      });
    return NextResponse.json(out);
  }

  // Full week fetch (Sun..Sat + Later)
  const week: (BoardItem & { completed?: boolean; tags?: string[] })[][] =
    Array.from({ length: 8 }, () => []);

  for (let d: Weekday = 0; d <= 6; d = (d + 1) as Weekday) {
    const docs: TaskDoc[] = await Task.find(
      {
        userId: uid,
        deletedAt: { $exists: false },
        $or: [
          { type: 'weekly', dayOfWeek: d },
          { type: 'regular', date: weekDates[d] },
        ],
      },
      {
        id: 1,
        text: 1,
        order: 1,
        type: 1,
        completed: 1,
        completedDates: 1,
        tags: 1,
        _id: 0,
      }
    )
      .sort({ order: 1 })
      .lean<TaskDoc[]>()
      .exec();

    week[d] = docs
      .map((t: TaskDoc) => ({
        id: t.id,
        text: t.text,
        order: t.order,
        type: t.type,
        completed:
          (t.completedDates ?? []).includes(weekDates[d]) ||
          (!!t.completed && t.type === 'regular'),
        tags: t.tags ?? [],
      }))
      .sort((a, b) => {
        if (!!a.completed !== !!b.completed) {
          return a.completed ? 1 : -1;
        }
        return (a.order ?? 0) - (b.order ?? 0);
      });
  }

  const backlogDocs: TaskDoc[] = await Task.find(
    { userId: uid, type: 'backlog', weekStart },
    { id: 1, text: 1, order: 1, type: 1, completed: 1, tags: 1, _id: 0 }
  )
    .sort({ order: 1 })
    .lean<TaskDoc[]>()
    .exec();

  week[7] = backlogDocs
    .map((t: TaskDoc) => ({
      id: t.id,
      text: t.text,
      order: t.order,
      type: t.type,
      completed: !!t.completed,
      tags: t.tags ?? [],
    }))
    .sort((a, b) => {
      if (!!a.completed !== !!b.completed) {
        return a.completed ? 1 : -1;
      }
      return (a.order ?? 0) - (b.order ?? 0);
    });

  return NextResponse.json(week);
}

async function handleBoardPut(
  uid: Types.ObjectId,
  body: { day: number; tasks: Array<{ id: string; text?: string; tags?: string[] }> },
  tz: string
) {
  const { day, tasks } = body;
  if (!Number.isInteger(day) || (day !== -1 && !isWeekday(day))) {
    return NextResponse.json(
      { error: 'day must be -1 or 0..6' },
      { status: 400 }
    );
  }

  const now = new Date();
  const { weekStart, weekDates } = getRollingWeekDatesZoned(tz);

  // Reorder/update the Later bucket
  if (day === -1) {
    const ids = (tasks as Array<{ id: string }>).map((t) => t.id);

    if (ids.length === 0) {
      await TaskModel.deleteMany({ userId: uid, type: 'backlog', weekStart });
      return NextResponse.json({ ok: true });
    }

    // Remove backlog entries not present anymore
    await TaskModel.deleteMany({
      userId: uid,
      type: 'backlog',
      weekStart,
      id: { $nin: ids },
    });

    const docs: TaskDoc[] = await TaskModel.find(
      { userId: uid, id: { $in: ids } },
      { id: 1, text: 1, type: 1, tags: 1 }
    )
      .lean<TaskDoc[]>()
      .exec();

    const textFromReq = new Map(
      (tasks as Array<{ id: string; text?: string }>).map((t) => [
        t.id,
        t.text ?? '',
      ])
    );
    const tagsFromReq = new Map(
      (tasks as Array<{ id: string; tags?: string[] }>).map((t) => [
        t.id,
        t.tags,
      ])
    );
    const textById = new Map<string, string>();
    const tagsById = new Map<string, string[]>();

    for (const d of docs) {
      textById.set(d.id, d.text ?? '');
      tagsById.set(d.id, d.tags ?? []);
    }

    await Promise.all(
      ids.map((id, i) =>
        TaskModel.updateOne(
          { userId: uid, type: 'backlog', weekStart, id },
          {
            $set: {
              order: i + 1,
              text: textById.get(id) ?? textFromReq.get(id) ?? '',
              tags: tagsFromReq.get(id) ?? tagsById.get(id) ?? [],
              weekStart,
              updatedAt: now,
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
          { upsert: true }
        )
      )
    );

    await TaskModel.deleteMany({
      userId: uid,
      id: { $in: ids },
      type: { $in: ['weekly', 'regular'] },
    });

    return NextResponse.json({ ok: true });
  }

  // Reorder/update a weekday column
  const weekday: Weekday = day as Weekday;
  const batch = tasks as Array<{ id: string; text?: string; tags?: string[] }>;
  const ids = batch.map((t) => t.id);

  await TaskModel.deleteMany({
    userId: uid,
    type: 'regular',
    date: weekDates[weekday],
    id: { $nin: ids },
  });

  const docs: TaskDoc[] = await TaskModel.find(
    { userId: uid, id: { $in: ids } },
    { id: 1, type: 1, text: 1, tags: 1 }
  )
    .lean<TaskDoc[]>()
    .exec();

  const typeById = new Map(docs.map((d) => [d.id, d.type]));
  const textById = new Map(docs.map((d) => [d.id, d.text]));
  const tagsById = new Map(docs.map((d) => [d.id, d.tags ?? []]));

  await Promise.all(
    batch.map((t, i) => {
      const ttype = typeById.get(t.id);
      const textFromReq = t.text ?? textById.get(t.id) ?? '';
      const tags = t.tags ?? tagsById.get(t.id) ?? [];

      if (ttype === 'weekly') {
        return TaskModel.updateOne(
          { userId: uid, type: 'weekly', id: t.id },
          {
            $set: {
              dayOfWeek: weekday,
              order: i + 1,
              updatedAt: now,
              tags,
            },
          }
        );
      }
      if (ttype === 'regular') {
        return TaskModel.updateOne(
          { userId: uid, type: 'regular', id: t.id },
          {
            $set: {
              date: weekDates[weekday],
              order: i + 1,
              updatedAt: now,
              tags,
            },
          }
        );
      }
      if (ttype === 'backlog') {
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
                date: weekDates[weekday],
                order: i + 1,
                completed: false,
                updatedAt: now,
              },
              $setOnInsert: {
                userId: uid,
                type: 'regular',
                createdAt: now,
              },
            },
            { upsert: true }
          ),
        ]);
      }

      return TaskModel.updateOne(
        { userId: uid, type: 'regular', id: t.id },
        {
          $set: {
            text: textFromReq,
            tags,
            date: weekDates[weekday],
            order: i + 1,
            completed: false,
            updatedAt: now,
          },
          $setOnInsert: {
            userId: uid,
            type: 'regular',
            createdAt: now,
          },
        },
        { upsert: true }
      );
    })
  );

  return NextResponse.json({ ok: true });
}

async function handleBoardDelete(
  uid: Types.ObjectId,
  body: { day: number; taskId: string },
  tz: string
) {
  const { day, taskId } = body;
  if (!taskId) {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
  }
  if (!Number.isInteger(day) || (day !== -1 && !isWeekday(day))) {
    return NextResponse.json(
      { error: 'day must be -1 or 0..6' },
      { status: 400 }
    );
  }

  const Task = TaskModel;

  if (day === -1) {
    const { weekStart } = getRollingWeekDatesZoned(tz);
    await Task.deleteOne({
      userId: uid,
      type: 'backlog',
      weekStart,
      id: taskId,
    });
    return NextResponse.json({ ok: true });
  }

  const doc = await Task.findOne({ userId: uid, id: taskId }, { type: 1 })
    .lean<TaskDoc>()
    .exec();

  if (doc?.type === 'regular') {
    await Task.deleteOne({ userId: uid, type: 'regular', id: taskId });
    return NextResponse.json({ ok: true });
  }

  await Task.updateOne(
    { userId: uid, type: 'weekly', id: taskId },
    { $set: { deletedAt: new Date() } }
  );

  // Remove future instances relative to user's today
  const today = getZonedToday(tz);
  await Task.deleteMany({
    userId: uid,
    type: 'regular',
    id: taskId,
    date: { $gte: today },
  });

  return NextResponse.json({ ok: true });
}

/* ====================================================================== */
/* Order helpers (board)                                                  */
/* ====================================================================== */
async function nextOrderForDay(
  userId: Types.ObjectId,
  weekday: Weekday,
  date: string
) {
  const doc = await TaskModel.findOne(
    {
      userId,
      $or: [
        { type: 'weekly', dayOfWeek: weekday },
        { type: 'regular', date },
      ],
    },
    { order: 1 }
  )
    .sort({ order: -1 })
    .lean<TaskDoc>()
    .exec();

  return (doc?.order ?? 0) + 1;
}

async function nextOrderBacklog(userId: Types.ObjectId, weekStart: string) {
  const doc = await TaskModel.findOne(
    { userId, type: 'backlog', weekStart },
    { order: 1 }
  )
    .sort({ order: -1 })
    .lean<TaskDoc>()
    .exec();

  return (doc?.order ?? 0) + 1;
}
