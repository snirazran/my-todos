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
  const startYRef = useRef(0);
  const scrollTopRef = useRef(0);
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

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const el = ref.current;
      if (!el) return;
      el.scrollTop = scrollTopRef.current - (e.clientY - startYRef.current);
    };
    const handleUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      const el = ref.current;
      if (!el) return;
      el.style.cursor = '';
      el.style.scrollSnapType = 'y mandatory';
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
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, []);

  const handleScroll = () => {
    const el = ref.current;
    if (!el || isDraggingRef.current || isUpdatingRef.current) return;
    const idx = Math.round(el.scrollTop / TIME_SLIDER_ITEM_H);
    const clamped = Math.max(0, Math.min(idx, items.length - 1));
    const next = items[clamped];
    const closeToSnap =
      Math.abs(el.scrollTop - clamped * TIME_SLIDER_ITEM_H) < 5;
    if (next !== value && closeToSnap) {
      lastValueRef.current = next;
      onChange(next);
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    isDraggingRef.current = true;
    startYRef.current = e.clientY;
    scrollTopRef.current = el.scrollTop;
    el.style.cursor = 'grabbing';
    el.style.scrollSnapType = 'none';
  };

  return (
    <div
      ref={ref}
      onScroll={handleScroll}
      onPointerDown={handlePointerDown}
      className="relative z-10 h-[176px] overflow-y-auto overscroll-contain no-scrollbar snap-y snap-mandatory select-none"
      style={{
        paddingTop: TIME_SLIDER_PAD,
        paddingBottom: TIME_SLIDER_PAD,
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
