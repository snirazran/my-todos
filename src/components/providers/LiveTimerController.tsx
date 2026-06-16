'use client';

import { useEffect } from 'react';
import { useFrogodoroStore } from '@/lib/frogodoroStore';
import { reconcileLiveTimer } from '@/lib/liveTimer';

export function LiveTimerController() {
  const phase = useFrogodoroStore((s) => s.phase);
  const isRunning = useFrogodoroStore((s) => s.isRunning);
  const timerActive = useFrogodoroStore((s) => s.timerActive);
  const phaseStarted = useFrogodoroStore((s) => s.startedByPhase[s.phase]);
  const endTime = useFrogodoroStore((s) => s.endTime);
  const timeLeft = useFrogodoroStore((s) => s.timeLeft);
  const totalSeconds = useFrogodoroStore((s) =>
    s.phase === 'focus' ? s.settings.focusDuration * 60 : s.settings.breakDuration * 60,
  );

  const active = timerActive && (isRunning || phaseStarted);

  useEffect(() => {
    void reconcileLiveTimer({
      active,
      isRunning,
      phase,
      endTime,
      timeLeft,
      totalSeconds,
      taskName: '',
    });
  }, [phase, isRunning, active, endTime, timeLeft, totalSeconds]);

  return null;
}
