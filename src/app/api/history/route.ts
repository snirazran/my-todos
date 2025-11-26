export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { Types } from 'mongoose';
import connectMongo from '@/lib/mongoose';
import DailyTaskModel, { type DailyTaskDoc } from '@/lib/models/DailyTask';

/* ---------- GET  /api/history ---------- */
export async function GET(req: NextRequest) {
  /* auth */
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }
  const userId = new Types.ObjectId(session.user.id);

  try {
    await connectMongo();

    /* cutoff date (30 days ago, local yyyy-mm-dd) */
    const cutoff = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return d.toISOString().split('T')[0];
    })();

    /* aggregate one doc per calendar-day, newest first */
    const history = await DailyTaskModel.aggregate<DailyTaskDoc>([
      { $match: { userId, date: { $gte: cutoff } } },
      { $sort: { date: -1, _id: -1 } }, // newest docs first
      { $group: { _id: '$date', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
      { $sort: { date: -1 } }, // final order by date
    ]);

    return NextResponse.json(history);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: 'Failed to fetch history' },
      { status: 500 }
    );
  }
}
