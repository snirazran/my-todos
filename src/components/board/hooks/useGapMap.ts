'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';

export type GapTarget = { index: number; top: number; bottom: number };

export function useGapMap(listEl: HTMLElement | null) {
  const mapRef = useRef<GapTarget[]>([]);
  const [tick, setTick] = useState(0); // if consumers need a state signal

  const compute = useCallback(() => {
    if (!listEl) return;

    // Look for any element that marks a "clickable gap"
    const rails = Array.from(
      listEl.querySelectorAll<HTMLElement>('[data-gap-index]')
    );

    const next: GapTarget[] = rails.map((el) => {
      const r = el.getBoundingClientRect();
      // store in PAGE coordinates so comparisons are scroll-agnostic
      return {
        index: Number(el.dataset.gapIndex!),
        top: r.top + window.scrollY,
        bottom: r.bottom + window.scrollY,
      };
    });

    next.sort((a, b) => a.top - b.top);
    mapRef.current = next;
    setTick((t) => t + 1);
  }, [listEl]);

  useLayoutEffect(() => {
    if (!listEl) return;
    compute();

    const onScroll = () => requestAnimationFrame(compute);
    const onResize = () => compute();

    listEl.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);

    const ro = new ResizeObserver(() => compute());
    ro.observe(listEl);

    const mo = new MutationObserver(() => compute());
    mo.observe(listEl, { childList: true, subtree: true });

    return () => {
      listEl.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      ro.disconnect();
      mo.disconnect();
    };
  }, [listEl, compute]);

  const hitTest = useCallback((clientY: number) => {
    const y = clientY + window.scrollY; // convert to page coords
    const map = mapRef.current;

    let best: GapTarget | null = null;
    let bestDist = Infinity;

    for (const g of map) {
      if (y >= g.top && y <= g.bottom) return g;
      const d = y < g.top ? g.top - y : y - g.bottom;
      if (d < bestDist) {
        bestDist = d;
        best = g;
      }
    }
    return best;
  }, []);

  // manual nudge after composer opens (layout settles next frame)
  const recomputeNow = useCallback(() => {
    requestAnimationFrame(() => requestAnimationFrame(compute));
  }, [compute]);

  return { hitTest, recomputeNow, tick };
}
