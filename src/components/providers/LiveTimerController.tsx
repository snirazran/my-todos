'use client';

import { useEffect } from 'react';
import { useFrogodoroStore } from '@/lib/frogodoroStore';
import { reconcileLiveTimer } from '@/lib/liveTimer';

/**
 * Invisible component that mirrors the Frogodoro timer into a native Live
 * Activity (iOS) / ongoing notification (Android). Mounted globally so the
 * activity persists regardless of whether the timer sheet is open.
 */
export function LiveTimerController() {
  const phase = useFrogodoroStore((s) => s.phase);
  const isRunning = useFrogodoroStore((s) => s.isRunning);
  const timerActive = useFrogodoroStore((s) => s.timerActive);
  const endTime = useFrogodoroStore((s) => s.endTime);
  const timeLeft = useFrogodoroStore((s) => s.timeLeft);

  useEffect(() => {
    void reconcileLiveTimer({
      active: timerActive,
      isRunning,
      phase,
      endTime,
      timeLeft,
      taskName: '',
    });
  }, [phase, isRunning, timerActive, endTime, timeLeft]);

  return null;
}
