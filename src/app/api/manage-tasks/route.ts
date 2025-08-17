// src/app/api/manage-tasks/route.ts
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
  dayOfWeek: number; // 0..6, and -1 = unscheduled backlog
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
  date: string; // YYYY-MM-DD
  tasks: TaskItem[];
}

interface WeeklyBacklogDoc {
  _id?: ObjectId;
  userId: ObjectId;
  weekStart: string; // Sunday YYYY-MM-DD
  tasks: { id: string; text: string; order: number; completed: boolean }[];
}

const getWeeklyCol = async () =>
  (await clientPromise).db('todoTracker').collection<WeeklyDoc>('weeklyTasks');

const getDailyCol = async () =>
  (await clientPromise).db('todoTracker').collection<DayRecord>('dailyTasks');

const getWeeklyBacklogCol = async () =>
  (await clientPromise)
    .db('todoTracker')
    .collection<WeeklyBacklogDoc>('weeklyBacklog');

/* ───────── helpers ───────── */
async function currentUserId() {
  const session = await getServerSession(authOptions);
  return session?.user?.id ? new ObjectId(session.user.id) : null;
}
function unauth() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function sundayOf(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}
function ymd(d: Date) {
  return d.toISOString().split('T')[0];
}

/* ─────────────────── GET ─────────────────── */
export async function GET(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();

  const col = await getWeeklyCol();
  const dayParam = req.nextUrl.searchParams.get('day');

  if (dayParam !== null) {
    // allow -1 for backlog
    const dayNum = Number(dayParam);
    const doc = await col.findOne({ userId: uid, dayOfWeek: dayNum });
    return NextResponse.json(doc?.tasks ?? []);
  }

  // Return 8 buckets: 0..6 + backlog(-1) mapped to index 7
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

  const body = await req.json();
  const text: string = body.text;
  // days can include 0..6 and/or 7 (UI) -> we map 7 => -1 for backlog
  const uiDays: number[] = Array.isArray(body.days) ? body.days : [];
  const repeat: 'weekly' | 'this-week' =
    body.repeat === 'this-week' ? 'this-week' : 'weekly';

  const days = uiDays.map((d) => (d === 7 ? -1 : d));

  const weeklyCol = await getWeeklyCol();
  const dailyCol = await getDailyCol();
  const backlogCol = await getWeeklyBacklogCol();

  if (repeat === 'weekly') {
    // write into weeklyTasks (including -1 = backlog)
    await Promise.all(
      days.map(async (dayOfWeek) => {
        const doc = await weeklyCol.findOne({ userId: uid, dayOfWeek });
        const nextOrder =
          (doc?.tasks?.reduce((m, t) => Math.max(m, t.order), 0) ?? 0) + 1;

        await weeklyCol.updateOne(
          { userId: uid, dayOfWeek },
          {
            $push: {
              tasks: { id: uuid(), text, order: nextOrder },
            },
          },
          { upsert: true }
        );
      })
    );
    return NextResponse.json({ ok: true });
  }

  // repeat === 'this-week'
  const start = sundayOf();
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return ymd(d);
  });

  for (const d of days) {
    if (d === -1) {
      // this-week backlog doc
      const weekStart = ymd(start);
      const doc = await backlogCol.findOne({ userId: uid, weekStart });
      const nextOrder =
        (doc?.tasks?.reduce((m, t) => Math.max(m, t.order), 0) ?? 0) + 1;

      await backlogCol.updateOne(
        { userId: uid, weekStart },
        {
          $setOnInsert: { userId: uid, weekStart, tasks: [] },
          $push: {
            tasks: { id: uuid(), text, order: nextOrder, completed: false },
          },
        },
        { upsert: true }
      );
    } else {
      // concrete day: add to that date's dailyTasks
      const date = weekDates[d];
      // ensure doc exists
      await dailyCol.updateOne(
        { userId: uid, date },
        { $setOnInsert: { userId: uid, date, tasks: [] } },
        { upsert: true }
      );
      const doc = await dailyCol.findOne({ userId: uid, date });
      const nextOrder =
        (doc?.tasks?.reduce((m, t) => Math.max(m, t.order), 0) ?? 0) + 1;

      await dailyCol.updateOne(
        { userId: uid, date },
        {
          $push: {
            tasks: {
              id: uuid(),
              text,
              order: nextOrder,
              completed: false,
            },
          },
        }
      );
    }
  }

  return NextResponse.json({ ok: true });
}

/* ─────────────────── PUT ─────────────────── */
export async function PUT(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();

  const { day, tasks } = await req.json();
  // accept UI 7, map to -1 for storage
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

  // 1) remove from weekly template (including unscheduled -1)
  await weeklyCol.updateOne(
    { userId: uid, dayOfWeek },
    { $pull: { tasks: { id: taskId } } }
  );

  // 2) remove from all future days where it exists
  const today = ymd(new Date());
  await dailyCol.updateMany(
    { userId: uid, date: { $gte: today }, 'tasks.id': taskId },
    { $pull: { tasks: { id: taskId } } } as any
  );

  return NextResponse.json({ ok: true });
}
