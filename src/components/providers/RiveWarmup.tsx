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

    const idle =
      typeof window.requestIdleCallback === 'function'
        ? window.requestIdleCallback
        : (cb: () => void) => window.setTimeout(cb, 2000);
    const cancelIdle =
      typeof window.cancelIdleCallback === 'function'
        ? window.cancelIdleCallback
        : window.clearTimeout;

    let cancelled = false;
    let id: number | undefined;
    void preloadRiveAsset('/frog_idle.riv').then(() => {
      if (cancelled) return;
      id = idle(() => {
        preloadRiveAsset('/idle_gift.riv');
        preloadRiveAsset(FLY_RIVE_ASSET_URL);
      });
    });
    return () => {
      cancelled = true;
      if (id !== undefined) cancelIdle(id);
    };
  }, []);

  return null;
}
