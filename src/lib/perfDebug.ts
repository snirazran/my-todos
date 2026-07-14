import { useRiveInteractionPause } from './riveInteractionPause';
import { setRiveIdle } from './riveIdlePause';

let fliesHeld = false;

/**
 * Console bisect switches for energy hunting (Safari Web Inspector):
 *   frogressPerf.css(true)   — pause every decorative CSS loop (app-idle class only)
 *   frogressPerf.flies(true) — hold the Rive interaction pause (fly master, drift, companion)
 *   frogressPerf.idle(true)  — full idle state (everything the idle flag gates)
 * Flip one axis at a time while watching the Xcode energy gauge to attribute
 * the cost. Pass false to restore.
 */
export function installPerfDebug() {
  if (typeof window === 'undefined') return;
  (window as unknown as Record<string, unknown>).frogressPerf = {
    css(on: boolean) {
      document.documentElement.classList.toggle('app-idle', on);
      return `css loops ${on ? 'paused' : 'resumed'}`;
    },
    flies(on: boolean) {
      if (on === fliesHeld) return 'already set';
      fliesHeld = on;
      const { acquire, release } = useRiveInteractionPause.getState();
      if (on) acquire();
      else release();
      return `fly/rive interaction pause ${on ? 'held' : 'released'}`;
    },
    idle(on: boolean) {
      setRiveIdle(on);
      return `idle ${on}`;
    },
  };
}
