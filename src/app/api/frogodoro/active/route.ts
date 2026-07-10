import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import {
  cancelFrogodoroTimerProcessing,
  scheduleFrogodoroTimerProcessing,
} from '@/lib/frogodoroDelayedTimer';
import { publishTimerEvent } from '@/lib/frogodoroEvents';
import { fanOutTimerState, clearTimerAndFanOut } from '@/lib/frogodoroSync';
import type { PomodoroPhase } from '@/lib/frogodoroStore';
import type {
  ActiveFrogodoroTimer,
  LiveActivityRef,
  NotificationPrefs,
} from '@/lib/types/UserDoc';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import TaskModel from '@/lib/models/Task';
import { taskAnalyticsProperties } from '@/lib/analytics/engagement';

export const dynamic = 'force-dynamic';

const phases = new Set<PomodoroPhase>(['focus', 'break']);
const statuses = new Set(['running', 'paused']);
const defaultSettings = {
  focusDuration: 25,
  breakDuration: 5,
  autoStartBreaks: false,
  timerSound: 'dreamscape' as const,
};
const defaultSessionStats = {
  focusTime: 0,
  breakTime: 0,
};

function unauth() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function normalizeTimer(input: unknown): ActiveFrogodoroTimer | null {
  if (!input || typeof input !== 'object') return null;

  const timer = input as Partial<ActiveFrogodoroTimer>;
  if (
    typeof timer.taskId !== 'string' ||
    !phases.has(timer.phase as PomodoroPhase) ||
    !statuses.has(timer.status ?? '') ||
    typeof timer.timeLeft !== 'number'
  ) {
    return null;
  }

  const phase = timer.phase as PomodoroPhase;
  const status = timer.status as 'running' | 'paused';

  return {
    taskId: timer.taskId,
    clientId: typeof timer.clientId === 'string' ? timer.clientId : undefined,
    clientStamp: typeof timer.clientStamp === 'number' ? timer.clientStamp : undefined,
    phase,
    status,
    timeLeft: Math.max(0, Math.floor(timer.timeLeft)),
    endsAt: typeof timer.endsAt === 'string' ? timer.endsAt : null,
    finished: timer.finished === true,
    settings: {
      ...defaultSettings,
      ...(timer.settings ?? {}),
    },
    sessionStats: {
      ...defaultSessionStats,
      ...(timer.sessionStats ?? {}),
    },
    rev: typeof timer.rev === 'number' ? timer.rev : undefined,
    updatedAt: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    const userId = await requireUserId();
    await connectMongo();

    const user = await UserModel.findById(userId, {
      activeFrogodoroTimer: 1,
      frogodoroSeq: 1,
    }).lean();

    return NextResponse.json({
      timer: user?.activeFrogodoroTimer ?? null,
      serverNow: Date.now(),
      seq: (user as { frogodoroSeq?: number } | null)?.frogodoroSeq ?? 0,
    });
  } catch {
    return unauth();
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const timer = normalizeTimer(body?.timer);
    const localLiveActivity = body?.localLiveActivity === true;

    if (!timer) {
      return NextResponse.json({ error: 'Invalid timer' }, { status: 400 });
    }

    await connectMongo();
    const existing = await UserModel.findById(userId, {
      activeFrogodoroTimer: 1,
      liveActivity: 1,
      liveActivityStartToken: 1,
      liveActivityStartClockSkewMs: 1,
      notificationPrefs: 1,
      frogodoroSeq: 1,
      focusProfile: 1,
    }).lean();
    const existingTimer = (
      existing as {
        activeFrogodoroTimer?: ActiveFrogodoroTimer | null;
      } | null
    )?.activeFrogodoroTimer;
    const prevRev = existingTimer?.rev ?? 0;

    if (
      existingTimer &&
      typeof timer.rev === 'number' &&
      typeof existingTimer.rev === 'number' &&
      timer.rev < existingTimer.rev
    ) {
      const currentSeq =
        (existing as { frogodoroSeq?: number } | null)?.frogodoroSeq ?? 0;
      return NextResponse.json({
        stale: true,
        timer: existingTimer,
        serverNow: Date.now(),
        seq: currentSeq,
      });
    }

    if (
      existingTimer &&
      timer.clientId &&
      existingTimer.clientId === timer.clientId &&
      typeof timer.clientStamp === 'number' &&
      typeof existingTimer.clientStamp === 'number' &&
      timer.clientStamp <= existingTimer.clientStamp
    ) {
      const currentSeq =
        (existing as { frogodoroSeq?: number } | null)?.frogodoroSeq ?? 0;
      return NextResponse.json({ stale: true, serverNow: Date.now(), seq: currentSeq });
    }
    const live = (existing as { liveActivity?: LiveActivityRef | null } | null)
      ?.liveActivity;
    const startToken = (
      existing as { liveActivityStartToken?: string | null } | null
    )?.liveActivityStartToken;
    const startTokenClockSkewMs = (
      existing as { liveActivityStartClockSkewMs?: number | null } | null
    )?.liveActivityStartClockSkewMs;
    const prefs = (existing as { notificationPrefs?: NotificationPrefs } | null)
      ?.notificationPrefs;
    const stored: ActiveFrogodoroTimer = { ...timer, rev: prevRev + 1 };
    console.log(
      `Frogodoro PUT /active clientId=${stored.clientId} status=${stored.status} finished=${stored.finished === true}`,
    );

    const updated = await UserModel.findOneAndUpdate(
      { _id: userId },
      { $set: { activeFrogodoroTimer: stored }, $inc: { frogodoroSeq: 1 } },
      { new: true, projection: { frogodoroSeq: 1 } },
    ).lean();
    const seq = (updated as { frogodoroSeq?: number } | null)?.frogodoroSeq ?? 0;
    publishTimerEvent(userId, stored, seq);

    if (!existingTimer && stored.phase === 'focus' && stored.status === 'running') {
      const task = await TaskModel.findOne({ userId, id: stored.taskId }).lean();
      await recordAnalyticsEvent({
        userId,
        name: 'timer_started',
        properties: taskAnalyticsProperties(task ?? {}, existing?.focusProfile, {
          phase: stored.phase,
          duration_minutes: stored.settings.focusDuration,
          focus_duration_minutes: stored.settings.focusDuration,
          break_duration_minutes: stored.settings.breakDuration,
          auto_start_breaks: stored.settings.autoStartBreaks,
        }),
      });
    }

    if (stored.status === 'running' && stored.endsAt) {
      scheduleFrogodoroTimerProcessing({
        userId,
        endsAt: stored.endsAt,
      });
    } else {
      cancelFrogodoroTimerProcessing(userId);
    }

    void fanOutTimerState(
      userId,
      stored,
      live,
      startToken,
      startTokenClockSkewMs,
      prefs,
      localLiveActivity,
    ).catch((e) => console.error('Frogodoro fan-out failed:', e));

    return NextResponse.json({ timer: stored, serverNow: Date.now(), seq });
  } catch {
    return unauth();
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const url = new URL(req.url);
    const clientId = url.searchParams.get('clientId');
    console.log(
      `Frogodoro DELETE /active by clientId=${clientId} owns=${url.searchParams.get('owns')} visible=${url.searchParams.get('visible')}`,
    );
    await connectMongo();

    // Every current client identifies itself (clientId is always sent, even as
    // 'unknown'). A param-less DELETE can only come from a stale/rogue build
    // running the old spurious-clear bug — never let it nuke a running timer.
    // Treat it as a no-op read so the caller re-hydrates the real state.
    if (clientId === null) {
      console.log('Frogodoro DELETE /active IGNORED (no clientId — stale client)');
      const user = await UserModel.findById(userId, {
        activeFrogodoroTimer: 1,
        frogodoroSeq: 1,
      }).lean();
      return NextResponse.json({
        timer: user?.activeFrogodoroTimer ?? null,
        serverNow: Date.now(),
        seq: (user as { frogodoroSeq?: number } | null)?.frogodoroSeq ?? 0,
      });
    }

    const existing = await UserModel.findById(userId, {
      liveActivity: 1,
      notificationPrefs: 1,
    }).lean();
    const live = (existing as { liveActivity?: LiveActivityRef | null } | null)
      ?.liveActivity;
    const prefs = (existing as { notificationPrefs?: NotificationPrefs } | null)
      ?.notificationPrefs;

    const seq = await clearTimerAndFanOut(userId, live, prefs);

    return NextResponse.json({ timer: null, serverNow: Date.now(), seq });
  } catch {
    return unauth();
  }
}
