import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { scheduleFrogodoroTimerProcessing } from '@/lib/frogodoroDelayedTimer';
import { normalizeClockSkewMs } from '@/lib/frogodoroSync';
import type { ActiveFrogodoroTimer, LiveActivityRef } from '@/lib/types/UserDoc';

export const dynamic = 'force-dynamic';

function unauth() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function tokenLabel(token: string): string {
  return `${token.slice(0, 8)}...${token.slice(-6)}`;
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const id = typeof body?.activityId === 'string' ? body.activityId : '';
    const pushToken = typeof body?.pushToken === 'string' ? body.pushToken : '';
    const pushToStartToken =
      typeof body?.pushToStartToken === 'string' ? body.pushToStartToken : '';
    const clientNow = typeof body?.clientNow === 'number' ? body.clientNow : null;
    const clockSkewMs = normalizeClockSkewMs(
      clientNow && Number.isFinite(clientNow) ? Date.now() - clientNow : 0,
    );

    if (!pushToStartToken && (!id || !pushToken)) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }

    await connectMongo();

    // The push-to-start token arrives on its own event and persists across
    // activities, so it's stored independently of the current activity ref.
    if (pushToStartToken) {
      await UserModel.updateOne(
        { _id: userId },
        {
          $set: {
            liveActivityStartToken: pushToStartToken,
            liveActivityStartClockSkewMs: clockSkewMs,
          },
        },
      );
      console.log(
        `Frogodoro live activity: stored push-to-start token ${tokenLabel(pushToStartToken)} skew=${clockSkewMs}ms`,
      );
    }

    if (id && pushToken) {
      const liveActivity: LiveActivityRef = {
        id,
        pushToken,
        updatedAt: new Date().toISOString(),
        clockSkewMs,
      };
      await UserModel.updateOne({ _id: userId }, { $set: { liveActivity } });
      console.log(
        `Frogodoro live activity: stored activity=${id} token=${tokenLabel(pushToken)}`,
      );
    }

    const user = await UserModel.findById(userId, {
      activeFrogodoroTimer: 1,
    }).lean();
    const timer = user?.activeFrogodoroTimer as ActiveFrogodoroTimer | null | undefined;
    if (timer?.status === 'running' && timer.endsAt) {
      scheduleFrogodoroTimerProcessing({ userId, endsAt: timer.endsAt });
    }

    return NextResponse.json({ ok: true });
  } catch {
    console.warn('Frogodoro live activity: token registration unauthorized');
    return unauth();
  }
}

export async function DELETE() {
  try {
    const userId = await requireUserId();
    await connectMongo();
    await UserModel.updateOne({ _id: userId }, { $set: { liveActivity: null } });
    console.log('Frogodoro live activity: cleared activity token');
    return NextResponse.json({ ok: true });
  } catch {
    console.warn('Frogodoro live activity: clear unauthorized');
    return unauth();
  }
}
