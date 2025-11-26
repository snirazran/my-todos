// src/app/api/tasks/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { Types } from 'mongoose';
import { v4 as uuid } from 'uuid';
import connectMongo from '@/lib/mongoose';
import TaskModel, {
  type TaskDoc,
  type TaskType,
  type Weekday,
} from '@/lib/models/Task';

type Origin = 'weekly' | 'regular';
type BoardItem = { id: string; text: string; order: number; type: TaskType };

const pad = (n: number) => String(n).padStart(2, '0');
const isWeekday = (n: number): n is Weekday =>
  Number.isInteger(n) && n >= 0 && n <= 6;

async function currentUserId() {
  const s = await getServerSession(authOptions);
  return s?.user?.id ? new Types.ObjectId(s.user.id) : null;
}
function unauth() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function ymdLocal(d: Date) {
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  return `${y}-${m}-${day}`;
}
function dowLocalFromYMD(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.getDay() as Weekday;
}
function atLocalMidnight(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function sundayOf(date = new Date()) {
  const base = atLocalMidnight(date);
  const sun = new Date(base);
  sun.setDate(base.getDate() - base.getDay());
  return sun;
}
function getWeekDates(start = sundayOf()) {
  const weekStart = ymdLocal(start);
  const weekDates: string[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return ymdLocal(d);
  });
  return { weekStart, weekDates };
}
function isBoardMode(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  return (
    params.get('view') === 'board' ||
    params.has('day') ||
    params.get('fullWeek') === '1'
  );
}

/* ====================================================================== */
/* GET handler                                                            */
/* ====================================================================== */
export async function GET(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();
  await connectMongo();

  if (isBoardMode(req)) {
    return handleBoardGet(req, uid);
  }
  return handleDailyGet(req, uid);
}

/* ====================================================================== */
/* POST handler (create tasks)                                            */
/* ====================================================================== */
export async function POST(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();
  await connectMongo();

  // For now, POST is used by the board (weekly/backlog/one-time)
  const body = await req.json();
  const text = String(body?.text ?? '').trim();
  const rawDays: number[] = Array.isArray(body?.days) ? body.days : [];
  const repeat: 'weekly' | 'this-week' =
    body?.repeat === 'this-week' ? 'this-week' : 'weekly';

  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  const days = rawDays
    .map(Number)
    .filter(Number.isInteger)
    .filter((d) => d === -1 || isWeekday(d));

  if (days.length === 0) {
    return NextResponse.json(
      { error: 'days must include -1 or 0..6' },
      { status: 400 }
    );
  }

  const { weekStart, weekDates } = getWeekDates();
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
      });
    }
    return NextResponse.json({ ok: true });
  }

  // One-time tasks: either backlog (-1) or regular (specific weekday)
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

  // Board reorder/update
  if (body && Object.prototype.hasOwnProperty.call(body, 'day')) {
    return handleBoardPut(uid, body);
  }

  // Daily toggle
  const { date, taskId, completed } = body ?? {};
  if (!date || !taskId || typeof completed !== 'boolean') {
    return NextResponse.json(
      { error: 'date, taskId and completed(boolean) are required' },
      { status: 400 }
    );
  }

  const doc = await TaskModel.findOne({ userId: uid, id: taskId }).lean<TaskDoc>();
  if (!doc) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  const update =
    completed === true
      ? { $addToSet: { completedDates: date } }
      : { $pull: { completedDates: date } };

  // Also keep the legacy "completed" flag for one-time tasks
  if (doc.type === 'regular') {
    (update as any).$set = { ...(update as any).$set, completed };
  }

  await TaskModel.updateOne({ userId: uid, id: taskId }, update);
  return NextResponse.json({ ok: true });
}

/* ====================================================================== */
/* DELETE handler (remove daily or board item)                            */
/* ====================================================================== */
export async function DELETE(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();
  await connectMongo();

  const body = await req.json();

  // Board delete
  if (body && Object.prototype.hasOwnProperty.call(body, 'day')) {
    return handleBoardDelete(uid, body);
  }

  // Daily delete/suppress
  const { date, taskId } = body ?? {};
  if (!date || !taskId) {
    return NextResponse.json(
      { error: 'date and taskId are required' },
      { status: 400 }
    );
  }

  const doc = await TaskModel.findOne({ userId: uid, id: taskId }).lean<TaskDoc>();
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

  // backlog shouldn't appear in daily view
  return NextResponse.json({ ok: true });
}

/* ====================================================================== */
/* Helpers: daily view                                                    */
/* ====================================================================== */
async function handleDailyGet(req: NextRequest, userId: Types.ObjectId) {
  // default to *local* today
  const url = new URL(req.url);
  const dateParam = url.searchParams.get('date');
  const todayLocal = ymdLocal(new Date());
  const date = dateParam ?? todayLocal;
  const dow = dowLocalFromYMD(date);

  const tasks = await TaskModel.find(
    {
      userId,
      $or: [
        { type: 'weekly', dayOfWeek: dow },
        { type: 'regular', date },
      ],
    },
    { id: 1, text: 1, order: 1, type: 1, completed: 1, completedDates: 1, suppressedDates: 1 }
  )
    .sort({ order: 1 })
    .lean<TaskDoc>()
    .exec();

  const weeklyIdsForUI = new Set(
    tasks.filter((t) => t.type === 'weekly').map((t) => t.id)
  );

  const filtered = tasks.filter(
    (t) => !(t.suppressedDates ?? []).includes(date)
  );

  const output = filtered
    .map((t) => ({
      id: t.id,
      text: t.text,
      order: t.order ?? 0,
      completed:
        (t.completedDates ?? []).includes(date) || (!!t.completed && t.type === 'regular'),
      origin: t.type as Origin,
    }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return NextResponse.json({
    date,
    tasks: output,
    weeklyIds: Array.from(weeklyIdsForUI),
  });
}

/* ====================================================================== */
/* Helpers: board view (weekly/backlog manager)                           */
/* ====================================================================== */
async function handleBoardGet(req: NextRequest, uid: Types.ObjectId) {
  const Task = TaskModel;
  const { weekStart, weekDates } = getWeekDates();

  const dayParam = req.nextUrl.searchParams.get('day');

  // Single-column fetch
  if (dayParam !== null) {
    const dayNum = Number(dayParam);

    // Later (backlog)
    if (dayNum === -1) {
      const later = await Task.find(
        { userId: uid, type: 'backlog', weekStart },
        { id: 1, text: 1, order: 1, type: 1, _id: 0 }
      )
        .sort({ order: 1 })
        .lean<TaskDoc>()
        .exec();

      const out: BoardItem[] = later.map(({ id, text, order, type }) => ({
        id,
        text,
        order,
        type,
      }));
      return NextResponse.json(out);
    }

    if (!isWeekday(dayNum)) {
      return NextResponse.json(
        { error: 'day must be -1 or 0..6' },
        { status: 400 }
      );
    }

    // Weekly + Regular for that weekday
    const docs = await Task.find(
      {
        userId: uid,
        $or: [
          { type: 'weekly', dayOfWeek: dayNum },
          { type: 'regular', date: weekDates[dayNum] },
        ],
      },
      { id: 1, text: 1, order: 1, type: 1, _id: 0 }
    )
      .sort({ order: 1 })
      .lean<TaskDoc>()
      .exec();

    const out: BoardItem[] = docs.map(({ id, text, order, type }) => ({
      id,
      text,
      order,
      type,
    }));
    return NextResponse.json(out);
  }

  // Full week fetch (Sun..Sat + Later)
  const week: BoardItem[][] = Array.from({ length: 8 }, () => []);

  for (let d: Weekday = 0; d <= 6; d = (d + 1) as Weekday) {
    const docs = await Task.find(
      {
        userId: uid,
        $or: [
          { type: 'weekly', dayOfWeek: d },
          { type: 'regular', date: weekDates[d] },
        ],
      },
      { id: 1, text: 1, order: 1, type: 1, _id: 0 }
    )
      .sort({ order: 1 })
      .lean<TaskDoc>()
      .exec();

    week[d] = docs.map(({ id, text, order, type }) => ({
      id,
      text,
      order,
      type,
    }));
  }

  const backlogDocs = await Task.find(
    { userId: uid, type: 'backlog', weekStart },
    { id: 1, text: 1, order: 1, type: 1, _id: 0 }
  )
    .sort({ order: 1 })
    .lean<TaskDoc>()
    .exec();

  week[7] = backlogDocs.map(({ id, text, order, type }) => ({
    id,
    text,
    order,
    type,
  }));

  return NextResponse.json(week);
}

async function handleBoardPut(
  uid: Types.ObjectId,
  body: { day: number; tasks: Array<{ id: string; text?: string }> }
) {
  const { day, tasks } = body;
  if (!Number.isInteger(day) || (day !== -1 && !isWeekday(day))) {
    return NextResponse.json(
      { error: 'day must be -1 or 0..6' },
      { status: 400 }
    );
  }

  const now = new Date();
  const { weekStart, weekDates } = getWeekDates();

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

    // Fetch any existing docs (any type) to preserve text
    const docs = await TaskModel.find(
      { userId: uid, id: { $in: ids } },
      { id: 1, text: 1, type: 1 }
    )
      .lean<TaskDoc>()
      .exec();

    // Prefer DB text; fall back to request payload text so backlog entries never go blank
    const textFromReq = new Map(
      (tasks as Array<{ id: string; text?: string }>).map((t) => [
        t.id,
        t.text ?? '',
      ])
    );
    const textById = new Map(
      docs.map((d) => [d.id, d.text]).map(([id, text]) => [id, text ?? ''])
    );

    // Upsert backlog entries in the given order
    await Promise.all(
      ids.map((id, i) =>
        TaskModel.updateOne(
          { userId: uid, type: 'backlog', weekStart, id },
          {
            $set: {
              order: i + 1,
              text: textById.get(id) ?? textFromReq.get(id) ?? '',
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

    // Convert any weekly/regular with these ids into backlog (remove old types)
    await TaskModel.deleteMany({
      userId: uid,
      id: { $in: ids },
      type: { $in: ['weekly', 'regular'] },
    });

    return NextResponse.json({ ok: true });
  }

  // Reorder/update a weekday column
  const weekday: Weekday = day as Weekday;
  const batch = tasks as Array<{ id: string; text?: string }>;
  const ids = batch.map((t) => t.id);

  // Remove one-time (regular) not present anymore
  await TaskModel.deleteMany({
    userId: uid,
    type: 'regular',
    date: weekDates[weekday],
    id: { $nin: ids },
  });

  // Get current types/text for all involved ids
  const docs = await TaskModel.find(
    { userId: uid, id: { $in: ids } },
    { id: 1, type: 1, text: 1 }
  )
    .lean<TaskDoc>()
    .exec();

  const typeById = new Map(docs.map((d) => [d.id, d.type]));
  const textById = new Map(docs.map((d) => [d.id, d.text]));

  await Promise.all(
    batch.map((t, i) => {
      const ttype = typeById.get(t.id);
      const textFromReq = t.text ?? textById.get(t.id) ?? '';

      if (ttype === 'weekly') {
        // just move/renumber the weekly item
        return TaskModel.updateOne(
          { userId: uid, type: 'weekly', id: t.id },
          { $set: { dayOfWeek: weekday, order: i + 1, updatedAt: now } }
        );
      }
      if (ttype === 'regular') {
        // move/renumber inside this week
        return TaskModel.updateOne(
          { userId: uid, type: 'regular', id: t.id },
          { $set: { date: weekDates[weekday], order: i + 1, updatedAt: now } }
        );
      }
      if (ttype === 'backlog') {
        // promote backlog + one-time on that weekday
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

      // Fallback: id not found (treat as new one-time on this weekday)
      return TaskModel.updateOne(
        { userId: uid, type: 'regular', id: t.id },
        {
          $set: {
            text: textFromReq,
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
  body: { day: number; taskId: string }
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

  // Delete from Later (backlog)
  if (day === -1) {
    const { weekStart } = getWeekDates();
    await Task.deleteOne({ userId: uid, type: 'backlog', weekStart, id: taskId });
    return NextResponse.json({ ok: true });
  }

  // Determine the type for this id
  const doc = await Task.findOne({ userId: uid, id: taskId }, { type: 1 })
    .lean<TaskDoc>()
    .exec();

  if (doc?.type === 'regular') {
    // remove just the one-time instance
    await Task.deleteOne({ userId: uid, type: 'regular', id: taskId });
    return NextResponse.json({ ok: true });
  }

  // weekly: remove the weekly template entry
  await Task.deleteOne({ userId: uid, type: 'weekly', id: taskId });

  // also remove any future one-time clones with the same id (safety)
  const today = ymdLocal(new Date());
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
