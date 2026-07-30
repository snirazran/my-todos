import UserModel from '@/lib/models/User';
import { addFrogodoroSession } from '@/lib/frogodoroSessions';
import type { FrogodoroSettings, PomodoroPhase, SessionStats } from '@/lib/frogodoroStore';
import {
  sendLiveActivityUpdate,
} from '@/lib/notifications/liveActivity';
import { sendTimerControlPush, sendTimerFinishedPush } from '@/lib/notifications/timer';
import { buildLiveActivityData } from '@/lib/liveActivityData';
import { scheduleFrogodoroTimerProcessing } from '@/lib/frogodoroDelayedTimer';
import {
  timerHuntExtras,
  clearTimerAndFanOut,
  priorFocusSecondsFor,
} from '@/lib/frogodoroSync';
import { iosAlarmFile } from '@/lib/timerSoundFiles';
import { publishTimerEvent } from '@/lib/frogodoroEvents';
import { unattendedOverdueMs } from '@/lib/serverHeartbeat';
import { syncQuestState } from '@/lib/quests/engine';
import { getZonedToday } from '@/lib/utils';
import type {
  ActiveFrogodoroTimer,
  NotificationPrefs,
  LiveActivityRef,
} from '@/lib/types/UserDoc';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import {
  DEEP_FOCUS_MIN_SECONDS,
  DEEP_FOCUS_BONUS_FLIES,
  DEEP_FOCUS_DAILY_CAP,
} from '@/lib/focusFlies';
import TaskModel from '@/lib/models/Task';
import { taskAnalyticsProperties } from '@/lib/analytics/engagement';

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
        finishedAt: autoStart ? null : now.toISOString(),
        deepFocusBroken: false,
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
      finishedAt: now.toISOString(),
      deepFocusBroken: false,
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

// How long a finished phase stays pinned waiting for Done before it expires on
// its own. Matches the iPhone Clock app, which rings for at most ~15 minutes and
// then gives up rather than waiting forever for someone who isn't there.
//
// Nothing is lost when it fires: the completed phase was already credited the
// moment it finished, so Done is pure acknowledgement. All that expires is the
// "+5 more" offer, which is stale by then anyway.
const RINGING_EXPIRY_MS = 15 * 60_000;

// activeFrogodoroTimer has no index, so the sweep is a collection scan. At a
// 15-minute deadline it gains nothing from running on all six ticks a minute.
const EXPIRY_SWEEP_INTERVAL_MS = 60_000;

type GlobalWithSweep = typeof globalThis & { frogodoroLastExpirySweep?: number };

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

  const expired = await expireStaleFinishedTimers(results);

  return {
    ok: true,
    processed: processedTotal,
    expired,
    results,
  };
}

// Clear finished-but-unacknowledged sessions. Without this a phase that nobody
// pressed Done on stays in the database indefinitely — the due-processor only
// ever looks at running timers — and follows the user onto every device they
// open.
async function expireStaleFinishedTimers(
  results: Array<{
    userId: string;
    processed: boolean;
    sent?: number;
    reason?: string;
  }>,
): Promise<number> {
  const now = Date.now();
  const g = globalThis as GlobalWithSweep;
  if (now - (g.frogodoroLastExpirySweep ?? 0) < EXPIRY_SWEEP_INTERVAL_MS) return 0;
  g.frogodoroLastExpirySweep = now;

  const cutoff = new Date(now - RINGING_EXPIRY_MS).toISOString();

  const users = await UserModel.find({
    'activeFrogodoroTimer.finished': true,
    $or: [
      { 'activeFrogodoroTimer.finishedAt': { $lte: cutoff } },
      // Sessions already stuck when this shipped carry no finishedAt. A missing
      // field matches null in Mongo, so they fall back to updatedAt and get
      // swept once rather than sitting there forever.
      {
        'activeFrogodoroTimer.finishedAt': null,
        'activeFrogodoroTimer.updatedAt': { $lte: cutoff },
      },
    ],
  })
    .select('_id activeFrogodoroTimer notificationPrefs liveActivity')
    .limit(100)
    .lean()
    .exec();

  let expired = 0;

  for (const user of users) {
    const userId = String((user as any)._id);
    const timer = (user as any).activeFrogodoroTimer as ActiveFrogodoroTimer;
    const ringingSince = timer.finishedAt ?? timer.updatedAt;
    // The lateness the user actually saw — downtime we caused doesn't count, so
    // a deploy can't expire a session that only just started ringing.
    const ringingMs = unattendedOverdueMs(
      ringingSince ? new Date(ringingSince).getTime() : now,
      now,
    );
    if (ringingMs <= RINGING_EXPIRY_MS) continue;

    console.log(
      `Frogodoro processor: expiring unacknowledged finished session after ${Math.round(ringingMs / 60_000)}m for user ${userId}`,
    );
    await clearTimerAndFanOut(
      userId,
      (user as any).liveActivity as LiveActivityRef | null | undefined,
      (user as any).notificationPrefs as NotificationPrefs | undefined,
    );
    results.push({ userId, processed: true, reason: 'ringing_expired' });
    expired += 1;
  }

  return expired;
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
    .select('_id activeFrogodoroTimer notificationPrefs liveActivity focusProfile')
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

// An alarm is a signal that the moment arrived, so a late one is worse than
// none: past this much overdue the phase is still completed and credited, but
// silently — nobody wants a session ringing long after it ended.
const ALARM_GRACE_MS = 2 * 60_000;
// Beyond this, no server-side gap explains the delay: the record is a corpse
// (a stale client republished a dead session, a write went missing). Clearing it
// without crediting keeps phantom focus time out of the user's stats.
// Measured against time the server was actually up — a deploy or crash must
// never be the reason someone's focus time disappears.
const ABANDON_OVERDUE_MS = 30 * 60_000;

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

  const overdueMs = now.getTime() - new Date(timer.endsAt).getTime();
  const unattendedMs = unattendedOverdueMs(
    new Date(timer.endsAt).getTime(),
    now.getTime(),
  );

  if (unattendedMs > ABANDON_OVERDUE_MS) {
    console.log(
      `Frogodoro processor: abandoning timer overdue by ${Math.round(overdueMs / 60_000)}m for user ${userId}`,
    );
    await clearTimerAndFanOut(
      userId,
      (user as any).liveActivity as LiveActivityRef | null | undefined,
      prefs,
    );
    return { processed: true, result: { userId, processed: true, reason: 'abandoned' } };
  }

  const suppressAlarm = overdueMs > ALARM_GRACE_MS;

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
  // Clients flush partial progress while the phase runs (pause, periodic
  // live-progress saves) and record it as savedElapsed — only the remainder
  // is saved here, or pause+resume sessions get double-counted.
  const alreadySaved = Math.max(0, Math.floor(timer.savedElapsed ?? 0));
  const remainingSeconds = Math.max(0, next.completedDuration - alreadySaved);
  if (remainingSeconds > 0) {
    await saveTimerProgress({
      userId,
      taskId: timer.taskId,
      phase: next.completedPhase,
      seconds: remainingSeconds,
      timezone,
    });
  }
  const deepFocusEarned =
    next.completedPhase === 'focus' &&
    timer.deepFocus === true &&
    timer.deepFocusBroken !== true &&
    next.completedDuration >= DEEP_FOCUS_MIN_SECONDS;
  if (deepFocusEarned) {
    const deepDate = getZonedToday(timezone);
    await UserModel.updateOne({ _id: userId }, [
      {
        $set: {
          _deepPrev: {
            $cond: [
              { $eq: ['$wardrobe.deepFocusDaily.date', deepDate] },
              { $ifNull: ['$wardrobe.deepFocusDaily.earned', 0] },
              0,
            ],
          },
        },
      },
      {
        $set: {
          _deepGained: {
            $min: [
              DEEP_FOCUS_BONUS_FLIES,
              { $max: [0, { $subtract: [DEEP_FOCUS_DAILY_CAP, '$_deepPrev'] }] },
            ],
          },
        },
      },
      {
        $set: {
          'wardrobe.deepFocusDaily': {
            date: deepDate,
            earned: { $add: ['$_deepPrev', '$_deepGained'] },
          },
          'wardrobe.flies': {
            $add: [{ $ifNull: ['$wardrobe.flies', 0] }, '$_deepGained'],
          },
        },
      },
      { $unset: ['_deepPrev', '_deepGained'] },
    ], { updatePipeline: true });
  }

  if (next.completedPhase === 'focus') {
    const task = await TaskModel.findOne({ userId, id: timer.taskId }).lean();
    await recordAnalyticsEvent({
      userId,
      name: 'timer_completed',
      properties: taskAnalyticsProperties(task ?? {}, (user as any).focusProfile, {
        phase: next.completedPhase,
        duration_minutes: Math.round(next.completedDuration / 60),
        focus_duration_minutes: timer.settings.focusDuration,
        break_duration_minutes: timer.settings.breakDuration,
        auto_start_breaks: timer.settings.autoStartBreaks,
        completed_seconds: next.completedDuration,
      }),
    });
  }

  const live = (user as any).liveActivity as LiveActivityRef | null | undefined;
  const priorFocus = await priorFocusSecondsFor(userId, nextTimer, timezone).catch(
    () => 0,
  );

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
          ...timerHuntExtras(nextTimer, now.getTime(), priorFocus),
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
      const extras = timerHuntExtras(nextTimer, now.getTime(), priorFocus);
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
          ...extras,
        },
        now.getTime(),
      );
      await sendLiveActivityUpdate({
        pushToken: live.pushToken,
        activityId: live.id,
        data,
        priority: suppressAlarm ? 5 : 10,
        alert: suppressAlarm
          ? undefined
          : {
              title: "Time's up",
              body:
                next.completedPhase === 'focus' && extras.fliesCaught > 0
                  ? `${extras.fliesCaught} ${extras.fliesCaught === 1 ? 'fly' : 'flies'} caught — tap Done to collect.`
                  : 'Your session finished.',
              sound: iosAlarmFile(timer.settings.timerSound),
            },
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
        rev: nextTimer.rev,
        ...timerHuntExtras(nextTimer, now.getTime(), priorFocus),
      });
    } else if (!suppressAlarm) {
      await sendTimerFinishedPush({
        userId,
        tokens,
        phase: next.completedPhase,
        sound: timer.settings.timerSound,
      });
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
    .select('_id activeFrogodoroTimer notificationPrefs liveActivity focusProfile')
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
