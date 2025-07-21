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
    const { searchParams } = new URL(request.url);
    const date =
      searchParams.get('date') || new Date().toISOString().split('T')[0];

    const client = await clientPromise;
    const db = client.db('todoTracker');
    const collection = db.collection<DayRecord>('dailyTasks');

    let dayRecord = await collection.findOne({ date });

    if (!dayRecord) {
      const dateObj = new Date(date);
      const dayOfWeek = dateObj.getDay();
      const tasks = getTodaysTasks(dayOfWeek);

      const newDayRecord: DayRecord = {
        date,
        tasks: tasks.map((task) => ({
          ...task,
          completed: false,
        })),
      };

      const result = await collection.insertOne(newDayRecord);
      dayRecord = { ...newDayRecord, _id: result.insertedId };
    }

    return NextResponse.json(dayRecord);
  } catch (error) {
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
