import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { scheduleFrogodoroTimerProcessing } from '@/lib/frogodoroDelayedTimer';
import { normalizeClockSkewMs, fanOutTimerState } from '@/lib/frogodoroSync';
import type { ActiveFrogodoroTimer, LiveActivityRef } from '@/lib/types/UserDoc';

export const dynamic = 'force-dynamic';

function unauth() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function tokenLabel(token: string): string {
  return `${token.slice(0, 8)}...${token.slice(-6)}`;
}

async function resolveUserId(creds: {
  authToken?: string;
  pushToStartToken?: string;
  pushToken?: string;
}): Promise<string | null> {
  try {
    return await requireUserId();
  } catch {
    void 0;
  }
  const cred = creds.authToken || creds.pushToStartToken || creds.pushToken;
  if (!cred) return null;
  const user = await UserModel.findOne(
    {
      $or: [
        { 'notificationPrefs.fcmTokens': cred },
        { liveActivityStartToken: cred },
        { 'liveActivity.pushToken': cred },
      ],
    },
    { _id: 1 },
  ).lean();
  return user ? String((user as { _id: unknown })._id) : null;
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const id = typeof body?.activityId === 'string' ? body.activityId : '';
    const pushToken = typeof body?.pushToken === 'string' ? body.pushToken : '';
    const pushToStartToken =
      typeof body?.pushToStartToken === 'string' ? body.pushToStartToken : '';
    const authToken = typeof body?.authToken === 'string' ? body.authToken : '';
    const clientNow = typeof body?.clientNow === 'number' ? body.clientNow : null;
    const needsRemoteStart = body?.needsRemoteStart === true;
    const clockSkewMs = normalizeClockSkewMs(
      clientNow && Number.isFinite(clientNow) ? Date.now() - clientNow : 0,
    );

    if (!pushToStartToken && !needsRemoteStart && (!id || !pushToken)) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }

    await connectMongo();

    const userId = await resolveUserId({ authToken, pushToStartToken, pushToken });
    if (!userId) return unauth();

    // The local Live Activity creation was skipped (the app left the foreground
    // mid-start), so the client asks the server to create/refresh the island
    // via APNs after all.
    if (needsRemoteStart) {
      const user = (await UserModel.findById(userId, {
        activeFrogodoroTimer: 1,
        liveActivity: 1,
        liveActivityStartToken: 1,
        liveActivityStartClockSkewMs: 1,
      }).lean()) as {
        activeFrogodoroTimer?: ActiveFrogodoroTimer | null;
        liveActivity?: LiveActivityRef | null;
        liveActivityStartToken?: string | null;
        liveActivityStartClockSkewMs?: number | null;
      } | null;
      const timer = user?.activeFrogodoroTimer;
      const canStart =
        !!timer &&
        timer.finished !== true &&
        timer.status === 'running' &&
        !!timer.endsAt;
      if (canStart) {
        console.log('Frogodoro live activity: remote-start fallback requested');
        await fanOutTimerState(
          userId,
          timer,
          user?.liveActivity,
          user?.liveActivityStartToken,
          user?.liveActivityStartClockSkewMs,
          null,
        );
      }
      // remoteStart:false tells the client its timer write hasn't landed yet
      // (the start raced this request) so it can retry once.
      return NextResponse.json({ ok: true, remoteStart: canStart });
    }

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

    let liveActivity: LiveActivityRef | null = null;
    let refChanged = false;
    if (id && pushToken) {
      liveActivity = {
        id,
        pushToken,
        updatedAt: new Date().toISOString(),
        clockSkewMs,
      };
      const prev = (await UserModel.findOneAndUpdate(
        { _id: userId },
        { $set: { liveActivity } },
        { new: false, projection: { liveActivity: 1 } },
      ).lean()) as { liveActivity?: LiveActivityRef | null } | null;
      const prevRef = prev?.liveActivity;
      refChanged = prevRef?.id !== id || prevRef?.pushToken !== pushToken;
      console.log(
        `Frogodoro live activity: stored activity=${id} token=${tokenLabel(pushToken)} changed=${refChanged}`,
      );
    }

    const user = await UserModel.findById(userId, {
      activeFrogodoroTimer: 1,
    }).lean();
    const timer = user?.activeFrogodoroTimer as ActiveFrogodoroTimer | null | undefined;
    if (timer?.status === 'running' && timer.endsAt) {
      scheduleFrogodoroTimerProcessing({ userId, endsAt: timer.endsAt });
    }

    // A state change that landed while this activity had no registered token
    // (pause/resume within the first seconds of a push-to-start) was dropped —
    // reconcile the just-registered activity with the current timer state.
    if (liveActivity && refChanged && timer) {
      await fanOutTimerState(userId, timer, liveActivity, null, null, null, true);
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
