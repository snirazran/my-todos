import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

/* ---------- types ---------- */
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

interface WeeklyDoc {
  _id?: ObjectId;
  userId: ObjectId;
  dayOfWeek: number; // 0 = Sunday … 6 = Saturday
  tasks: { id: string; text: string; order: number }[];
}

/* ===================================================================== */
/* GET – return (and lazily create) the list for the requested calendar‑day
/* ===================================================================== */
export async function GET(req: NextRequest) {
  /* ---------- auth ---------- */
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }
  const userId = new ObjectId(session.user.id);

  try {
    /* resolve the day */
    const date =
      new URL(req.url).searchParams.get('date') ??
      new Date().toISOString().split('T')[0];

    const client = await clientPromise;
    const db = client.db('todoTracker');
    const daysCol = db.collection<DayRecord>('dailyTasks');
    const weeklyCol = db.collection<WeeklyDoc>('weeklyTasks');

    /* build today’s template from weeklyTasks (per‑user) */
    const dow = new Date(date).getDay();
    const weekly =
      (await weeklyCol.findOne({ userId, dayOfWeek: dow }))?.tasks ?? [];
    const template = weekly
      .sort((a, b) => a.order - b.order)
      .map((t) => ({ ...t, completed: false }));

    /* 1 ▸ upsert today’s row */
    await daysCol.updateOne(
      { userId, date },
      { $setOnInsert: { userId, date, tasks: template } },
      { upsert: true }
    );

    /* 2 ▸ merge newly‑added weekly tasks (so old days get new tasks) */
    let dayRecord = await daysCol.findOne({ userId, date });

    if (dayRecord && template.length) {
      const missing = template.filter(
        (tpl) => !dayRecord!.tasks.some((d) => d.id === tpl.id)
      );
      if (missing.length) {
        await daysCol.updateOne(
          { userId, date },
          { $push: { tasks: { $each: missing } } }
        );
        dayRecord = await daysCol.findOne({ userId, date });
      }
    }

    return NextResponse.json(dayRecord);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: 'Failed to fetch tasks' },
      { status: 500 }
    );
  }
}

/* ===================================================================== */
/* PUT – toggle a single task’s ‘completed’ flag                          */
/* ===================================================================== */
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }
  const userId = new ObjectId(session.user.id);

  try {
    const { date, taskId, completed } = await request.json();

    const client = await clientPromise;
    const collection = client
      .db('todoTracker')
      .collection<DayRecord>('dailyTasks');

    await collection.updateOne(
      { userId, date, 'tasks.id': taskId },
      { $set: { 'tasks.$.completed': completed } }
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: 'Failed to update task' },
      { status: 500 }
    );
  }
}
