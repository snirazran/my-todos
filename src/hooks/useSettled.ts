import { useEffect, useState } from 'react';

/**
 * True once a sheet's entrance is over. Rive-backed children each cost a
 * short-lived instance to spin up, and a handful of them queued against a
 * running transition is what drops the frame rate — so gate them on this and
 * let them mount into a still screen.
 */
export function useSettled(delayMs = 220) {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);
  return settled;
}
