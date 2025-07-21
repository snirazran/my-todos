import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
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
    const client = await clientPromise;
    const db = client.db('todoTracker');
    const collection = db.collection<DayRecord>('dailyTasks');

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const history = await collection
      .find({
        date: { $gte: thirtyDaysAgo.toISOString().split('T')[0] },
      })
      .sort({ date: -1 })
      .toArray();

    return NextResponse.json(history);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch history' },
      { status: 500 }
    );
  }
}
