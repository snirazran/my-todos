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

    let endDate = new Date();
    if (toParam) {
      endDate = new Date(toParam);
    }
    
    // Default to 30 days ago if no 'from' is provided
    let startDate = new Date();
    if (fromParam) {
      startDate = new Date(fromParam);
    } else {
      startDate.setDate(endDate.getDate() - 30);
    }

    // Normalize to midnight for consistent comparisons
    // Note: ymdLocal handles the string format, but for the loop we want Date objects
    
    const dates: string[] = [];
    const loopDate = new Date(endDate);
    
    // Generate dates from End to Start (descending) to match existing order preference, 
    // or we can sort later. Let's loop naturally.
    // Actually, the original loop was "last 30 days" (descending effectively?). 
    // Let's just generate the array of YYYY-MM-DD strings in the range.
    
    // We'll iterate from endDate down to startDate to keep the 'descending' nature
    // or we can just sort at the end.
    
    const curr = new Date(endDate);
    while (curr >= startDate) {
      dates.push(ymdLocal(curr));
      curr.setDate(curr.getDate() - 1);
    }

    const cutoff = ymdLocal(startDate);
    const endStr = ymdLocal(endDate);

    // Fetch tasks needed to render history
    // For regular tasks: date >= cutoff AND date <= endStr
    const tasks = await TaskModel.find(
      {
        userId,
        $or: [
          { type: 'regular', date: { $gte: cutoff, $lte: endStr } },
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
      }
    )
      .lean<TaskDoc[]>()
      .exec();

    type HistoryTask = {
      id: string;
      text: string;
      order: number;
      completed: boolean;
      type: 'weekly' | 'regular'; // Added type for UI filtering/badges
    };

    const byDate: Record<string, HistoryTask[]> = {};

    for (const date of dates) {
      const dt = new Date(date);
      const dow = dt.getDay() as Weekday;

      const dayTasks = tasks
        .filter((t: TaskDoc) => {
          // 1. Check if task matches the day (Regular vs Weekly)
          let matchesDay = false;
          if (t.type === 'regular') matchesDay = t.date === date;
          else if (t.type === 'weekly') matchesDay = t.dayOfWeek === dow;
          
          if (!matchesDay) return false;

          // 2. Check Lifespan (Creation)
          // If createdAt is available, ensure the task existed on 'date'
          if (t.createdAt) {
             const createdYMD = ymdLocal(t.createdAt);
             if (createdYMD > date) return false;
          }

          // 3. Check Lifespan (Deletion)
          // If deletedAt is available, ensure it wasn't deleted BEFORE 'date'
          if (t.deletedAt) {
             const deletedYMD = ymdLocal(t.deletedAt);
             if (deletedYMD < date) return false;
          }

          return true;
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
            type: t.type as 'weekly' | 'regular',
          })
        )
        // Only include completed tasks in history? 
        // The prompt says "view tasks i did in the past".
        // The original code returned *all* tasks for that day and checked 'completed'.
        // To be a true history of "what I did", we usually only show completed ones,
        // OR we show everything to show what was missed.
        // The original code included everything. Let's keep it that way but maybe the UI filters it.
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
