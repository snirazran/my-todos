'use client';

import { useEffect, useRef } from 'react';
import { useFrogodoroStore, PomodoroPhase, FrogodoroSettings } from '@/lib/frogodoroStore';
import { playTimerSoundLooped, unlockAudio } from '@/lib/timerSounds';
import { format } from 'date-fns';
import type { ActiveFrogodoroTimer } from '@/lib/types/UserDoc';
import { createId } from '@/lib/createId';

async function sendTimerNotification(phase: PomodoroPhase, autoStartBreak: boolean) {
  try {
    await fetch('/api/notifications/timer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ phase, autoStartBreak }),
    });
  } catch {
    // Silent fail — notification is non-critical
  }
}

function getPhaseDuration(phase: PomodoroPhase, settings: FrogodoroSettings): number {
  if (phase === 'shortBreak') return settings.shortBreakDuration * 60;
  if (phase === 'longBreak') return settings.longBreakDuration * 60;
  return settings.cycleDuration * 60;
}

function getClientId() {
  const key = 'frogodoro-client-id';
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;

  const id = createId();
  window.localStorage.setItem(key, id);
  return id;
}

export function GlobalTimer() {
  const {
    isRunning,
    endTime,
    timeLeft,
    phase,
    selectedTaskId,
    settings,
    completedCycles,
    sessionStats,
    tickTimer,
    completePhase,
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
    cycles: number,
    spend: number,
    breaks?: { shortBreaks?: number; shortBreakTime?: number; longBreaks?: number; longBreakTime?: number },
  ) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      await fetch(`/api/tasks/${taskId}/frogodoro`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: {
            date: today,
            completedCycles: cycles,
            timeSpent: spend,
            ...breaks,
          },
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

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { selectedTaskIdRef.current = selectedTaskId; }, [selectedTaskId]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);

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

  // Publish meaningful timer state changes, not every second.
  useEffect(() => {
    if (!selectedTaskId || !clientIdRef.current || !hasLoadedRemoteTimerRef.current) return;

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
      completedCycles,
      sessionStats,
    };

    const signature = JSON.stringify({
      taskId: timer.taskId,
      phase: timer.phase,
      status: timer.status,
      timeLeft: timer.timeLeft,
      endsAt: timer.endsAt,
      settings: timer.settings,
      completedCycles: timer.completedCycles,
      sessionStats: timer.sessionStats,
    });

    if (signature === lastPublishedSignatureRef.current) return;
    lastPublishedSignatureRef.current = signature;
    void publishActiveTimer(timer);
  }, [completedCycles, endTime, isRunning, phase, selectedTaskId, sessionStats, settings]);

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
    const interval = window.setInterval(loadActiveTimer, 5000);
    return () => window.clearInterval(interval);
  }, [hydrateActiveTimer, isRunning]);

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
        if (elapsed > 0) {
          if (phase === 'focus') {
            saveProgress(selectedTaskId, 0, elapsed);
          } else if (phase === 'shortBreak') {
            saveProgress(selectedTaskId, 0, 0, { shortBreaks: 1, shortBreakTime: elapsed });
          } else if (phase === 'longBreak') {
            saveProgress(selectedTaskId, 0, 0, { longBreaks: 1, longBreakTime: elapsed });
          }
        }
      }
    }
    prevIsRunning.current = isRunning;
  }, [isRunning, phase, selectedTaskId, settings, timeLeft]);

  // The Main Loop
  useEffect(() => {
    if (!isRunning || !endTime) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.round((endTime - now) / 1000));

      // Set title synchronously before tickTimer so it lands before React renders
      const m = Math.floor(remaining / 60).toString().padStart(2, '0');
      const s = (remaining % 60).toString().padStart(2, '0');
      const icon = phaseRef.current === 'focus' ? '🐸' : phaseRef.current === 'shortBreak' ? '☕' : '💤';
      document.title = `${icon} ${m}:${s} - FrogTask`;

      tickTimer(remaining);

      if (remaining === 0) {
        clearInterval(interval);

        if (!ownsTimerRef.current) return;

        // Play finish sound (loops up to 3x, stops on user interaction)
        playTimerSoundLooped(settingsRef.current.timerSound);

        // Auto Save on Complete — save the full phase duration
        if (selectedTaskIdRef.current) {
          const phaseDuration = getPhaseDuration(phaseRef.current, settingsRef.current);
          if (phaseRef.current === 'focus') {
            saveProgress(selectedTaskIdRef.current, 1, phaseDuration);
          } else if (phaseRef.current === 'shortBreak') {
            saveProgress(selectedTaskIdRef.current, 0, 0, { shortBreaks: 1, shortBreakTime: phaseDuration });
          } else if (phaseRef.current === 'longBreak') {
            saveProgress(selectedTaskIdRef.current, 0, 0, { longBreaks: 1, longBreakTime: phaseDuration });
          }
        }

        // Push notification
        sendTimerNotification(
          phaseRef.current,
          phaseRef.current === 'focus' && settingsRef.current.autoStartBreaks,
        );

        completePhase(settingsRef.current.autoStartBreaks);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, endTime, completePhase, tickTimer]);

  // Reset tab title when timer stops
  useEffect(() => {
    if (!isRunning) {
      document.title = 'FrogTask';
    }
  }, [isRunning]);

  return null;
}
