import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { publishTimerEvent } from '@/lib/frogodoroEvents';
import {
  cancelFrogodoroTimerProcessing,
  scheduleFrogodoroTimerProcessing,
} from '@/lib/frogodoroDelayedTimer';
import { fanOutTimerState, clearTimerAndFanOut } from '@/lib/frogodoroSync';
import type {
  ActiveFrogodoroTimer,
  LiveActivityRef,
  NotificationPrefs,
} from '@/lib/types/UserDoc';

export const dynamic = 'force-dynamic';

type Action = 'pause' | 'resume' | 'stop' | 'done';
const actions = new Set<Action>(['pause', 'resume', 'stop', 'done']);

type UserFields = {
  _id: unknown;
  activeFrogodoroTimer?: ActiveFrogodoroTimer | null;
  liveActivity?: LiveActivityRef | null;
  liveActivityStartToken?: string | null;
  liveActivityStartClockSkewMs?: number | null;
  notificationPrefs?: NotificationPrefs;
  frogodoroControlSeq?: number;
};

const SELECT = {
  activeFrogodoroTimer: 1,
  liveActivity: 1,
  liveActivityStartToken: 1,
  liveActivityStartClockSkewMs: 1,
  notificationPrefs: 1,
  frogodoroControlSeq: 1,
} as const;

function controlSeqFilter(userId: string, controlSeq: number | null) {
  if (controlSeq === null) return { _id: userId };
  return {
    _id: userId,
    $or: [
      { frogodoroControlSeq: { $exists: false } },
      { frogodoroControlSeq: { $lt: controlSeq } },
    ],
  };
}

// Drive the timer from a native surface (iOS Live Activity / Android notification
// buttons). Native callers send their push token for auth (they can't send the
// session cookie when the app is closed); web/app callers fall back to the
// session cookie. Each action mutates the stored timer and fans the new state
// out to every surface (SSE + APNs + FCM).
export async function POST(req: NextRequest) {
  try {
    await connectMongo();

    let body: { action?: unknown; token?: unknown; controlSeq?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const action = (typeof body?.action === 'string' ? body.action : '') as Action;
    if (!actions.has(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
    const token = typeof body?.token === 'string' ? body.token : '';
    const rawControlSeq =
      typeof body?.controlSeq === 'number' && Number.isFinite(body.controlSeq)
        ? Math.floor(body.controlSeq)
        : null;

    let user: UserFields | null = null;
    if (token) {
      user = (await UserModel.findOne(
        {
          $or: [
            { 'notificationPrefs.fcmTokens': token },
            { 'liveActivity.pushToken': token },
            { liveActivityStartToken: token },
          ],
        },
        SELECT,
      ).lean()) as UserFields | null;
    }
    if (!user) {
      const userId = await requireUserId();
      user = (await UserModel.findById(userId, SELECT).lean()) as UserFields | null;
    }
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = String(user._id);
    const live = user.liveActivity;
    const startToken = user.liveActivityStartToken;
    const startTokenClockSkewMs = user.liveActivityStartClockSkewMs;
    const prefs = user.notificationPrefs;
    const timer = user.activeFrogodoroTimer;
    const controlSeq = token && rawControlSeq && rawControlSeq > 0 ? rawControlSeq : null;

    console.log(
      `Frogodoro control: action=${action} seq=${controlSeq ?? 'none'} matchedBy=${token ? 'token' : 'cookie'} userId=${userId} timer=${timer ? timer.status : 'none'}`,
    );

    if (
      controlSeq !== null &&
      typeof user.frogodoroControlSeq === 'number' &&
      controlSeq <= user.frogodoroControlSeq
    ) {
      console.log(
        `Frogodoro control: ignored stale native seq=${controlSeq} current=${user.frogodoroControlSeq}`,
      );
      return NextResponse.json({ ok: true, stale: true });
    }

    if (action === 'stop' || action === 'done') {
      if (controlSeq !== null) {
        const accepted = await UserModel.updateOne(controlSeqFilter(userId, controlSeq), {
          $set: { frogodoroControlSeq: controlSeq },
        });
        if (accepted.matchedCount === 0) {
          return NextResponse.json({ ok: true, stale: true });
        }
      }
      await clearTimerAndFanOut(userId, live, prefs);
      if (controlSeq !== null) {
        await UserModel.updateOne({ _id: userId }, { $max: { frogodoroControlSeq: controlSeq } });
      }
      return NextResponse.json({ ok: true });
    }

    if (!timer) {
      console.log('Frogodoro control: no active timer for matched user — no-op');
      if (controlSeq !== null) {
        await UserModel.updateOne({ _id: userId }, { $max: { frogodoroControlSeq: controlSeq } });
      }
      return NextResponse.json({ ok: true });
    }

    const now = Date.now();
    let next: ActiveFrogodoroTimer | null = null;

    if (action === 'pause') {
      const endsAtMs = timer.endsAt ? new Date(timer.endsAt).getTime() : 0;
      const timeLeft = endsAtMs
        ? Math.max(0, Math.round((endsAtMs - now) / 1000))
        : timer.timeLeft;
      next = {
        ...timer,
        status: 'paused',
        timeLeft: timer.status === 'running' ? timeLeft : timer.timeLeft,
        endsAt: null,
        finished: false,
        rev: (timer.rev ?? 0) + 1,
        updatedAt: new Date(now).toISOString(),
      };
    } else if (action === 'resume') {
      const timeLeft =
        timer.status === 'running' && timer.endsAt
          ? Math.max(0, Math.round((new Date(timer.endsAt).getTime() - now) / 1000))
          : timer.timeLeft;
      next = {
        ...timer,
        status: 'running',
        timeLeft,
        endsAt: new Date(now + timeLeft * 1000).toISOString(),
        finished: false,
        rev: (timer.rev ?? 0) + 1,
        updatedAt: new Date(now).toISOString(),
      };
    }

    if (!next) {
      console.log(
        `Frogodoro control: action=${action} ignored — timer.status=${timer.status} (no transition) — no-op`,
      );
      return NextResponse.json({ ok: true });
    }

    const updated = await UserModel.findOneAndUpdate(
      controlSeqFilter(userId, controlSeq),
      {
        $set: {
          activeFrogodoroTimer: next,
          ...(controlSeq !== null ? { frogodoroControlSeq: controlSeq } : {}),
        },
        $inc: { frogodoroSeq: 1 },
      },
      { new: true, projection: { frogodoroSeq: 1 } },
    ).lean();
    if (!updated) {
      console.log(`Frogodoro control: skipped stale native update seq=${controlSeq}`);
      return NextResponse.json({ ok: true, stale: true });
    }
    const seq = (updated as { frogodoroSeq?: number } | null)?.frogodoroSeq ?? 0;
    publishTimerEvent(userId, next, seq);

    if (next.status === 'running' && next.endsAt) {
      scheduleFrogodoroTimerProcessing({ userId, endsAt: next.endsAt });
    } else {
      cancelFrogodoroTimerProcessing(userId);
    }

    await fanOutTimerState(userId, next, live, startToken, startTokenClockSkewMs, prefs);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
