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
import { advanceUserTimer } from '@/lib/frogodoroTimerProcessor';
import { addFrogodoroSession } from '@/lib/frogodoroSessions';
import { syncQuestState } from '@/lib/quests/engine';
import { notifyTaskChanged } from '@/lib/taskSync';
import { getZonedToday } from '@/lib/utils';
import type {
  ActiveFrogodoroTimer,
  LiveActivityRef,
  NotificationPrefs,
} from '@/lib/types/UserDoc';

export const dynamic = 'force-dynamic';

type Action = 'pause' | 'resume' | 'stop' | 'done' | 'more5' | 'alarmStop';
const actions = new Set<Action>([
  'pause',
  'resume',
  'stop',
  'done',
  'more5',
  'alarmStop',
]);

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

// Where the current phase stands: how much of it has run, and how much of that
// the task's session rows already hold (`savedElapsed`, the same watermark the
// completion save subtracts).
function phaseProgress(timer: ActiveFrogodoroTimer, now: number) {
  const minutes =
    timer.phase === 'focus'
      ? timer.settings.focusDuration
      : timer.settings.breakDuration;
  const fullSeconds = Math.max(1, Math.round(minutes * 60));
  const remaining =
    timer.status === 'running' && timer.endsAt
      ? Math.max(0, Math.round((new Date(timer.endsAt).getTime() - now) / 1000))
      : Math.max(0, Math.round(timer.timeLeft));
  const elapsedSeconds = Math.min(fullSeconds, Math.max(0, fullSeconds - remaining));
  const savedSeconds = Math.max(0, Math.floor(timer.savedElapsed ?? 0));
  return {
    fullSeconds,
    elapsedSeconds,
    unsavedSeconds: Math.max(0, elapsedSeconds - savedSeconds),
  };
}

// Bank the part of the current phase the task's rows don't have yet. A web
// client flushes its own time on pause/stop; the island and the notification
// have no client to do it for them, so without this the minutes a native pause
// or X ended on were simply dropped.
//
// `settle` is the difference the fly ledger cares about: a pause leaves the
// phase on the clock (its flies stay on the phase's own catch marks), while
// ending the session re-prices what was actually focused on the day curve.
async function flushPhaseProgress(
  userId: string,
  timer: ActiveFrogodoroTimer,
  timezone: string,
  settle: boolean,
  progress = phaseProgress(timer, Date.now()),
): Promise<boolean> {
  const { fullSeconds, elapsedSeconds, unsavedSeconds } = progress;
  if (!timer.taskId || elapsedSeconds <= 0) return false;
  if (!settle && unsavedSeconds <= 0) return false;
  // A phase that reached its end belongs to the completion path, which credits
  // it in one claimed write. Banking it here as well is how the same session
  // gets counted twice when a button and the due-processor land together.
  if (elapsedSeconds >= fullSeconds) return false;

  // Raise the watermark before the rows move, so a completion that lands in
  // between adds only the remainder rather than the whole phase.
  await UserModel.updateOne(
    {
      _id: userId,
      'activeFrogodoroTimer.taskId': timer.taskId,
      'activeFrogodoroTimer.phase': timer.phase,
    },
    { $max: { 'activeFrogodoroTimer.savedElapsed': elapsedSeconds } },
  ).catch(() => {});

  await addFrogodoroSession(
    userId,
    timer.taskId,
    getZonedToday(timezone),
    timer.phase === 'focus' ? unsavedSeconds : 0,
    timer.phase === 'break' ? unsavedSeconds : 0,
    settle || timer.phase !== 'focus' ? null : { elapsedSeconds, fullSeconds },
  ).catch((error) => {
    console.error('Frogodoro control: progress flush failed', error);
    return false;
  });

  if (unsavedSeconds > 0) {
    await notifyTaskChanged(userId).catch(() => {});
    void syncQuestState({ userId, timezone }).catch((error) => {
      console.error('Quest sync failed after native timer flush:', error);
    });
  }
  return unsavedSeconds > 0;
}

// Drive the timer from a native surface (iOS Live Activity / Android notification
// buttons). Native callers send their push token for auth (they can't send the
// session cookie when the app is closed); web/app callers fall back to the
// session cookie. Each action mutates the stored timer and fans the new state
// out to every surface (SSE + APNs + FCM).
export async function POST(req: NextRequest) {
  try {
    await connectMongo();

    let body: {
      action?: unknown;
      token?: unknown;
      controlSeq?: unknown;
      activityId?: unknown;
    } = {};
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
    const activityId = typeof body?.activityId === 'string' ? body.activityId : '';
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

    if (action === 'stop' || action === 'done' || action === 'alarmStop') {
      if (controlSeq !== null) {
        const accepted = await UserModel.updateOne(controlSeqFilter(userId, controlSeq), {
          $set: { frogodoroControlSeq: controlSeq },
        });
        if (accepted.matchedCount === 0) {
          return NextResponse.json({ ok: true, stale: true });
        }
      }

      const timezone = prefs?.timezone || 'UTC';

      // Acknowledging a phase can beat the processor that credits it (the alarm
      // rings on the phase's own end, the finished state lands a tick later), and
      // clearing the timer first would drop the focus time, flies and deep-focus
      // bonus it earned. Stop runs it too: a phase that reached its end is
      // credited by the completion, whichever button ends the session — and
      // going through the advance is what keeps that credit a single write when
      // the processor is racing this request for the same phase.
      const advanced = await advanceUserTimer(userId, { silent: true }).catch(
        () => null,
      );

      // alarmStop is the AlarmKit slide, which can't tell whether the alarm
      // outlived its phase. A phase still running is an auto-started break the
      // user never finished: the slide silenced the alarm, nothing more.
      if (action === 'alarmStop' && advanced?.status === 'running') {
        console.log(
          `Frogodoro control: alarmStop — ${advanced.phase} still running, alarm silenced only`,
        );
        if (controlSeq !== null) {
          await UserModel.updateOne(
            { _id: userId },
            { $max: { frogodoroControlSeq: controlSeq } },
          );
        }
        return NextResponse.json({ ok: true, running: true });
      }

      // Whatever the session ran without reaching a phase end is banked here —
      // the minutes behind an island X, or a Done taken on a phase that still
      // had time on it. A phase that DID just complete was credited in full by
      // the advance above and lands here as a fresh next phase with nothing
      // elapsed, so this adds nothing on top of it.
      if (advanced) {
        await flushPhaseProgress(userId, advanced, timezone, true).catch(
          () => false,
        );
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
      // Pausing from a native surface persists the phase's time here, the way a
      // web client flushes before it publishes a pause — and records how much of
      // the phase is now banked, so the completion save adds only the rest.
      const progress = phaseProgress(timer, now);
      // A phase already at its end is completing, not pausing — leave its time
      // (and its watermark) to the completion.
      const banks =
        timer.status === 'running' &&
        progress.elapsedSeconds < progress.fullSeconds;
      if (banks) {
        await flushPhaseProgress(
          userId,
          timer,
          prefs?.timezone || 'UTC',
          false,
          progress,
        ).catch(() => false);
      }
      next = {
        ...timer,
        status: 'paused',
        timeLeft: timer.status === 'running' ? timeLeft : timer.timeLeft,
        savedElapsed: banks
          ? Math.max(Math.floor(timer.savedElapsed ?? 0), progress.elapsedSeconds)
          : timer.savedElapsed,
        endsAt: null,
        finished: false,
        finishedAt: null,
        deepFocusBroken:
          timer.deepFocusBroken === true ||
          (timer.phase === 'focus' && timer.status === 'running'),
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
        finishedAt: null,
        rev: (timer.rev ?? 0) + 1,
        updatedAt: new Date(now).toISOString(),
      };
    } else if (action === 'more5') {
      // "+5 more" from the ringing state: a 5-minute focus continuation on
      // the same task (mirrors the web extendFocus — the shrunken
      // focusDuration is what makes hydration render 5:00, and the client
      // restores the original duration on stop).
      const extendSec = 5 * 60;
      next = {
        ...timer,
        phase: 'focus',
        status: 'running',
        timeLeft: extendSec,
        endsAt: new Date(now + extendSec * 1000).toISOString(),
        finished: false,
        finishedAt: null,
        deepFocusBroken: false,
        savedElapsed: 0,
        settings: { ...timer.settings, focusDuration: 5 },
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

    await fanOutTimerState(
      userId,
      next,
      live,
      startToken,
      startTokenClockSkewMs,
      prefs,
      false,
      !!activityId && activityId === live?.id,
    );

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
