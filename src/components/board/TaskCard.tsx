'use client';

import React, { useRef, useCallback, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import type { Task } from './helpers';
import Fly from '@/components/ui/fly';

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

  const cleanupLP = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    const el = cardRef.current;
    if (el) {
      el.removeEventListener('pointermove', handlePointerMove as any);
      el.removeEventListener('pointerup', handlePointerUp as any);
      el.removeEventListener('pointercancel', handlePointerUp as any);
    }
  }, []);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!startPos.current) return;
      const dx = Math.abs(e.clientX - startPos.current.x);
      const dy = Math.abs(e.clientY - startPos.current.y);
      if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) cleanupLP();
    },
    [cleanupLP]
  );

  const handlePointerUp = useCallback(() => cleanupLP(), [cleanupLP]);

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      if (e.button !== 0 || !e.isPrimary) return;

      const target = e.target as HTMLElement;
      if (target.closest('button, a, input, textarea, [role="button"]')) return;

      if (e.pointerType === 'mouse') {
        onGrab({
          clientX: e.clientX,
          clientY: e.clientY,
          pointerType: 'mouse',
        });
        return;
      }

      startPos.current = { x: e.clientX, y: e.clientY };
      const el = cardRef.current;
      if (el) {
        el.addEventListener('pointermove', handlePointerMove as any, {
          passive: true,
        });
        el.addEventListener('pointerup', handlePointerUp as any, {
          passive: true,
        });
        el.addEventListener('pointercancel', handlePointerUp as any, {
          passive: true,
        });
      }

      longPressTimer.current = window.setTimeout(() => {
        onGrab({
          clientX: startPos.current!.x,
          clientY: startPos.current!.y,
          pointerType: 'touch',
        });
        cleanupLP();
      }, LONG_PRESS_DURATION);
    },
    [onGrab, handlePointerMove, handlePointerUp, cleanupLP]
  );

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    el.addEventListener('pointerdown', handlePointerDown as any, {
      passive: true,
    });
    return () => {
      el.removeEventListener('pointerdown', handlePointerDown as any);
      cleanupLP();
    };
  }, [handlePointerDown, cleanupLP]);

  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      cardRef.current = el;
      if (innerRef) innerRef(el);
    },
    [innerRef]
  );

  return (
    <div
      ref={setRefs}
      data-card-id={dragId}
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      style={{ touchAction: 'auto' }}
      className={[
        'group flex items-center gap-3 p-3 select-none rounded-2xl cursor-grab transition',
        'bg-white/85 dark:bg-emerald-900/40 backdrop-blur',
        'border border-emerald-700/20 dark:border-emerald-300/15 shadow',
        'mb-2',
        hiddenWhileDragging ? 'opacity-0' : 'hover:shadow-md',
      ].join(' ')}
      role="listitem"
      aria-grabbed={false}
    >
      {/* Animated fly (your component) */}
      <span className="relative grid w-5 h-5 shrink-0 place-items-center">
        <Fly size={25} x={-2} y={-6.5} />
      </span>

      <span className="flex-1 text-sm text-emerald-950 dark:text-emerald-50">
        {task.text}
      </span>

      <button
        onClick={onDelete}
        title="Delete"
        className="shrink-0 rounded-full p-1.5 hover:bg-emerald-100/60 dark:hover:bg-emerald-800/50 transition"
        type="button"
      >
        <Trash2 className="w-4 h-4 text-red-500 group-hover:text-red-600" />
      </button>
    </div>
  );
}
