import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectMongo from '@/lib/mongoose';
import UserModel, { type UserDoc } from '@/lib/models/User';
import { Types } from 'mongoose';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

type LeanUser = UserDoc & { _id: Types.ObjectId };

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return json({ error: 'Unauthorized' }, 401);

  let body: { action: 'complete_task' | 'claim_gift'; taskId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  await connectMongo();
  const user = (await UserModel.findOne({
    email: session.user.email,
  }).lean()) as LeanUser | null;

  if (!user) return json({ error: 'User not found' }, 404);

  const userTimezone = body.timezone || 'UTC';

  // 1. Determine Date in User Timezone
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: userTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  // 2. Get current stats
  const currentStats = user.statistics?.daily ?? {
    date: '',
    dailyTasksCount: 0,
    dailyMilestoneGifts: 0,
    completedTaskIds: [],
    taskCountAtLastGift: 0,
  };

  const isNewDay = currentStats.date !== today;

  let updateQuery = {};

  // ==========================================================
  // ACTION: CLAIM GIFT
  // ==========================================================
  if (body.action === 'claim_gift') {
    const giftId = 'gift_box_1';

    if (isNewDay) {
      updateQuery = {
        $set: {
          'statistics.daily': {
            date: today,
            dailyTasksCount: 0,
            dailyMilestoneGifts: 1,
            completedTaskIds: [],
            taskCountAtLastGift: 0,
          },
        },
        $inc: { [`wardrobe.inventory.${giftId}`]: 1 },
        $addToSet: { 'wardrobe.unseenItems': giftId },
      };
    } else {
      // Rule 1: Max 3 gifts
      if (currentStats.dailyMilestoneGifts >= 3) {
        return json({ error: 'Daily gift limit reached (3/3)' }, 403);
      }

      // Rule 2: Must have done NEW work
      const lastCount = currentStats.taskCountAtLastGift || 0;
      if (currentStats.dailyTasksCount <= lastCount) {
        return json({ error: 'No new tasks completed since last reward' }, 403);
      }

      // Grant Gift + Update High Water Mark
      updateQuery = {
        $inc: { 
          'statistics.daily.dailyMilestoneGifts': 1,
          [`wardrobe.inventory.${giftId}`]: 1 
        },
        $set: {
          'statistics.daily.taskCountAtLastGift': currentStats.dailyTasksCount,
        },
        $addToSet: { 'wardrobe.unseenItems': giftId },
      };
    }
  }

  // ==========================================================
  // ACTION: COMPLETE TASK
  // ==========================================================
  else if (body.action === 'complete_task') {
    const taskId = body.taskId;
    if (!taskId) return json({ error: 'Task ID required' }, 400);

    if (isNewDay) {
      updateQuery = {
        $set: {
          'statistics.daily': {
            date: today,
            dailyTasksCount: 1,
            dailyMilestoneGifts: 0,
            completedTaskIds: [taskId],
            taskCountAtLastGift: 0,
          },
        },
      };
    } else {
      // If task already counted, return OK but DO NOT update DB
      if (currentStats.completedTaskIds.includes(taskId)) {
        return json({ ok: true, message: 'Already counted' });
      }

      updateQuery = {
        $inc: { 'statistics.daily.dailyTasksCount': 1 },
        $push: { 'statistics.daily.completedTaskIds': taskId },
      };
    }
  }

  // 4. Execute Update
  if (Object.keys(updateQuery).length > 0) {
    await UserModel.updateOne({ _id: user._id }, updateQuery);
  }

  return json({ ok: true });
}
