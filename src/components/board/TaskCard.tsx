'use client';

import React, { useRef, useCallback, useEffect } from 'react';
import { RotateCcw, EllipsisVertical, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
  userTags,
  isAnyDragging,
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
  userTags?: { id: string; name: string; color: string }[];
  isAnyDragging?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  const getTagDetails = (tagIdentifier: string) => {
    // Try to find by ID first
    const byId = userTags?.find((t) => t.id === tagIdentifier);
    if (byId) return byId;
    // Fallback: try to find by Name
    return userTags?.find((t) => t.name === tagIdentifier);
  };

  // Keep latest callbacks in refs to avoid effect re-runs
  const onGrabRef = useRef(onGrab);
  onGrabRef.current = onGrab;
  const onToggleMenuRef = useRef(onToggleMenu);
  onToggleMenuRef.current = onToggleMenu;

  const MOVE_TOLERANCE = 8;
  const LONG_PRESS_DURATION = 300;
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
        'group relative overflow-visible flex items-stretch gap-3 p-3.5 select-none rounded-xl transition-all duration-200',
        task.completed ? 'cursor-default opacity-60' : 'cursor-grab',
        // Increased presence: Solid background, stronger border, more defined shadow
        'bg-card border border-border/80', 
        task.completed ? 'shadow-sm' : 'shadow-sm hover:shadow-md hover:border-primary/40',
        'mb-2.5', // slightly more breathing room
        menuOpen ? 'z-50 shadow-xl ring-2 ring-primary/20' : '',
        hiddenWhileDragging ? 'opacity-0' : '',
      ].join(' ')}
      role="listitem"
      aria-grabbed={false}
    >
      <motion.div 
        className="flex items-stretch gap-3 w-full"
      >
        <div className="grid self-center shrink-0 place-items-center text-muted-foreground group-hover:text-primary transition-colors relative h-6 w-6">
        <div
          className={`absolute inset-0 transition-opacity duration-200 ${
            task.completed ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          <Fly size={24} paused={task.completed} />
        </div>

        <div
          className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${
            task.completed ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <CheckCircle2 className="w-6 h-6 text-green-500" />
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-center">
        {(isRepeating || (task.tags && task.tags.length > 0)) && (
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            {isRepeating && (
              <span
                title="Repeats weekly"
                className="inline-flex items-center gap-1 rounded-md bg-purple-50/80 px-2 py-0.5 text-[11px] font-bold text-purple-600 dark:bg-purple-900/40 dark:text-purple-200 transition-colors"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                <span className="tracking-wider uppercase">Weekly</span>
              </span>
            )}
            <AnimatePresence mode="popLayout">
            {task.tags?.map((tagId) => {
              const tagDetails = getTagDetails(tagId);
              if (!tagDetails) return null;

              const color = tagDetails.color;
              const name = tagDetails.name;

              return (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0 }}
                  transition={{ duration: 0.2 }}
                  key={tagId}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wider uppercase transition-colors border shadow-sm"
                  style={
                    color
                      ? {
                          backgroundColor: `${color}20`,
                          color: color,
                          borderColor: `${color}40`,
                        }
                      : undefined
                  }
                >
                  {/* Fallback styling if no color found */}
                  {!color && (
                    <span className="absolute inset-0 w-full h-full border rounded-md opacity-10 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200 border-indigo-100 dark:border-indigo-800/50 pointer-events-none" />
                  )}
                  <span className={!color ? "text-indigo-600 dark:text-indigo-200 z-10 relative" : ""}>{name}</span>
                </motion.span>
              );
            })}
            </AnimatePresence>
          </div>
        )}
        <div
          className={`whitespace-pre-wrap break-words text-[15px] font-medium leading-snug transition-colors ${
            task.completed
              ? 'text-muted-foreground line-through'
              : 'text-foreground'
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
            'rounded-full p-1.5 hover:bg-accent transition-colors',
            menuOpen ? 'bg-accent opacity-100' : '',
          ].join(' ')}
          type="button"
        >
          <EllipsisVertical className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
      </motion.div>
    </div>
  );
}








