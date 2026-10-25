import { afterItemFlightsLand } from '@/lib/flyFlight';
import { holdAutoPopups, releaseAutoPopups, whenScreenIsFree } from '@/lib/popupGate';
import { useUIStore } from '@/lib/uiStore';

const AFTER_SCREEN_FREE_MS = 600;
const WAIT_LIMIT_MS = 10 * 60 * 1000;
const REPEAT_GAP_MS = 2 * 60 * 1000;
const PAYWALL_HOLD = 'plus-paywall';

let cancelPending: (() => void) | null = null;
let lastShownAt = 0;

export function queuePlusPaywall(placement: string) {
  cancelPending?.();
  let cancelled = false;
  const cancelWait = whenScreenIsFree(
    () => {
      holdAutoPopups(PAYWALL_HOLD);
      afterItemFlightsLand(() => {
        window.setTimeout(() => {
          if (cancelled) return;
          cancelPending = null;
          const ui = useUIStore.getState();
          if (!ui.isPremiumModalOpen && Date.now() - lastShownAt >= REPEAT_GAP_MS) {
            lastShownAt = Date.now();
            ui.setPremiumModalOpen(true, placement);
          }
          releaseAutoPopups(PAYWALL_HOLD);
        }, AFTER_SCREEN_FREE_MS);
      });
    },
    { dropAfterMs: WAIT_LIMIT_MS, ownHold: PAYWALL_HOLD },
  );
  cancelPending = () => {
    cancelled = true;
    cancelWait();
    releaseAutoPopups(PAYWALL_HOLD, 0);
  };
}
