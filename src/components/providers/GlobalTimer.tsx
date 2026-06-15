'use client';

import { useEffect, useRef } from 'react';
import { useFrogodoroStore, PomodoroPhase, FrogodoroSettings } from '@/lib/frogodoroStore';
import { playTimerSoundLooped, unlockAudio } from '@/lib/timerSounds';
import {
  scheduleTimerNotifications,
  cancelTimerNotifications,
} from '@/lib/timerNotifications';
import { format } from 'date-fns';
import type { ActiveFrogodoroTimer } from '@/lib/types/UserDoc';

function getPhaseDuration(phase: PomodoroPhase, settings: FrogodoroSettings): number {
  return phase === 'focus' ? settings.focusDuration * 60 : settings.breakDuration * 60;
}

function getClientId() {
  const key = 'frogodoro-client-id';
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;

  const id = crypto.randomUUID();
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
    tickTimer,
    completePhase,
    setPhaseElapsed,
    hydrateActiveTimer,
  } = useFrogodoroStore();

  const prevIsRunning = useRef(isRunning);
  const clientIdRef = useRef<string | null>(null);
  const ownsTimerRef = useRef(true);
  const suppressNextPauseSaveRef = useRef(false);
  const suppressNextPublishRef = useRef(false);
  const hasLoadedRemoteTimerRef = useRef(false);
  const lastRemoteUpdatedAtRef = useRef('');
  const lastPublishedSignatureRef = useRef('');

  // Unlock AudioContext on first user interaction (required for mobile)
  useEffect(() => {
    const handler = () => unlockAudio();
    clientIdRef.current = getClientId();
    document.addEventListener('touchstart', handler, { once: true });
    document.addEventListener('click', handler, { once: true });
    return () => {
      document.removeEventListener('touchstart', handler);
      document.removeEventListener('click', handler);
    };
  }, []);

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
    } catch {
      // Cross-device timer sync is best-effort.
    }
  };

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

  // Poll for timer changes started from another app window/device.
  useEffect(() => {
    const loadActiveTimer = async () => {
      try {
        const res = await fetch('/api/frogodoro/active', {
          credentials: 'include',
        });
        if (!res.ok) return;
        const data = await res.json();
        const timer = data?.timer as ActiveFrogodoroTimer | null;
        if (!timer?.updatedAt) {
          // localStorage persists `timerActive: true` across sessions. On
          // the first poll, if the server confirms there's no timer, clear
          // the stale local state so the FrogodoroPill doesn't stick
          // around pointing at a task that no longer exists.
          if (!hasLoadedRemoteTimerRef.current) {
            const store = useFrogodoroStore.getState();
            if (store.timerActive) {
              suppressNextPublishRef.current = true;
              store.stopTimer();
            }
          }
          hasLoadedRemoteTimerRef.current = true;
          return;
        }

        if (timer.updatedAt === lastRemoteUpdatedAtRef.current) {
          hasLoadedRemoteTimerRef.current = true;
          return;
        }

        lastRemoteUpdatedAtRef.current = timer.updatedAt;
        hasLoadedRemoteTimerRef.current = true;
        ownsTimerRef.current = timer.clientId === clientIdRef.current;
        suppressNextPauseSaveRef.current = isRunning && timer.status === 'paused';
        suppressNextPublishRef.current = true;
        hydrateActiveTimer(timer);
      } catch {
        // Cross-device timer sync is best-effort.
      }
    };

    void loadActiveTimer();
    if (!timerActive) return;

    const interval = window.setInterval(loadActiveTimer, 5000);
    return () => window.clearInterval(interval);
  }, [hydrateActiveTimer, isRunning, timerActive]);

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
      const icon = phaseRef.current === 'focus' ? '🐸' : '☕';
      document.title = `${icon} ${m}:${s} - Frogress`;

      tickTimer(remaining);

      if (remaining === 0) {
        clearInterval(interval);

        if (!ownsTimerRef.current) return;

        // Play finish sound (loops up to 3x, stops on user interaction)
        playTimerSoundLooped(settingsRef.current.timerSound);

        // Auto Save on Complete — save the full phase duration
        if (selectedTaskIdRef.current) {
          const phaseDuration = getPhaseDuration(phaseRef.current, settingsRef.current);
          const unsavedElapsed = Math.max(0, phaseDuration - phaseElapsedRef.current);
          if (unsavedElapsed > 0) {
            saveProgress(selectedTaskIdRef.current, phaseRef.current, unsavedElapsed);
          }
        }

        // Completion delivery is handled by the local notification scheduled at
        // phase start (see the effect below) — it fires even if the app is
        // closed, so we don't send a push here (which also caused duplicates).

        completePhase(settingsRef.current.autoStartBreaks);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, endTime, completePhase, tickTimer]);

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
