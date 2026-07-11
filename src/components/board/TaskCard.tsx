'use client';

import React, { useRef, useCallback, useEffect } from 'react';
import {
  CheckCircle2,
  Plus,
  CalendarDays,
  EllipsisVertical,
  Pen,
  ListChecks,
  Flame,
} from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { TimeTag } from '@/components/ui/TimeTag';
import { BuddyBadge } from '@/components/ui/BuddyBadge';
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
  isPast = false,
  showStreak = false,
  isToday = false,
  occurrenceDate,
}: {
  dragId: string;
  task: Task;
  /** The occurrence date (YYYY-MM-DD) for this column — used by the buddy badge. */
  occurrenceDate?: string;
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
  /** True on past-day columns — completed cards become a clickable pointer. */
  isPast?: boolean;
  /** Show the repeat streak (fire) badge. */
  showStreak?: boolean;
  /** True on the today column — streak fly bonus only applies to today completions. */
  isToday?: boolean;
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
  // Key the tongue by the per-column drag id, not task.id: a repeating task
  // shares one id across every date column, so keying by id would collide and
  // make the tongue grab (and hide) the wrong instance.
  const grabbing = isHidden(dragId);

  // Keep latest callbacks in refs to avoid effect re-runs
  const onGrabRef = useRef(onGrab);
  onGrabRef.current = onGrab;
  const onToggleMenuRef = useRef(onToggleMenu);
  onToggleMenuRef.current = onToggleMenu;
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  const MOVE_TOLERANCE = 8;
  // Mouse drags start on movement (Trello-style) — the threshold only exists
  // to keep clicks from becoming accidental micro-drags.
  const MOUSE_DRAG_THRESHOLD = 6;
  const LONG_PRESS_DURATION = 220;
  const MOUSE_HOLD_DURATION = 150;
  const defaultTouchAction = touchAction || 'auto';

  const pointerTypeRef = useRef<string>('mouse');
  const canDragRef = useRef(false);
  const beginGrabRef = useRef<(x: number, y: number) => void>(() => {});
  // Non-passive touchmove guard installed synchronously at grab time — the
  // drag manager's own listener registers an effect-frame later, which is
  // enough of a gap for the browser to claim the gesture and pan the board
  // underneath the drag.
  const touchScrollGuardRef = useRef<((e: TouchEvent) => void) | null>(null);

  const cleanupLP = useCallback(() => {
    document.body.style.userSelect = '';
    (document.body.style as any).webkitUserSelect = '';
    if (touchScrollGuardRef.current) {
      window.removeEventListener('touchmove', touchScrollGuardRef.current);
      touchScrollGuardRef.current = null;
    }
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

      // Mouse: movement while pressed means "drag" — grab immediately instead
      // of requiring a hold. Touch keeps the long-press (movement = scroll).
      if (
        pointerTypeRef.current === 'mouse' &&
        canDragRef.current &&
        !longPressFiredRef.current &&
        (dx > MOUSE_DRAG_THRESHOLD || dy > MOUSE_DRAG_THRESHOLD)
      ) {
        beginGrabRef.current(e.clientX, e.clientY);
        return;
      }

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

      // Suppress text selection from the very start of the press — the
      // pointerdown is passive (can't preventDefault) and the drag only begins
      // after the long-press delay, so without this the browser selects text
      // across cards while the press is pending. Applies to every card (not
      // just draggable ones): a press on a completed/past card can still drift
      // into a selection. Restored in cleanupLP. The board's selectstart guard
      // is the belt-and-suspenders catch-all.
      document.body.style.userSelect = 'none';
      (document.body.style as any).webkitUserSelect = 'none';

      pointerIdRef.current = e.pointerId;
      longPressFiredRef.current = false;
      movedOutRef.current = false;
      startPos.current = { x: e.clientX, y: e.clientY };
      pointerTypeRef.current = e.pointerType;
      canDragRef.current = canDrag;

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

      const pointerType = e.pointerType;
      const beginGrab = (clientX: number, clientY: number) => {
        if (longPressFiredRef.current) return;
        longPressFiredRef.current = true;
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
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

        // Clear any selection that began before the drag took over.
        window.getSelection()?.removeAllRanges();

        if (pointerType !== 'mouse') {
          const guard = (ev: TouchEvent) => {
            if (ev.cancelable) ev.preventDefault();
          };
          window.addEventListener('touchmove', guard, { passive: false });
          touchScrollGuardRef.current = guard;
          try {
            navigator.vibrate?.(15);
          } catch {
            // ignore
          }
        }

        onGrabRef.current({
          clientX,
          clientY,
          pointerType: pointerType as 'mouse' | 'touch',
        });
      };
      beginGrabRef.current = beginGrab;

      const delay =
        pointerType === 'mouse' ? MOUSE_HOLD_DURATION : LONG_PRESS_DURATION;

      longPressTimer.current = window.setTimeout(() => {
        beginGrab(e.clientX, e.clientY);
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
  const projectedStreak =
    isToday && isRepeating
      ? (task.streak ?? 0) + (task.completed ? 0 : 1)
      : 0;
  const streakFlyBase =
    projectedStreak >= 30
      ? 5
      : projectedStreak >= 14
        ? 4
        : projectedStreak >= 7
          ? 3
          : projectedStreak >= 3
            ? 2
            : 1;
  const flyValue =
    streakFlyBase + (task.checklist?.filter((c) => c.done).length ?? 0);
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
          ? 'group relative overflow-visible flex items-center gap-2 px-2 py-2 select-none rounded-xl transition-colors duration-200'
          : 'group relative overflow-visible flex items-start gap-3 p-3.5 select-none rounded-xl transition-colors duration-200',
        task.completed
          ? isPast
            ? 'cursor-pointer'
            : 'cursor-default'
          : disableDrag
            ? 'cursor-pointer'
            : 'cursor-grab',
        // The column itself now sits a shade darker/greyer (DayColumn) so
        // cards need to visibly pop off it, Trello-style — only in the
        // planner's compact list; the home page's non-compact cards sit on
        // their own lighter list surface and are unaffected. Trello itself
        // drops the card outline entirely and relies on a soft drop shadow
        // for edge definition instead, so the border here stays present
        // (for the hover/active/menu highlight below) but transparent at
        // rest.
        compact
          ? 'bg-card dark:bg-muted border border-transparent shadow-[0_1px_2px_rgba(0,0,0,0.12)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.5)]'
          : 'bg-card border border-border/80 shadow-sm',
        task.completed
          ? ''
          : 'md:hover:border-primary/40 active:border-primary/40',
        compact ? 'mb-1' : 'mb-2.5',
        menuOpen ? 'z-50 border-primary/30' : '',
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
                  <TimeTag
                    startTime={task.startTime}
                    endTime={task.endTime}
                    reminder={task.reminder}
                    size="md"
                    className="isolate"
                  />
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
              task.completed ? 'text-muted-foreground' : 'text-foreground'
            }`}
          >
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <span
                className={`min-w-0 whitespace-pre-wrap break-words ${
                  task.completed ? 'line-through' : ''
                }`}
              >
                {task.text}
              </span>
              {isRepeating && (
                <Icon name="repeat" label="Repeating" className="w-5 h-5 flex-shrink-0" />
              )}
              {showStreak && isRepeating && (task.streak ?? 0) > 0 && (
                <span
                  className="inline-flex flex-shrink-0 items-center gap-0.5 text-orange-500 no-underline"
                  title={`${task.streak} in a row`}
                >
                  <Flame className="h-4 w-4" fill="currentColor" />
                  <span className="text-[12px] font-black tabular-nums leading-none">
                    ×{task.streak}
                  </span>
                </span>
              )}
              <BuddyBadge taskId={task.id} date={occurrenceDate} />
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
              ref={(el) => registerFly(dragId, el)}
              className={`absolute inset-0 flex items-center justify-center rounded-full border border-muted-foreground/10 bg-muted transition-opacity duration-200 ${
                task.completed || grabbing
                  ? 'opacity-0 pointer-events-none'
                  : 'opacity-100'
              }`}
            >
              <Fly size={36} paused={task.completed} y={-3} />
              {flyValue > 1 && (
                <span className="absolute -right-1 -top-1.5 sm:-top-1 flex min-w-[17px] items-center justify-center rounded-full border border-card bg-primary px-1 py-0.5 text-[10px] font-black leading-none text-primary-foreground shadow-sm">
                  ×{flyValue}
                </span>
              )}
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
