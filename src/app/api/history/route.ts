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

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db('todoTracker');
    const collection = db.collection<DayRecord>('dailyTasks');

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoff = thirtyDaysAgo.toISOString().split('T')[0];

    const history = await collection
      .aggregate([
        { $match: { date: { $gte: cutoff } } },
        { $sort: { date: -1, _id: -1 } }, // newest first
        { $group: { _id: '$date', doc: { $first: '$$ROOT' } } },
        { $replaceRoot: { newRoot: '$doc' } },
        { $sort: { date: -1 } }, // final order by date
      ])
      .toArray();

    return NextResponse.json(history);
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to fetch history' },
      { status: 500 }
    );
  }
}
