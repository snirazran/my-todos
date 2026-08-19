'use client';

import { useEffect } from 'react';
import { preload } from 'react-dom';

const warmed = new Map<string, HTMLImageElement>();

export function warmImage(src: string, fetchPriority: 'low' | 'high' = 'low') {
  if (typeof window === 'undefined' || warmed.has(src)) return;

  preload(src, { as: 'image', fetchPriority });

  const img = new Image();
  img.src = src;
  warmed.set(src, img);
  img.decode?.().catch(() => {});
}

export function useIdleImageWarmup(sources: readonly string[], enabled = true) {
  const key = sources.join('|');

  useEffect(() => {
    if (!enabled) return;

    const idle =
      typeof window.requestIdleCallback === 'function'
        ? window.requestIdleCallback
        : (cb: () => void) => window.setTimeout(cb, 2000);
    const cancelIdle =
      typeof window.cancelIdleCallback === 'function'
        ? window.cancelIdleCallback
        : window.clearTimeout;

    const id = idle(() => {
      for (const src of key.split('|')) warmImage(src);
    });
    return () => cancelIdle(id);
  }, [key, enabled]);
}
