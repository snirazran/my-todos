'use client';

import React, { useRef, useCallback } from 'react';
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

  // A single cleanup function
  const cleanup = useCallback((pointerId?: number) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    // If we have a pointerId, release the capture
    if (pointerId && cardRef.current?.hasPointerCapture(pointerId)) {
      cardRef.current.releasePointerCapture(pointerId);
    }
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    window.removeEventListener('pointercancel', handlePointerUp);
  }, []);

  // We need to store the pointerId to release it later
  const pointerIdRef = useRef<number | null>(null);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      // Ensure we are only tracking the pointer that started the interaction
      if (e.pointerId !== pointerIdRef.current) return;

      if (!startPos.current) return;
      const dx = Math.abs(e.clientX - startPos.current.x);
      const dy = Math.abs(e.clientY - startPos.current.y);

      if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) {
        // This is a scroll gesture. Release control back to the browser.
        cleanup(e.pointerId);
      }
    },
    [cleanup]
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      if (e.pointerId !== pointerIdRef.current) return;
      cleanup(e.pointerId);
    },
    [cleanup]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !e.isPrimary) return;

    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, textarea, [role="button"]')) {
      return;
    }

    // Store the ref to the card element
    cardRef.current = e.currentTarget;

    if (e.pointerType === 'mouse') {
      onGrab({ clientX: e.clientX, clientY: e.clientY, pointerType: 'mouse' });
      return;
    }

    // --- Touch Interaction Logic ---
    pointerIdRef.current = e.pointerId;
    startPos.current = { x: e.clientX, y: e.clientY };

    // ✅ STEP 1: Take full control of this pointer event stream.
    // This prevents the browser from trying to scroll on its own.
    cardRef.current.setPointerCapture(e.pointerId);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    longPressTimer.current = window.setTimeout(() => {
      // Long press successful, initiate the drag.
      onGrab({
        clientX: startPos.current!.x,
        clientY: startPos.current!.y,
        pointerType: 'touch',
      });
      // Cleanup, but keep the pointer captured for the drag overlay
      cleanup();
    }, LONG_PRESS_DURATION);
  };

  // Combine refs
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
      // The `touch-action` style is a helpful hint but the JS capture is what enforces the behavior.
      style={{ touchAction: 'pan-y' }}
      className={[
        'flex items-center gap-3 p-3 select-none rounded-xl transition-colors',
        'bg-white dark:bg-slate-700', // Removed hover styles to prevent "sticky focus"
        'border border-slate-200 dark:border-slate-600 shadow-sm',
        'cursor-grab',
        hiddenWhileDragging ? 'opacity-0' : '',
      ].join(' ')}
      onPointerDown={handlePointerDown}
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
