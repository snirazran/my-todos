'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useFrogodoroStore, PomodoroPhase, FrogodoroSettings } from '@/lib/frogodoroStore';
import {
  playTimerSoundUntilStopped,
  playTransitionBeep,
  unlockAudio,
  normalizeTimerSound,
} from '@/lib/timerSounds';
import {
  scheduleTimerNotifications,
  cancelTimerNotifications,
} from '@/lib/timerNotifications';
import { format } from 'date-fns';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { randomUUID } from '@/lib/uuid';
import type { ActiveFrogodoroTimer } from '@/lib/types/UserDoc';
import { getCurrentLiveActivityState } from '@/lib/liveTimer';
import { notifyQuestClaims } from '@/lib/questClaims';
import { useNotification } from '@/components/providers/NotificationProvider';

function getPhaseDuration(phase: PomodoroPhase, settings: FrogodoroSettings): number {
  return phase === 'focus' ? settings.focusDuration * 60 : settings.breakDuration * 60;
}

function getClientId() {
  const key = 'frogodoro-client-id';
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;

  const id = randomUUID();
  window.localStorage.setItem(key, id);
  return id;
}

export function GlobalTimer() {
  const {
    isRunning,
    timerActive,
    endTime,
    timeLeft,
    phase,
    selectedTaskId,
    settings,
    sessionStats,
    phaseElapsed,
    awaitingDone,
    pendingSync,
    tickTimer,
    completePhase,
    registerCompletion,
    setAwaitingDone,
    setPhaseElapsed,
    lastCompletionId,
    lastCompletedPhase,
  } = useFrogodoroStore();

  const { showNotification } = useNotification();
  const prevCompletionIdRef = useRef(lastCompletionId);
  useEffect(() => {
    if (lastCompletionId === prevCompletionIdRef.current) return;
    prevCompletionIdRef.current = lastCompletionId;
    if (lastCompletedPhase !== 'focus') return;
    const t = window.setTimeout(
      () => void notifyQuestClaims(showNotification),
      1500,
    );
    return () => window.clearTimeout(t);
  }, [lastCompletionId, lastCompletedPhase, showNotification]);

  const prevIsRunning = useRef(isRunning);
  const clientIdRef = useRef<string | null>(null);
  // A device is NOT the owner until hydration proves it (clientId match) or the
  // user starts a timer here (the publisher claims it). Starting at `true` let a
  // freshly launched/woken non-owner act as owner before the first reconcile and
  // clear the timer the other on-screen device is running.
  const ownsTimerRef = useRef(false);
  const suppressNextPauseSaveRef = useRef(false);
  const hasLoadedRemoteTimerRef = useRef(false);
  // Highest server seq we've applied. Every timer event carries the seq of the
  // state it represents; we ignore anything not strictly newer, which orders all
  // events (incl. clears) deterministically and kills stale/out-of-order races.
  const lastSeqRef = useRef(-1);
  // The pendingSync value we last pushed to the server. The publisher fires only
  // when the store's pendingSync (bumped solely by user-intent actions) moves
  // past this — so hydrations and display ticks never publish.
  const lastSyncedPendingRef = useRef(0);
  const lastRemoteUpdatedAtRef = useRef('');
  const isRunningRef = useRef(isRunning);
  // True while our own PUT/DELETE to /active is outstanding. A resync GET that
  // lands in this window can read transitional state and clobber the optimistic
  // local countdown (the "timer jumps back" on tab-switch), so we skip applying
  // remote reads until our write settles and its seq is recorded.
  const publishInFlightRef = useRef(false);

  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);

  // Unlock AudioContext on first user interaction (required for mobile)
  useEffect(() => {
    const handler = () => unlockAudio();
    clientIdRef.current = getClientId();
    // Clear any persisted "awaiting Done" flag on load so a reload doesn't
    // resurrect a stuck alarm from a completion that happened in a past session.
    setAwaitingDone(false);
    document.addEventListener('touchstart', handler, { once: true });
    document.addEventListener('click', handler, { once: true });
    return () => {
      document.removeEventListener('touchstart', handler);
      document.removeEventListener('click', handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While a completion is awaiting acknowledgement, keep the alarm sounding
  // until the user clicks Done (which flips awaitingDone false → cleanup stops).
  // On native, the looping web audio would hijack the Dynamic Island as a
  // "Now Playing" media control (and the user picked a one-shot sound anyway),
  // so there the OS notification sound provides the audio instead.
  useEffect(() => {
    if (!awaitingDone || Capacitor.isNativePlatform()) return;
    const stop = playTimerSoundUntilStopped(
      normalizeTimerSound(settingsRef.current.timerSound),
    );
    return stop;
  }, [awaitingDone]);

  // Save Progress API Caller. totalPhaseElapsed (when known) tells the server
  // how much of the current phase is now persisted in total, so the
  // phase-completion save only adds the remainder.
  const saveProgress = async (
    taskId: string,
    phaseForSave: PomodoroPhase,
    seconds: number,
    totalPhaseElapsed?: number,
  ) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const session = {
      date: today,
      focusTime: phaseForSave === 'focus' ? seconds : 0,
      breakTime: phaseForSave === 'break' ? seconds : 0,
    };
    window.dispatchEvent(
      new CustomEvent('frogodoro-progress-saved', {
        detail: { taskId, session },
      }),
    );
    try {
      await fetch(`/api/tasks/${taskId}/frogodoro`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session,
          timezone,
          ...(typeof totalPhaseElapsed === 'number'
            ? {
                activePhaseElapsed: Math.max(0, Math.round(totalPhaseElapsed)),
                activePhase: phaseForSave,
              }
            : {}),
        }),
      });
    } catch (e) {
      console.error('Failed saving Frogodoro progress (Background)', e);
    }
  };

  // Refs for values needed inside the stable interval closure
  const phaseRef = useRef(phase);
  const selectedTaskIdRef = useRef(selectedTaskId);
  const settingsRef = useRef(settings);
  const timeLeftRef = useRef(timeLeft);
  const phaseElapsedRef = useRef(phaseElapsed);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { selectedTaskIdRef.current = selectedTaskId; }, [selectedTaskId]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);
  useEffect(() => { phaseElapsedRef.current = phaseElapsed; }, [phaseElapsed]);

  const publishActiveTimer = async (timer: Omit<ActiveFrogodoroTimer, 'updatedAt'>) => {
    publishInFlightRef.current = true;
    try {
      // A foregrounded iOS app creates the Live Activity locally (quiet, no
      // banner), so the server must NOT also fire a push-to-start — that push
      // requires an alert and would flash an unwanted banner/expand on the very
      // device that just started the timer.
      const localLiveActivity =
        Capacitor.getPlatform() === 'ios' &&
        typeof document !== 'undefined' &&
        document.visibilityState === 'visible';
      const res = await fetch('/api/frogodoro/active', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ timer, localLiveActivity }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.timer?.updatedAt) {
        lastRemoteUpdatedAtRef.current = data.timer.updatedAt;
      }
      if (typeof data?.timer?.rev === 'number') {
        useFrogodoroStore.getState().setActiveTimerRev(data.timer.rev);
      }
      if (data?.stale === true && data?.timer) {
        useFrogodoroStore.getState().hydrateActiveTimer(
          data.timer as ActiveFrogodoroTimer,
          typeof data.serverNow === 'number' ? data.serverNow : Date.now(),
        );
      }
      // Our own write is the newest state; record its seq so the echo (SSE/GET)
      // is ignored as not-newer, breaking the publish→echo→hydrate loop.
      if (typeof data?.seq === 'number' && data.seq > lastSeqRef.current) {
        lastSeqRef.current = data.seq;
      }
    } catch {
      // Cross-device timer sync is best-effort.
    } finally {
      publishInFlightRef.current = false;
    }
  };

  const clearActiveTimer = async () => {
    publishInFlightRef.current = true;
    try {
      const cid = clientIdRef.current ?? 'unknown';
      const res = await fetch(
        `/api/frogodoro/active?clientId=${encodeURIComponent(cid)}&owns=${ownsTimerRef.current}&visible=${typeof document !== 'undefined' ? document.visibilityState : 'na'}`,
        {
          method: 'DELETE',
          credentials: 'include',
        },
      );
      lastRemoteUpdatedAtRef.current = '';
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (typeof data?.seq === 'number' && data.seq > lastSeqRef.current) {
          lastSeqRef.current = data.seq;
        }
      }
    } catch {
      // Cross-device timer sync is best-effort.
    } finally {
      publishInFlightRef.current = false;
    }
  };

  // Builds the server payload from the CURRENT store state at call time. Used by
  // the user-action publisher and the first-load adopt path.
  const buildTimerPayload = useCallback(():
    | Omit<ActiveFrogodoroTimer, 'updatedAt'>
    | null => {
    const s = useFrogodoroStore.getState();
    if (!s.selectedTaskId || !clientIdRef.current) return null;
    const running = s.isRunning && !!s.endTime;
    const snapshotTimeLeft =
      running && s.endTime
        ? Math.max(0, Math.round((s.endTime - Date.now()) / 1000))
        : s.timeLeft;
    return {
      taskId: s.selectedTaskId,
      clientId: clientIdRef.current,
      clientStamp: Date.now(),
      phase: s.phase,
      status: s.isRunning ? 'running' : 'paused',
      timeLeft: snapshotTimeLeft,
      endsAt: running && s.endTime ? new Date(s.endTime).toISOString() : null,
      finished: s.awaitingDone,
      settings: s.settings,
      sessionStats: s.sessionStats,
      rev: s.activeTimerRev ?? undefined,
    };
  }, []);

  // Single entry point for applying server-authoritative timer state, whether
  // it arrives via SSE, the initial GET, a resync, or the advance response.
  const applyRemoteTimer = useCallback(
    (timer: ActiveFrogodoroTimer | null, serverNow: number, seq: number) => {
      // While our own write is outstanding, never let an incoming read (SSE
      // initial snapshot, echo, or a resync) apply — it can carry null or an
      // older endsAt that lands in the window before our PUT response records
      // the new seq, clobbering the optimistic start (timer "stops" or jumps).
      // Once the write settles, lastSeqRef holds its seq and the normal seq
      // guard below filters anything stale.
      if (publishInFlightRef.current) return;
      // The server stamps every state write with a monotonic seq. Ignore any
      // event whose seq isn't strictly newer than the last we applied — this
      // deterministically drops stale/out-of-order events (including a null GET
      // that raced our own start), so no time-window or "had a timer" heuristics
      // are needed. A seq of -1 (legacy/unknown) is always treated as fresh.
      const hasSeq = typeof seq === 'number' && seq >= 0;
      if (hasSeq && hasLoadedRemoteTimerRef.current && seq <= lastSeqRef.current) {
        return;
      }
      if (hasSeq) lastSeqRef.current = seq;

      if (!timer?.updatedAt) {
        const store = useFrogodoroStore.getState();
        const firstLoad = !hasLoadedRemoteTimerRef.current;
        hasLoadedRemoteTimerRef.current = true;
        lastRemoteUpdatedAtRef.current = '';

        // First reconcile after mount: if the server has no timer but this device
        // does (a fresh start in the load window, or the server lost it), the
        // local timer wins — publish it rather than wiping it.
        if (firstLoad && (store.timerActive || store.awaitingDone)) {
          const payload = buildTimerPayload();
          if (payload) void publishActiveTimer(payload);
          return;
        }

        // A later null is a genuine remote clear (Stop/Done on another surface) —
        // mirror it locally. Sync lastSyncedPending so this stop doesn't bounce
        // back to the server as a redundant clear.
        if (store.timerActive || store.awaitingDone) {
          store.setAwaitingDone(false);
          store.stopTimer();
          lastSyncedPendingRef.current = useFrogodoroStore.getState().pendingSync;
        }
        return;
      }

      // Detect a phase completion that this update is carrying. The server (its
      // scheduled processor, or another device) advances the timer and pushes
      // the next phase — which drives the transition even on the device that was
      // running it. Catch it here so the open app can sound the alarm + show the
      // Done prompt regardless of which path won the race.
      const prevState = useFrogodoroStore.getState();
      const isCompletion =
        hasLoadedRemoteTimerRef.current &&
        prevState.timerActive &&
        prevState.isRunning &&
        timer.phase !== prevState.phase;
      const completedPhase = prevState.phase;

      lastRemoteUpdatedAtRef.current = timer.updatedAt;
      hasLoadedRemoteTimerRef.current = true;
      ownsTimerRef.current = timer.clientId === clientIdRef.current;
      suppressNextPauseSaveRef.current =
        isRunningRef.current && timer.status === 'paused';
      useFrogodoroStore.getState().hydrateActiveTimer(timer, serverNow);

      if (isCompletion) {
        // Natural completion → the phase ran to 0, so its elapsed is its full
        // duration. Record it for the Done screen's summary.
        const mins =
          completedPhase === 'focus'
            ? timer.settings?.focusDuration
            : timer.settings?.breakDuration;
        const completedFull = Math.max(1, Math.round((mins ?? 0) * 60));
        useFrogodoroStore.getState().setPhaseElapsedResult(completedPhase, completedFull);

        // A break that auto-started keeps running → a short beep marks the
        // switch (the chosen alarm can be long; we don't want it mid-flow).
        // Anything that lands paused is a finished session: open the popup and
        // sound the alarm until the user clicks Done.
        if (timer.status === 'running') {
          playTransitionBeep();
        } else {
          registerCompletion(completedPhase, true);
        }
      }

      // Always mirror the server's ringing flag. If a completion arrived via a
      // path that didn't trip isCompletion (e.g. this backgrounded device lost
      // the advance race), this still marks awaitingDone so the next publish
      // stays "finished" and doesn't overwrite the Done island with the queued
      // paused phase. Likewise clears it when the server is no longer ringing.
      const store = useFrogodoroStore.getState();
      if (!!timer.finished !== store.awaitingDone) {
        store.setAwaitingDone(!!timer.finished);
      }
    },
    [registerCompletion],
  );

  const applyNativeLiveActivityState = useCallback(async () => {
    const state = await getCurrentLiveActivityState();
    if (!state?.active) return;

    const phase: PomodoroPhase =
      state.label.toLowerCase().includes('break') ? 'break' : 'focus';
    const running = !state.paused && state.endTime > 0 && state.finished !== true;
    const timeLeft = running
      ? Math.max(0, Math.round((state.endTime - Date.now()) / 1000))
      : Math.max(0, Math.round(state.ringValue));

    useFrogodoroStore.getState().hydrateLiveActivitySnapshot({
      phase,
      isRunning: running,
      endTime: running ? state.endTime : null,
      timeLeft,
      totalSeconds: state.ringTotal,
      finished: state.finished,
    });
  }, []);

  // Publish to the server ONLY in response to user-intent actions, detected via
  // the store's pendingSync counter (bumped by start/pause/resume/stop/switch/
  // complete and nothing else). Server→client hydration and per-second display
  // ticks never bump it, so they never publish — this is what makes the server
  // the single source of truth with no echo loop.
  useEffect(() => {
    if (pendingSync === 0) return;
    // Not ready to sync yet (first server reconcile hasn't run). The first-load
    // adopt path in applyRemoteTimer will push local state once it does.
    if (!clientIdRef.current || !hasLoadedRemoteTimerRef.current) return;
    if (pendingSync === lastSyncedPendingRef.current) return;

    // A device that doesn't own the active timer and isn't on-screen must stay
    // passive. When the backgrounded app is woken (push-to-start, SSE reconnect)
    // its reconcile can flip local state and bump pendingSync; without this
    // guard that publishes a stale state — or clears the shared timer — out from
    // under the device the user is actually on. Consume the bump and bail; the
    // next foreground resync re-hydrates this device from the server.
    const visible =
      typeof document === 'undefined' || document.visibilityState === 'visible';
    if (!visible && !ownsTimerRef.current) {
      lastSyncedPendingRef.current = pendingSync;
      return;
    }

    lastSyncedPendingRef.current = pendingSync;

    ownsTimerRef.current = true;

    if (!useFrogodoroStore.getState().timerActive) {
      void clearActiveTimer();
      return;
    }

    const payload = buildTimerPayload();
    if (payload) void publishActiveTimer(payload);
  }, [pendingSync, buildTimerPayload]);

  // Sync timer state across windows/devices in real time via SSE. A GET resync
  // gates the (authenticated) connection — logged-out users get a 401 and never
  // open the stream — and also serves as a periodic + on-focus backstop that
  // re-establishes the stream if it drops (e.g. iOS suspending the app).
  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;

    const connect = () => {
      if (es || cancelled) return;
      try {
        const source = new EventSource('/api/frogodoro/stream', {
          withCredentials: true,
        });
        source.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data) as {
              timer: ActiveFrogodoroTimer | null;
              serverNow: number;
              seq: number;
            };
            applyRemoteTimer(
              data.timer,
              data.serverNow ?? Date.now(),
              typeof data.seq === 'number' ? data.seq : -1,
            );
          } catch {
            // ignore malformed events
          }
        };
        source.onerror = () => {
          source.close();
          if (es === source) es = null;
        };
        es = source;
      } catch {
        es = null;
      }
    };

    const resync = async () => {
      // Don't let a backstop read clobber our own optimistic state while a
      // write is in flight — the publish response (and SSE echo) will sync us.
      if (publishInFlightRef.current) {
        connect();
        return;
      }
      try {
        const res = await fetch('/api/frogodoro/active', {
          credentials: 'include',
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        applyRemoteTimer(
          (data?.timer as ActiveFrogodoroTimer | null) ?? null,
          typeof data?.serverNow === 'number' ? data.serverNow : Date.now(),
          typeof data?.seq === 'number' ? data.seq : -1,
        );
        connect();
      } catch {
        // Cross-device timer sync is best-effort.
      }
    };

    // Coming back from the background, the SSE was almost certainly suspended;
    // its EventSource can still read non-null (so connect() would no-op). Tear it
    // down and resync from scratch so the store snaps to server truth.
    const forceResync = () => {
      if (es) {
        es.close();
        es = null;
      }
      void applyNativeLiveActivityState();
      void resync();
    };

    void resync();
    // SSE is the live channel. Only poll to re-establish it when it's actually
    // dropped (cheap reconnect), plus a slow full resync as a catch-all for a
    // stream that died silently (e.g. iOS suspended the app without an error).
    const reconnectPoll = window.setInterval(() => {
      if (!es) void resync();
    }, 30000);
    const safetyResync = window.setInterval(resync, 180000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') forceResync();
    };
    document.addEventListener('visibilitychange', onVisible);

    // iOS Capacitor doesn't reliably fire `visibilitychange` on app resume, so
    // without this the in-app webview keeps counting a stale endTime after the
    // user paused/played from the Dynamic Island while backgrounded — showing a
    // different time than the island/web. appStateChange(isActive) is the
    // reliable foreground signal; force a full resync to re-hydrate from server.
    let appStateHandle: { remove: () => void } | null = null;
    if (Capacitor.isNativePlatform()) {
      void App.addListener('appStateChange', ({ isActive }) => {
        if (isActive && !cancelled) forceResync();
      })
        .then((handle) => {
          if (cancelled) handle.remove();
          else appStateHandle = handle;
        })
        .catch(() => {
          // Plugin missing from an older native shell — visibilitychange covers web.
        });
    }

    return () => {
      cancelled = true;
      window.clearInterval(reconnectPoll);
      window.clearInterval(safetyResync);
      document.removeEventListener('visibilitychange', onVisible);
      appStateHandle?.remove();
      es?.close();
    };
  }, [applyNativeLiveActivityState, applyRemoteTimer]);

  // Detect pause/stop to flush partial time for any phase
  useEffect(() => {
    if (prevIsRunning.current && !isRunning) {
      if (suppressNextPauseSaveRef.current) {
        suppressNextPauseSaveRef.current = false;
        prevIsRunning.current = isRunning;
        return;
      }

      if (selectedTaskId) {
        const phaseDuration = getPhaseDuration(phase, settings);
        const elapsed = phaseDuration - timeLeft;
        const unsavedElapsed = elapsed - phaseElapsed;
        if (unsavedElapsed > 0) {
          saveProgress(selectedTaskId, phase, unsavedElapsed, elapsed);
          setPhaseElapsed(elapsed);
          // Fold the just-elapsed time into sessionStats synchronously so the
          // stats display doesn't momentarily drop to 0 between resetting
          // phaseElapsed and the async DB write landing (the first-pause
          // flicker on a freshly opened task).
          const store = useFrogodoroStore.getState();
          const stats = store.sessionStats;
          store.updateSessionStats({
            focusTime: stats.focusTime + (phase === 'focus' ? unsavedElapsed : 0),
            breakTime: stats.breakTime + (phase === 'break' ? unsavedElapsed : 0),
          });
        }
      }
    }
    prevIsRunning.current = isRunning;
  }, [isRunning, phase, phaseElapsed, selectedTaskId, setPhaseElapsed, settings, timeLeft]);

  // Live progress: while a focus phase runs on the owning device, persist the
  // unsaved elapsed time every minute so focus quests advance during the
  // session instead of only at pause/completion. The server subtracts these
  // flushes from the completion save via savedElapsed, so nothing is counted
  // twice.
  useEffect(() => {
    if (!isRunning || !endTime) return;
    const interval = setInterval(() => {
      if (!ownsTimerRef.current) return;
      if (phaseRef.current !== 'focus') return;
      const taskId = selectedTaskIdRef.current;
      if (!taskId) return;
      const phaseDuration = getPhaseDuration(
        phaseRef.current,
        settingsRef.current,
      );
      const elapsed = Math.max(0, phaseDuration - timeLeftRef.current);
      const unsaved = elapsed - phaseElapsedRef.current;
      if (unsaved < 45) return;
      saveProgress(taskId, 'focus', unsaved, elapsed);
      setPhaseElapsed(elapsed);
      const store = useFrogodoroStore.getState();
      const stats = store.sessionStats;
      store.updateSessionStats({
        focusTime: stats.focusTime + unsaved,
        breakTime: stats.breakTime,
      });
      window.setTimeout(
        () =>
          void notifyQuestClaims(showNotification, { progressToast: false }),
        1200,
      );
    }, 60_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, endTime, setPhaseElapsed, showNotification]);

  // The Main Loop
  useEffect(() => {
    if (!isRunning || !endTime) return;

    let lastTick = Date.now();

    const interval = setInterval(() => {
      const now = Date.now();
      const gap = now - lastTick;
      lastTick = now;
      const remaining = Math.max(0, Math.round((endTime - now) / 1000));

      // Set title synchronously before tickTimer so it lands before React renders
      const m = Math.floor(remaining / 60).toString().padStart(2, '0');
      const s = (remaining % 60).toString().padStart(2, '0');
      document.title = `${m}:${s} - Frogress`;

      tickTimer(remaining);

      if (now >= endTime) {
        clearInterval(interval);

        // A large gap between ticks means the webview was suspended (backgrounded
        // app) and this 0 reflects time that elapsed off-screen, not a real-time
        // countdown. The server already processed this completion (its scheduler/
        // ticker) and the resume resync delivers the authoritative result — so
        // don't fire a duplicate alarm/advance here (which re-rang a session the
        // user had already Done'd from the Dynamic Island).
        if (gap > 2500) return;

        // The non-owning device never drives the transition; it waits for the
        // server's authoritative next phase to arrive over SSE.
        if (!ownsTimerRef.current) return;

        const completedPhase = phaseRef.current;
        const willAutoStart =
          completedPhase === 'focus' && settingsRef.current.autoStartBreaks;

        // The server is the single authority for the phase transition (and for
        // recording the completed phase's progress). Ask it to advance and apply
        // the result — applyRemoteTimer detects the completion and drives the
        // alarm + Done prompt. Fall back to a local transition only if the
        // request fails (e.g. offline), handling the alarm here in that case.
        void (async () => {
          try {
            const res = await fetch('/api/frogodoro/advance', {
              method: 'POST',
              credentials: 'include',
            });
            if (res.ok) {
              const data = await res.json();
              if (data?.timer) {
                applyRemoteTimer(
                  data.timer as ActiveFrogodoroTimer,
                  typeof data.serverNow === 'number' ? data.serverNow : Date.now(),
                  typeof data.seq === 'number' ? data.seq : -1,
                );
                return;
              }
            }
            throw new Error('advance failed');
          } catch {
            if (selectedTaskIdRef.current) {
              const phaseDuration = getPhaseDuration(
                phaseRef.current,
                settingsRef.current,
              );
              const unsavedElapsed = Math.max(
                0,
                phaseDuration - phaseElapsedRef.current,
              );
              if (unsavedElapsed > 0) {
                saveProgress(
                  selectedTaskIdRef.current,
                  phaseRef.current,
                  unsavedElapsed,
                );
              }
            }
            // Offline: applyRemoteTimer never ran, so own the alarm here.
            // completePhase sets awaitingDone (paused case) → the awaitingDone
            // effect plays the looping alarm; an auto-started break just beeps.
            if (willAutoStart) {
              playTransitionBeep();
            }
            completePhase(willAutoStart);
          }
        })();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, endTime, completePhase, tickTimer, applyRemoteTimer]);

  // Schedule the OS-level completion notification whenever a phase is running,
  // so it lands on time regardless of whether the app is open. Only the device
  // that owns the timer schedules, to avoid cross-device duplicates.
  useEffect(() => {
    if (isRunning && endTime && ownsTimerRef.current) {
      void scheduleTimerNotifications({
        phase,
        endTime,
        autoStartBreak: phase === 'focus' && settings.autoStartBreaks,
        breakDurationSec: settings.breakDuration * 60,
      });
    } else {
      void cancelTimerNotifications();
    }
  }, [isRunning, endTime, phase, settings.autoStartBreaks, settings.breakDuration]);

  // Reset tab title when timer stops
  useEffect(() => {
    if (!isRunning) {
      document.title = 'Frogress';
    }
  }, [isRunning]);

  return null;
}
