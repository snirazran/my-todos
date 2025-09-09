'use client';

import React, { useRef, useCallback, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import type { Task } from './helpers';

type OnGrabParams = {
  clientX: number;
  clientY: number;
  pointerType: 'mouse' | 'touch';
};

export default function TaskCard({
  dragId,
  task,
  onDelete,
  onGrab,
  innerRef,
  hiddenWhileDragging,
}: {
  dragId: string;
  task: Task;
  onDelete: () => void;
  innerRef?: (el: HTMLDivElement | null) => void;
  onGrab: (params: OnGrabParams) => void;
  hiddenWhileDragging?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);

  const MOVE_TOLERANCE = 8;
  const LONG_PRESS_DURATION = 230;

  // This cleanup function will be stable thanks to useCallback
  const cleanup = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    window.removeEventListener('pointercancel', handlePointerUp);
  }, []);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!startPos.current) return;
      const dx = Math.abs(e.clientX - startPos.current.x);
      const dy = Math.abs(e.clientY - startPos.current.y);

      if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) {
        cleanup();
      }
    },
    [cleanup]
  );

  const handlePointerUp = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      if (e.button !== 0 || !e.isPrimary) return;

      const target = e.target as HTMLElement;
      if (target.closest('button, a, input, textarea, [role="button"]')) {
        return;
      }

      if (e.pointerType === 'mouse') {
        onGrab({
          clientX: e.clientX,
          clientY: e.clientY,
          pointerType: 'mouse',
        });
        return;
      }

      startPos.current = { x: e.clientX, y: e.clientY };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);

      longPressTimer.current = window.setTimeout(() => {
        onGrab({
          clientX: startPos.current!.x,
          clientY: startPos.current!.y,
          pointerType: 'touch',
        });
        cleanup();
      }, LONG_PRESS_DURATION);
    },
    [onGrab, handlePointerMove, handlePointerUp, cleanup]
  );

  // ✅ THIS IS THE KEY CHANGE: We use useEffect to add a PASSIVE event listener.
  useEffect(() => {
    const element = cardRef.current;
    if (!element) return;

    // A passive listener tells the browser it's safe to scroll immediately.
    element.addEventListener('pointerdown', handlePointerDown, {
      passive: true,
    });

    return () => {
      element.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [handlePointerDown]);

  // Combine internal and external refs
  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      cardRef.current = el;
      if (innerRef) {
        innerRef(el);
      }
    },
    [innerRef]
  );

  return (
    <div
      ref={setRefs}
      data-card-id={dragId}
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      style={{ touchAction: 'pan-y' }}
      className={[
        'flex items-center gap-3 p-3 select-none rounded-xl transition-colors',
        'bg-white dark:bg-slate-700',
        'border border-slate-200 dark:border-slate-600 shadow-sm',
        'cursor-grab',
        hiddenWhileDragging ? 'opacity-0' : '',
      ].join(' ')}
      // ⛔️ The onPointerDown prop is removed from here and handled by the useEffect.
      role="listitem"
      aria-grabbed={false}
    >
      <span className="flex-1 text-sm text-slate-800 dark:text-slate-200">
        {task.text}
      </span>

      <button onClick={onDelete} title="מחק" className="shrink-0" type="button">
        <Trash2 className="w-4 h-4 text-red-500 hover:text-red-600" />
      </button>
    </div>
  );
}
