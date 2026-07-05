'use client';

import { auth } from '@/lib/firebase';
import { useUIStore } from '@/lib/uiStore';

const PLUS_INTRO_SHOWN_KEY = 'frogress.plusIntroShown';

/**
 * Open the Plus intro pitch once per account. Triggered after the user's first
 * task completion — the core "frog fed" aha moment — with a delay so the catch
 * animation finishes first.
 */
export function queuePlusIntroOnce(delayMs = 2000) {
  const uid = auth?.currentUser?.uid;
  if (!uid) return;
  const key = `${PLUS_INTRO_SHOWN_KEY}:${uid}`;
  try {
    if (window.localStorage.getItem(key)) return;
    window.localStorage.setItem(key, '1');
  } catch {
    return;
  }
  window.setTimeout(() => {
    useUIStore.getState().setPremiumModalOpen(true);
  }, delayMs);
}
