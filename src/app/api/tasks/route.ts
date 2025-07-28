import { NextRequest, NextResponse } from 'next/server';
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
  date: string;
  tasks: TaskItem[];
}
interface WeeklyDoc {
  _id?: ObjectId;
  dayOfWeek: number; // 0 = Sunday … 6 = Saturday
  tasks: { id: string; text: string; order: number }[];
}

/* ===================================================================== */
/* GET – return (and lazily create) the list for the requested calendar‑day
/* ===================================================================== */
export async function GET(req: NextRequest) {
  try {
    const date =
      new URL(req.url).searchParams.get('date') ??
      new Date().toISOString().split('T')[0];

    const client = await clientPromise;
    const db = client.db('todoTracker');
    const daysCol = db.collection<DayRecord>('dailyTasks');
    const weeklyCol = db.collection<WeeklyDoc>('weeklyTasks');

    /* build today’s template from weeklyTasks */
    const dow = new Date(date).getDay();
    const weekly = (await weeklyCol.findOne({ dayOfWeek: dow }))?.tasks ?? [];
    const template = weekly
      .sort((a, b) => a.order - b.order)
      .map((t) => ({ ...t, completed: false }));

    /* ------------------------------------------------------- */
    /* 1. create document if it doesn’t exist                  */
    /* ------------------------------------------------------- */
    await daysCol.updateOne(
      { date },
      { $setOnInsert: { date, tasks: template } },
      { upsert: true }
    );

    /* 2. if the document already existed *and* is still empty,
          or you added new weekly tasks later, merge them in   */
    let dayRecord = await daysCol.findOne({ date });

    if (dayRecord && template.length) {
      const missing = template.filter(
        (tpl) => !dayRecord!.tasks.some((d) => d.id === tpl.id)
      );
      if (missing.length) {
        await daysCol.updateOne(
          { date },
          { $push: { tasks: { $each: missing } } }
        );
        dayRecord = await daysCol.findOne({ date }); // refresh
      }
    }

    return NextResponse.json(dayRecord);
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch tasks' },
      { status: 500 }
    );
  }
}

/* ===================================================================== */
/* PUT – toggle a single task’s ‘completed’ flag (unchanged)              */
/* ===================================================================== */
export async function PUT(request: NextRequest) {
  try {
    const { date, taskId, completed } = await request.json();

    const client = await clientPromise;
    const collection = client
      .db('todoTracker')
      .collection<DayRecord>('dailyTasks');

    await collection.updateOne(
      { date, 'tasks.id': taskId },
      { $set: { 'tasks.$.completed': completed } }
    );

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Failed to update task' },
      { status: 500 }
    );
  }
}
