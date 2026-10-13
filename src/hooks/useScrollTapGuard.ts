'use client';

import React, { useCallback, useEffect, useRef } from 'react';

const MOVE_SLOP_PX = 10;
const SETTLE_MS = 220;

export function useScrollTapGuard<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const lastScrollAt = useRef(0);
  const press = useRef<{ x: number; y: number; at: number; scrolling: boolean } | null>(null);

  useEffect(() => {
    const onScroll = (event: Event) => {
      const root = ref.current;
      const target = event.target;
      if (!root) return;
      if (
        target === document ||
        (target instanceof Node && (target.contains(root) || root.contains(target)))
      ) {
        lastScrollAt.current = performance.now();
      }
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () =>
      document.removeEventListener('scroll', onScroll, { capture: true });
  }, []);

  const onPointerDownCapture = useCallback((event: React.PointerEvent) => {
    const now = performance.now();
    press.current = {
      x: event.clientX,
      y: event.clientY,
      at: now,
      scrolling: now - lastScrollAt.current < SETTLE_MS,
    };
  }, []);

  const onClickCapture = useCallback((event: React.MouseEvent) => {
    const now = performance.now();
    const down = press.current;
    press.current = null;
    const moved = down
      ? Math.hypot(event.clientX - down.x, event.clientY - down.y) > MOVE_SLOP_PX
      : false;
    const scrolled = down
      ? down.scrolling || lastScrollAt.current > down.at
      : now - lastScrollAt.current < SETTLE_MS;
    if (moved || scrolled) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, []);

  return { ref, onPointerDownCapture, onClickCapture };
}
