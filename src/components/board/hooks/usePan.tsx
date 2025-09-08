'use client';

import { useEffect, useRef, useState } from 'react';

export function usePan(scrollerRef: React.RefObject<HTMLDivElement>) {
  const [panActive, setPanActive] = useState(false);
  const canPanRef = useRef(false);
  const panActiveRef = useRef(false);
  const panStartXRef = useRef(0);
  const panStartScrollLeftRef = useRef(0);

  const recomputeCanPan = () => {
    const s = scrollerRef.current;
    if (!s) return;
    canPanRef.current = s.scrollWidth - s.clientWidth > 2;
  };

  useEffect(() => {
    const s = scrollerRef.current;
    if (!s) return;
    const ro = new ResizeObserver(() => recomputeCanPan());
    ro.observe(s);
    window.addEventListener('resize', recomputeCanPan);
    requestAnimationFrame(recomputeCanPan);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recomputeCanPan);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startPanIfEligible = (e: React.PointerEvent<HTMLDivElement>) => {
    const dragIsActive = (e.currentTarget as HTMLElement).dataset.drag === '1';
    if (dragIsActive) return;
    if (e.pointerType !== 'mouse') return;
    if (!canPanRef.current) return;
    if (e.button !== 0) return;

    const target = e.target as HTMLElement;
    if (
      target.closest('[data-card-id]') ||
      target.closest('button, a, input, textarea, [role="button"]')
    )
      return;

    const s = scrollerRef.current;
    if (!s) return;
    e.preventDefault();

    panActiveRef.current = true;
    setPanActive(true);
    panStartXRef.current = e.clientX;
    panStartScrollLeftRef.current = s.scrollLeft;
    s.setPointerCapture?.(e.pointerId);
    document.body.style.userSelect = 'none';
    (s as any).style.scrollSnapType = 'none';
  };

  const onPanMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panActiveRef.current) return;
    const s = scrollerRef.current;
    if (!s) return;
    e.preventDefault();
    s.scrollLeft =
      panStartScrollLeftRef.current - (e.clientX - panStartXRef.current);
  };

  const endPan = (e?: React.PointerEvent<HTMLDivElement>) => {
    if (!panActiveRef.current) return;
    panActiveRef.current = false;
    setPanActive(false);
    const s = scrollerRef.current;
    if (s && e) s.releasePointerCapture?.(e.pointerId);
    (s as any).style.scrollSnapType = '';
    document.body.style.userSelect = '';
  };

  useEffect(() => {
    const up = () => endPan();
    window.addEventListener('pointerup', up, { passive: true });
    return () => window.removeEventListener('pointerup', up as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { panActive, startPanIfEligible, onPanMove, endPan, recomputeCanPan };
}
