'use client';

import React, { useEffect, useRef } from 'react';
import { TIME_SLIDER_ITEM_H, TIME_SLIDER_PAD } from './constants';

type Props<T extends string | number> = {
  items: readonly T[];
  value: T;
  onChange: (value: T) => void;
  formatLabel?: (value: T) => string;
};

export function TimeSliderColumn<T extends string | number>({
  items,
  value,
  onChange,
  formatLabel = String,
}: Props<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const isUpdatingRef = useRef(false);
  const isDraggingRef = useRef(false);
  const lastValueRef = useRef<T | null>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const scrollTopRef = useRef(0);
  const axisLockedRef = useRef<'y' | null>(null);
  const itemsRef = useRef(items);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  itemsRef.current = items;
  valueRef.current = value;
  onChangeRef.current = onChange;

  // Sync scroll position when value changes externally (not from our own scroll)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value === lastValueRef.current) return;

    const idx = items.indexOf(value);
    if (idx < 0) return;

    isUpdatingRef.current = true;
    el.scrollTo({ top: idx * TIME_SLIDER_ITEM_H, behavior: 'auto' });
    lastValueRef.current = value;

    const t = window.setTimeout(() => {
      isUpdatingRef.current = false;
    }, 50);
    return () => window.clearTimeout(t);
  }, [value, items]);

  // Mouse-only custom drag. On touch, we let native CSS scroll-snap handle
  // scrolling — that gives smooth momentum, reliable snapping, and live
  // color updates via the scroll handler (which doesn't bail out when no
  // custom drag is active).
  useEffect(() => {
    const releaseDrag = (snap: boolean) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      axisLockedRef.current = null;
      const el = ref.current;
      if (!el) return;
      el.style.cursor = '';
      el.style.scrollSnapType = 'y mandatory';
      if (!snap) return;
      const list = itemsRef.current;
      const idx = Math.round(el.scrollTop / TIME_SLIDER_ITEM_H);
      const clamped = Math.max(0, Math.min(idx, list.length - 1));
      const next = list[clamped];
      if (next !== valueRef.current) {
        lastValueRef.current = next;
        onChangeRef.current(next);
      }
      el.scrollTo({ top: clamped * TIME_SLIDER_ITEM_H, behavior: 'smooth' });
    };
    const handleMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const el = ref.current;
      if (!el) return;
      const dx = e.pageX - startXRef.current;
      const dy = e.pageY - startYRef.current;
      // Axis lock: the first ~6px of movement decides whether this is a
      // vertical scroll. If the user moves more horizontally than
      // vertically, release the drag entirely — no sideways sliding.
      if (!axisLockedRef.current) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          axisLockedRef.current = 'y';
        } else {
          releaseDrag(false);
          return;
        }
      }
      el.scrollTop = scrollTopRef.current - dy;
    };
    const handleUp = () => releaseDrag(true);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []);

  const handleScroll = () => {
    const el = ref.current;
    if (!el || isDraggingRef.current || isUpdatingRef.current) return;
    const idx = Math.round(el.scrollTop / TIME_SLIDER_ITEM_H);
    const clamped = Math.max(0, Math.min(idx, items.length - 1));
    const next = items[clamped];
    if (next !== valueRef.current) {
      lastValueRef.current = next;
      onChangeRef.current(next);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only respond to primary (left) button. Right/middle click should not
    // start a drag.
    if (e.button !== 0) return;
    const el = ref.current;
    if (!el) return;
    // Suppress native text selection / drag-image so horizontal mouse
    // movement during the drag can't slide anything sideways.
    e.preventDefault();
    isDraggingRef.current = true;
    axisLockedRef.current = null;
    startXRef.current = e.pageX;
    startYRef.current = e.pageY;
    scrollTopRef.current = el.scrollTop;
    el.style.cursor = 'grabbing';
    el.style.scrollSnapType = 'none';
  };

  return (
    <div
      ref={ref}
      onScroll={handleScroll}
      onMouseDown={handleMouseDown}
      className="relative z-10 h-[176px] overflow-y-auto overflow-x-hidden overscroll-contain no-scrollbar snap-y snap-mandatory select-none"
      style={{
        paddingTop: TIME_SLIDER_PAD,
        paddingBottom: TIME_SLIDER_PAD,
        touchAction: 'pan-y',
      }}
    >
      {items.map((item) => {
        const selected = item === value;
        return (
          <button
            key={String(item)}
            type="button"
            onClick={() => onChange(item)}
            className={`flex h-11 w-full snap-center items-center justify-center text-[24px] font-bold transition-all ${
              selected
                ? 'text-primary scale-110'
                : 'text-muted-foreground/45 scale-95'
            }`}
          >
            {formatLabel(item)}
          </button>
        );
      })}
    </div>
  );
}
