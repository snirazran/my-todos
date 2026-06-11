'use client';

import React, { useRef, useCallback, useEffect } from 'react';
import {
  CheckCircle2,
  Plus,
  CalendarDays,
  Clock,
  Bell,
  EllipsisVertical,
  Pen,
  ListChecks,
} from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { motion, AnimatePresence } from 'framer-motion';
import type { Task } from './helpers';
import Fly from '@/components/ui/fly';
import { useLeftTongue } from './LeftTongue';

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
  onDoToday,
  hideDoTodayButton,
  compact = false,
  onTap,
  onToggleComplete,
  disableDrag = false,
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
  onDoToday?: () => void;
  hideDoTodayButton?: boolean;
  compact?: boolean;
  /** Fired when user releases the press before the long-press timer fires (and didn't drag). */
  onTap?: () => void;
  /** Toggle completion — fired by tapping the fly/check on the right. */
  onToggleComplete?: () => void;
  /** Disable initiating drag (e.g., past-date columns). Tap still works. */
  disableDrag?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);
  const movedOutRef = useRef(false);

  const getTagDetails = (tagIdentifier: string) => {
    // Try to find by ID first
    const byId = userTags?.find((t) => t.id === tagIdentifier);
    if (byId) return byId;
    // Fallback: try to find by Name
    return userTags?.find((t) => t.name === tagIdentifier);
  };

  const { registerFly, isHidden } = useLeftTongue();
  const grabbing = isHidden(task.id);

  // Keep latest callbacks in refs to avoid effect re-runs
  const onGrabRef = useRef(onGrab);
  onGrabRef.current = onGrab;
  const onToggleMenuRef = useRef(onToggleMenu);
  onToggleMenuRef.current = onToggleMenu;
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  const MOVE_TOLERANCE = 8;
  const LONG_PRESS_DURATION = 300;
  const MOUSE_HOLD_DURATION = 150;
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
      el.removeEventListener('pointercancel', handlePointerCancel as any);

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
      if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) {
        movedOutRef.current = true;
        // Cancel pending long-press; without drag, this becomes a no-op tap-cancel.
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
      }
    },
    [],
  );

  const handlePointerUp = useCallback(() => {
    // If LP never fired and pointer didn't move enough, treat as tap.
    const wasTap = !longPressFiredRef.current && !movedOutRef.current;
    cleanupLP();
    if (wasTap) onTapRef.current?.();
  }, [cleanupLP]);

  const handlePointerCancel = useCallback(() => cleanupLP(), [cleanupLP]);

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      if (e.button !== 0 || !e.isPrimary) return;

      const target = e.target as HTMLElement;
      if (target.closest('button, a, input, textarea, [role="button"]')) return;

      // Completed cards can still be tapped (to open the detail card) but
      // never dragged.
      const canDrag = !task.completed && !disableDrag;

      pointerIdRef.current = e.pointerId;
      longPressFiredRef.current = false;
      movedOutRef.current = false;
      startPos.current = { x: e.clientX, y: e.clientY };

      const el = cardRef.current;
      if (el) {
        el.addEventListener('pointermove', handlePointerMove as any, {
          passive: true,
        });
        el.addEventListener('pointerup', handlePointerUp as any, {
          passive: true,
        });
        el.addEventListener('pointercancel', handlePointerCancel as any, {
          passive: true,
        });
      }

      // If drag is disabled (past dates) or the task is completed, skip the
      // grab timer. We still listen for pointermove/pointerup so onTap fires.
      if (!canDrag) return;

      const delay =
        e.pointerType === 'mouse' ? MOUSE_HOLD_DURATION : LONG_PRESS_DURATION;

      longPressTimer.current = window.setTimeout(() => {
        longPressFiredRef.current = true;
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
      }, delay);
    },
    [handlePointerMove, handlePointerUp, handlePointerCancel, task.completed, disableDrag],
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
    [innerRef],
  );

  const hasMeta =
    (task.tags && task.tags.length > 0) || task.startTime || task.reminder;
  const chipClass = compact
    ? 'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-bold tracking-normal uppercase transition-colors border shadow-sm'
    : 'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase transition-colors border shadow-sm';

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
        compact
          ? 'group relative overflow-visible flex items-center gap-2 px-2 py-2 select-none rounded-[14px] transition-all duration-200'
          : 'group relative overflow-visible flex items-start gap-3 p-3.5 select-none rounded-xl transition-all duration-200',
        task.completed
          ? 'cursor-default'
          : disableDrag
            ? 'cursor-pointer'
            : 'cursor-grab',
        'bg-card border border-border/80',
        task.completed
          ? 'shadow-sm'
          : 'shadow-sm md:hover:border-primary/40 active:border-primary/40',
        compact ? 'mb-1.5' : 'mb-2.5',
        menuOpen ? 'z-50 shadow-sm border-primary/30' : '',
        hiddenWhileDragging ? 'opacity-0' : '',
      ].join(' ')}
      role="listitem"
      aria-grabbed={false}
    >
      <motion.div className="flex w-full items-center gap-1.5">
        {/* Grab handle (left) — 3-dot drag hint */}
        <div
          aria-hidden
          className="-ml-0.5 flex shrink-0 items-center justify-center self-stretch text-muted-foreground/30"
        >
          <EllipsisVertical className="h-4 w-4" />
        </div>

        <div
          className={`flex-1 min-w-0 flex flex-col ${task.completed ? 'opacity-60' : ''}`}
        >
          {hasMeta && (
            <div
              className={
                compact
                  ? 'mb-1 flex flex-wrap items-center gap-1'
                  : 'mb-2 flex flex-wrap items-center gap-1.5'
              }
            >
              <>
                {task.startTime && (
                  <span
                    className="isolate inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-1.5 py-[4px] text-[10px] leading-[1] font-bold uppercase tracking-normal text-primary shadow-sm"
                  >
                    <Clock className="w-2.5 h-2.5 shrink-0" />
                    <span className="leading-[1]">
                      {task.startTime}
                      {task.endTime && task.endTime !== task.startTime ? ` - ${task.endTime}` : ''}
                    </span>
                    {task.reminder && <Bell className="w-2.5 h-2.5 shrink-0 text-amber-500" />}
                  </span>
                )}
                {task.tags?.map((tagId) => {
                  const tagDetails = getTagDetails(tagId);
                  if (!tagDetails) return null;

                  const color = tagDetails.color;
                  const name = tagDetails.name;

                  return (
                    <span
                      key={tagId}
                      className="isolate inline-flex items-center gap-1 rounded-md border px-1.5 py-[4px] text-[10px] leading-[1] font-bold uppercase tracking-normal shadow-sm"
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
                      {!color && (
                        <span className="absolute inset-0 w-full h-full border rounded-md opacity-10 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200 border-indigo-100 dark:border-indigo-800/50 pointer-events-none" />
                      )}
                      <span
                        className={
                          !color
                            ? 'text-indigo-600 dark:text-indigo-200 z-10 relative'
                            : ''
                        }
                      >
                        {name}
                      </span>
                    </span>
                  );
                })}
              </>
            </div>
          )}
          <div
            className={`whitespace-pre-wrap break-words transition-colors ${
              compact
                ? 'text-sm font-semibold leading-snug'
                : 'text-[15px] font-medium leading-[1.4]'
            } ${
              task.completed
                ? 'text-muted-foreground line-through'
                : 'text-foreground'
            }`}
          >
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <span className="min-w-0 whitespace-pre-wrap break-words">
                {task.text}
              </span>
              {isRepeating && (
                <Icon name="repeat" label="Repeating" className="w-5 h-5 flex-shrink-0" />
              )}
              {task.calendarEventId && (
                <CalendarDays className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 flex-shrink-0" />
              )}
              {(task.notes?.trim() ||
                (task.checklist && task.checklist.length > 0)) && (
                <span className="inline-flex flex-shrink-0 items-center gap-1.5 no-underline">
                  {task.notes?.trim() && (
                    <Pen
                      aria-label="Has notes"
                      className="h-4 w-4 text-muted-foreground/70"
                    />
                  )}
                  {task.checklist &&
                    task.checklist.length > 0 &&
                    (() => {
                      const done = task.checklist.filter((c) => c.done).length;
                      const total = task.checklist.length;
                      return (
                        <span
                          className={`inline-flex items-center gap-1 ${
                            done === total
                              ? 'text-primary'
                              : 'text-muted-foreground/70'
                          }`}
                        >
                          <ListChecks className="h-4 w-4" />
                          <span className="text-[11px] font-bold tabular-nums no-underline">
                            {done}/{total}
                          </span>
                        </span>
                      );
                    })()}
                </span>
              )}
            </div>
          </div>

          {task.frogodoroSession && ((task.frogodoroSession.focusTime ?? 0) > 0 || (task.frogodoroSession.breakTime ?? 0) > 0) && (
            <div className="flex flex-wrap items-center gap-1 mt-0.5">
              {(task.frogodoroSession.focusTime ?? 0) > 0 && (() => { const s = task.frogodoroSession!.focusTime; const m = Math.floor(s / 60); const sec = s % 60; const t = s < 60 ? `${s}s` : sec > 0 ? `${m}m ${sec}s` : `${m}m`; return (
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-primary/8 dark:bg-primary/15">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                  <span className="text-[10px] font-bold text-primary/60 uppercase tracking-wider">Focus</span>
                  <span className="text-[11px] font-black text-primary tabular-nums">{t}</span>
                </div>
              ); })()}
              {(task.frogodoroSession.breakTime ?? 0) > 0 && (() => { const s = task.frogodoroSession!.breakTime ?? 0; const m = Math.floor(s / 60); const sec = s % 60; const t = s < 60 ? `${s}s` : sec > 0 ? `${m}m ${sec}s` : `${m}m`; return (
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-500/8 dark:bg-sky-500/15">
                  <div className="w-1.5 h-1.5 rounded-full bg-sky-500 flex-shrink-0" />
                  <span className="text-[10px] font-bold text-sky-500/60 uppercase tracking-wider">Break</span>
                  <span className="text-[11px] font-black text-sky-500 tabular-nums">{t}</span>
                </div>
              ); })()}
            </div>
          )}
        </div>

        <div className="shrink-0 flex items-center gap-1.5">
          {onDoToday && !hideDoTodayButton && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDoToday();
              }}
              title="Add to Today"
              className="flex items-center justify-center w-8 h-8 bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400 rounded-full hover:bg-green-100 dark:hover:bg-green-500/20 transition-colors"
              type="button"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}

          {/* Completion indicator (right) — tap to toggle */}
          <button
            type="button"
            disabled={!onToggleComplete}
            onClick={(e) => {
              e.stopPropagation();
              if (onToggleComplete && !isAnyDragging) onToggleComplete();
            }}
            aria-label={task.completed ? 'Mark not done' : 'Mark done'}
            className={`relative h-10 w-10 shrink-0 rounded-full transition-colors ${
              onToggleComplete ? 'cursor-pointer' : 'cursor-default'
            }`}
          >
            <span
              ref={(el) => registerFly(task.id, el)}
              className={`absolute inset-0 flex items-center justify-center rounded-full border border-muted-foreground/10 bg-muted transition-opacity duration-200 ${
                task.completed || grabbing
                  ? 'opacity-0 pointer-events-none'
                  : 'opacity-100'
              }`}
            >
              <Fly size={36} paused={task.completed} y={-3} />
            </span>
            <span
              className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${
                task.completed || grabbing
                  ? 'opacity-100'
                  : 'opacity-0 pointer-events-none'
              }`}
            >
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
