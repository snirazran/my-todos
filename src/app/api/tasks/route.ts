// src/app/api/tasks/route.ts
export const dynamic = 'force-dynamic';

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
  date: string; // YYYY-MM-DD
  tasks: TaskItem[];
  suppressed?: string[]; // ids hidden for *this* date (delete today only)
}
interface WeeklyDoc {
  _id?: ObjectId;
  userId: ObjectId;
  dayOfWeek: number; // 0..6 (0 = Sunday)
  tasks: { id: string; text: string; order: number }[];
}

/* ---------- helpers: treat YYYY-MM-DD as calendar-only ---------- */
const pad = (n: number) => String(n).padStart(2, '0');

/** Today as YYYY-MM-DD (UTC-based to be stable across server TZs) */
const todayYMD = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(
    now.getUTCDate()
  )}`;
};

/** DOW from YYYY-MM-DD (0=Sun..6=Sat), independent of server TZ */
const dowFromYMD = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay();
};

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }
  const userId = new ObjectId(session.user.id);

  try {
    const date = new URL(req.url).searchParams.get('date') ?? todayYMD();

    const client = await clientPromise;
    const db = client.db('todoTracker');
    const daysCol = db.collection<DayRecord>('dailyTasks');
    const weeklyCol = db.collection<WeeklyDoc>('weeklyTasks');

    const dow = dowFromYMD(date);

    // Weekly template (raw) for that DOW
    const weekly =
      (await weeklyCol.findOne({ userId, dayOfWeek: dow }))?.tasks ?? [];
    const weeklyIds = weekly.map((t) => t.id); // expose for UI (e.g., delete modal)

    // Ensure a day doc exists (empty); don't seed tasks yet
    await daysCol.updateOne(
      { userId, date },
      { $setOnInsert: { userId, date, tasks: [], suppressed: [] } },
      { upsert: true }
    );

    // Load the day to read current tasks + suppressed list
    let dayRecord = await daysCol.findOne({ userId, date });
    const suppressed = dayRecord?.suppressed ?? [];

    // Filter weekly template by suppressed, then map to TaskItem
    const templateFiltered: TaskItem[] = weekly
      .filter((t) => !suppressed.includes(t.id))
      .sort((a, b) => a.order - b.order)
      .map((t) => ({ ...t, completed: false }));

    // If brand-new day (no tasks yet), seed with filtered template
    if ((dayRecord?.tasks?.length ?? 0) === 0 && templateFiltered.length) {
      await daysCol.updateOne(
        { userId, date },
        { $set: { tasks: templateFiltered } }
      );
      dayRecord = await daysCol.findOne({ userId, date });
    }

    // Merge any newly-added weekly tasks that aren't already present
    if (dayRecord && templateFiltered.length) {
      const missing = templateFiltered.filter(
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

    // Sort tasks by order before returning
    const tasksSorted = (dayRecord?.tasks ?? []).slice().sort((a, b) => {
      const ao = a.order ?? 0;
      const bo = b.order ?? 0;
      return ao - bo;
    });

    return NextResponse.json({
      ...dayRecord,
      tasks: tasksSorted,
      weeklyIds,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: 'Failed to fetch tasks' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { date, taskId, completed } = await request.json();
  if (!date || !taskId || typeof completed !== 'boolean') {
    return NextResponse.json(
      { error: 'date, taskId and completed(boolean) are required' },
      { status: 400 }
    );
  }

  const userId = new ObjectId(session.user.id);
  const client = await clientPromise;
  const daysCol = client.db('todoTracker').collection<DayRecord>('dailyTasks');

  const r = await daysCol.updateOne(
    { userId, date, 'tasks.id': taskId },
    { $set: { 'tasks.$.completed': !!completed } }
  );

  if (r.matchedCount === 0) {
    return NextResponse.json(
      { error: 'Day or task not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }
  const { date, taskId } = await request.json();
  if (!date || !taskId) {
    return NextResponse.json(
      { error: 'date and taskId are required' },
      { status: 400 }
    );
  }

  const userId = new ObjectId(session.user.id);
  const client = await clientPromise;
  const daysCol = client.db('todoTracker').collection<DayRecord>('dailyTasks');

  // Remove from today's list and remember it in suppressed so GET won't re-inject it
  const r = await daysCol.updateOne(
    { userId, date },
    {
      $pull: { tasks: { id: taskId } } as any,
      $addToSet: { suppressed: taskId },
    }
  );

  if (!r.matchedCount) {
    return NextResponse.json({ error: 'Day not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
