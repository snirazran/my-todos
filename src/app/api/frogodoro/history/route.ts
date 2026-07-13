import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import TaskModel from '@/lib/models/Task';
import { getZonedToday } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function dayKeyMinus(todayKey: string, minus: number): string {
  const d = new Date(`${todayKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - minus);
  return d.toISOString().slice(0, 10);
}

export type FrogodoroHistoryDay = {
  date: string;
  focusTime: number;
  breakTime: number;
  tasks: number;
};

// Daily focus/break totals across all of the user's tasks — the data behind
// the pond history view.
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    await connectMongo();

    const tz = req.nextUrl.searchParams.get('tz') || 'UTC';
    const rawDays = Number(req.nextUrl.searchParams.get('days'));
    const days = Number.isFinite(rawDays)
      ? Math.min(31, Math.max(1, Math.floor(rawDays)))
      : 7;

    const today = getZonedToday(tz);
    const start = dayKeyMinus(today, days - 1);

    const rows = (await TaskModel.aggregate([
      { $match: { userId, 'frogodoroSessions.0': { $exists: true } } },
      { $unwind: '$frogodoroSessions' },
      {
        $match: {
          'frogodoroSessions.date': { $gte: start, $lte: today },
        },
      },
      {
        $group: {
          _id: '$frogodoroSessions.date',
          focusTime: { $sum: '$frogodoroSessions.focusTime' },
          breakTime: { $sum: '$frogodoroSessions.breakTime' },
          tasks: { $sum: 1 },
        },
      },
    ])) as Array<{
      _id: string;
      focusTime: number;
      breakTime: number;
      tasks: number;
    }>;

    const byDate = new Map(rows.map((r) => [r._id, r]));
    const result: FrogodoroHistoryDay[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = dayKeyMinus(today, i);
      const row = byDate.get(date);
      result.push({
        date,
        focusTime: row?.focusTime ?? 0,
        breakTime: row?.breakTime ?? 0,
        tasks: row?.tasks ?? 0,
      });
    }

    return NextResponse.json({ today, days: result });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
