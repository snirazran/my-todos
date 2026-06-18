import UserModel from '@/lib/models/User';
import { publishTimerEvent } from '@/lib/frogodoroEvents';
import { cancelFrogodoroTimerProcessing } from '@/lib/frogodoroDelayedTimer';
import {
  sendLiveActivityUpdate,
  sendLiveActivityEnd,
  sendLiveActivityStart,
  isLiveActivityPushConfigured,
} from '@/lib/notifications/liveActivity';
import { buildLiveActivityData } from '@/lib/liveActivityData';
import { sendTimerControlPush } from '@/lib/notifications/timer';
import type {
  ActiveFrogodoroTimer,
  LiveActivityRef,
  NotificationPrefs,
} from '@/lib/types/UserDoc';

export function phaseTotalSeconds(timer: ActiveFrogodoroTimer): number {
  const minutes =
    timer.phase === 'focus'
      ? timer.settings.focusDuration
      : timer.settings.breakDuration;
  return Math.max(1, Math.round(minutes * 60));
}

// Fan a state change made on one device out to that user's other surfaces that
// the SSE stream can't reach (a backgrounded/killed phone): the iOS Live
// Activity via APNs and the Android live-timer notification via a data FCM.
export async function fanOutTimerState(
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
    const finished = timer.finished === true;
    const running = !finished && timer.status === 'running' && !!timer.endsAt;
    const endTime = running ? new Date(timer.endsAt as string).getTime() : 0;
    const data = buildLiveActivityData({
      active: true,
      isRunning: running,
      finished,
      phase: timer.phase,
      endTime: running ? endTime : 0,
      timeLeft: finished ? 0 : timer.timeLeft,
      totalSeconds: phaseTotalSeconds(timer),
      taskName: '',
    });

    if (live?.id && live.pushToken) {
      tasks.push(
        sendLiveActivityUpdate({
          pushToken: live.pushToken,
          activityId: live.id,
          data,
          staleDate: running ? endTime : null,
        }).then((res) => (res.gone ? clearRef() : undefined)),
      );
    } else if (running && startToken) {
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

export async function fanOutTimerStop(
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

// Single source of truth for clearing a user's active timer and ending the
// alarm everywhere — used by the active-route DELETE (web) and the /done
// endpoint (native Done button). Idempotent.
export async function clearTimerAndFanOut(
  userId: string,
  live: LiveActivityRef | null | undefined,
  prefs: NotificationPrefs | null | undefined,
): Promise<void> {
  await UserModel.updateOne(
    { _id: userId },
    { $set: { activeFrogodoroTimer: null, liveActivity: null } },
  );
  publishTimerEvent(userId, null);
  cancelFrogodoroTimerProcessing(userId);
  await fanOutTimerStop(userId, live, prefs);
}
