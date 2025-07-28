export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

/* ---------- schema ---------- */
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

/* ---------- GET  /api/history ---------- */
export async function GET(req: NextRequest) {
  /* auth */
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }
  const userId = new ObjectId(session.user.id);

  try {
    const client = await clientPromise;
    const collection = client
      .db('todoTracker')
      .collection<DayRecord>('dailyTasks');

    /* cutoff date (30 days ago, local yyyy‑mm‑dd) */
    const cutoff = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return d.toISOString().split('T')[0];
    })();

    /* aggregate one doc per calendar‑day, newest first */
    const history = await collection
      .aggregate([
        { $match: { userId, date: { $gte: cutoff } } },
        { $sort: { date: -1, _id: -1 } }, // newest docs first
        { $group: { _id: '$date', doc: { $first: '$$ROOT' } } },
        { $replaceRoot: { newRoot: '$doc' } },
        { $sort: { date: -1 } }, // final order by date
      ])
      .toArray();

    return NextResponse.json(history);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: 'Failed to fetch history' },
      { status: 500 }
    );
  }
}
