'use client';

import React, { useRef, useCallback, useEffect } from 'react';
import { RotateCcw, EllipsisVertical } from 'lucide-react';
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
  menuOpen,
  onToggleMenu,
  onGrab,
  innerRef,
  hiddenWhileDragging,
  isRepeating = false,
}: {
  dragId: string;
  task: Task;
  menuOpen: boolean;
  onToggleMenu: (anchor: DOMRect) => void;
  innerRef?: (el: HTMLDivElement | null) => void;
  onGrab: (params: OnGrabParams) => void;
  hiddenWhileDragging?: boolean;
  isRepeating?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const pointerIdRef = useRef<number | null>(null);

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

      // 🟢 RESTORE: Allow vertical scrolling again after interaction ends
      el.style.touchAction = 'pan-y';
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

      pointerIdRef.current = e.pointerId;

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
        if (el && pointerIdRef.current !== null) {
          try {
            el.setPointerCapture(pointerIdRef.current);
            // 🟢 FIX: Manually force 'none' INSTANTLY.
            // Do not wait for React to update classes.
            // This stops the horizontal scroll on the parent from stealing the event.
            el.style.touchAction = 'none';
          } catch (err) {
            // ignore
          }
        }

        onGrab({
          clientX: startPos.current!.x,
          clientY: startPos.current!.y,
          pointerType: 'touch',
        });

        // We don't fully cleanup here because we want to keep the drag going,
        // but we clear the timer reference.
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
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
      // Initial state: 'pan-y' allows you to scroll the list up/down.
      // The timer above swaps this to 'none' when dragging starts.
      style={{ touchAction: 'pan-y' }}
      className={[
        'group relative overflow-visible flex items-stretch gap-2 p-3 select-none rounded-2xl cursor-grab transition',
        'bg-white/85 dark:bg-emerald-900/40 backdrop-blur',
        'border border-emerald-700/20 dark:border-emerald-300/15 shadow',
        'mb-2',
        menuOpen ? 'z-50 shadow-2xl' : '',
        hiddenWhileDragging ? 'opacity-0' : 'hover:shadow-md',
      ].join(' ')}
      role="listitem"
      aria-grabbed={false}
    >
      <span className="grid self-center mt-0 h-7 w-7 shrink-0 place-items-center">
        <Fly size={26} x={-1} y={-4} />
      </span>

      <div className="flex-1 min-w-0">
        {isRepeating && (
          <div className="mt-1 flex items-center gap-1.5">
            <span
              title="Repeats weekly"
              className="inline-flex items-center gap-1 rounded-md border border-emerald-300/50 bg-emerald-50/80 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 shadow-sm dark:border-emerald-400/30 dark:bg-emerald-900/40 dark:text-emerald-100 transition-colors group-hover:bg-emerald-50"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="tracking-wide uppercase">Repeats</span>
            </span>
          </div>
        )}
        <div className="truncate text-[15px] leading-6 text-emerald-950 dark:text-emerald-50">
          {task.text}
        </div>
      </div>

      <div className="relative self-center ml-1 shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleMenu(e.currentTarget.getBoundingClientRect());
          }}
          title="Task actions"
          aria-label="Task actions"
          aria-expanded={menuOpen}
          className={[
            'rounded-full p-1.5 hover:bg-emerald-100/60 dark:hover:bg-emerald-800/50 transition',
            menuOpen ? 'bg-emerald-100/80 dark:bg-emerald-800/70' : '',
          ].join(' ')}
          type="button"
        >
          <EllipsisVertical className="w-4 h-4 text-emerald-700 dark:text-emerald-100" />
        </button>
      </div>
    </div>
  );
}
