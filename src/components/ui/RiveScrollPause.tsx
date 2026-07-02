'use client';

import { useEffect } from 'react';
import { useRiveInteractionPause } from '@/lib/riveInteractionPause';

/**
 * Freezes ambient Rive playback while anything on the page is scrolling
 * (capture listener on window catches every scroll container), resuming
 * 200ms after the last scroll event. Mounted once in the root layout.
 */
export function RiveScrollPause() {
  useEffect(() => {
    const { acquire, release } = useRiveInteractionPause.getState();
    let held = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      if (!held) {
        held = true;
        acquire();
      }
      clearTimeout(timer);
      timer = setTimeout(() => {
        held = false;
        release();
      }, 200);
    };
    window.addEventListener('scroll', onScroll, {
      passive: true,
      capture: true,
    });
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true });
      clearTimeout(timer);
      if (held) release();
    };
  }, []);
  return null;
}
