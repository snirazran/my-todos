export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { Types } from 'mongoose';
import connectMongo from '@/lib/mongoose';
import TaskModel, { type TaskDoc, type Weekday } from '@/lib/models/Task';

const pad = (n: number) => String(n).padStart(2, '0');
const ymdLocal = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/* ---------- GET  /api/history ---------- */
export async function GET(_req: NextRequest) {
  /* auth */
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }
  const userId = new Types.ObjectId(session.user.id);

  try {
    await connectMongo();

    // Build date list for last 30 days (today included)
    const today = new Date();
    const dates: string[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      dates.push(ymdLocal(d));
    }

    const cutoff = dates[dates.length - 1];

    // Fetch tasks needed to render history
    const tasks = await TaskModel.find(
      {
        userId,
        $or: [
          { type: 'regular', date: { $gte: cutoff } },
          { type: 'weekly' },
        ],
      },
      {
        id: 1,
        text: 1,
        order: 1,
        type: 1,
        dayOfWeek: 1,
        date: 1,
        completed: 1,
        completedDates: 1,
        suppressedDates: 1,
      }
    )
      .lean<TaskDoc[]>()
      .exec();

    type HistoryTask = {
      id: string;
      text: string;
      order: number;
      completed: boolean;
    };

    const byDate: Record<string, HistoryTask[]> = {};

    for (const date of dates) {
      const dt = new Date(date);
      const dow = dt.getDay() as Weekday;

      const dayTasks = tasks
        .filter((t: TaskDoc) => {
          if (t.type === 'regular') return t.date === date;
          if (t.type === 'weekly') return t.dayOfWeek === dow;
          return false;
        })
        .filter((t: TaskDoc) => !(t.suppressedDates ?? []).includes(date))
        .map(
          (t): HistoryTask => ({
            id: t.id,
            text: t.text,
            order: t.order ?? 0,
            completed:
              (t.completedDates ?? []).includes(date) ||
              (!!t.completed && t.type === 'regular'),
          })
        )
        .sort((a: HistoryTask, b: HistoryTask) => a.order - b.order);

      if (dayTasks.length) {
        byDate[date] = dayTasks;
      }
    }

    const history = Object.entries(byDate)
      .map(([date, tasks]): { date: string; tasks: HistoryTask[] } => ({
        date,
        tasks,
      }))
      .sort(
        (
          a: { date: string; tasks: HistoryTask[] },
          b: { date: string; tasks: HistoryTask[] }
        ) => (a.date > b.date ? -1 : 1)
      );

    return NextResponse.json(history);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: 'Failed to fetch history' },
      { status: 500 }
    );
  }
}
