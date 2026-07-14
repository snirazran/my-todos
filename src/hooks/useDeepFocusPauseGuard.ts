'use client';

import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useFrogodoroStore } from '@/lib/frogodoroStore';
import { deepFocusPledgeLive } from '@/lib/focusFlies';

/**
 * Tap-again pause guard for the compact timer surfaces (pill, circular
 * timer): while the deep-focus pledge is live, the first Pause tap arms a
 * 3-second warning ("+1 fly lost") instead of pausing; tapping again within
 * the window pauses for real. The full sheet uses its own confirm dialog.
 */
export function useDeepFocusPauseGuard() {
  const { deepFocus, pausedThisPhase, phase, settings, timerActive } =
    useFrogodoroStore(
      useShallow((s) => ({
        deepFocus: s.deepFocus,
        pausedThisPhase: s.pausedThisPhase,
        phase: s.phase,
        settings: s.settings,
        timerActive: s.timerActive,
      })),
    );
  const [armed, setArmed] = useState(false);
  const disarmTimer = useRef(0);

  const pledgeLive =
    timerActive &&
    deepFocusPledgeLive({
      deepFocus,
      pausedThisPhase,
      phase,
      focusDurationMinutes: settings.focusDuration,
    });

  useEffect(() => {
    if (!pledgeLive) setArmed(false);
  }, [pledgeLive]);
  useEffect(() => () => window.clearTimeout(disarmTimer.current), []);

  const guardPause = (doPause: () => void) => {
    if (pledgeLive && !armed) {
      setArmed(true);
      window.clearTimeout(disarmTimer.current);
      disarmTimer.current = window.setTimeout(() => setArmed(false), 3000);
      return;
    }
    window.clearTimeout(disarmTimer.current);
    setArmed(false);
    doPause();
  };

  return { armed, guardPause };
}
