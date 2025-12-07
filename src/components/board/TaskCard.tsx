'use client';

import React, { useRef, useCallback, useEffect } from 'react';
import { RotateCcw, EllipsisVertical, CheckCircle2 } from 'lucide-react';
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
  touchAction,
  requireLongPress = false,
}: {
  dragId: string;
  task: Task;
  menuOpen: boolean;
  onToggleMenu: (anchor: DOMRect) => void;
  innerRef?: (el: HTMLDivElement | null) => void;
  onGrab: (params: OnGrabParams) => void;
  hiddenWhileDragging?: boolean;
  isRepeating?: boolean;
  touchAction?: string;
  requireLongPress?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  // Keep latest callbacks in refs to avoid effect re-runs
  const onGrabRef = useRef(onGrab);
  onGrabRef.current = onGrab;
  const onToggleMenuRef = useRef(onToggleMenu);
  onToggleMenuRef.current = onToggleMenu;

  const MOVE_TOLERANCE = 8;
  const LONG_PRESS_DURATION = 230;
  const defaultTouchAction = touchAction || 'auto';

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

      // Restore: allow vertical scrolling again after interaction ends
      el.style.touchAction = defaultTouchAction;
    }
  }, [defaultTouchAction]);

  // Stable handlers using Refs
  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!startPos.current) return;
      const dx = Math.abs(e.clientX - startPos.current.x);
      const dy = Math.abs(e.clientY - startPos.current.y);
      if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) cleanupLP();
    },
    [cleanupLP] // cleanupLP depends on defaultTouchAction, but that is primitive string usually
  );

  const handlePointerUp = useCallback(() => cleanupLP(), [cleanupLP]);

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      if (task.completed) return;
      if (e.button !== 0 || !e.isPrimary) return;

      const target = e.target as HTMLElement;
      if (target.closest('button, a, input, textarea, [role="button"]')) return;

      pointerIdRef.current = e.pointerId;

      // If mouse and NOT requiring long press, grab immediately
      if (e.pointerType === 'mouse' && !requireLongPress) {
        onGrabRef.current({
          clientX: e.clientX,
          clientY: e.clientY,
          pointerType: 'mouse',
        });
        return;
      }

      // Otherwise start long press timer
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
            el.style.touchAction = 'none';
            el.removeEventListener('pointermove', handlePointerMove as any);
          } catch (err) {
            // ignore
          }
        }

        startPos.current = null;

        onGrabRef.current({
          clientX: e.clientX,
          clientY: e.clientY,
          pointerType: e.pointerType as 'mouse' | 'touch',
        });

        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
      }, LONG_PRESS_DURATION);
    },
    [handlePointerMove, handlePointerUp, requireLongPress, task.completed] // Removed onGrab, cleanupLP dependencies
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
  }, [handlePointerDown, cleanupLP]); // cleanupLP is stable if defaultTouchAction stable. handlePointerDown is stable now.

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
      style={{
        touchAction: defaultTouchAction,
        WebkitTapHighlightColor: 'transparent',
      }}
      className={[
        'group relative overflow-visible flex items-stretch gap-3 p-3.5 select-none rounded-xl transition-all duration-300',
        task.completed ? 'cursor-default' : 'cursor-grab',
        'bg-white dark:bg-slate-800/90 backdrop-blur-md',
        'hover:bg-slate-50 dark:hover:bg-slate-800', // Hover bg instead of border
        'shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:shadow-md',
        'mb-2', // reduced margin
        menuOpen ? 'z-50 shadow-xl ring-2 ring-purple-500/20' : '',
        hiddenWhileDragging ? 'opacity-0' : '',
      ].join(' ')}
      role="listitem"
      aria-grabbed={false}
    >
      <div className="grid self-center shrink-0 place-items-center text-slate-400 group-hover:text-purple-500 transition-colors">
        {task.completed ? (
          <CheckCircle2 className="w-6 h-6 text-green-500" />
        ) : (
          <Fly size={24} />
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-center">
        {isRepeating && (
          <div className="mb-1 flex items-center gap-1.5">
            <span
              title="Repeats weekly"
              className="inline-flex items-center gap-1 rounded-md bg-purple-50/80 px-1.5 py-0.5 text-[10px] font-bold text-purple-600 dark:bg-purple-900/40 dark:text-purple-200 transition-colors"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              <span className="tracking-wider uppercase">Weekly</span>
            </span>
          </div>
        )}
        <div
          className={`truncate text-[15px] font-medium leading-snug transition-colors ${
            task.completed
              ? 'text-slate-400 line-through dark:text-slate-500'
              : 'text-slate-700 dark:text-slate-100 group-hover:text-slate-900 dark:group-hover:text-white'
          }`}
        >
          {task.text}
        </div>
      </div>

      <div className="relative self-center shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity focus-within:opacity-100">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleMenuRef.current(e.currentTarget.getBoundingClientRect());
          }}
          title="Task actions"
          aria-label="Task actions"
          aria-expanded={menuOpen}
          className={[
            'rounded-full p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors',
            menuOpen ? 'bg-slate-200/80 dark:bg-slate-800/70 opacity-100' : '',
          ].join(' ')}
          type="button"
        >
          <EllipsisVertical className="w-4 h-4 text-slate-500 dark:text-slate-400" />
        </button>
      </div>
    </div>
  );
}








