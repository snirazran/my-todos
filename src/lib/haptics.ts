'use client';

import { create } from 'zustand';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/**
 * Central haptics engine. Every vibration in the app goes through here so it:
 *  - uses the real Taptic Engine on iOS and VibrationEffect on Android
 *    (via @capacitor/haptics) instead of `navigator.vibrate`, which iOS
 *    never implemented;
 *  - falls back to `navigator.vibrate` on the mobile web build;
 *  - respects the user's in-app Haptics preference;
 *  - is globally throttled so rapid-fire ticks (counters) feel like a
 *    texture, not a rattle.
 *
 * Semantic API — call by intent, not by milliseconds:
 *   hapticTick()      subtle selection tick — counter bumps, toggles, detents
 *   hapticImpact()    medium thump — drag pickup, equip, meaningful taps
 *   hapticHeavy()     strong thump — landing a big moment inside a sequence
 *   hapticSuccess()   completion — task done, purchase confirmed
 *   hapticWarning()   caution — destructive confirms, streak at risk
 *   hapticError()     rejection — failed purchase, not enough flies
 *   hapticCelebrate() layered reward crescendo — streaks, quest claims, gifts
 */

const STORAGE_KEY = 'frogress.haptics';

function readStoredEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

interface HapticsStore {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

export const useHapticsStore = create<HapticsStore>((set) => ({
  enabled: readStoredEnabled(),
  setEnabled: (enabled) => {
    set({ enabled });
    try {
      window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
    } catch {}
  },
}));

export function useHapticsEnabled() {
  return useHapticsStore((s) => s.enabled);
}

export function setHapticsEnabled(enabled: boolean) {
  useHapticsStore.getState().setEnabled(enabled);
}

const isNative = () =>
  typeof window !== 'undefined' && Capacitor.isNativePlatform();

const webVibrate = (pattern: number | number[]) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
};

// Ticks fired closer together than this are dropped so fast counters read as
// one continuous texture instead of a rattle. Stronger events always fire.
const TICK_MIN_GAP_MS = 60;
let lastTickAt = 0;

function canTick() {
  const now = Date.now();
  if (now - lastTickAt < TICK_MIN_GAP_MS) return false;
  lastTickAt = now;
  return true;
}

function fire(native: () => Promise<void>, webPattern: number | number[]) {
  if (!useHapticsStore.getState().enabled) return;
  if (isNative()) {
    native().catch(() => {});
  } else {
    webVibrate(webPattern);
  }
}

export function hapticTick() {
  if (!canTick()) return;
  fire(() => Haptics.impact({ style: ImpactStyle.Light }), 8);
}

export function hapticImpact() {
  lastTickAt = Date.now();
  fire(() => Haptics.impact({ style: ImpactStyle.Medium }), 15);
}

export function hapticHeavy() {
  lastTickAt = Date.now();
  fire(() => Haptics.impact({ style: ImpactStyle.Heavy }), 25);
}

export function hapticSuccess() {
  lastTickAt = Date.now();
  fire(
    () => Haptics.notification({ type: NotificationType.Success }),
    [12, 60, 22],
  );
}

export function hapticWarning() {
  lastTickAt = Date.now();
  fire(
    () => Haptics.notification({ type: NotificationType.Warning }),
    [22, 50, 22],
  );
}

export function hapticError() {
  lastTickAt = Date.now();
  fire(
    () => Haptics.notification({ type: NotificationType.Error }),
    [30, 50, 30],
  );
}

// A rising three-beat pattern (light → medium → success) so big rewards feel
// bigger than a single task tick — the Duolingo "lesson complete" moment.
export function hapticCelebrate() {
  if (!useHapticsStore.getState().enabled) return;
  lastTickAt = Date.now();
  if (isNative()) {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    window.setTimeout(() => {
      Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
    }, 100);
    window.setTimeout(() => {
      Haptics.notification({ type: NotificationType.Success }).catch(() => {});
    }, 220);
  } else {
    webVibrate([12, 70, 18, 70, 40]);
  }
}
