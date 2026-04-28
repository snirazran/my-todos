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
  cycleDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 30,
  longBreakInterval: 3,
  autoStartBreaks: false,
  timerSound: 'bell',
};
const DEFAULT_SESSION_STATS: SessionStats = {
  focusSessions: 0,
  shortBreaks: 0,
  longBreaks: 0,
  focusTime: 0,
  shortBreakTime: 0,
  longBreakTime: 0,
};

function getPhaseDuration(phase: PomodoroPhase, settings: FrogodoroSettings) {
  if (phase === 'shortBreak') return settings.shortBreakDuration * 60;
  if (phase === 'longBreak') return settings.longBreakDuration * 60;
  return settings.cycleDuration * 60;
}

function getNextTimer(timer: ActiveFrogodoroTimer, now: Date) {
  const settings = { ...DEFAULT_SETTINGS, ...timer.settings };
  const sessionStats: SessionStats = {
    ...DEFAULT_SESSION_STATS,
    ...timer.sessionStats,
  };

  if (timer.phase === 'focus') {
    const completedCycles = (timer.completedCycles ?? 0) + 1;
    const nextPhase: PomodoroPhase =
      completedCycles % settings.longBreakInterval === 0
        ? 'longBreak'
        : 'shortBreak';
    const nextDuration = getPhaseDuration(nextPhase, settings);
    const autoStart = settings.autoStartBreaks;

    return {
      completedPhase: timer.phase,
      completedDuration: getPhaseDuration(timer.phase, settings),
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
        completedCycles,
        sessionStats: {
          ...sessionStats,
          focusSessions: sessionStats.focusSessions + 1,
          focusTime:
            sessionStats.focusTime + getPhaseDuration(timer.phase, settings),
        },
        updatedAt: now.toISOString(),
      } satisfies ActiveFrogodoroTimer,
    };
  }

  const nextDuration = getPhaseDuration('focus', settings);
  const completedDuration = getPhaseDuration(timer.phase, settings);

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
        ...(timer.phase === 'shortBreak'
          ? {
              shortBreaks: sessionStats.shortBreaks + 1,
              shortBreakTime: sessionStats.shortBreakTime + completedDuration,
            }
          : {
              longBreaks: sessionStats.longBreaks + 1,
              longBreakTime: sessionStats.longBreakTime + completedDuration,
            }),
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

  const session =
    phase === 'focus'
      ? { date: today, completedCycles: 1, timeSpent: seconds }
      : phase === 'shortBreak'
        ? {
            date: today,
            completedCycles: 0,
            timeSpent: 0,
            shortBreaks: 1,
            shortBreakTime: seconds,
          }
        : {
            date: today,
            completedCycles: 0,
            timeSpent: 0,
            longBreaks: 1,
            longBreakTime: seconds,
          };

  if (!task.frogodoroSessions) task.frogodoroSessions = [];
  const idx = task.frogodoroSessions.findIndex((s: any) => s.date === today);

  if (idx !== -1) {
    task.frogodoroSessions[idx].completedCycles += session.completedCycles || 0;
    task.frogodoroSessions[idx].timeSpent += session.timeSpent || 0;
    if ('shortBreaks' in session) {
      task.frogodoroSessions[idx].shortBreaks =
        (task.frogodoroSessions[idx].shortBreaks ?? 0) +
        (session.shortBreaks ?? 0);
      task.frogodoroSessions[idx].shortBreakTime =
        (task.frogodoroSessions[idx].shortBreakTime ?? 0) +
        (session.shortBreakTime ?? 0);
    }
    if ('longBreaks' in session) {
      task.frogodoroSessions[idx].longBreaks =
        (task.frogodoroSessions[idx].longBreaks ?? 0) +
        (session.longBreaks ?? 0);
      task.frogodoroSessions[idx].longBreakTime =
        (task.frogodoroSessions[idx].longBreakTime ?? 0) +
        (session.longBreakTime ?? 0);
    }
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
