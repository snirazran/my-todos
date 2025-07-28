// src/app/api/manage-tasks/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
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
  dayOfWeek: number;
  tasks: WeeklyTask[];
}

/* ✅  מוסיפים גם את DayRecord  (או מייבאים ממודול משותף) */
interface TaskItem {
  id: string;
  text: string;
  order: number;
  completed: boolean;
}
interface DayRecord {
  _id?: ObjectId;
  userId: ObjectId;
  date: string; // YYYY‑MM‑DD
  tasks: TaskItem[];
}

const getCol = async () =>
  (await clientPromise).db('todoTracker').collection<WeeklyDoc>('weeklyTasks');

/* ─────────────── helpers ─────────────── */
async function currentUserId() {
  const session = await getServerSession(authOptions);
  return session?.user?.id ? new ObjectId(session.user.id) : null;
}
function unauth() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/* ─────────────────── GET ─────────────────── */
export async function GET(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();

  const col = await getCol();
  const day = req.nextUrl.searchParams.get('day');

  if (day !== null) {
    const doc = await col.findOne({ userId: uid, dayOfWeek: +day });
    return NextResponse.json(doc?.tasks ?? []);
  }

  const docs = await col.find({ userId: uid }).toArray();
  const week: WeeklyTask[][] = Array.from({ length: 7 }, () => []);
  docs.forEach((d) => (week[d.dayOfWeek] = d.tasks));
  return NextResponse.json(week);
}

/* ─────────────────── POST ─────────────────── */
export async function POST(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();

  const { text, days } = await req.json();
  const col = await getCol();

  await Promise.all(
    (days as number[]).map(async (d) => {
      const doc = await col.findOne({ userId: uid, dayOfWeek: d });
      const nextOrder =
        (doc?.tasks.reduce((m, t) => Math.max(m, t.order), 0) ?? 0) + 1;

      await col.updateOne(
        { userId: uid, dayOfWeek: d },
        { $push: { tasks: { id: uuid(), text, order: nextOrder } } },
        { upsert: true }
      );
    })
  );

  return NextResponse.json({ ok: true });
}

/* ─────────────────── PUT ─────────────────── */
export async function PUT(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();

  const { day, tasks } = await req.json();
  const ordered = tasks.map((t: WeeklyTask, i: number) => ({
    ...t,
    order: i + 1,
  }));

  await (
    await getCol()
  ).updateOne({ userId: uid, dayOfWeek: day }, { $set: { tasks: ordered } });

  return NextResponse.json({ ok: true });
}

/* ────────────────── DELETE ────────────────── */
export async function DELETE(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();

  const { day, taskId } = await req.json();

  const client = await clientPromise;
  const weeklyCol = client
    .db('todoTracker')
    .collection<WeeklyDoc>('weeklyTasks');
  const dailyCol = client.db('todoTracker').collection<DayRecord>('dailyTasks');

  /* 1️⃣ – מוחקים מהתבנית השבועית */
  await weeklyCol.updateOne(
    { userId: uid, dayOfWeek: day },
    { $pull: { tasks: { id: taskId } } }
  );

  /* 2️⃣ – מוחקים מכל הימים העתידיים (הסר את המסנן כדי למחוק גם מהעבר) */
  const today = new Date().toISOString().split('T')[0];

  await dailyCol.updateMany(
    {
      userId: uid,
      date: { $gte: today },
      'tasks.id': taskId,
    },
    { $pull: { tasks: { id: taskId } } } as any // ✅  cast קטן כדי להשתיק TS
  );

  return NextResponse.json({ ok: true });
}
