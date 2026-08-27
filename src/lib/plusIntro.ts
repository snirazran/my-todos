'use client';

import { auth } from '@/lib/firebase';
import { useUIStore } from '@/lib/uiStore';

const PLUS_INTRO_SHOWN_KEY = 'frogress.plusIntroShown';
const PLUS_INTRO_SERVER_SYNCED_KEY = 'frogress.plusIntroServerSynced';
const inFlight = new Set<string>();

function storageKey(prefix: string, uid: string | null | undefined) {
  return `${prefix}:${uid || 'current'}`;
}

/**
 * Open the Plus intro pitch once per account, after the user claims their first
 * gift box — with a delay so the reveal finishes first.
 *
 * It used to fire on the first task completion, which was too early to be
 * legible: every line of the pitch is about flies, gifts and outfits, and a
 * user who has only ever completed one task has not seen a gift box or the
 * wardrobe yet. The gift claim is the first moment the offer describes
 * something they have actually experienced.
 */
export function queuePlusIntroOnce(delayMs = 2000) {
  const uid = auth?.currentUser?.uid ?? null;
  const key = storageKey(PLUS_INTRO_SHOWN_KEY, uid);
  const syncedKey = storageKey(PLUS_INTRO_SERVER_SYNCED_KEY, uid);
  try {
    if (window.localStorage.getItem(key)) {
      // Backfill the account-level flag for users who saw this before the
      // server-side guard existed. Ignore the response; local state already
      // says not to show it again on this device.
      if (!window.localStorage.getItem(syncedKey)) {
        void fetch('/api/user/plus-intro', { method: 'POST' })
          .then((res) => {
            if (res.ok) window.localStorage.setItem(syncedKey, '1');
          })
          .catch(() => {});
      }
      return;
    }
  } catch {
    return;
  }
  if (inFlight.has(key)) return;
  inFlight.add(key);

  void fetch('/api/user/plus-intro', { method: 'POST' })
    .then((res) => (res.ok ? res.json() : null))
    .then((payload) => {
      const shouldShow = payload?.show === true;
      try {
        window.localStorage.setItem(key, '1');
        window.localStorage.setItem(syncedKey, '1');
      } catch {}
      if (!shouldShow) return;
      window.setTimeout(() => {
        useUIStore.getState().setPremiumModalOpen(true, 'first_gift_claim');
      }, delayMs);
    })
    .catch(() => {
      // Do not fall back to opening the modal. If the account-level check is
      // unavailable, retry on a later completion instead of risking repeats.
    })
    .finally(() => {
      inFlight.delete(key);
    });
}
