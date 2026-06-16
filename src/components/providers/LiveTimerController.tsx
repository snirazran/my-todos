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
  // Total seconds for the current phase — anchors the animated progress ring so
  // it reflects whole-session progress, not just the remaining slice.
  const totalSeconds = useFrogodoroStore((s) =>
    s.phase === 'focus' ? s.settings.focusDuration * 60 : s.settings.breakDuration * 60,
  );

  useEffect(() => {
    void reconcileLiveTimer({
      active: timerActive,
      isRunning,
      phase,
      endTime,
      timeLeft,
      totalSeconds,
      taskName: '',
    });
  }, [phase, isRunning, timerActive, endTime, timeLeft, totalSeconds]);

  return null;
}
