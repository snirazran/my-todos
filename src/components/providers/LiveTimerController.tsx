'use client';

import { useEffect, useState } from 'react';
import { useFrogodoroStore } from '@/lib/frogodoroStore';
import { reconcileLiveTimer } from '@/lib/liveTimer';
import { fliesCaughtFor, deepFocusPledgeLive } from '@/lib/focusFlies';

export function LiveTimerController() {
  const [foregroundTick, setForegroundTick] = useState(0);
  const phase = useFrogodoroStore((s) => s.phase);
  const isRunning = useFrogodoroStore((s) => s.isRunning);
  const timerActive = useFrogodoroStore((s) => s.timerActive);
  const phaseStarted = useFrogodoroStore((s) => s.startedByPhase[s.phase]);
  const endTime = useFrogodoroStore((s) => s.endTime);
  const timeLeft = useFrogodoroStore((s) => s.timeLeft);
  const awaitingDone = useFrogodoroStore((s) => s.awaitingDone);
  const lastCompletedPhase = useFrogodoroStore((s) => s.lastCompletedPhase);
  const settings = useFrogodoroStore((s) => s.settings);
  const sessionFocusTime = useFrogodoroStore((s) => s.sessionStats.focusTime);
  const phaseElapsed = useFrogodoroStore((s) => s.phaseElapsed);
  const deepFocus = useFrogodoroStore((s) => s.deepFocus);
  const pausedThisPhase = useFrogodoroStore((s) => s.pausedThisPhase);

  // While the alarm is ringing (awaitingDone) keep the activity alive in its
  // finished state — show the phase that just ended, not the queued next one.
  const displayPhase = awaitingDone ? lastCompletedPhase ?? phase : phase;
  const totalSeconds =
    displayPhase === 'focus'
      ? settings.focusDuration * 60
      : settings.breakDuration * 60;

  const active = timerActive && (isRunning || phaseStarted || awaitingDone);

  useEffect(() => {
    const timeouts: number[] = [];
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setForegroundTick((value) => value + 1);
        const timeout = window.setTimeout(() => {
          setForegroundTick((value) => value + 1);
        }, 500);
        timeouts.push(timeout);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      timeouts.forEach((timeout) => window.clearTimeout(timeout));
    };
  }, []);

  // Hunt state for the native surfaces — same math as the timer sheet's chip.
  const liveElapsed =
    displayPhase === 'focus' ? Math.max(0, totalSeconds - timeLeft) : 0;
  const sessionFocusLive =
    sessionFocusTime +
    (phase === 'focus' && !awaitingDone
      ? Math.max(0, liveElapsed - phaseElapsed)
      : 0);
  const fliesCaught = fliesCaughtFor(sessionFocusLive);
  const fliesPotential =
    displayPhase === 'focus'
      ? fliesCaughtFor(sessionFocusLive + (awaitingDone ? 0 : Math.max(0, timeLeft)))
      : fliesCaught;
  const pledgeLive = deepFocusPledgeLive({
    deepFocus,
    pausedThisPhase,
    phase: displayPhase,
    focusDurationMinutes: settings.focusDuration,
  });

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
      fliesCaught,
      fliesPotential,
      deepFocus: pledgeLive,
      sound: settings.timerSound,
    });
  }, [
    displayPhase,
    isRunning,
    active,
    endTime,
    timeLeft,
    totalSeconds,
    awaitingDone,
    foregroundTick,
    fliesCaught,
    fliesPotential,
    pledgeLive,
    settings.timerSound,
  ]);

  return null;
}
