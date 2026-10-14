'use client';

import type React from 'react';
import { useCallback, useRef } from 'react';

// Click-and-drag horizontal scrolling — mirrors the shop/wardrobe FilterBar.
// Touch scrolls natively via `touch-pan-x`; this adds desktop drag, and `guard`
// swallows the click that ends a drag so a chip doesn't toggle on release.
export function useDragScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const isDown = useRef(false);
  const startX = useRef(0);
  const startScroll = useRef(0);
  const dragging = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    isDown.current = true;
    dragging.current = false;
    startX.current = e.pageX - el.offsetLeft;
    startScroll.current = el.scrollLeft;
  }, []);
  const onMouseLeave = useCallback(() => {
    isDown.current = false;
  }, []);
  const onMouseUp = useCallback(() => {
    isDown.current = false;
    setTimeout(() => {
      dragging.current = false;
    }, 0);
  }, []);
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const el = ref.current;
    if (!isDown.current || !el) return;
    e.preventDefault();
    const walk = e.pageX - el.offsetLeft - startX.current;
    if (Math.abs(walk) > 5) {
      dragging.current = true;
      el.scrollLeft = startScroll.current - walk;
    }
  }, []);
  const onWheel = useCallback((e: React.WheelEvent) => {
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth + 1) return;
    if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
    el.scrollLeft += e.deltaY;
  }, []);
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    e.preventDefault();
    e.stopPropagation();
  }, []);
  const guard = useCallback(
    (fn: () => void) => () => {
      if (dragging.current) return;
      fn();
    },
    [],
  );

  return {
    ref,
    handlers: { onMouseDown, onMouseLeave, onMouseUp, onMouseMove, onWheel, onClickCapture },
    guard,
  };
}
