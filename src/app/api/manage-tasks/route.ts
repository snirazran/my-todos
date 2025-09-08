import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { v4 as uuid } from 'uuid';

/* ---------- types ---------- */
interface WeeklyTask {
  id: string;
  text: string;
  order: number;
}
interface WeeklyDoc {
  _id?: ObjectId;
  userId: ObjectId;
  dayOfWeek: number; // 0..6, -1 = “unscheduled (every week template)”
  tasks: WeeklyTask[];
}

interface TaskItem {
  id: string;
  text: string;
  order: number;
  completed: boolean;
}
interface DayRecord {
  _id?: ObjectId;
  userId: ObjectId;
  date: string; // YYYY-MM-DD (LOCAL)
  tasks: TaskItem[];
}

interface WeeklyBacklogDoc {
  _id?: ObjectId;
  userId: ObjectId;
  weekStart: string; // LOCAL Sunday YYYY-MM-DD
  tasks: { id: string; text: string; order: number; completed: boolean }[];
}

/* ---------- helpers ---------- */
const getWeeklyCol = async () =>
  (await clientPromise).db('todoTracker').collection<WeeklyDoc>('weeklyTasks');
const getDailyCol = async () =>
  (await clientPromise).db('todoTracker').collection<DayRecord>('dailyTasks');
const getWeeklyBacklogCol = async () =>
  (await clientPromise)
    .db('todoTracker')
    .collection<WeeklyBacklogDoc>('weeklyBacklog');

async function currentUserId() {
  const session = await getServerSession(authOptions);
  return session?.user?.id ? new ObjectId(session.user.id) : null;
}
function unauth() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/** local midnight */
function atLocalMidnight(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
/** Local week: return local Sunday */
function sundayOf(date = new Date()) {
  const base = atLocalMidnight(date);
  const day = base.getDay(); // 0 = Sunday
  const sun = new Date(base);
  sun.setDate(base.getDate() - day);
  return sun;
}
/** Format local date as YYYY-MM-DD */
function ymdLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* ─────────────────── GET ─────────────────── */
export async function GET(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();

  const dayParam = req.nextUrl.searchParams.get('day');
  const col = await getWeeklyCol();

  if (dayParam !== null) {
    const dayNum = Number(dayParam); // allow -1
    const doc = await col.findOne({ userId: uid, dayOfWeek: dayNum });
    return NextResponse.json(doc?.tasks ?? []);
  }

  // Return 8 buckets: 0..6 + backlog(-1) at index 7
  const docs = await col.find({ userId: uid }).toArray();
  const week: WeeklyTask[][] = Array.from({ length: 8 }, () => []);
  docs.forEach((d) => {
    const idx = d.dayOfWeek === -1 ? 7 : d.dayOfWeek;
    week[idx] = (d.tasks ?? []).sort((a, b) => a.order - b.order);
  });
  return NextResponse.json(week);
}

/* ─────────────────── POST ─────────────────── */
export async function POST(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();

  try {
    const body = await req.json();
    const text = String(body?.text ?? '').trim();
    const uiDays: number[] = Array.isArray(body?.days) ? body.days : [];
    const repeat: 'weekly' | 'this-week' =
      body?.repeat === 'this-week' ? 'this-week' : 'weekly';

    // optional index where to insert (0..N). If null/undefined -> append.
    const insertAtRaw = body?.insertAt;
    const insertAt: number | null =
      Number.isInteger(insertAtRaw) && insertAtRaw >= 0
        ? Number(insertAtRaw)
        : null;

    if (!text) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 });
    }

    // UI 0..6, 7 = “no day” → -1
    const days = uiDays
      .map((d) => Number(d))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 7)
      .map((d) => (d === 7 ? -1 : d));

    const weeklyCol = await getWeeklyCol();
    const dailyCol = await getDailyCol();
    const backlogCol = await getWeeklyBacklogCol();

    /* ---------------- weekly template ---------------- */
    if (repeat === 'weekly') {
      await Promise.all(
        days.map(async (dayOfWeek) => {
          const doc = await weeklyCol.findOne({ userId: uid, dayOfWeek });
          const arr = (doc?.tasks ?? []).slice();

          const at =
            insertAt == null ? arr.length : Math.min(arr.length, insertAt);
          const newTask = { id: uuid(), text, order: 0 };

          arr.splice(at, 0, newTask);
          const renumbered = arr.map((t, i) => ({ ...t, order: i + 1 }));

          await weeklyCol.updateOne(
            { userId: uid, dayOfWeek },
            { $set: { tasks: renumbered } },
            { upsert: true }
          );
        })
      );
      return NextResponse.json({ ok: true });
    }

    /* ---------------- this week (dated docs / backlog) ---------------- */
    const start = sundayOf();
    const weekStart = ymdLocal(start);
    const weekDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return ymdLocal(d);
    });

    for (const d of days) {
      if (d === -1) {
        // backlog for this specific week
        const doc = await backlogCol.findOne({ userId: uid, weekStart });
        const arr = (doc?.tasks ?? []).slice() as {
          id: string;
          text: string;
          order: number;
          completed: boolean;
        }[];

        const at =
          insertAt == null ? arr.length : Math.min(arr.length, insertAt);
        arr.splice(at, 0, { id: uuid(), text, order: 0, completed: false });

        const renumbered = arr.map((t, i) => ({ ...t, order: i + 1 }));

        await backlogCol.updateOne(
          { userId: uid, weekStart },
          { $set: { userId: uid, weekStart, tasks: renumbered } },
          { upsert: true }
        );
      } else {
        const date = weekDates[d];

        await dailyCol.updateOne(
          { userId: uid, date },
          { $setOnInsert: { userId: uid, date, tasks: [] } },
          { upsert: true }
        );

        const doc = await dailyCol.findOne({ userId: uid, date });
        const arr = (doc?.tasks ?? []).slice();

        const at =
          insertAt == null ? arr.length : Math.min(arr.length, insertAt);
        arr.splice(at, 0, { id: uuid(), text, order: 0, completed: false });

        const renumbered = arr.map((t, i) => ({ ...t, order: i + 1 }));

        await dailyCol.updateOne(
          { userId: uid, date },
          { $set: { tasks: renumbered } }
        );
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
export async function PUT(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();

  const { day, tasks } = await req.json();
  const dayOfWeek = day === 7 ? -1 : day;

  await (
    await getWeeklyCol()
  ).updateOne(
    { userId: uid, dayOfWeek },
    {
      $set: {
        tasks: (tasks as WeeklyTask[]).map((t, i) => ({ ...t, order: i + 1 })),
      },
    },
    { upsert: true }
  );

  return NextResponse.json({ ok: true });
}

/* ────────────────── DELETE ────────────────── */
export async function DELETE(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();

  const { day, taskId } = await req.json();
  const dayOfWeek = day === 7 ? -1 : day;

  const client = await clientPromise;
  const weeklyCol = client
    .db('todoTracker')
    .collection<WeeklyDoc>('weeklyTasks');
  const dailyCol = client.db('todoTracker').collection<DayRecord>('dailyTasks');

  // remove from weekly template
  await weeklyCol.updateOne(
    { userId: uid, dayOfWeek },
    { $pull: { tasks: { id: taskId } } }
  );

  // remove from all future local days
  const todayLocal = ymdLocal(new Date());
  await dailyCol.updateMany(
    { userId: uid, date: { $gte: todayLocal }, 'tasks.id': taskId },
    { $pull: { tasks: { id: taskId } } } as any
  );

  return NextResponse.json({ ok: true });
}
