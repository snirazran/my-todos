'use client';

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { setRiveIdle } from '@/lib/riveIdlePause';
import { installPerfDebug } from '@/lib/perfDebug';

const IDLE_MS = 20_000;
// Input events (pointermove especially) fire in bursts; restarting the timer
// at most once a second keeps the handler nearly free.
const RESET_THROTTLE_MS = 1_000;

const EVENTS: (keyof WindowEventMap)[] = [
  'pointerdown',
  'pointermove',
  'touchstart',
  'touchmove',
  'wheel',
  'keydown',
  'scroll',
];

/**
 * Flips the global Rive idle flag after IDLE_MS without user input, and
 * clears it on the first touch. Mounted once in the root layout, next to
 * SheetRivePause. Native-only: battery/thermals are a phone problem, and the
 * desktop web build shouldn't drop its ambient motion.
 */
export function RiveIdlePause() {
  useEffect(() => {
    installPerfDebug();
    if (!Capacitor.isNativePlatform()) return;
    let timer = 0;
    let lastArm = 0;

    const arm = () => {
      lastArm = Date.now();
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setRiveIdle(true), IDLE_MS);
    };

    const onActivity = () => {
      setRiveIdle(false);
      if (Date.now() - lastArm < RESET_THROTTLE_MS) return;
      arm();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') onActivity();
    };

    EVENTS.forEach((ev) =>
      window.addEventListener(ev, onActivity, { passive: true, capture: true }),
    );
    document.addEventListener('visibilitychange', onVisibility);
    arm();

    return () => {
      window.clearTimeout(timer);
      EVENTS.forEach((ev) =>
        window.removeEventListener(ev, onActivity, { capture: true }),
      );
      document.removeEventListener('visibilitychange', onVisibility);
      setRiveIdle(false);
    };
  }, []);
  return null;
}
