'use client';

import { useEffect } from 'react';
import { preloadRiveAsset, warmRiveRuntime } from '@/lib/riveLoader';

export function RiveWarmup() {
  useEffect(() => {
    warmRiveRuntime();
    preloadRiveAsset('/frog_idle.riv');

    const idle =
      typeof window.requestIdleCallback === 'function'
        ? window.requestIdleCallback
        : (cb: () => void) => window.setTimeout(cb, 2000);
    const cancelIdle =
      typeof window.cancelIdleCallback === 'function'
        ? window.cancelIdleCallback
        : window.clearTimeout;

    const id = idle(() => {
      preloadRiveAsset('/idle_gift.riv');
      preloadRiveAsset('/fly_idle.riv');
    });
    return () => cancelIdle(id);
  }, []);

  return null;
}
