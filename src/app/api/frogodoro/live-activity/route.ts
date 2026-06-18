import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { scheduleFrogodoroTimerProcessing } from '@/lib/frogodoroDelayedTimer';
import type { ActiveFrogodoroTimer, LiveActivityRef } from '@/lib/types/UserDoc';

export const dynamic = 'force-dynamic';

function unauth() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const id = typeof body?.activityId === 'string' ? body.activityId : '';
    const pushToken = typeof body?.pushToken === 'string' ? body.pushToken : '';
    const pushToStartToken =
      typeof body?.pushToStartToken === 'string' ? body.pushToStartToken : '';

    if (!pushToStartToken && (!id || !pushToken)) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }

    await connectMongo();

    // The push-to-start token arrives on its own event and persists across
    // activities, so it's stored independently of the current activity ref.
    if (pushToStartToken) {
      await UserModel.updateOne(
        { _id: userId },
        { $set: { liveActivityStartToken: pushToStartToken } },
      );
    }

    if (id && pushToken) {
      const liveActivity: LiveActivityRef = {
        id,
        pushToken,
        updatedAt: new Date().toISOString(),
      };
      await UserModel.updateOne({ _id: userId }, { $set: { liveActivity } });
    }

    const user = await UserModel.findById(userId, { activeFrogodoroTimer: 1 }).lean();
    const timer = user?.activeFrogodoroTimer as ActiveFrogodoroTimer | null | undefined;
    if (timer?.status === 'running' && timer.endsAt) {
      scheduleFrogodoroTimerProcessing({ userId, endsAt: timer.endsAt });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return unauth();
  }
}

export async function DELETE() {
  try {
    const userId = await requireUserId();
    await connectMongo();
    await UserModel.updateOne({ _id: userId }, { $set: { liveActivity: null } });
    return NextResponse.json({ ok: true });
  } catch {
    return unauth();
  }
}
