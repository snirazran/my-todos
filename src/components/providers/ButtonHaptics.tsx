'use client';

import { useEffect } from 'react';
import { hapticTick } from '@/lib/haptics';

const BUTTON_SELECTOR =
  'button, input[type="button"], input[type="submit"], input[type="reset"], [role="button"]';

export function ButtonHaptics() {
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!event.isTrusted || !(event.target instanceof Element)) return;

      const button = event.target.closest(BUTTON_SELECTOR);
      if (!(button instanceof HTMLElement)) return;
      if (
        button.matches(':disabled') ||
        button.getAttribute('aria-disabled') === 'true' ||
        button.closest('[data-haptic="off"]')
      ) {
        return;
      }

      // Capture catches controls whose handlers stop propagation. Deferring the
      // soft tick lets an existing semantic haptic (success, warning, etc.) run
      // first; the central haptics throttle then prevents a duplicate tick.
      window.queueMicrotask(hapticTick);
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, []);

  return null;
}
