'use client';

import { useEffect, useRef } from 'react';
import { useFrogodoroStore, PomodoroPhase, FrogodoroSettings } from '@/lib/frogodoroStore';
import { playTimerSound } from '@/lib/timerSounds';
import { format } from 'date-fns';

function getPhaseDuration(phase: PomodoroPhase, settings: FrogodoroSettings): number {
  if (phase === 'shortBreak') return settings.shortBreakDuration * 60;
  if (phase === 'longBreak') return settings.longBreakDuration * 60;
  return settings.cycleDuration * 60;
}

export function GlobalTimer() {
  const {
    isRunning,
    endTime,
    timeLeft,
    phase,
    selectedTaskId,
    settings,
    tickTimer,
    completePhase,
  } = useFrogodoroStore();

  const prevIsRunning = useRef(isRunning);

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
            timeSpent: spend,
          },
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

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { selectedTaskIdRef.current = selectedTaskId; }, [selectedTaskId]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  // Detect pause/stop to flush time
  useEffect(() => {
    if (prevIsRunning.current && !isRunning) {
      if (phase === 'focus' && selectedTaskId) {
        const phaseDuration = getPhaseDuration(phase, settings);
        const elapsed = phaseDuration - timeLeft;
        if (elapsed > 0) {
          saveProgress(selectedTaskId, 0, elapsed);
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

        // Play finish sound
        playTimerSound(settingsRef.current.timerSound);

        // Auto Save on Complete — save the full phase duration
        if (phaseRef.current === 'focus' && selectedTaskIdRef.current) {
          const phaseDuration = getPhaseDuration(phaseRef.current, settingsRef.current);
          saveProgress(selectedTaskIdRef.current, 1, phaseDuration);
        }

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
