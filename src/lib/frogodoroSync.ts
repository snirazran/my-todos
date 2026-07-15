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
import { fliesCaughtFor, deepFocusPledgeLive } from '@/lib/focusFlies';
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

// The hunt state native surfaces render (island/notification fly chip):
// flies caught this session, the session's reachable total, whether the
// deep-focus +1 pledge is live, and the chosen finish sound. Mirrors the
// timer sheet's math (sessionStats + live elapsed of a running focus).
export function timerHuntExtras(
  timer: ActiveFrogodoroTimer,
  now = Date.now(),
): {
  fliesCaught: number;
  fliesPotential: number;
  deepFocus: boolean;
  sound: string;
} {
  const total = phaseTotalSeconds(timer);
  const running = timer.status === 'running' && !!timer.endsAt;
  const remaining = running
    ? Math.max(0, Math.round((new Date(timer.endsAt as string).getTime() - now) / 1000))
    : Math.max(0, timer.timeLeft);
  const phaseElapsed = timer.phase === 'focus' ? Math.max(0, total - remaining) : 0;
  const flushed = Math.max(0, Math.floor(timer.savedElapsed ?? 0));
  const sessionFocus =
    (timer.sessionStats?.focusTime ?? 0) +
    (timer.phase === 'focus' ? Math.max(0, phaseElapsed - flushed) : 0);
  const fliesCaught = fliesCaughtFor(sessionFocus);
  const fliesPotential =
    timer.phase === 'focus'
      ? fliesCaughtFor(sessionFocus + remaining)
      : fliesCaught;
  return {
    fliesCaught,
    fliesPotential,
    deepFocus: deepFocusPledgeLive({
      deepFocus: timer.deepFocus === true,
      pausedThisPhase: timer.deepFocusBroken === true,
      phase: timer.phase,
      focusDurationMinutes: timer.settings.focusDuration,
    }),
    sound: timer.settings.timerSound ?? '',
  };
}

function tokenLabel(token: string | null | undefined): string {
  return token ? `${token.slice(0, 8)}...${token.slice(-6)}` : 'none';
}

export function normalizeClockSkewMs(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 10 * 60_000
    ? Math.round(value)
    : 0;
}

export function liveActivityEndTimeForDevice(
  serverEndTime: number,
  clockSkewMs: unknown,
): number {
  return serverEndTime - normalizeClockSkewMs(clockSkewMs);
}

export async function reserveLiveActivityRemoteStart(
  userId: string,
  key: string,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - 30_000).toISOString();
  const reserved = await UserModel.findOneAndUpdate(
    {
      _id: userId,
      $or: [
        { 'liveActivityRemoteStart.key': { $ne: key } },
        { 'liveActivityRemoteStart.attemptedAt': { $lt: cutoff } },
        { liveActivityRemoteStart: { $exists: false } },
      ],
    },
    {
      $set: {
        liveActivityRemoteStart: {
          key,
          attemptedAt: new Date().toISOString(),
        },
      },
    },
    { projection: { _id: 1 } },
  ).lean();
  return !!reserved;
}

// Fan a state change made on one device out to that user's other surfaces that
// the SSE stream can't reach (a backgrounded/killed phone): the iOS Live
// Activity via APNs and the Android live-timer notification via a data FCM.
export async function fanOutTimerState(
  userId: string,
  timer: ActiveFrogodoroTimer,
  live: LiveActivityRef | null | undefined,
  startToken: string | null | undefined,
  startTokenClockSkewMs: number | null | undefined,
  prefs: NotificationPrefs | null | undefined,
  // The publishing device is a foregrounded iOS app that creates the Live
  // Activity itself — don't push-to-start it (that push must carry an alert and
  // would flash a banner on the device that just started the timer).
  suppressPushToStart = false,
  suppressLiveActivityPush = false,
): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  const clearRef = () =>
    UserModel.updateOne({ _id: userId }, { $set: { liveActivity: null } });
  const clearStartToken = () =>
    UserModel.updateOne({ _id: userId }, { $set: { liveActivityStartToken: null } });
  const livePushConfigured = isLiveActivityPushConfigured();

  console.log(
    `Frogodoro fan-out: status=${timer.status} phase=${timer.phase} finished=${timer.finished === true} live=${live?.id ? 'yes' : 'no'} liveToken=${tokenLabel(live?.pushToken)} startToken=${tokenLabel(startToken)} apns=${livePushConfigured ? 'yes' : 'no'}`,
  );

  if (livePushConfigured && !suppressLiveActivityPush) {
    const finished = timer.finished === true;
    const running = !finished && timer.status === 'running' && !!timer.endsAt;
    const endTime = running ? new Date(timer.endsAt as string).getTime() : 0;
    const deviceEndTime =
      running && live?.id
        ? liveActivityEndTimeForDevice(endTime, live.clockSkewMs)
        : running
          ? liveActivityEndTimeForDevice(endTime, startTokenClockSkewMs)
          : 0;
    const data = buildLiveActivityData({
      active: true,
      isRunning: running,
      finished,
      phase: timer.phase,
      endTime: deviceEndTime,
      timeLeft: finished ? 0 : timer.timeLeft,
      totalSeconds: phaseTotalSeconds(timer),
      taskName: '',
      ...timerHuntExtras(timer),
    });

    if (live?.id && live.pushToken) {
      console.log(`Frogodoro fan-out: sending Live Activity update ${live.id}`);
      tasks.push(
        sendLiveActivityUpdate({
          pushToken: live.pushToken,
          activityId: live.id,
          data,
          staleDate: running ? deviceEndTime : null,
        }).then((res) =>
          res.gone || res.reason === 'BadDeviceToken' ? clearRef() : undefined,
        ),
      );
    } else if (running && startToken && !suppressPushToStart) {
      const startKey = `${timer.taskId}:${timer.phase}:${timer.endsAt}`;
      const reserved = await reserveLiveActivityRemoteStart(userId, startKey);
      if (!reserved) {
        console.log('Frogodoro fan-out: skipped duplicate remote start reservation');
      } else {
        console.log('Frogodoro fan-out: sending Live Activity remote start');
        tasks.push(
          sendLiveActivityStart({
            pushToStartToken: startToken,
            data,
            staleDate: deviceEndTime,
          }).then((res) => {
            if (res.gone || res.reason === 'BadDeviceToken') return clearStartToken();
            // A transient failure must release the reservation, or no retry can
            // happen until the next state change 30s+ later.
            if (!res.ok) {
              return UserModel.updateOne(
                { _id: userId },
                { $unset: { liveActivityRemoteStart: 1 } },
              );
            }
            return undefined;
          }),
        );
      }
    } else {
      console.log('Frogodoro fan-out: no Live Activity push target for this state');
    }
  }

  const tokens = prefs?.enabled ? prefs.androidFcmTokens ?? [] : [];
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
        rev: timer.rev,
        ...timerHuntExtras(timer),
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

  const tokens = prefs?.enabled ? prefs.androidFcmTokens ?? [] : [];
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
): Promise<number> {
  const doc = await UserModel.findOneAndUpdate(
    { _id: userId },
    { $set: { activeFrogodoroTimer: null, liveActivity: null }, $inc: { frogodoroSeq: 1 } },
    { new: true, projection: { frogodoroSeq: 1 } },
  ).lean();
  const seq = (doc as { frogodoroSeq?: number } | null)?.frogodoroSeq ?? 0;
  publishTimerEvent(userId, null, seq);
  cancelFrogodoroTimerProcessing(userId);
  await fanOutTimerStop(userId, live, prefs);
  return seq;
}
