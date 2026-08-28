'use client';

import { useCallback, useEffect, useRef } from 'react';
import { BUILD_ID } from '@/lib/generated/buildId';

const CHECK_THROTTLE_MS = 60_000;
const RELOAD_GUARD_PREFIX = 'build-reload:';

export function VersionWatcher() {
  const lastCheckRef = useRef(0);
  const checkingRef = useRef(false);

  const check = useCallback(async () => {
    if (checkingRef.current) return;
    if (document.visibilityState !== 'visible') return;
    if (navigator.onLine === false) return;
    const now = Date.now();
    if (now - lastCheckRef.current < CHECK_THROTTLE_MS) return;
    lastCheckRef.current = now;
    checkingRef.current = true;
    try {
      const res = await fetch('/api/version', { cache: 'no-store' });
      if (!res.ok) return;
      const { buildId } = (await res.json()) as { buildId?: string };
      if (!buildId || buildId === BUILD_ID) return;

      const guard = `${RELOAD_GUARD_PREFIX}${buildId}`;
      try {
        if (sessionStorage.getItem(guard)) return;
        sessionStorage.setItem(guard, '1');
      } catch {
        return;
      }
      window.location.reload();
    } catch {
      /* offline or server hiccup */
    } finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void check();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [check]);

  return null;
}
