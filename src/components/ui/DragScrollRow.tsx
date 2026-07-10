'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export function DragScrollRow({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef({ active: false, moved: false, startX: 0, startScroll: 0 });

  const onMouseDown = React.useCallback((e: React.MouseEvent) => {
    const el = ref.current;
    if (!el || e.button !== 0) return;
    if (el.scrollWidth <= el.clientWidth) return;
    dragRef.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startScroll: el.scrollLeft,
    };
    const onMove = (ev: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag.active) return;
      const dx = ev.clientX - drag.startX;
      if (!drag.moved && Math.abs(dx) > 4) drag.moved = true;
      if (drag.moved) {
        el.scrollLeft = drag.startScroll - dx;
        ev.preventDefault();
      }
    };
    const onUp = () => {
      dragRef.current.active = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  const onClickCapture = React.useCallback((e: React.MouseEvent) => {
    if (dragRef.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current.moved = false;
    }
  }, []);

  const onDragStart = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div
      ref={ref}
      onMouseDown={onMouseDown}
      onClickCapture={onClickCapture}
      onDragStart={onDragStart}
      className={cn(
        'flex gap-2.5 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        'md:cursor-grab md:select-none md:active:cursor-grabbing',
        className,
      )}
    >
      {children}
    </div>
  );
}
