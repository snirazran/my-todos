export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import TaskModel from '@/lib/models/Task';
import {
  buddyScheduleSummary,
  isShareableParams,
  paramsFromTask,
  type ExistingBuddyTask,
} from '@/lib/buddy/bond';
import { getZonedToday } from '@/lib/utils';

const MAX_HABITS = 40;
const MAX_TODAY = 30;

type ShareableDoc = ExistingBuddyTask & {
  order?: number;
  completed?: boolean;
  isStarter?: boolean;
  isTutorial?: boolean;
};

export type ShareableTask = { id: string; text: string; schedule: string };

export async function GET(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tz = req.nextUrl.searchParams.get('timezone') || 'UTC';
  const today = getZonedToday(tz);

  try {
    await connectMongo();
    const docs = await TaskModel.find({
      userId,
      bondId: null,
      deletedAt: { $exists: false },
      isStarter: { $ne: true },
      isTutorial: { $ne: true },
      $or: [
        { type: 'weekly' },
        { type: 'regular', date: today, completed: { $ne: true } },
      ],
    })
      .select(
        'id text type order completed repeatMode repeatGroupId repeatEndDate repeatDayOfMonth repeatRule dayOfWeek date',
      )
      .sort({ order: 1 })
      .lean<ShareableDoc[]>()
      .exec();

    const groups = new Map<string, ShareableDoc[]>();
    const todayTasks: ShareableTask[] = [];
    for (const doc of docs) {
      if (!doc.text?.trim()) continue;
      if (doc.type === 'regular') {
        if (todayTasks.length < MAX_TODAY)
          todayTasks.push({ id: doc.id, text: doc.text, schedule: 'Today' });
        continue;
      }
      if (doc.repeatEndDate && doc.repeatEndDate < today) continue;
      const key = doc.repeatGroupId ?? doc.id;
      const group = groups.get(key);
      if (group) group.push(doc);
      else groups.set(key, [doc]);
    }

    const habits: ShareableTask[] = [];
    groups.forEach((siblings) => {
      if (habits.length >= MAX_HABITS) return;
      const lead = siblings[0];
      const params = paramsFromTask(lead, siblings);
      if (!isShareableParams(params)) return;
      habits.push({
        id: lead.id,
        text: lead.text,
        schedule: buddyScheduleSummary(params) || 'Repeats',
      });
    });

    return NextResponse.json({ habits, today: todayTasks });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load tasks' },
      { status: 500 },
    );
  }
}
