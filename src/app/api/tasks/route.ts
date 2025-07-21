import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { getTodaysTasks } from '@/lib/tasks';
import { ObjectId } from 'mongodb';

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

export async function GET(request: NextRequest) {
  try {
    /* 1 ▸ resolve the requested calendar-day string (local YYYY-MM-DD) */
    const { searchParams } = new URL(request.url);
    const date =
      searchParams.get('date') ?? new Date().toISOString().split('T')[0];

    const client = await clientPromise;
    const db = client.db('todoTracker');
    const collection = db.collection<DayRecord>('dailyTasks');

    /* 2 ▸ create-if-missing with an **UPSERT** (no duplicates possible) */
    const dateObj = new Date(date);
    const dayOfWeek = dateObj.getDay();
    const defaultTasks = getTodaysTasks(dayOfWeek).map((t) => ({
      ...t,
      completed: false,
    }));

    await collection.updateOne(
      { date }, // query
      { $setOnInsert: { date, tasks: defaultTasks } },
      { upsert: true }
    );

    /* 3 ▸ now read the single, authoritative row */
    const dayRecord = await collection.findOne({ date });

    return NextResponse.json(dayRecord);
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to fetch tasks' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, taskId, completed } = body;

    const client = await clientPromise;
    const db = client.db('todoTracker');
    const collection = db.collection<DayRecord>('dailyTasks');

    await collection.updateOne(
      { date, 'tasks.id': taskId },
      { $set: { 'tasks.$.completed': completed } }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update task' },
      { status: 500 }
    );
  }
}
