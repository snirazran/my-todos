'use client';

import { useEffect, useRef } from 'react';
import { useFrogodoroStore } from '@/lib/frogodoroStore';
import { format } from 'date-fns';

export function GlobalTimer() {
  const {
    isRunning,
    endTime,
    timeLeft,
    phase,
    selectedTaskId,
    settings,
    completedCycles,
    currentSessionSpend,
    tickTimer,
    completePhase,
    addSessionSpend,
    clearSessionSpend,
  } = useFrogodoroStore();

  const prevIsRunning = useRef(isRunning);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize audio
  useEffect(() => {
    audioRef.current = new Audio('/notification.mp3');
  }, []);

  // Save Progress API Caller
  const saveProgress = async (
    taskId: string,
    cycles: number,
    spend: number,
  ) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    try {
      await fetch(`/api/tasks/${taskId}/frogodoro`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: {
            date: today,
            completedCycles: cycles,
            targetCycles: settings.expectedCycles,
            timeSpent: spend,
          },
        }),
      });
    } catch (e) {
      console.error('Failed saving Frogodoro progress (Background)', e);
    }
  };

  // Detect pause/stop to flush time
  useEffect(() => {
    if (prevIsRunning.current && !isRunning) {
      // Paused! If we have spend, send it out.
      if (phase === 'focus' && currentSessionSpend > 0 && selectedTaskId) {
        saveProgress(selectedTaskId, 0, currentSessionSpend);
        clearSessionSpend();
      }
    }
    prevIsRunning.current = isRunning;
  }, [isRunning, phase, currentSessionSpend, selectedTaskId]); // SWR/Hooks sync

  // The Main Loop
  useEffect(() => {
    if (!isRunning || !endTime) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.round((endTime - now) / 1000));

      tickTimer(remaining);

      // Track focus spend
      if (phase === 'focus' && remaining > 0) {
        addSessionSpend(1);
      }

      if (remaining === 0) {
        clearInterval(interval);

        // Play Sound
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => {});
        }

        // Auto Save on Complete
        if (phase === 'focus' && selectedTaskId) {
          // Need +1 cycle, and flush pending spend (including the last second)
          saveProgress(selectedTaskId, 1, currentSessionSpend + 1);
          clearSessionSpend();
        }

        completePhase();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [
    isRunning,
    endTime,
    phase,
    selectedTaskId,
    currentSessionSpend,
    completePhase,
    tickTimer,
    addSessionSpend,
  ]);

  // Tab Title Update
  useEffect(() => {
    if (isRunning) {
      const m = Math.floor(timeLeft / 60)
        .toString()
        .padStart(2, '0');
      const s = (timeLeft % 60).toString().padStart(2, '0');
      const icon =
        phase === 'focus' ? '🐸' : phase === 'shortBreak' ? '☕' : '💤';
      document.title = `${icon} ${m}:${s} - FrogTask`;
    } else {
      document.title = 'FrogTask';
    }
  }, [timeLeft, isRunning, phase]);

  return null; // Headless component
}
