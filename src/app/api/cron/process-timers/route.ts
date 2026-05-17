export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import TaskModel from '@/lib/models/Task';
import type { FrogodoroSettings, PomodoroPhase, SessionStats } from '@/lib/frogodoroStore';
import { sendTimerPushToUser } from '@/lib/notifications/timer';
import { syncQuestState } from '@/lib/quests/engine';
import { getZonedToday } from '@/lib/utils';
import type { ActiveFrogodoroTimer, NotificationPrefs } from '@/lib/types/UserDoc';

const CRON_SECRET = process.env.CRON_SECRET;
const DEFAULT_SETTINGS: FrogodoroSettings = {
  focusDuration: 25,
  breakDuration: 5,
  autoStartBreaks: false,
  timerSound: 'bell',
};
const DEFAULT_SESSION_STATS: SessionStats = {
  focusTime: 0,
  breakTime: 0,
};

function getPhaseDuration(phase: PomodoroPhase, settings: FrogodoroSettings) {
  return phase === 'focus' ? settings.focusDuration * 60 : settings.breakDuration * 60;
}

function getNextTimer(timer: ActiveFrogodoroTimer, now: Date) {
  const settings = { ...DEFAULT_SETTINGS, ...timer.settings };
  const sessionStats: SessionStats = {
    ...DEFAULT_SESSION_STATS,
    ...timer.sessionStats,
  };
  const completedDuration = getPhaseDuration(timer.phase, settings);

  if (timer.phase === 'focus') {
    const nextPhase: PomodoroPhase = 'break';
    const nextDuration = getPhaseDuration(nextPhase, settings);
    const autoStart = settings.autoStartBreaks;

    return {
      completedPhase: timer.phase,
      completedDuration,
      autoStartBreak: autoStart,
      nextTimer: {
        ...timer,
        phase: nextPhase,
        status: autoStart ? 'running' : 'paused',
        timeLeft: nextDuration,
        endsAt: autoStart
          ? new Date(now.getTime() + nextDuration * 1000).toISOString()
          : null,
        settings,
        sessionStats: {
          ...sessionStats,
          focusTime: sessionStats.focusTime + completedDuration,
        },
        updatedAt: now.toISOString(),
      } satisfies ActiveFrogodoroTimer,
    };
  }

  const nextDuration = getPhaseDuration('focus', settings);

  return {
    completedPhase: timer.phase,
    completedDuration,
    autoStartBreak: false,
    nextTimer: {
      ...timer,
      phase: 'focus',
      status: 'paused',
      timeLeft: nextDuration,
      endsAt: null,
      settings,
      sessionStats: {
        ...sessionStats,
        breakTime: sessionStats.breakTime + completedDuration,
      },
      updatedAt: now.toISOString(),
    } satisfies ActiveFrogodoroTimer,
  };
}

async function saveTimerProgress({
  userId,
  taskId,
  phase,
  seconds,
  timezone,
}: {
  userId: string;
  taskId: string;
  phase: PomodoroPhase;
  seconds: number;
  timezone: string;
}) {
  const today = getZonedToday(timezone);
  const task = await TaskModel.findOne({ id: taskId, userId });
  if (!task) return;

  const session = {
    date: today,
    focusTime: phase === 'focus' ? seconds : 0,
    breakTime: phase === 'break' ? seconds : 0,
  };

  if (!task.frogodoroSessions) task.frogodoroSessions = [];
  const idx = task.frogodoroSessions.findIndex((s: any) => s.date === today);

  if (idx !== -1) {
    task.frogodoroSessions[idx].focusTime =
      (task.frogodoroSessions[idx].focusTime ?? 0) + session.focusTime;
    task.frogodoroSessions[idx].breakTime =
      (task.frogodoroSessions[idx].breakTime ?? 0) + session.breakTime;
  } else {
    task.frogodoroSessions.push(session);
  }

  task.markModified('frogodoroSessions');
  await task.save();
  await syncQuestState({ userId, timezone }).catch((error) => {
    console.error('Quest sync failed after server timer processing:', error);
  });
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await connectMongo();

  const now = new Date();
  const users = await UserModel.find({
    'activeFrogodoroTimer.status': 'running',
    'activeFrogodoroTimer.endsAt': { $lte: now.toISOString() },
  })
    .select('_id activeFrogodoroTimer notificationPrefs')
    .limit(100)
    .lean()
    .exec();

  const results: Array<{
    userId: string;
    processed: boolean;
    sent?: number;
    reason?: string;
  }> = [];

  for (const user of users) {
    const userId = String((user as any)._id);
    const timer = (user as any).activeFrogodoroTimer as ActiveFrogodoroTimer;
    const prefs = (user as any).notificationPrefs as NotificationPrefs | undefined;

    if (!timer?.taskId || !timer.endsAt) {
      results.push({ userId, processed: false, reason: 'invalid_timer' });
      continue;
    }

    const next = getNextTimer(timer, now);
    const claim = await UserModel.updateOne(
      {
        _id: userId,
        'activeFrogodoroTimer.status': 'running',
        'activeFrogodoroTimer.endsAt': timer.endsAt,
      },
      { $set: { activeFrogodoroTimer: next.nextTimer } },
    );

    if (claim.modifiedCount !== 1) {
      results.push({ userId, processed: false, reason: 'already_claimed' });
      continue;
    }

    const timezone = prefs?.timezone || 'UTC';
    await saveTimerProgress({
      userId,
      taskId: timer.taskId,
      phase: next.completedPhase,
      seconds: next.completedDuration,
      timezone,
    });

    const tokens = prefs?.enabled ? prefs.fcmTokens ?? [] : [];
    const push = await sendTimerPushToUser({
      userId,
      phase: next.completedPhase,
      autoStartBreak: next.autoStartBreak,
      tokens,
    });

    results.push({ userId, processed: true, sent: push.sent });
  }

  return NextResponse.json({
    ok: true,
    processed: results.filter((result) => result.processed).length,
    results,
  });
}
