// src/app/api/tasks/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

/* ---------- types (daily snapshot) ---------- */
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
  suppressed?: string[]; // ids hidden for *this* date only
}

/* ---------- types (unified manager collection) ---------- */
type TaskType = 'weekly' | 'regular' | 'backlog';
interface UnifiedTask {
  _id?: ObjectId;
  userId: ObjectId;
  type: TaskType;
  id: string; // logical id
  text: string;
  order: number;
  dayOfWeek?: number; // weekly: 0..6
  date?: string; // regular: 'YYYY-MM-DD' (LOCAL)
  weekStart?: string; // backlog
}

/* ---------- helpers: LOCAL calendar (matches /manage-tasks) ---------- */
const pad = (n: number) => String(n).padStart(2, '0');

function ymdLocal(d: Date) {
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  return `${y}-${m}-${day}`;
}

function dowLocalFromYMD(ymd: string) {
  // interpret the YYYY-MM-DD in local time (00:00 local)
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.getDay(); // 0..6 Sun..Sat
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }
  const userId = new ObjectId(session.user.id);

  try {
    // default to *local* today
    const url = new URL(req.url);
    const dateParam = url.searchParams.get('date');
    const todayLocal = ymdLocal(new Date());
    const date = dateParam ?? todayLocal;

    const client = await clientPromise;
    const db = client.db('todoTracker');
    const daysCol = db.collection<DayRecord>('dailyTasks');
    const tasksCol = db.collection<UnifiedTask>('tasks');

    const dow = dowLocalFromYMD(date);

    // --- 1) Fetch the combined template for this day from unified tasks
    // weekly (dayOfWeek=dow) + regular (date = given date), sorted by order
    const unified = await tasksCol
      .find(
        {
          userId,
          $or: [
            { type: 'weekly', dayOfWeek: dow },
            { type: 'regular', date },
          ],
        },
        { projection: { id: 1, text: 1, order: 1, type: 1 } }
      )
      .sort({ order: 1 })
      .toArray();

    const weeklyIds = unified
      .filter((t) => t.type === 'weekly')
      .map((t) => t.id);

    // Ensure a DayRecord exists
    await daysCol.updateOne(
      { userId, date },
      { $setOnInsert: { userId, date, tasks: [], suppressed: [] } },
      { upsert: true }
    );

    // Load the day
    let dayRecord = await daysCol.findOne({ userId, date });
    const suppressed = dayRecord?.suppressed ?? [];

    // Filter template by suppressed, map to daily TaskItem shape
    const templateFiltered: TaskItem[] = unified
      .filter((t) => !suppressed.includes(t.id))
      .map((t) => ({
        id: t.id,
        text: t.text,
        order: t.order ?? 0,
        completed: false,
      }));

    // If brand new or empty, seed from template
    if (!dayRecord || (dayRecord.tasks?.length ?? 0) === 0) {
      if (templateFiltered.length) {
        await daysCol.updateOne(
          { userId, date },
          { $set: { tasks: templateFiltered } }
        );
        dayRecord = await daysCol.findOne({ userId, date });
      }
    } else {
      // Merge any missing items (e.g., new weekly or regular added later)
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

      // Optionally, keep orders in sync with manager (only for items that exist)
      // We won’t overwrite completion state.
      if (dayRecord) {
        const byIdOrder = new Map(templateFiltered.map((t) => [t.id, t.order]));
        const reOrdered = dayRecord.tasks
          .map((t) => ({ ...t, order: byIdOrder.get(t.id) ?? t.order ?? 0 }))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        await daysCol.updateOne(
          { userId, date },
          { $set: { tasks: reOrdered } }
        );
        dayRecord = await daysCol.findOne({ userId, date });
      }
    }

    const tasksSorted = (dayRecord?.tasks ?? []).slice().sort((a, b) => {
      const ao = a.order ?? 0;
      const bo = b.order ?? 0;
      return ao - bo;
    });

    return NextResponse.json({
      date,
      tasks: tasksSorted,
      weeklyIds, // so the client can show “delete from week”
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
