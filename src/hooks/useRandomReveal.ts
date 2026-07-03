'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const DAY_MS = 24 * 60 * 60 * 1000;

function storageKey(key: string) {
  return `frogress_nudge_${key}_until`;
}

export function useRandomReveal(
  key: string,
  { probability = 0.3 }: { probability?: number } = {},
) {
  const [show, setShow] = useState(false);
  const decidedRef = useRef(false);

  useEffect(() => {
    if (decidedRef.current) return;
    decidedRef.current = true;

    let until = 0;
    try {
      until = Number(localStorage.getItem(storageKey(key))) || 0;
    } catch {
      /* ignore */
    }
    if (Date.now() < until) return;

    if (Math.random() < probability) setShow(true);
  }, [key, probability]);

  const dismiss = useCallback(() => {
    setShow(false);
    try {
      const until = Date.now() + DAY_MS + Math.random() * (DAY_MS / 2);
      localStorage.setItem(storageKey(key), String(Math.round(until)));
    } catch {
      /* ignore */
    }
  }, [key]);

  return { show, dismiss };
}
