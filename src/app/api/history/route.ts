export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { Types } from 'mongoose';
import connectMongo from '@/lib/mongoose';
import TaskModel, { type TaskDoc, type Weekday } from '@/lib/models/Task';
import { format, parseISO, subDays, isBefore, isAfter, parse } from 'date-fns';

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

    // Parse query params or default to 30 days
    const url = new URL(req.url);
    const fromParam = url.searchParams.get('from');
    const toParam = url.searchParams.get('to');
    const userTimezone = url.searchParams.get('timezone') || 'UTC';

    // Determine Date Range (Local YYYY-MM-DD strings)
    const today = new Date();
    const toDate = toParam ? parseISO(toParam) : today;
    const fromDate = fromParam ? parseISO(fromParam) : subDays(toDate, 30);

    // Generate array of date strings [YYYY-MM-DD] inclusive
    const dates: string[] = [];
    let curr = new Date(toDate);
    while (curr >= fromDate) {
      dates.push(format(curr, 'yyyy-MM-dd'));
      curr.setDate(curr.getDate() - 1);
    }

    const startStr = format(fromDate, 'yyyy-MM-dd');
    const endStr = format(toDate, 'yyyy-MM-dd');

    // Helper to get YYYY-MM-DD in user's timezone
    const getZonedYMD = (d: Date) => {
      return new Intl.DateTimeFormat('en-CA', { // en-CA gives YYYY-MM-DD
        timeZone: userTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(d);
    };

    // Fetch tasks
    const tasks = await TaskModel.find(
      {
        userId,
        $or: [
          { type: 'regular', date: { $gte: startStr, $lte: endStr } },
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
        createdAt: 1,
        deletedAt: 1,
        tags: 1,
      }
    )
      .lean<TaskDoc[]>()
      .exec();

    type HistoryTask = {
      id: string;
      text: string;
      order: number;
      completed: boolean;
      type: 'weekly' | 'regular';
      tags?: string[];
    };

    const byDate: Record<string, HistoryTask[]> = {};

    for (const dateStr of dates) {
      // Robust DOW: Force UTC noon to avoid timezone shifts
      const dow = new Date(`${dateStr}T12:00:00Z`).getUTCDay() as Weekday;

      const dayTasks = tasks
        .filter((t: TaskDoc) => {
          // 1. Check if task matches the day
          let matchesDay = false;
          if (t.type === 'regular') {
            matchesDay = t.date === dateStr;
          } else if (t.type === 'weekly') {
            matchesDay = t.dayOfWeek === dow;
          }
          
          if (!matchesDay) return false;

          // 2. Check Lifespan (Creation) - in User Timezone
          if (t.createdAt) {
             const createdYMD = getZonedYMD(t.createdAt);
             if (createdYMD > dateStr) return false;
          }

          // 3. Check Lifespan (Deletion) - in User Timezone
          if (t.deletedAt) {
             const deletedYMD = getZonedYMD(t.deletedAt);
             if (deletedYMD < dateStr) return false;
          }

          return true;
        })
        .filter((t: TaskDoc) => !(t.suppressedDates ?? []).includes(dateStr))
        .map(
          (t): HistoryTask => ({
            id: t.id,
            text: t.text,
            order: t.order ?? 0,
            completed:
              (t.completedDates ?? []).includes(dateStr) ||
              (!!t.completed && t.type === 'regular'),
            type: t.type as 'weekly' | 'regular',
            tags: t.tags,
          })
        )
        .sort((a: HistoryTask, b: HistoryTask) => a.order - b.order);

      if (dayTasks.length) {
        byDate[dateStr] = dayTasks;
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
