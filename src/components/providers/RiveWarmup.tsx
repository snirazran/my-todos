'use client';

import { useEffect } from 'react';
import {
  FLY_RIVE_ASSET_URL,
  preloadRiveAsset,
  warmRiveRuntime,
} from '@/lib/riveLoader';

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
      preloadRiveAsset(FLY_RIVE_ASSET_URL);
    });
    return () => cancelIdle(id);
  }, []);

  return null;
}
