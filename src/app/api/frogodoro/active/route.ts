import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import {
  cancelFrogodoroTimerProcessing,
  scheduleFrogodoroTimerProcessing,
} from '@/lib/frogodoroDelayedTimer';
import { publishTimerEvent } from '@/lib/frogodoroEvents';
import {
  sendLiveActivityUpdate,
  sendLiveActivityEnd,
  sendLiveActivityStart,
  isLiveActivityPushConfigured,
} from '@/lib/notifications/liveActivity';
import { buildLiveActivityData } from '@/lib/liveActivityData';
import { sendTimerControlPush } from '@/lib/notifications/timer';
import type { PomodoroPhase } from '@/lib/frogodoroStore';
import type {
  ActiveFrogodoroTimer,
  LiveActivityRef,
  NotificationPrefs,
} from '@/lib/types/UserDoc';

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

function phaseTotalSeconds(timer: ActiveFrogodoroTimer): number {
  const minutes =
    timer.phase === 'focus'
      ? timer.settings.focusDuration
      : timer.settings.breakDuration;
  return Math.max(1, Math.round(minutes * 60));
}

// Fan a state change made on one device out to that user's other surfaces that
// the SSE stream can't reach (a backgrounded/killed phone): the iOS Live
// Activity via APNs and the Android live-timer notification via a data FCM.
async function fanOutTimerState(
  userId: string,
  timer: ActiveFrogodoroTimer,
  live: LiveActivityRef | null | undefined,
  startToken: string | null | undefined,
  prefs: NotificationPrefs | null | undefined,
): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  const clearRef = () =>
    UserModel.updateOne({ _id: userId }, { $set: { liveActivity: null } });

  if (isLiveActivityPushConfigured()) {
    const running = timer.status === 'running' && !!timer.endsAt;
    const endTime = running ? new Date(timer.endsAt as string).getTime() : 0;
    const data = buildLiveActivityData({
      active: true,
      isRunning: running,
      phase: timer.phase,
      endTime: running ? endTime : 0,
      timeLeft: timer.timeLeft,
      totalSeconds: phaseTotalSeconds(timer),
      taskName: '',
    });

    if (live?.id && live.pushToken) {
      // The native widget renders run vs paused from content-state, so both are
      // a plain in-place update — the island survives a pause.
      tasks.push(
        sendLiveActivityUpdate({
          pushToken: live.pushToken,
          activityId: live.id,
          data,
          staleDate: running ? endTime : null,
        }).then((res) => (res.gone ? clearRef() : undefined)),
      );
    } else if (running && startToken) {
      // No live island yet → create it remotely via push-to-start (iOS 17.2+),
      // so starting/resuming on web shows the island on a closed phone.
      tasks.push(
        sendLiveActivityStart({
          pushToStartToken: startToken,
          data,
          staleDate: endTime,
        }),
      );
    }
  }

  const tokens = prefs?.enabled ? prefs.fcmTokens ?? [] : [];
  if (tokens.length > 0) {
    tasks.push(
      sendTimerControlPush({
        userId,
        tokens,
        action: timer.status === 'running' ? 'start' : 'pause',
        phase: timer.phase,
        endTime: timer.endsAt ? new Date(timer.endsAt).getTime() : 0,
        timeLeft: timer.timeLeft,
        taskName: '',
      }),
    );
  }

  await Promise.allSettled(tasks);
}

async function fanOutTimerStop(
  userId: string,
  live: LiveActivityRef | null | undefined,
  prefs: NotificationPrefs | null | undefined,
): Promise<void> {
  const tasks: Promise<unknown>[] = [];

  if (live?.id && live.pushToken && isLiveActivityPushConfigured()) {
    tasks.push(
      sendLiveActivityEnd({
        pushToken: live.pushToken,
        activityId: live.id,
        data: buildLiveActivityData({
          active: false,
          isRunning: false,
          phase: 'focus',
          endTime: 0,
          timeLeft: 0,
          totalSeconds: 0,
          taskName: '',
        }),
      }),
    );
  }

  const tokens = prefs?.enabled ? prefs.fcmTokens ?? [] : [];
  if (tokens.length > 0) {
    tasks.push(
      sendTimerControlPush({
        userId,
        tokens,
        action: 'stop',
        phase: 'focus',
        endTime: 0,
        timeLeft: 0,
        taskName: '',
      }),
    );
  }

  await Promise.allSettled(tasks);
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
    phase,
    status,
    timeLeft: Math.max(0, Math.floor(timer.timeLeft)),
    endsAt: typeof timer.endsAt === 'string' ? timer.endsAt : null,
    settings: {
      ...defaultSettings,
      ...(timer.settings ?? {}),
    },
    sessionStats: {
      ...defaultSessionStats,
      ...(timer.sessionStats ?? {}),
    },
    updatedAt: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    const userId = await requireUserId();
    await connectMongo();

    const user = await UserModel.findById(userId, {
      activeFrogodoroTimer: 1,
    }).lean();

    return NextResponse.json({
      timer: user?.activeFrogodoroTimer ?? null,
      serverNow: Date.now(),
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

    if (!timer) {
      return NextResponse.json({ error: 'Invalid timer' }, { status: 400 });
    }

    await connectMongo();
    const existing = await UserModel.findById(userId, {
      'activeFrogodoroTimer.rev': 1,
      liveActivity: 1,
      liveActivityStartToken: 1,
      notificationPrefs: 1,
    }).lean();
    const prevRev =
      (existing as { activeFrogodoroTimer?: { rev?: number } } | null)
        ?.activeFrogodoroTimer?.rev ?? 0;
    const live = (existing as { liveActivity?: LiveActivityRef | null } | null)
      ?.liveActivity;
    const startToken = (
      existing as { liveActivityStartToken?: string | null } | null
    )?.liveActivityStartToken;
    const prefs = (existing as { notificationPrefs?: NotificationPrefs } | null)
      ?.notificationPrefs;
    const stored: ActiveFrogodoroTimer = { ...timer, rev: prevRev + 1 };

    await UserModel.updateOne(
      { _id: userId },
      { $set: { activeFrogodoroTimer: stored } },
    );
    publishTimerEvent(userId, stored);

    if (stored.status === 'running' && stored.endsAt) {
      scheduleFrogodoroTimerProcessing({
        userId,
        endsAt: stored.endsAt,
      });
    } else {
      cancelFrogodoroTimerProcessing(userId);
    }

    await fanOutTimerState(userId, stored, live, startToken, prefs);

    return NextResponse.json({ timer: stored, serverNow: Date.now() });
  } catch {
    return unauth();
  }
}

export async function DELETE() {
  try {
    const userId = await requireUserId();
    await connectMongo();
    const existing = await UserModel.findById(userId, {
      liveActivity: 1,
      notificationPrefs: 1,
    }).lean();
    const live = (existing as { liveActivity?: LiveActivityRef | null } | null)
      ?.liveActivity;
    const prefs = (existing as { notificationPrefs?: NotificationPrefs } | null)
      ?.notificationPrefs;

    await UserModel.updateOne(
      { _id: userId },
      { $set: { activeFrogodoroTimer: null, liveActivity: null } },
    );
    publishTimerEvent(userId, null);
    cancelFrogodoroTimerProcessing(userId);

    await fanOutTimerStop(userId, live, prefs);

    return NextResponse.json({ timer: null, serverNow: Date.now() });
  } catch {
    return unauth();
  }
}
