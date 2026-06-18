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
  const awaitingDone = useFrogodoroStore((s) => s.awaitingDone);
  const lastCompletedPhase = useFrogodoroStore((s) => s.lastCompletedPhase);
  const settings = useFrogodoroStore((s) => s.settings);

  // While the alarm is ringing (awaitingDone) keep the activity alive in its
  // finished state — show the phase that just ended, not the queued next one.
  const displayPhase = awaitingDone ? lastCompletedPhase ?? phase : phase;
  const totalSeconds =
    displayPhase === 'focus'
      ? settings.focusDuration * 60
      : settings.breakDuration * 60;

  const active = timerActive && (isRunning || phaseStarted || awaitingDone);

  useEffect(() => {
    void reconcileLiveTimer({
      active,
      isRunning,
      phase: displayPhase,
      endTime,
      timeLeft: awaitingDone ? 0 : timeLeft,
      totalSeconds,
      taskName: '',
      finished: awaitingDone,
    });
  }, [displayPhase, isRunning, active, endTime, timeLeft, totalSeconds, awaitingDone]);

  return null;
}
