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
import { randomUUID } from '@/lib/uuid';
import type { ActiveFrogodoroTimer } from '@/lib/types/UserDoc';

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
    tickTimer,
    completePhase,
    registerCompletion,
    setAwaitingDone,
    setPhaseElapsed,
  } = useFrogodoroStore();

  const prevIsRunning = useRef(isRunning);
  const clientIdRef = useRef<string | null>(null);
  const ownsTimerRef = useRef(true);
  const suppressNextPauseSaveRef = useRef(false);
  const suppressNextPublishRef = useRef(false);
  const hasLoadedRemoteTimerRef = useRef(false);
  const lastRemoteUpdatedAtRef = useRef('');
  const lastPublishedSignatureRef = useRef('');
  const lastRevRef = useRef(-1);
  const isRunningRef = useRef(isRunning);

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
  useEffect(() => {
    if (!awaitingDone) return;
    const stop = playTimerSoundUntilStopped(
      normalizeTimerSound(settingsRef.current.timerSound),
    );
    return stop;
  }, [awaitingDone]);

  // Save Progress API Caller
  const saveProgress = async (
    taskId: string,
    phaseForSave: PomodoroPhase,
    seconds: number,
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
    try {
      const res = await fetch('/api/frogodoro/active', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ timer }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.timer?.updatedAt) {
        lastRemoteUpdatedAtRef.current = data.timer.updatedAt;
      }
      if (typeof data?.timer?.rev === 'number') {
        lastRevRef.current = data.timer.rev;
      }
    } catch {
      // Cross-device timer sync is best-effort.
    }
  };

  const clearActiveTimer = async () => {
    try {
      await fetch('/api/frogodoro/active', {
        method: 'DELETE',
        credentials: 'include',
      });
      lastRemoteUpdatedAtRef.current = '';
      lastPublishedSignatureRef.current = '';
      lastRevRef.current = -1;
    } catch {
      // Cross-device timer sync is best-effort.
    }
  };

  // Single entry point for applying server-authoritative timer state, whether
  // it arrives via SSE, the initial GET, a resync, or the advance response.
  const applyRemoteTimer = useCallback(
    (timer: ActiveFrogodoroTimer | null, serverNow: number) => {
      if (!timer?.updatedAt) {
        if (!hasLoadedRemoteTimerRef.current) {
          const store = useFrogodoroStore.getState();
          if (store.timerActive) {
            suppressNextPublishRef.current = true;
            store.stopTimer();
          }
        }
        hasLoadedRemoteTimerRef.current = true;
        lastRevRef.current = -1;
        lastRemoteUpdatedAtRef.current = '';
        return;
      }

      const rev = typeof timer.rev === 'number' ? timer.rev : 0;
      if (hasLoadedRemoteTimerRef.current && rev <= lastRevRef.current) {
        return;
      }

      // Detect a phase completion that this update is carrying. The server (its
      // scheduled processor, or another device) advances the timer and pushes
      // the next phase over SSE — which is what actually drives the transition,
      // even on the device that was running it. Catch it here so the open app
      // can sound the alarm + show the Done prompt regardless of which path won
      // the race. Skipped on the first load so a persisted, already-expired
      // timer isn't treated as a fresh completion.
      const prevState = useFrogodoroStore.getState();
      const isCompletion =
        hasLoadedRemoteTimerRef.current &&
        prevState.timerActive &&
        prevState.isRunning &&
        timer.phase !== prevState.phase;
      const completedPhase = prevState.phase;

      lastRevRef.current = rev;
      lastRemoteUpdatedAtRef.current = timer.updatedAt;
      hasLoadedRemoteTimerRef.current = true;
      ownsTimerRef.current = timer.clientId === clientIdRef.current;
      suppressNextPauseSaveRef.current =
        isRunningRef.current && timer.status === 'paused';
      suppressNextPublishRef.current = true;
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
    },
    [registerCompletion],
  );

  // Publish meaningful timer state changes, not every second.
  useEffect(() => {
    if (!selectedTaskId || !clientIdRef.current || !hasLoadedRemoteTimerRef.current) return;

    if (!timerActive) {
      void clearActiveTimer();
      return;
    }

    if (suppressNextPublishRef.current) {
      suppressNextPublishRef.current = false;
      return;
    }

    ownsTimerRef.current = true;

    const snapshotTimeLeft = isRunning && endTime
      ? Math.max(0, Math.round((endTime - Date.now()) / 1000))
      : timeLeftRef.current;

    const timer: Omit<ActiveFrogodoroTimer, 'updatedAt'> = {
      taskId: selectedTaskId,
      clientId: clientIdRef.current,
      phase,
      status: isRunning ? 'running' : 'paused',
      timeLeft: snapshotTimeLeft,
      endsAt: isRunning && endTime ? new Date(endTime).toISOString() : null,
      settings,
      sessionStats,
    };

    const signature = JSON.stringify({
      taskId: timer.taskId,
      phase: timer.phase,
      status: timer.status,
      timeLeft: timer.timeLeft,
      endsAt: timer.endsAt,
      settings: timer.settings,
      sessionStats: timer.sessionStats,
    });

    if (signature === lastPublishedSignatureRef.current) return;
    lastPublishedSignatureRef.current = signature;
    void publishActiveTimer(timer);
  }, [endTime, isRunning, phase, selectedTaskId, sessionStats, settings, timerActive]);

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
            };
            applyRemoteTimer(data.timer, data.serverNow ?? Date.now());
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
      try {
        const res = await fetch('/api/frogodoro/active', {
          credentials: 'include',
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        applyRemoteTimer(
          (data?.timer as ActiveFrogodoroTimer | null) ?? null,
          typeof data?.serverNow === 'number' ? data.serverNow : Date.now(),
        );
        connect();
      } catch {
        // Cross-device timer sync is best-effort.
      }
    };

    void resync();
    const interval = window.setInterval(resync, 30000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void resync();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      es?.close();
    };
  }, [applyRemoteTimer]);

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
          saveProgress(selectedTaskId, phase, unsavedElapsed);
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

  // The Main Loop
  useEffect(() => {
    if (!isRunning || !endTime) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.round((endTime - now) / 1000));

      // Set title synchronously before tickTimer so it lands before React renders
      const m = Math.floor(remaining / 60).toString().padStart(2, '0');
      const s = (remaining % 60).toString().padStart(2, '0');
      document.title = `${m}:${s} - Frogress`;

      tickTimer(remaining);

      if (remaining === 0) {
        clearInterval(interval);

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
