import UserModel from '@/lib/models/User';
import { addFrogodoroSession } from '@/lib/frogodoroSessions';
import type { FrogodoroSettings, PomodoroPhase, SessionStats } from '@/lib/frogodoroStore';
import {
  sendLiveActivityUpdate,
} from '@/lib/notifications/liveActivity';
import { sendTimerControlPush, sendTimerFinishedPush } from '@/lib/notifications/timer';
import { buildLiveActivityData } from '@/lib/liveActivityData';
import { scheduleFrogodoroTimerProcessing } from '@/lib/frogodoroDelayedTimer';
import { publishTimerEvent } from '@/lib/frogodoroEvents';
import { syncQuestState } from '@/lib/quests/engine';
import { getZonedToday } from '@/lib/utils';
import type {
  ActiveFrogodoroTimer,
  NotificationPrefs,
  LiveActivityRef,
} from '@/lib/types/UserDoc';

const DEFAULT_SETTINGS: FrogodoroSettings = {
  focusDuration: 25,
  breakDuration: 5,
  autoStartBreaks: false,
  timerSound: 'dreamscape',
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

  const boundary = timer.endsAt ? new Date(timer.endsAt).getTime() : now.getTime();

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
          ? new Date(boundary + nextDuration * 1000).toISOString()
          : null,
        finished: !autoStart,
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
      finished: true,
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
  const saved = await addFrogodoroSession(
    userId,
    taskId,
    today,
    phase === 'focus' ? seconds : 0,
    phase === 'break' ? seconds : 0,
  );
  if (!saved) return;

  await syncQuestState({ userId, timezone }).catch((error) => {
    console.error('Quest sync failed after server timer processing:', error);
  });
}

export async function processDueFrogodoroTimers() {
  const results: Array<{
    userId: string;
    processed: boolean;
    sent?: number;
    reason?: string;
  }> = [];

  let processedTotal = 0;

  for (let pass = 0; pass < 10; pass++) {
    const passProcessed = await processDuePass(results);
    processedTotal += passProcessed;
    if (passProcessed === 0) break;
  }

  return {
    ok: true,
    processed: processedTotal,
    results,
  };
}

async function processDuePass(
  results: Array<{
    userId: string;
    processed: boolean;
    sent?: number;
    reason?: string;
  }>,
): Promise<number> {
  const now = new Date();
  const users = await UserModel.find({
    'activeFrogodoroTimer.status': 'running',
    'activeFrogodoroTimer.endsAt': { $lte: now.toISOString() },
  })
    .select('_id activeFrogodoroTimer notificationPrefs liveActivity')
    .limit(100)
    .lean()
    .exec();

  let processed = 0;

  for (const user of users) {
    const outcome = await processOneDueTimer(user, now);
    results.push(outcome.result);
    if (outcome.processed) processed += 1;
  }

  return processed;
}

type ProcessResult = {
  userId: string;
  processed: boolean;
  sent?: number;
  reason?: string;
};

async function processOneDueTimer(
  user: unknown,
  now: Date,
): Promise<{ processed: boolean; result: ProcessResult; timer?: ActiveFrogodoroTimer }> {
  const userId = String((user as any)._id);
  const timer = (user as any).activeFrogodoroTimer as ActiveFrogodoroTimer;
  const prefs = (user as any).notificationPrefs as NotificationPrefs | undefined;

  if (!timer?.taskId || !timer.endsAt) {
    return { processed: false, result: { userId, processed: false, reason: 'invalid_timer' } };
  }

  const next = getNextTimer(timer, now);
  const nextTimer: ActiveFrogodoroTimer = {
    ...next.nextTimer,
    rev: (timer.rev ?? 0) + 1,
  };

  const claimed = await UserModel.findOneAndUpdate(
    {
      _id: userId,
      'activeFrogodoroTimer.status': 'running',
      'activeFrogodoroTimer.endsAt': timer.endsAt,
    },
    { $set: { activeFrogodoroTimer: nextTimer }, $inc: { frogodoroSeq: 1 } },
    { new: true, projection: { frogodoroSeq: 1 } },
  ).lean();

  if (!claimed) {
    return { processed: false, result: { userId, processed: false, reason: 'already_claimed' } };
  }

  const seq = (claimed as { frogodoroSeq?: number } | null)?.frogodoroSeq ?? 0;
  publishTimerEvent(userId, nextTimer, seq);

  const timezone = prefs?.timezone || 'UTC';
  await saveTimerProgress({
    userId,
    taskId: timer.taskId,
    phase: next.completedPhase,
    seconds: next.completedDuration,
    timezone,
  });

  const live = (user as any).liveActivity as LiveActivityRef | null | undefined;
  if (live?.id && live.pushToken) {
    const breakEndsAt = nextTimer.endsAt ? new Date(nextTimer.endsAt).getTime() : 0;
    if (next.autoStartBreak && breakEndsAt > now.getTime()) {
      const endTime = breakEndsAt;
      const total = nextTimer.timeLeft;
      const data = buildLiveActivityData(
        {
          active: true,
          isRunning: true,
          phase: 'break',
          endTime,
          timeLeft: total,
          totalSeconds: total,
          taskName: '',
        },
        now.getTime(),
      );
      await sendLiveActivityUpdate({
        pushToken: live.pushToken,
        activityId: live.id,
        data,
        staleDate: endTime,
      });
    } else {
      // Finished (non-auto-start): keep the island alive in the ringing state
      // (shows "Time's up" + a Done button) rather than ending it. The completed
      // phase drives the label/color; the Done action clears it later.
      const total = getPhaseDuration(next.completedPhase, nextTimer.settings);
      const data = buildLiveActivityData(
        {
          active: true,
          isRunning: false,
          finished: true,
          phase: next.completedPhase,
          endTime: 0,
          timeLeft: 0,
          totalSeconds: total,
          taskName: '',
        },
        now.getTime(),
      );
      await sendLiveActivityUpdate({
        pushToken: live.pushToken,
        activityId: live.id,
        data,
        alert: { title: "Time's up", body: 'Your session finished.' },
      });
    }
  }

  const tokens = prefs?.enabled ? prefs.androidFcmTokens ?? [] : [];
  if (tokens.length > 0) {
    if (next.autoStartBreak && nextTimer.status === 'running' && nextTimer.endsAt) {
      await sendTimerControlPush({
        userId,
        tokens,
        action: 'start',
        phase: nextTimer.phase,
        endTime: new Date(nextTimer.endsAt).getTime(),
        timeLeft: nextTimer.timeLeft,
        taskName: '',
      });
    } else {
      await sendTimerFinishedPush({ userId, tokens, phase: next.completedPhase });
    }
  }

  if (nextTimer.status === 'running' && nextTimer.endsAt) {
    scheduleFrogodoroTimerProcessing({ userId, endsAt: nextTimer.endsAt });
  }

  return {
    processed: true,
    timer: nextTimer,
    result: { userId, processed: true },
  };
}

const ADVANCE_TOLERANCE_MS = 1500;

export async function advanceUserTimer(
  userId: string,
): Promise<ActiveFrogodoroTimer | null> {
  const now = new Date();
  const user = await UserModel.findById(userId)
    .select('_id activeFrogodoroTimer notificationPrefs liveActivity')
    .lean()
    .exec();

  const timer = (user as any)?.activeFrogodoroTimer as
    | ActiveFrogodoroTimer
    | null
    | undefined;
  if (!timer) return null;

  const endsAtMs = timer.endsAt ? new Date(timer.endsAt).getTime() : 0;
  const isDue =
    timer.status === 'running' && endsAtMs > 0 && endsAtMs <= now.getTime() + ADVANCE_TOLERANCE_MS;
  if (!isDue) return timer;

  const outcome = await processOneDueTimer(user, now);
  return outcome.timer ?? timer;
}
