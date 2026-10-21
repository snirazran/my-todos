import { auth } from '@/lib/firebase';
import { afterItemFlightsLand } from '@/lib/flyFlight';
import { whenScreenIsFree } from '@/lib/popupGate';
import { useUIStore } from '@/lib/uiStore';

const DONE_KEY = 'plus.firstGiftPaywall.done';
const AFTER_LANDING_MS = 600;
let checking = false;

function doneKey(uid: string) {
  return `${DONE_KEY}:${uid}`;
}

function isDone(uid: string) {
  try {
    return window.localStorage.getItem(doneKey(uid)) === '1';
  } catch {
    return false;
  }
}

function markDone(uid: string) {
  try {
    window.localStorage.setItem(doneKey(uid), '1');
  } catch {
    /* storage is best-effort */
  }
}

export function queueFirstGiftPaywall() {
  const uid = auth?.currentUser?.uid;
  if (!uid || checking || isDone(uid)) return;
  checking = true;
  void fetch('/api/plus/first-gift', { method: 'POST' })
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { show?: boolean } | null) => {
      if (!data) return;
      markDone(uid);
      if (!data.show) return;
      afterItemFlightsLand(() => {
        whenScreenIsFree(
          () => useUIStore.getState().setPremiumModalOpen(true, 'first_gift'),
          { initialDelayMs: AFTER_LANDING_MS },
        );
      });
    })
    .catch(() => {})
    .finally(() => {
      checking = false;
    });
}
