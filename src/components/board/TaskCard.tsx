'use client';

import React, {
  useRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Plus,
  Check,
  Timer,
} from 'lucide-react';
import { TaskTimeChip } from '@/components/ui/TaskMeta';
import { BuddyLine } from '@/components/ui/BuddyBadge';
import { StreakPill, formatFocusSpan } from '@/components/ui/TaskAdornments';
import { StepsStrip } from '@/components/ui/TaskSteps';
import { checklistPayout } from '@/lib/checklist';
import type { Task } from './helpers';
import Fly from '@/components/ui/fly';
import { useLeftTongue } from './LeftTongue';
import { hapticImpact, hapticTick } from '@/lib/haptics';
import { isFreshTask, playTaskEntrance } from '@/lib/taskEntrance';
import { taskFlyWorthNow } from '@/lib/flyValue';
import { FlyValueBadge } from '@/components/ui/FlyValueBadge';
import { useTaskTimerPhase } from '@/hooks/useTaskTimerPhase';
import { TOUR_BLOCKED_TAP, isPlannerTourLocked } from '@/lib/tour/plannerTour';

type OnGrabParams = {
  clientX: number;
  clientY: number;
  pointerType: 'mouse' | 'touch';
};

export type SelectModifiers = { shift: boolean; meta: boolean };

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
  selectionMode = false,
  selected = false,
  selectable = true,
  onSelectToggle,
  onToggleChecklistItem,
  flyPaused = false,
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
  /** Board-wide multi-select is on: taps pick cards instead of opening them. */
  selectionMode?: boolean;
  selected?: boolean;
  /** False for cards that can't take part in bulk actions (past columns). */
  selectable?: boolean;
  onSelectToggle?: (mods: SelectModifiers) => void;
  onToggleChecklistItem?: (itemId: string) => void;
  flyPaused?: boolean;
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
  const onSelectToggleRef = useRef(onSelectToggle);
  onSelectToggleRef.current = onSelectToggle;
  // A modifier-click (⌘/Ctrl/Shift) picks the card instead of opening it, and a
  // tap in selection mode does the same — both resolve on pointerup, so the
  // press path needs to know which one this gesture is before it releases.
  const suppressTapRef = useRef(false);
  const selectTapRef = useRef(false);

  const MOVE_TOLERANCE = 8;
  // Mouse drags start on movement (Trello-style) — the threshold only exists
  // to keep clicks from becoming accidental micro-drags.
  const MOUSE_DRAG_THRESHOLD = 5;
  const LONG_PRESS_DURATION = 120;
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

  const refuseTap = useCallback(() => {
    if (!isPlannerTourLocked()) return false;
    window.dispatchEvent(new Event(TOUR_BLOCKED_TAP));
    return true;
  }, []);

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

      const panningBoard =
        pointerTypeRef.current !== 'mouse' && dx > 3 && dx >= dy;
      if (panningBoard || dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) {
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
    const suppressed = suppressTapRef.current;
    const asSelect = selectTapRef.current;
    cleanupLP();
    if (!wasTap || suppressed) return;
    if (asSelect) onSelectToggleRef.current?.({ shift: false, meta: false });
    else if (!refuseTap()) onTapRef.current?.();
  }, [cleanupLP, refuseTap]);

  const handlePointerCancel = useCallback(() => cleanupLP(), [cleanupLP]);

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      if (e.button !== 0 || !e.isPrimary) return;

      const target = e.target as HTMLElement;
      if (target.closest('button, a, input, textarea, [role="button"]')) return;

      suppressTapRef.current = false;
      selectTapRef.current = false;

      // Desktop modifier-click picks the card up into the selection instead of
      // opening it — resolved here rather than on release so the press never
      // arms a drag or a text selection.
      const modifierSelect =
        e.pointerType === 'mouse' &&
        selectable &&
        !!onSelectToggleRef.current &&
        (e.shiftKey || e.metaKey || e.ctrlKey);

      // Completed cards can still be tapped (to open the detail card) but
      // never dragged. In selection mode only already-selected cards drag —
      // that drag carries the whole selection.
      const canDrag =
        !task.completed &&
        !disableDrag &&
        !modifierSelect &&
        (!selectionMode || (selected && selectable));

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

      if (modifierSelect) {
        suppressTapRef.current = true;
        onSelectToggleRef.current?.({
          shift: e.shiftKey,
          meta: e.metaKey || e.ctrlKey,
        });
      } else if (selectionMode && selectable) {
        selectTapRef.current = true;
      } else if (selectionMode) {
        suppressTapRef.current = true;
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
          hapticImpact();
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
    [
      handlePointerMove,
      handlePointerUp,
      handlePointerCancel,
      task.completed,
      disableDrag,
      selectionMode,
      selected,
      selectable,
    ],
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

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el || !isFreshTask(task.id)) return;
    playTaskEntrance(
      el.closest<HTMLElement>('[data-row]') ?? el,
      task.id,
      { moveFollowers: false },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const projectedStreak =
    isToday && isRepeating
      ? (task.streak ?? 0) + (task.completed ? 0 : 1)
      : 0;
  const flyValue =
    task.flyWorth ??
    taskFlyWorthNow({
      checklist: task.checklist,
      streak: projectedStreak,
    });

  const timerPhase = useTaskTimerPhase(task.id);
  const isDone = !!task.completed;
  const tags = (task.tags ?? [])
    .map((tagId) => getTagDetails(tagId))
    .filter((tag): tag is NonNullable<typeof tag> => !!tag);
  const checklist = task.checklist;
  const steps = React.useMemo(
    () => (checklist?.length ? checklistPayout(checklist) : null),
    [checklist],
  );
  const [stepsOpen, setStepsOpen] = useState(false);
  const focusSeconds = task.frogodoroSession?.focusTime ?? 0;
  const streak = showStreak && isRepeating && !isDone ? (task.streak ?? 0) : 0;
  const showDoToday = !!onDoToday && !hideDoTodayButton && !selectionMode;
  const showFly = !!onToggleComplete;

  return (
    <div
      ref={setRefs}
      data-card-id={dragId}
      data-hint={task.isTutorial ? 'tutorial-card' : undefined}
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      style={{
        touchAction: defaultTouchAction,
        WebkitTapHighlightColor: 'transparent',
      }}
      className={[
        'group relative flex select-none items-center gap-2.5 bg-card py-3 pl-3.5 pr-2.5 transition-colors duration-150 md:gap-2 md:py-2.5 md:pl-3 md:pr-2',
        isDone
          ? isPast
            ? 'cursor-pointer'
            : 'cursor-default'
          : disableDrag
            ? 'cursor-pointer'
            : 'cursor-grab',
        selected
          ? 'bg-primary/[0.07] dark:bg-primary/[0.12]'
          : selectionMode
            ? ''
            : 'active:bg-muted/50 [@media(hover:hover)]:hover:bg-muted/40',
        menuOpen ? 'z-50 bg-muted/40' : '',
        selectionMode && !selectable ? 'opacity-40' : '',
        hiddenWhileDragging ? 'opacity-0' : '',
      ].join(' ')}
      aria-selected={selectionMode ? selected : undefined}
      role="listitem"
      aria-grabbed={false}
    >
      {tags.length > 0 && (
        <span
          aria-hidden
          className={`pointer-events-none absolute left-0 top-1/2 h-[24px] max-h-[60%] w-[3px] -translate-y-1/2 rounded-r-full ${
            isDone ? 'opacity-30' : 'opacity-90'
          }`}
          style={{
            background:
              tags.length > 1
                ? `linear-gradient(to bottom, ${tags[0].color} 50%, ${tags[1].color} 50%)`
                : tags[0].color,
          }}
        />
      )}

      {selectionMode && (
        <span
          aria-hidden
          className={`grid h-[20px] w-[20px] shrink-0 place-items-center rounded-md border-2 transition-colors ${
            selected
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-muted-foreground/35'
          }`}
        >
          {selected && <Check className="h-3 w-3" strokeWidth={4} />}
        </span>
      )}

      <div
        className={`min-w-0 flex-1 transition-opacity duration-200 ${
          isDone ? 'opacity-60' : ''
        }`}
      >
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span
            className={`break-words text-[16px] font-semibold leading-snug line-through decoration-2 transition-[color,text-decoration-color] duration-300 md:text-[15px] ${
              isDone
                ? 'text-muted-foreground decoration-current'
                : 'text-foreground decoration-transparent'
            }`}
          >
            {task.text}
          </span>
          {task.isTutorial && (
            <span className="inline-flex shrink-0 items-center rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-primary">
              Practice
            </span>
          )}
        </span>
        {streak > 0 ||
        task.startTime ||
        (!isDone && timerPhase) ||
        task.calendarEventId ||
        focusSeconds > 0 ? (
          <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {streak > 0 && <StreakPill count={streak} size="sm" />}
            <TaskTimeChip
              startTime={task.startTime}
              endTime={task.endTime}
              reminder={task.reminder}
              isDone={isDone}
              activePhase={!isDone && timerPhase ? timerPhase : null}
            />
            {task.calendarEventId && (
              <CalendarDays
                aria-label="From your calendar"
                className="h-3.5 w-3.5 text-blue-500/80 dark:text-blue-400/80"
              />
            )}
            {focusSeconds > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[12px] font-bold tabular-nums text-primary/80">
                <Timer className="h-3.5 w-3.5" />
                {formatFocusSpan(focusSeconds)}
              </span>
            )}
          </span>
        ) : null}
        <BuddyLine
          className="mt-0.5"
          taskId={task.id}
          isDone={isDone}
          date={occurrenceDate}
        />
        {steps && (
          <StepsStrip
            taskText={task.text}
            items={steps.items}
            doneCount={steps.doneCount}
            open={stepsOpen && !isAnyDragging}
            isDone={isDone}
            onToggleOpen={() => {
              hapticTick();
              setStepsOpen((v) => !v);
            }}
            onToggleItem={
              onToggleChecklistItem && !selectionMode
                ? onToggleChecklistItem
                : undefined
            }
          />
        )}
      </div>

      {showDoToday && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDoToday?.();
          }}
          title="Do it today"
          aria-label={`Do ${task.text} today`}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary transition-[background-color,transform] active:scale-90 [@media(hover:hover)]:hover:bg-primary/15"
          type="button"
        >
          <Plus className="h-5 w-5" strokeWidth={2.75} />
        </button>
      )}

      {showFly && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onToggleComplete && !isAnyDragging && !selectionMode && !refuseTap())
              onToggleComplete();
          }}
          aria-label={isDone ? 'Mark not done' : 'Mark done'}
          className={`relative h-11 w-11 shrink-0 rounded-full transition-transform active:scale-90 md:h-10 md:w-10 ${
            selectionMode ? 'pointer-events-none' : 'cursor-pointer'
          }`}
        >
          <span
            ref={(el) => registerFly(dragId, el)}
            data-fly-slot
            className={`absolute inset-0 flex items-center justify-center rounded-full bg-primary/[0.16] ring-1 ring-inset ring-primary/25 transition-opacity duration-200 ${
              isDone || grabbing ? 'pointer-events-none opacity-0' : 'opacity-100'
            }`}
          >
            <Fly size={36} paused={isDone || flyPaused} y={-3} interactive={false} />
            <FlyValueBadge value={flyValue} />
          </span>
          <span
            className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${
              isDone || grabbing ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            <CheckCircle2 className="h-9 w-9 text-primary md:h-8 md:w-8" />
          </span>
        </button>
      )}
    </div>
  );
}
