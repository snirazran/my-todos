// src/app/api/manage-tasks/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { v4 as uuid } from 'uuid';

/* ---------- model ---------- */
type TaskType = 'weekly' | 'regular' | 'backlog';
type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
const isWeekday = (n: number): n is Weekday =>
  Number.isInteger(n) && n >= 0 && n <= 6;

type BoardItem = { id: string; text: string; order: number };

interface TaskDoc {
  _id?: ObjectId;
  userId: ObjectId;
  type: TaskType;

  // shared
  id: string; // logical id for the task row
  text: string;
  order: number;
  completed?: boolean;

  // keys by type
  dayOfWeek?: Weekday; // weekly
  date?: string; // regular: 'YYYY-MM-DD' (LOCAL)
  weekStart?: string; // backlog: local Sunday 'YYYY-MM-DD'

  createdAt: Date;
  updatedAt: Date;
}

/* ---------- helpers ---------- */
const colTasks = async () =>
  (await clientPromise).db('todoTracker').collection<TaskDoc>('tasks');

async function currentUserId() {
  const s = await getServerSession(authOptions);
  return s?.user?.id ? new ObjectId(s.user.id) : null;
}
function unauth() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/** local midnight / week helpers (LOCAL time) */
function atLocalMidnight(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function sundayOf(date = new Date()) {
  const base = atLocalMidnight(date);
  const sun = new Date(base);
  sun.setDate(base.getDate() - base.getDay());
  return sun;
}
function ymdLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function todayLocalYMD() {
  return ymdLocal(new Date());
}

/* ---------- order helpers ---------- */
// unified: gives "next order" for a weekday column (weekly + regular together)
async function nextOrderForDay(
  userId: ObjectId,
  weekday: Weekday,
  date: string
) {
  const c = await colTasks();
  const doc = await c
    .find<Pick<TaskDoc, 'order'>>(
      {
        userId,
        $or: [
          { type: 'weekly', dayOfWeek: weekday },
          { type: 'regular', date },
        ],
      },
      { projection: { order: 1 } }
    )
    .sort({ order: -1 })
    .limit(1)
    .next();
  return (doc?.order ?? 0) + 1;
}

async function nextOrderBacklog(userId: ObjectId, weekStart: string) {
  const c = await colTasks();
  const doc = await c
    .find<Pick<TaskDoc, 'order'>>(
      { userId, type: 'backlog', weekStart },
      { projection: { order: 1 } }
    )
    .sort({ order: -1 })
    .limit(1)
    .next();
  return (doc?.order ?? 0) + 1;
}

/* ─────────────────── GET ─────────────────── */
export async function GET(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();
  const c = await colTasks();

  const start = sundayOf();
  const weekStart = ymdLocal(start);
  const weekDates: string[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return ymdLocal(d);
  });

  const dayParam = req.nextUrl.searchParams.get('day');

  if (dayParam !== null) {
    const dayNum = Number(dayParam);

    if (dayNum === -1) {
      const later = await c
        .find<Pick<TaskDoc, 'id' | 'text' | 'order'>>(
          { userId: uid, type: 'backlog', weekStart },
          { projection: { id: 1, text: 1, order: 1 } }
        )
        .sort({ order: 1 })
        .toArray();
      return NextResponse.json(
        later.map(({ id, text, order }) => ({ id, text, order }))
      );
    }

    if (!isWeekday(dayNum)) {
      return NextResponse.json(
        { error: 'day must be -1 or 0..6' },
        { status: 400 }
      );
    }

    const docs = await c
      .find<Pick<TaskDoc, 'id' | 'text' | 'order'>>(
        {
          userId: uid,
          $or: [
            { type: 'weekly', dayOfWeek: dayNum },
            { type: 'regular', date: weekDates[dayNum] },
          ],
        },
        { projection: { id: 1, text: 1, order: 1 } }
      )
      .sort({ order: 1 })
      .toArray();

    return NextResponse.json(
      docs.map(({ id, text, order }) => ({ id, text, order }))
    );
  }

  const week: BoardItem[][] = Array.from({ length: 8 }, () => []);

  for (let d: Weekday = 0; d <= 6; d = (d + 1) as Weekday) {
    const docs = await c
      .find<Pick<TaskDoc, 'id' | 'text' | 'order'>>(
        {
          userId: uid,
          $or: [
            { type: 'weekly', dayOfWeek: d },
            { type: 'regular', date: weekDates[d] },
          ],
        },
        { projection: { id: 1, text: 1, order: 1 } }
      )
      .sort({ order: 1 })
      .toArray();

    week[d] = docs.map(({ id, text, order }) => ({ id, text, order }));
  }

  const backlogDocs = await c
    .find<Pick<TaskDoc, 'id' | 'text' | 'order'>>(
      { userId: uid, type: 'backlog', weekStart },
      { projection: { id: 1, text: 1, order: 1 } }
    )
    .sort({ order: 1 })
    .toArray();

  week[7] = backlogDocs.map(({ id, text, order }) => ({ id, text, order }));

  return NextResponse.json(week);
}

/* ─────────────────── POST ─────────────────── */
export async function POST(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();

  try {
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

    const c = await colTasks();
    const now = new Date();

    const start = sundayOf();
    const weekStart = ymdLocal(start);
    const weekDates: string[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return ymdLocal(d);
    });

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
        const order = await nextOrderForDay(
          uid,
          dayOfWeek,
          weekDates[dayOfWeek]
        );
        await c.insertOne({
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

    for (const d of days) {
      const id = uuid();
      if (d === -1) {
        const order = await nextOrderBacklog(uid, weekStart);
        await c.insertOne({
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
        await c.insertOne({
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
  } catch (err: any) {
    console.error('POST /api/manage-tasks failed:', err);
    return NextResponse.json(
      { error: err?.message ?? 'Internal error' },
      { status: 500 }
    );
  }
}

/* ─────────────────── PUT ─────────────────── */
// Body: { day: -1 | 0..6, tasks: Array<{id:string, text?:string}> }
export async function PUT(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();

  const { day, tasks } = await req.json();
  if (!Number.isInteger(day) || (day !== -1 && !isWeekday(day))) {
    return NextResponse.json(
      { error: 'day must be -1 or 0..6' },
      { status: 400 }
    );
  }

  const c = await colTasks();
  const now = new Date();

  const start = sundayOf();
  const weekStart = ymdLocal(start);
  const weekDates: string[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return ymdLocal(d);
  });

  if (day === -1) {
    const ids = (tasks as Array<{ id: string }>).map((t) => t.id);

    if (ids.length === 0) {
      await c.deleteMany({ userId: uid, type: 'backlog', weekStart });
      return NextResponse.json({ ok: true });
    }

    await c.deleteMany({
      userId: uid,
      type: 'backlog',
      weekStart,
      id: { $nin: ids },
    });

    const docs = await c
      .find({ userId: uid, id: { $in: ids } })
      .project<Pick<TaskDoc, 'id' | 'text'>>({ id: 1, text: 1 })
      .toArray();
    const textById = new Map(docs.map((d) => [d.id, d.text]));

    await Promise.all(
      ids.map((id, i) =>
        c.updateOne(
          { userId: uid, type: 'backlog', weekStart, id },
          {
            $set: {
              order: i + 1,
              text: textById.get(id) ?? '',
              weekStart,
              updatedAt: now,
            },
            $setOnInsert: {
              userId: uid,
              type: 'backlog',
              createdAt: now,
              completed: false,
            },
          },
          { upsert: true }
        )
      )
    );

    return NextResponse.json({ ok: true });
  }

  const weekday: Weekday = day as Weekday;
  const batch = tasks as Array<{ id: string; text?: string }>;
  const ids = batch.map((t) => t.id);

  await c.deleteMany({
    userId: uid,
    type: 'regular',
    date: weekDates[weekday],
    id: { $nin: ids },
  });

  const docs = await c
    .find({ userId: uid, id: { $in: ids } })
    .project<Pick<TaskDoc, 'id' | 'type' | 'text'>>({ id: 1, type: 1, text: 1 })
    .toArray();

  const typeById = new Map(docs.map((d) => [d.id, d.type]));
  const textById = new Map(docs.map((d) => [d.id, d.text]));

  await Promise.all(
    batch.map((t, i) => {
      const ttype = typeById.get(t.id);
      const textFromReq = t.text ?? textById.get(t.id) ?? '';

      if (ttype === 'weekly') {
        return c.updateOne(
          { userId: uid, type: 'weekly', id: t.id },
          { $set: { dayOfWeek: weekday, order: i + 1, updatedAt: now } }
        );
      }
      if (ttype === 'regular') {
        return c.updateOne(
          { userId: uid, type: 'regular', id: t.id },
          { $set: { date: weekDates[weekday], order: i + 1, updatedAt: now } }
        );
      }
      if (ttype === 'backlog') {
        return Promise.all([
          c.deleteOne({ userId: uid, type: 'backlog', weekStart, id: t.id }),
          c.updateOne(
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

      // Fallback: id not found (e.g., backlog was deleted by the other PUT first)
      return c.updateOne(
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

/* ────────────────── DELETE ────────────────── */
export async function DELETE(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();

  const { day, taskId } = await req.json();
  if (!taskId) {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
  }
  if (!Number.isInteger(day) || (day !== -1 && !isWeekday(day))) {
    return NextResponse.json(
      { error: 'day must be -1 or 0..6' },
      { status: 400 }
    );
  }

  const c = await colTasks();

  if (day === -1) {
    const weekStart = ymdLocal(sundayOf());
    await c.deleteOne({ userId: uid, type: 'backlog', weekStart, id: taskId });
    return NextResponse.json({ ok: true });
  }

  const doc = await c.findOne<Pick<TaskDoc, 'type'>>(
    { userId: uid, id: taskId },
    { projection: { type: 1 } }
  );

  if (doc?.type === 'regular') {
    await c.deleteOne({ userId: uid, type: 'regular', id: taskId });
    return NextResponse.json({ ok: true });
  }

  await c.deleteOne({ userId: uid, type: 'weekly', id: taskId });

  const today = todayLocalYMD();
  await c.deleteMany({
    userId: uid,
    type: 'regular',
    id: taskId,
    date: { $gte: today },
  });

  return NextResponse.json({ ok: true });
}
