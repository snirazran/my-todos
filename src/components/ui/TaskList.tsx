import {
  CheckCircle2,
  ChevronDown,
  Circle,
  EllipsisVertical,
  CalendarCheck,
  CalendarClock,
  Repeat,
  Filter,
  CalendarDays,
  Pencil,
  Plus,
  Flame,
  Pen,
  ListChecks,
  EyeOff,
  Trash2,
} from 'lucide-react';
import Fly from '@/components/ui/fly';
import { createPortal } from 'react-dom';
import { TimeTag } from '@/components/ui/TimeTag';
import { Icon } from '@/components/ui/Icon';
import { hapticImpact, hapticSuccess, hapticTick } from '@/lib/haptics';
import { useTaskTimerPhase } from '@/hooks/useTaskTimerPhase';
import {
  AnimatePresence,
  motion,
  PanInfo,
  useMotionValue,
  useTransform,
  animate,
} from 'framer-motion';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import {
  DndContext,
  closestCenter,
  closestCorners,
  KeyboardSensor,
  MouseSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  TouchSensor,
  Modifier,
  MeasuringStrategy,
} from '@dnd-kit/core';
import {
  restrictToVerticalAxis,
  restrictToParentElement,
} from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  defaultAnimateLayoutChanges,
  type AnimateLayoutChanges,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DeleteDialog } from '@/components/ui/DeleteDialog';
import { AddTaskButton } from '@/components/ui/AddTaskButton';
import TaskMenu from '../board/TaskMenu';
import TaskDetailSheet from '../board/TaskDetailSheet';
import { EditScopeDialog } from '../board/EditScopeDialog';
import TagsPopup from '@/components/ui/TagsPopup';
import { EditTaskDialog } from '@/components/ui/EditTaskDialog';
import { TimePopup } from '@/components/ui/TimePopup';
import { BuddyBadge } from '@/components/ui/BuddyBadge';
import { objectiveCardTone } from '@/lib/questClaims';
import { useUIStore } from '@/lib/uiStore';
import { guideById } from '@/lib/hints/guides';
import { format } from 'date-fns';

interface Task {
  id: string;
  text: string;
  completed: boolean;
  order?: number;
  type?: 'regular' | 'weekly' | 'backlog';
  origin?: 'regular' | 'weekly' | 'backlog';
  kind?: 'regular' | 'weekly' | 'backlog';
  tags?: string[];
  notes?: string;
  checklist?: { id: string; text: string; done: boolean }[];
  repeatMode?:
    | 'none'
    | 'daily'
    | 'weekdays'
    | 'weekend'
    | 'weekly'
    | 'monthly'
    | 'custom';
  repeatGroupId?: string;
  dayOfWeek?: number;
  frogodoroSession?: {
    date: string;
    focusTime: number;
    breakTime: number;
  } | null;
  calendarEventId?: string;
  startTime?: string;
  endTime?: string;
  reminder?: string;
  completedDates?: string[];
  /** Consecutive-completion streak for a repeating task, as of today. */
  streak?: number;
  isStarter?: boolean;
  sectionId?: string | null;
}

export interface TaskListSection {
  id: string;
  name: string;
  order: number;
  collapsed: boolean;
}

const SECTION_PREFIX = 'section:';
const sectionSortableId = (id: string) => `${SECTION_PREFIX}${id}`;
const sectionIdFromSortable = (id: string | number) =>
  typeof id === 'string' && id.startsWith(SECTION_PREFIX)
    ? id.slice(SECTION_PREFIX.length)
    : null;

type ListRow =
  | { kind: 'task'; task: Task }
  | { kind: 'header'; section: TaskListSection; count: number; doneCount: number };

const animateLayoutChanges: AnimateLayoutChanges = (args) =>
  args.isSorting || args.wasDragging ? defaultAnimateLayoutChanges(args) : true;

const SWIPE_ACTION_WIDTH = 88;
const SWIPE_SNAP_THRESHOLD = 32;
const SWIPE_COMMIT_X = SWIPE_ACTION_WIDTH + 40;
const SWIPE_SPRING = { type: 'spring' as const, stiffness: 520, damping: 34 };

interface SortableTaskItemProps {
  task: Task;
  isDone: boolean;
  isMenuOpen: boolean;
  isExitingLater: boolean;
  renderBullet?: (task: Task, isVisuallyDone: boolean, paused: boolean) => React.ReactNode;
  handleTaskToggle: (
    task: Task,
    forceState?: boolean,
    skipDelay?: boolean,
  ) => void;
  onMenuOpen: (e: React.MouseEvent<HTMLButtonElement>, task: Task) => void;
  getTagDetails: (
    tagId: string,
  ) => { id: string; name: string; color: string } | undefined;
  isDragDisabled?: boolean;
  isWeekly?: boolean;
  disableLayout?: boolean;
  onDoLater?: (task: Task) => void;
  onSkipToday?: (task: Task) => void;
  isGuest?: boolean;
  isGlowActive?: boolean;
  isSortDragging?: boolean;
  onStartTimer?: (task: Task, opts?: { autoStart?: boolean }) => void;
  onOpenDetail?: (task: Task) => void;
  paused?: boolean;
  hintPeekPrimary?: boolean;
  isDesktop?: boolean;
}

const SortableTaskItem = React.forwardRef<
  HTMLDivElement,
  SortableTaskItemProps
>(
  (
    {
      task,
      isDone,
      isMenuOpen,
      isExitingLater,
      renderBullet,
      handleTaskToggle,
      onMenuOpen,
      getTagDetails,
      isDragDisabled,
      isWeekly,
      disableLayout,
      onDoLater,
      onSkipToday,
      isGlowActive,
      isSortDragging,
      onStartTimer,
      onOpenDetail,
      paused = false,
      hintPeekPrimary = false,
      isDesktop = false,
    },
    ref,
  ) => {
    /* Swipe Logic */
    const [openSide, setOpenSide] = useState<'timer' | 'secondary' | null>(null);
    const isOpen = openSide !== null;
    const [isSwiping, setIsSwiping] = useState(false);
    const isDraggingRef = React.useRef(false);
    const hasActionTriggeredRef = React.useRef(false);
    const dragStartSideRef = React.useRef<'timer' | 'secondary' | null>(null);
    const actionBlockTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );
    const containerRef = React.useRef<HTMLDivElement>(null);
    const [isHovered, setIsHovered] = useState(false);
    const [swipeBlocked, setSwipeBlocked] = useState(false);
    // Axis framer locked the swipe to ('x' once a horizontal swipe is committed).
    // Used to block native vertical scroll for the rest of the gesture.
    const lockedAxisRef = React.useRef<'x' | 'y' | null>(null);

    const bulletContent = React.useMemo(
      () => renderBullet ? renderBullet(task, false, paused) : null,
      [task.id, task.completed, paused, renderBullet],
    );

    const timerPhase = useTaskTimerPhase(task.id);

    const wasDoneRef = React.useRef(isDone);
    useEffect(() => {
      if (
        isDone &&
        !wasDoneRef.current &&
        containerRef.current &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        try {
          containerRef.current.animate(
            [
              { transform: 'scale(1)' },
              { transform: 'scale(0.972)', offset: 0.4 },
              { transform: 'scale(1.006)', offset: 0.75 },
              { transform: 'scale(1)' },
            ],
            { duration: 320, easing: 'ease-out', composite: 'add' },
          );
        } catch {
          // ignore
        }
      }
      wasDoneRef.current = isDone;
    }, [isDone]);

    // Motion Values for Swipe
    const x = useMotionValue(0);
    const isRepeating =
      !!isWeekly ||
      !!task.repeatGroupId ||
      (!!task.repeatMode && task.repeatMode !== 'none');
    const secondaryAction = isRepeating
      ? onSkipToday
      : task.isStarter
        ? undefined
        : onDoLater;
    const secondaryLabel = isRepeating ? 'Skip today' : 'Save later';

    const pastCommitRef = React.useRef(false);
    useEffect(() => {
      const unsub = x.on('change', (v) => {
        const past = Math.abs(v) >= SWIPE_COMMIT_X;
        if (past && !pastCommitRef.current && isDraggingRef.current) {
          hapticImpact();
        }
        pastCommitRef.current = past;
      });
      return unsub;
    }, [x]);

    const snapSwipe = React.useCallback(
      (side: 'timer' | 'secondary' | null) => {
        setOpenSide(side);
        const target =
          side === 'timer'
            ? SWIPE_ACTION_WIDTH
            : side === 'secondary'
              ? -SWIPE_ACTION_WIDTH
              : 0;
        animate(x, target, SWIPE_SPRING);
      },
      [x],
    );

    // Once a horizontal swipe is locked, block the browser's native vertical
    // scroll for the rest of the gesture. framer's drag='x' sets
    // touch-action:pan-y, which otherwise lets a vertical move scroll the list
    // and release the swipe mid-motion (inconsistently). A non-passive
    // touchmove preventDefault makes it deterministic.
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const onTouchMove = (e: TouchEvent) => {
        if (lockedAxisRef.current === 'x') e.preventDefault();
      };
      el.addEventListener('touchmove', onTouchMove, { passive: false });
      return () => el.removeEventListener('touchmove', onTouchMove);
    }, []);

    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({
      id: task.id,
      disabled: isDragDisabled || isOpen,
      animateLayoutChanges,
    });
    const showSwipeActions =
      (isOpen || isSwiping) && !isDragging && !isSortDragging;

    const activeHint = useUIStore((s) => s.activeHint);
    const hintStep = activeHint
      ? guideById(activeHint.guideId)?.steps[activeHint.stepIndex] ?? null
      : null;
    const hintStepKey = activeHint
      ? `${activeHint.runId}:${activeHint.guideId}:${activeHint.stepIndex}`
      : null;
    const hintTagIds = activeHint?.context?.tagIds ?? [];
    const hintPeekTarget =
      !isDone &&
      (hintStep?.rowPeek === 'tagged'
        ? (task.tags ?? []).some((id) => hintTagIds.includes(id))
        : hintStep?.rowPeek === 'first'
          ? hintPeekPrimary
          : false);
    const hintRowGlow = hintPeekTarget && hintStep?.rowPeek === 'tagged';

    // Demo nudge: slide the row right with the same motion value the real
    // swipe uses, so the Focus action genuinely peeks out and a user grab at
    // any moment takes over from the current position. First touch on the
    // row retires the demo for this hint step.
    const peekRetiredRef = React.useRef<string | null>(null);
    useEffect(() => {
      if (!hintPeekTarget || !hintStepKey || !onStartTimer) return;
      if (isDesktop || isOpen || isDragging || isSortDragging || isExitingLater || swipeBlocked) {
        return;
      }
      if (peekRetiredRef.current === hintStepKey) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      let cancelled = false;
      let controls: ReturnType<typeof animate> | null = null;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const loop = () => {
        if (cancelled) return;
        setIsSwiping(true);
        controls = animate(x, 52, { type: 'spring', stiffness: 320, damping: 26 });
        timer = setTimeout(() => {
          if (cancelled) return;
          controls = animate(x, 0, SWIPE_SPRING);
          timer = setTimeout(() => {
            if (cancelled) return;
            if (!isDraggingRef.current) setIsSwiping(false);
            timer = setTimeout(loop, 2200);
          }, 420);
        }, 700);
      };
      timer = setTimeout(loop, 400);

      const el = containerRef.current;
      const onPointerDown = () => {
        cancelled = true;
        peekRetiredRef.current = hintStepKey;
        if (timer) clearTimeout(timer);
        controls?.stop();
        controls = animate(x, 0, SWIPE_SPRING);
      };
      el?.addEventListener('pointerdown', onPointerDown);

      return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
        controls?.stop();
        el?.removeEventListener('pointerdown', onPointerDown);
        if (!isDraggingRef.current) {
          if (x.get() !== 0) animate(x, 0, SWIPE_SPRING);
          setIsSwiping(false);
        }
      };
    }, [
      hintPeekTarget,
      hintStepKey,
      onStartTimer,
      isDesktop,
      isOpen,
      isDragging,
      isSortDragging,
      isExitingLater,
      swipeBlocked,
      x,
    ]);

    // Clear hover state and reset swipe position when any sort drag starts
    useEffect(() => {
      if (isDragging || isSortDragging) {
        setSwipeBlocked(true);
        setIsHovered(false);
        setOpenSide(null);
        x.set(0);
      } else if (swipeBlocked) {
        const timer = setTimeout(() => setSwipeBlocked(false), 200);
        return () => clearTimeout(timer);
      }
    }, [isDragging, isSortDragging, swipeBlocked, x]);

    // Transform values based on drag position x. Releasing only reveals the
    // corresponding action; the user must tap the button to run it.
    const timerActionOpacity = useTransform(x, [0, 25], [0, 1]);
    const timerActionScale = useTransform(
      x,
      [0, SWIPE_ACTION_WIDTH, SWIPE_COMMIT_X],
      [0.9, 1, 1.18],
    );
    const secondaryActionOpacity = useTransform(x, [-25, 0], [1, 0]);
    const secondaryActionScale = useTransform(
      x,
      [-SWIPE_COMMIT_X, -SWIPE_ACTION_WIDTH, 0],
      [1.18, 1, 0.9],
    );

    useEffect(() => {
      const handleOtherSwipe = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (detail.id !== task.id) {
          snapSwipe(null);
        }
      };

      // Global click listener to close on outside click
      const handleGlobalClick = (e: MouseEvent) => {
        if (!isOpen) return;

        // If clicking inside THIS task's actions or card, don't close via this handler
        if (
          containerRef.current &&
          containerRef.current.contains(e.target as Node)
        ) {
          return;
        }

        snapSwipe(null);
      };

      window.addEventListener('task-swipe-open', handleOtherSwipe);

      // Only attach click listener if open, using capture to ensure we get it
      if (isOpen) {
        window.addEventListener('click', handleGlobalClick, { capture: true });

        // Also close on scroll
        const handleScroll = () => {
          snapSwipe(null);
        };
        window.addEventListener('scroll', handleScroll, {
          capture: true,
          passive: true,
        });

        return () => {
          window.removeEventListener('task-swipe-open', handleOtherSwipe);
          window.removeEventListener('click', handleGlobalClick, {
            capture: true,
          });
          window.removeEventListener('scroll', handleScroll, { capture: true });
        };
      }

      return () => {
        window.removeEventListener('task-swipe-open', handleOtherSwipe);
      };
    }, [task.id, isOpen, snapSwipe]);

    useEffect(() => {
      return () => {
        if (actionBlockTimeoutRef.current) {
          clearTimeout(actionBlockTimeoutRef.current);
        }
      };
    }, []);

    const blockImmediatePostSwipeClick = () => {
      hasActionTriggeredRef.current = true;
      if (actionBlockTimeoutRef.current) {
        clearTimeout(actionBlockTimeoutRef.current);
      }
      actionBlockTimeoutRef.current = setTimeout(() => {
        hasActionTriggeredRef.current = false;
        actionBlockTimeoutRef.current = null;
      }, 250);
    };

    const handleDragStart = () => {
      isDraggingRef.current = true;
      setIsSwiping(true);
      lockedAxisRef.current = null;
      dragStartSideRef.current = openSide;
      window.dispatchEvent(
        new CustomEvent('task-swipe-open', { detail: { id: task.id } }),
      );
    };

    const handleDragEnd = (_: any, info: PanInfo) => {
      lockedAxisRef.current = null;
      // Small delay to prevent click triggering immediately after swipe
      setTimeout(() => {
        isDraggingRef.current = false;
        setIsSwiping(false);
      }, 100);

      // If a sort (vertical) drag was active, ignore horizontal swipe result
      if (swipeBlocked) {
        snapSwipe(null);
        return;
      }

      const projectedX = x.get() + info.velocity.x * 0.06;
      const startSide = dragStartSideRef.current;
      dragStartSideRef.current = null;

      // A swipe held past the commit threshold runs the action directly on
      // release — no second tap needed. Short swipes still just reveal.
      if (x.get() >= SWIPE_COMMIT_X && onStartTimer && !isDone) {
        blockImmediatePostSwipeClick();
        snapSwipe(null);
        onStartTimer(task, { autoStart: true });
        return;
      }
      if (x.get() <= -SWIPE_COMMIT_X && secondaryAction && !isDone) {
        blockImmediatePostSwipeClick();
        snapSwipe(null);
        secondaryAction(task);
        return;
      }

      // Closing an open tray cannot cross through zero and open the opposite
      // tray during the same gesture.
      if (startSide === 'timer') {
        blockImmediatePostSwipeClick();
        snapSwipe(
          projectedX > SWIPE_SNAP_THRESHOLD && onStartTimer && !isDone
            ? 'timer'
            : null,
        );
      } else if (startSide === 'secondary') {
        blockImmediatePostSwipeClick();
        snapSwipe(
          projectedX < -SWIPE_SNAP_THRESHOLD && secondaryAction && !isDone
            ? 'secondary'
            : null,
        );
      } else if (
        projectedX > SWIPE_SNAP_THRESHOLD &&
        onStartTimer &&
        !isDone
      ) {
        blockImmediatePostSwipeClick();
        snapSwipe('timer');
      } else if (
        projectedX < -SWIPE_SNAP_THRESHOLD &&
        secondaryAction &&
        !isDone
      ) {
        blockImmediatePostSwipeClick();
        snapSwipe('secondary');
      } else {
        snapSwipe(null);
      }
    };

    const handleTimerAction = (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (!onStartTimer || isDone) return;
      blockImmediatePostSwipeClick();
      snapSwipe(null);
      onStartTimer(task, { autoStart: true });
    };

    const handleSecondaryAction = (
      event: React.MouseEvent<HTMLButtonElement>,
    ) => {
      event.stopPropagation();
      if (!secondaryAction || isDone) return;
      blockImmediatePostSwipeClick();
      snapSwipe(null);
      secondaryAction(task);
    };

    const handleCardClick = (e: React.MouseEvent) => {
      if (isDraggingRef.current) return;
      if (isExitingLater || hasActionTriggeredRef.current) return;

      if (isOpen) {
        snapSwipe(null);
        return;
      }
      // Clicking the row body opens the detail card; only the fly/circle on the
      // right toggles completion.
      onOpenDetail?.(task);
    };

    const style = {
      transform: CSS.Translate.toString(transform),
      transition,
      zIndex: isDragging
        ? 30
        : isOpen
          ? 20
          : isMenuOpen
            ? 50
            : isExitingLater
              ? 0
              : 1,
    };

    return (
      <motion.div
        ref={(node: HTMLDivElement | null) => {
          setNodeRef(node);
          (
            containerRef as React.MutableRefObject<HTMLDivElement | null>
          ).current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref)
            (ref as React.MutableRefObject<HTMLDivElement | null>).current =
              node;
        }}
        style={{ ...style, overflow: 'hidden' }}
        {...attributes}
        {...listeners}
        onKeyDown={(e: React.KeyboardEvent) => {
          (listeners as any)?.onKeyDown?.(e);
          if (
            e.key === 'Enter' &&
            !e.defaultPrevented &&
            e.target === e.currentTarget &&
            !isDragging &&
            !isOpen
          ) {
            e.preventDefault();
            onOpenDetail?.(task);
          }
        }}
        // The card's own drop shadow has to live here, on the outermost
        // layer — its children below are clipped by this element's own
        // `overflow: hidden` (needed for the swipe-reveal actions), and any
        // box-shadow on a clipped child is invisible no matter how it's
        // styled. This layer's *own* shadow isn't affected by its own
        // overflow setting, only its children's are.
        className={`relative mb-1.5 w-full rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.12)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.5)] md:mb-2 ${isDragging ? 'z-30' : isMenuOpen ? 'z-50 border border-primary/30' : 'z-auto'} ${hintRowGlow ? 'hint-row-glow' : ''}`}
        data-is-active={!isDone}
        data-hint={isDone ? undefined : 'task-row'}
        data-tag-ids={isDone ? undefined : task.tags?.join(',') || undefined}
        data-savable={
          !isDone &&
          !isWeekly &&
          !task.isStarter &&
          (task.repeatMode ?? 'none') === 'none' &&
          !task.repeatGroupId &&
          onDoLater
            ? 'true'
            : undefined
        }
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={isExitingLater ? { opacity: 1 } : { opacity: 0 }}
        transition={{ opacity: { duration: 0.2, ease: 'easeOut' } }}
      >
        <motion.div
          layout={false}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          transition={{
            layout: { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] },
            opacity: { duration: 0.2, ease: 'easeOut', delay: 0.15 },
          }}
          className={`group relative w-full rounded-xl ${isDragging ? 'overflow-visible shadow-none' : isExitingLater ? 'overflow-visible shadow-none' : isGlowActive && !isDone ? 'overflow-visible shadow-none' : isOpen || isSwiping ? 'overflow-hidden bg-muted/70 shadow-none' : 'overflow-hidden'} ${isExitingLater ? 'will-change-transform' : ''}`}
        >
          {/* Swipe actions stay behind the row until the drag snaps open. A
              swipe never performs an action by itself. */}
          {onStartTimer && !isDone && showSwipeActions && (
            <button
              type="button"
              aria-label={`Start focus timer for ${task.text}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={handleTimerAction}
              className="absolute inset-y-0 left-0 flex w-[88px] flex-col items-center justify-center gap-0.5 rounded-l-xl bg-emerald-600 text-white"
            >
              <motion.span
                className="flex flex-col items-center justify-center"
                style={{ opacity: timerActionOpacity, scale: timerActionScale }}
              >
                <Icon name="clock" className="-mb-1 h-10 w-10 drop-shadow-sm" />
                <span className="text-[10px] font-black uppercase tracking-wide">
                  Focus
                </span>
              </motion.span>
            </button>
          )}

          {secondaryAction && !isDone && showSwipeActions && (
            <button
              type="button"
              aria-label={
                isRepeating
                  ? `Skip ${task.text} today`
                  : `Save ${task.text} for later`
              }
              onPointerDown={(event) => event.stopPropagation()}
              onClick={handleSecondaryAction}
              className={`absolute inset-y-0 right-0 flex w-[88px] flex-col items-center justify-center gap-1 rounded-r-xl text-white ${
                isRepeating ? 'bg-slate-500' : 'bg-amber-500'
              }`}
            >
              <motion.span
                className="flex flex-col items-center justify-center gap-1"
                style={{
                  opacity: secondaryActionOpacity,
                  scale: secondaryActionScale,
                }}
              >
                {isRepeating ? (
                  <EyeOff className="h-6 w-6" strokeWidth={2.75} />
                ) : (
                  <Icon name="saved" className="h-8 w-8" />
                )}
                <span className="text-[10px] font-black uppercase tracking-wide">
                  {secondaryLabel}
                </span>
              </motion.span>
            </button>
          )}

          {/* Foreground Card (Swipeable) */}
          <motion.div
            drag={isDesktop || isDragging || swipeBlocked ? false : 'x'} // Disable swipe if sorting/dragging
            dragListener={!isDragging && !isDragDisabled} // Also ensure disabled listener logic matches
            dragDirectionLock={true} // Lock direction to prevent accidental diagonal swipes
            onDirectionLock={(axis) => {
              lockedAxisRef.current = axis;
            }}
            dragConstraints={{
              left:
                openSide === 'timer'
                  ? 0
                  : secondaryAction
                    ? -SWIPE_ACTION_WIDTH
                    : 0,
              right:
                openSide === 'secondary'
                  ? 0
                  : onStartTimer && !isDone
                    ? SWIPE_ACTION_WIDTH
                    : 0,
            }}
            dragElastic={{
              right: onStartTimer && !isDone ? 0.5 : 0,
              left: secondaryAction && !isDone ? 0.5 : 0,
            }}
            dragMomentum={false}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            // Hover handlers for robust desktop behavior
            onMouseEnter={() => isDesktop && !isDragging && setIsHovered(true)}
            onMouseLeave={() => isDesktop && setIsHovered(false)}
            initial={false}
            animate={{
              x: isExitingLater
                ? isDesktop
                  ? 800
                  : 450
                : openSide === 'timer'
                  ? SWIPE_ACTION_WIDTH
                  : openSide === 'secondary'
                    ? -SWIPE_ACTION_WIDTH
                    : 0,
            }}
            style={{
              x: x,
              cursor: 'pointer',
              willChange: isExitingLater ? 'transform' : 'auto',
            }}
            transition={
              isExitingLater
                ? {
                    type: 'tween',
                    duration: 0.8,
                    ease: [0.22, 1, 0.36, 1],
                  }
                : { type: 'spring', stiffness: 600, damping: 28, mass: 1 }
            }
            className={`
              relative flex w-full items-center gap-1 px-2.5 py-2.5 md:gap-1 md:px-3.5 md:py-3.5
              transition-colors duration-200 rounded-xl
              bg-card dark:bg-muted
              border shadow-none
              ${
                timerPhase && !isDone
                  ? timerPhase === 'break'
                    ? 'border-sky-500/70 dark:border-sky-400/70'
                    : 'border-primary/70 dark:border-primary/80'
                  : 'border-transparent'
              }
              ${isHovered && isDesktop && !isDone && !timerPhase ? 'border-primary/40' : ''}
              ${
                isGlowActive && !isDone
                  ? 'ring-2 ring-primary shadow-[0_0_30px_rgba(var(--primary),0.3)]'
                  : ''
              }

              select-none active:border-primary/40 active:bg-muted
              has-[[data-completion-target]:active]:border-transparent has-[[data-completion-target]:active]:bg-card dark:has-[[data-completion-target]:active]:bg-muted
              ${isDragging ? 'z-[100] opacity-100 shadow-lg shadow-black/15 ring-2 ring-primary/40 dark:shadow-black/40' : ''}
              ${isDone && !isDragging && isHovered && isDesktop ? 'bg-accent/50' : ''}
              cursor-pointer
            `}
            // Note: We are using 'style' prop for x motion value to avoid re-renders
            // combined with the style object above, so we pass x via the style prop on the motion component directly
            onClick={handleCardClick}
          >
            {/* Glow Animation Overlay */}
            {isGlowActive && !isDone && (
              <div
                className="absolute inset-0 z-0 pointer-events-none bg-gradient-to-r from-transparent via-primary/10 to-transparent animate-shimmer"
                style={{ backgroundSize: '200% 100%' }}
              />
            )}

            {/* Visual grab affordance. The full row remains the sortable
                activator so vertical movement is measured correctly. */}
            <div
              aria-hidden="true"
              className={`relative z-10 -ml-1 flex w-5 flex-shrink-0 items-center justify-center self-stretch transition-colors ${isDone ? 'text-muted-foreground/20' : isDragging ? 'text-primary' : 'text-muted-foreground/40 md:group-hover:text-primary/70'}`}
            >
              <EllipsisVertical className="h-4 w-4 md:h-[18px] md:w-[18px]" />
            </div>

            {/* Content — clicking the row toggles completion */}
            <div
              className={`relative z-10 min-w-0 flex-1 transition-opacity duration-200 ${isDone && !isDragging ? 'opacity-60' : 'opacity-100'}`}
            >
                {( (task.tags && task.tags.length > 0) || task.startTime ) && (
                  <div className="flex flex-wrap gap-1 mb-1">
                    <AnimatePresence mode="popLayout">
                      {task.startTime && (
                        <motion.span
                          initial={false}
                          exit={{ opacity: 0, scale: 0 }}
                          key="task-time-tag"
                          className="inline-flex"
                        >
                          <TimeTag
                            startTime={task.startTime}
                            endTime={task.endTime}
                            reminder={task.reminder}
                            overdue={(() => {
                              if (isDone) return false;
                              const ref = task.endTime || task.startTime;
                              const [h, m] = ref.split(':').map(Number);
                              if (!Number.isFinite(h)) return false;
                              const now = new Date();
                              return (
                                now.getHours() * 60 + now.getMinutes() >
                                h * 60 + (m || 0)
                              );
                            })()}
                          />
                        </motion.span>
                      )}
                      {task.tags?.map((tagId) => {
                        const tagDetails = getTagDetails(tagId);
                        if (!tagDetails) return null;

                        const color = tagDetails.color;
                        const name = tagDetails.name;

                        return (
                          <motion.span
                            initial={false}
                            exit={{ opacity: 0, scale: 0 }}
                            transition={{ duration: 0.2 }}
                            key={tagId}
                            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-normal shadow-sm transition-colors ${
                              !color
                                ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-200 border-indigo-100 dark:border-indigo-800/50'
                                : 'tag-chip'
                            }`}
                            style={
                              color
                                ? ({
                                    backgroundColor: `${color}20`,
                                    borderColor: `${color}40`,
                                    '--tag-color': color,
                                  } as React.CSSProperties)
                                : undefined
                            }
                          >
                            {name}
                          </motion.span>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                )}
                <span className="flex flex-wrap items-center gap-1.5">
                  <motion.span
                    className={`text-[15px] font-semibold leading-snug break-words line-through decoration-2 transition-[color,text-decoration-color] duration-300 md:text-[17px] ${
                      isDone
                        ? 'text-muted-foreground decoration-current'
                        : 'text-foreground decoration-transparent'
                    }`}
                    animate={{
                      opacity: isDone ? 0.8 : 1,
                    }}
                    transition={{ duration: 0.2 }}
                  >
                    {task.text}
                  </motion.span>
                  {isWeekly && (
                    <Icon name="repeat" label="Repeating" className="w-5 h-5 flex-shrink-0" />
                  )}
                  {isWeekly && (task.streak ?? 0) > 0 && (
                    <span
                      className={`inline-flex flex-shrink-0 items-center gap-0.5 no-underline ${
                        isDone ? 'text-orange-500' : 'text-orange-400/80'
                      }`}
                      title={
                        isDone
                          ? `${task.streak} in a row`
                          : `${task.streak} in a row — finish today to keep it`
                      }
                    >
                      <Flame
                        className={`h-4 w-4 ${isDone ? '' : 'motion-safe:animate-pulse'}`}
                        fill={isDone ? 'currentColor' : 'none'}
                      />
                      <span className="text-[12px] font-black tabular-nums leading-none">
                        ×{task.streak}
                      </span>
                    </span>
                  )}
                  <BuddyBadge
                    taskId={task.id}
                    date={new Intl.DateTimeFormat('en-CA').format(new Date())}
                  />
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
                          const done = task.checklist.filter(
                            (c) => c.done,
                          ).length;
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
                </span>
                
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

            {isDesktop && !isDone && (onStartTimer || secondaryAction) && (
              <div
                className={`relative z-10 hidden flex-shrink-0 items-center gap-0.5 md:flex transition-opacity duration-150 ${
                  isHovered && !isDragging
                    ? 'opacity-100'
                    : 'pointer-events-none opacity-0'
                }`}
              >
                {onStartTimer && (
                  <button
                    type="button"
                    title="Start focus timer"
                    aria-label={`Start focus timer for ${task.text}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={handleTimerAction}
                    className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground/60 transition-colors hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400"
                  >
                    <Icon name="clock" className="h-6 w-6" />
                  </button>
                )}
                {secondaryAction && (
                  <button
                    type="button"
                    title={secondaryLabel}
                    aria-label={
                      isRepeating
                        ? `Skip ${task.text} today`
                        : `Save ${task.text} for later`
                    }
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={handleSecondaryAction}
                    className={`grid h-9 w-9 place-items-center rounded-full text-muted-foreground/60 transition-colors ${
                      isRepeating
                        ? 'hover:bg-muted hover:text-foreground'
                        : 'hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400'
                    }`}
                  >
                    {isRepeating ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Icon name="saved" className="h-5 w-5" />
                    )}
                  </button>
                )}
              </div>
            )}

            {/* Completion indicator (right) — only this toggles completion */}
            <div
              role="button"
              tabIndex={0}
              data-completion-target
              aria-label={isDone ? 'Mark not done' : 'Mark done'}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (
                  isExitingLater ||
                  isSwiping ||
                  isDraggingRef.current ||
                  hasActionTriggeredRef.current
                )
                  return;
                handleTaskToggle(task);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  handleTaskToggle(task);
                }
              }}
              className={`relative z-10 flex-shrink-0 w-11 h-11 md:w-12 md:h-12 cursor-pointer transition-[opacity,transform] duration-200 active:scale-90 ${isDone && !isDragging ? 'opacity-60' : 'opacity-100'}`}
            >
              <AnimatePresence initial={false}>
                {!isDone ? (
                  <motion.div
                    key="fly"
                    className="absolute inset-0"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                  >
                    {bulletContent ? (
                      bulletContent
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (
                            isExitingLater ||
                            isSwiping ||
                            isDraggingRef.current ||
                            hasActionTriggeredRef.current
                          )
                            return;
                          handleTaskToggle(task, true);
                        }}
                        className="flex items-center justify-center w-full h-full transition-colors text-muted-foreground/50 md:hover:text-primary"
                      >
                        <Circle className="w-9 h-9 md:w-10 md:h-10" />
                      </button>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="check"
                    className="absolute inset-0"
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.6 }}
                    transition={{
                      type: 'spring',
                      stiffness: 400,
                      damping: 25,
                    }}
                  >
                    <button
                      className="flex items-center justify-center w-full h-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTaskToggle(task, false);
                      }}
                    >
                      <CheckCircle2 className="text-green-500 w-9 h-9 drop-shadow-sm md:w-10 md:h-10" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      </motion.div>
    );
  },
);

function SortableSectionHeader({
  section,
  count,
  doneCount,
  isFirst,
  onToggleCollapsed,
  onRename,
  onDelete,
}: {
  section: TaskListSection;
  count: number;
  doneCount: number;
  isFirst: boolean;
  onToggleCollapsed: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sectionSortableId(section.id),
    animateLayoutChanges,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const closeMenu = () => setMenuOpen(false);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('resize', closeMenu);
    return () => {
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('resize', closeMenu);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (renaming) {
      renameRef.current?.focus();
      renameRef.current?.select();
    }
  }, [renaming]);

  const commitRename = () => {
    const next = renameRef.current?.value.trim();
    setRenaming(false);
    if (next && next !== section.name) onRename(next);
  };

  // dnd-kit's Mouse/Touch sensors listen on mousedown/touchstart (not
  // pointerdown), so interactive children must stop those to avoid the held
  // tap being captured as a drag that swallows their click.
  const stopDndActivation = {
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
    onTouchStart: (e: React.TouchEvent) => e.stopPropagation(),
  };

  const remaining = count - doneCount;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 30 : menuOpen ? 40 : 1,
      }}
      data-is-active="true"
      data-section-header="true"
      className={`relative w-full select-none ${isFirst ? 'mt-1' : 'mt-3'} mb-1.5 ${
        isDragging ? 'opacity-90' : ''
      }`}
    >
      <div
        {...attributes}
        {...(renaming ? {} : listeners)}
        onClick={renaming ? undefined : onToggleCollapsed}
        className={`group flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-xl px-1.5 py-1 transition-colors ${
          isDragging ? 'bg-popover shadow-md ring-1 ring-border/70' : ''
        }`}
      >
        <motion.span
          initial={false}
          animate={{ rotate: section.collapsed ? -90 : 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="grid h-7 w-7 shrink-0 place-items-center text-muted-foreground/70"
        >
          <ChevronDown className="h-4 w-4" strokeWidth={2.75} />
        </motion.span>

        {renaming ? (
          <input
            ref={renameRef}
            defaultValue={section.name}
            maxLength={60}
            {...stopDndActivation}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitRename();
              } else if (e.key === 'Escape') {
                setRenaming(false);
              }
            }}
            className="min-w-0 flex-1 bg-transparent text-[13px] font-black uppercase tracking-[0.12em] text-foreground focus:outline-none"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-[13px] font-black uppercase tracking-[0.12em] text-muted-foreground">
            {section.name}
          </span>
        )}

        {count > 0 && !renaming && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums leading-none ${
              remaining === 0
                ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {remaining === 0 ? '✓' : remaining}
          </span>
        )}

        {!renaming && !section.collapsed && (
          <button
            type="button"
            aria-label={`Section options for ${section.name}`}
            {...stopDndActivation}
            onClick={(e) => {
              e.stopPropagation();
              if (menuOpen) {
                setMenuOpen(false);
                return;
              }
              const rect = e.currentTarget.getBoundingClientRect();
              const menuWidth = 176;
              const menuHeight = 96;
              const viewportPadding = 8;
              const left = Math.max(
                viewportPadding,
                Math.min(
                  rect.right - menuWidth,
                  window.innerWidth - menuWidth - viewportPadding,
                ),
              );
              const opensDown =
                rect.bottom + 4 + menuHeight <=
                window.innerHeight - viewportPadding;
              const top = opensDown
                ? rect.bottom + 4
                : Math.max(viewportPadding, rect.top - menuHeight - 4);
              setMenuPosition({ top, left });
              setMenuOpen(true);
            }}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground/50 transition-colors [@media(hover:hover)]:hover:bg-muted [@media(hover:hover)]:hover:text-foreground"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </div>

      {menuOpen &&
        menuPosition &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[9998]"
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onPointerDown={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
              }}
            />
            <div
              className="fixed z-[9999] w-44 overflow-hidden rounded-2xl border border-border/70 bg-popover py-1 shadow-lg"
              style={{ top: menuPosition.top, left: menuPosition.left }}
            >
              <button
                type="button"
                {...stopDndActivation}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  setRenaming(true);
                }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[14px] font-bold text-foreground transition-colors [@media(hover:hover)]:hover:bg-muted/60"
              >
                <Pencil className="h-4 w-4 text-muted-foreground" />
                Rename
              </button>
              <button
                type="button"
                {...stopDndActivation}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onDelete();
                }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[14px] font-bold text-rose-500 transition-colors [@media(hover:hover)]:hover:bg-rose-500/10"
              >
                <Trash2 className="h-4 w-4" />
                Delete section
              </button>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}

function AddSectionRow({
  onCreate,
  disabled,
}: {
  onCreate: (name: string) => void;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    const name = inputRef.current?.value.trim();
    setEditing(false);
    if (name) onCreate(name);
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={disabled}
        className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] font-bold text-muted-foreground/60 transition-colors [@media(hover:hover)]:hover:text-foreground disabled:pointer-events-none"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.75} />
        New section
      </button>
    );
  }

  return (
    <div className="mt-1 flex items-center gap-1.5 rounded-xl border border-dashed border-muted-foreground/25 bg-muted/10 px-2.5 py-1">
      <span className="grid h-7 w-7 shrink-0 place-items-center text-muted-foreground/70">
        <ChevronDown className="h-4 w-4" strokeWidth={2.75} />
      </span>
      <input
        ref={inputRef}
        maxLength={60}
        placeholder="Section name"
        enterKeyHint="done"
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            if (inputRef.current) inputRef.current.value = '';
            setEditing(false);
          }
        }}
        className="min-w-0 flex-1 bg-transparent py-1.5 text-[16px] font-black uppercase tracking-[0.12em] text-foreground placeholder:font-bold placeholder:normal-case placeholder:tracking-normal placeholder:text-muted-foreground/50 focus:outline-none"
      />
    </div>
  );
}

function EmptyAddRow({
  label,
  quickAddOpen,
  onClick,
}: {
  label: string;
  quickAddOpen: boolean;
  onClick: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: quickAddOpen ? 0 : 1 }}
      transition={{ duration: quickAddOpen ? 0 : 0.5 }}
      className="mb-2"
    >
      <button
        onClick={onClick}
        className="w-full flex items-center gap-1.5 px-2 py-2 border border-dashed border-muted-foreground/20 bg-muted/5 hover:bg-muted/10 rounded-xl transition-all cursor-pointer group disabled:pointer-events-none"
        disabled={quickAddOpen}
      >
        <div className="flex items-center justify-center w-11 h-11 rounded-full bg-muted border border-muted-foreground/10 shrink-0 md:w-12 md:h-12">
          <Plus
            className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors md:w-6 md:h-6"
            strokeWidth={2.5}
          />
        </div>
        <p className="text-[15px] font-semibold text-muted-foreground group-hover:text-foreground transition-colors md:text-[17px]">
          {label}
        </p>
      </button>
    </motion.div>
  );
}

export default function TaskList({
  tasks,
  toggle,
  showConfetti,
  renderBullet,
  visuallyCompleted,
  onAddRequested,
  weeklyIds = new Set<string>(),
  onDeleteToday,
  onDeleteFromWeek,
  onDoLater,
  onReorder,
  onToggleRepeat,
  onEditTask,
  onScheduleTask,
  onStartTimer,
  onUpdateDetails,
  onSetRepeat,
  onUpdateTags,
  onDuplicate,
  pendingToToday,
  tags,
  showCompleted,
  selectedTags,
  onSetSelectedTags,
  isGuest,
  isGlowActive,
  isFrozen = false,
  quickAddOpen = false,
  paused = false,
  sections = [],
  onCreateSection,
  onRenameSection,
  onDeleteSection,
  onSetSectionCollapsed,
  onReorderSections,
}: {
  tasks: Task[];
  toggle: (id: string, completed?: boolean) => void;
  showConfetti: boolean;
  renderBullet?: (task: Task, isVisuallyDone: boolean, paused: boolean) => React.ReactNode;
  visuallyCompleted?: Set<string>;
  onAddRequested: (
    prefill: string,
    insertAfterIndex: number | null,
    opts?: { preselectToday?: boolean },
  ) => void;

  weeklyIds?: Set<string>;
  onDeleteToday: (taskId: string) => Promise<void> | void;
  onDeleteFromWeek: (taskId: string) => Promise<void> | void;
  onDoLater?: (taskId: string) => Promise<void> | void;
  onReorder?: (tasks: Task[]) => void;
  onToggleRepeat?: (taskId: string) => Promise<void> | void;
  onEditTask?: (
    taskId: string,
    newText: string,
    scope?: 'one' | 'all',
  ) => Promise<void> | void;
  onScheduleTask?: (
    taskId: string,
    data: { startTime: string; endTime: string; reminder: string },
    scope?: 'one' | 'all',
  ) => Promise<void> | void;
  onStartTimer?: (task: { id: string; text: string; completed: boolean; tags?: string[]; frogodoroSession?: Task['frogodoroSession']; frogodoroSettings?: Record<string, unknown> }, opts?: { autoStart?: boolean }) => void;
  onUpdateDetails?: (
    taskId: string,
    details: { notes?: string; checklist?: { id: string; text: string; done: boolean }[] },
  ) => void;
  onSetRepeat?: (
    taskId: string,
    mode:
      | 'none'
      | 'daily'
      | 'weekdays'
      | 'weekend'
      | 'weekly'
      | 'monthly'
      | 'custom',
    dayOfWeek?: number,
    endDate?: string | null,
    rule?: import('@/components/ui/quick-add/utils').RepeatRule | null,
  ) => void;
  onUpdateTags?: (
    taskId: string,
    tags: string[],
    scope?: 'one' | 'all',
  ) => void;
  onDuplicate?: (taskId: string, when: 'today' | 'tomorrow') => void;
  pendingToToday?: number;
  tags?: { id: string; name: string; color: string }[];
  showCompleted: boolean;
  selectedTags: string[];
  onSetSelectedTags: (tags: string[]) => void;
  isGuest?: boolean;
  isGlowActive?: boolean;
  /** When true the current sort order is frozen (prevents layout shifts during tongue animation) */
  isFrozen?: boolean;
  quickAddOpen?: boolean;
  paused?: boolean;
  sections?: TaskListSection[];
  onCreateSection?: (name: string) => void;
  onRenameSection?: (sectionId: string, name: string) => void;
  onDeleteSection?: (sectionId: string) => void;
  onSetSectionCollapsed?: (sectionId: string, collapsed: boolean) => void;
  onReorderSections?: (orderedIds: string[]) => void;
}) {
  const router = useRouter(); // Import might be needed if not present
  const userTags = tags || [];

  const getTagDetails = (tagIdentifier: string) => {
    // Try to find by ID first
    const byId = userTags.find((t) => t.id === tagIdentifier);
    if (byId) return byId;
    // Fallback: try to find by Name
    return userTags.find((t) => t.name === tagIdentifier);
  };

  const vSet = visuallyCompleted ?? new Set<string>();

  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<{
    id: string;
    top: number;
    left: number;
  } | null>(null);
  const [exitAction, setExitAction] = useState<{
    id: string;
    type: 'later';
  } | null>(null);
  const [dialog, setDialog] = useState<{
    task: Task;
    kind: 'regular' | 'weekly' | 'backlog' | 'edit';
  } | null>(null);

  const [actionSheetId, setActionSheetId] = useState<string | null>(null);
  // When editing a field on a repeating task we ask "this / all repeats" first.
  const [pendingScope, setPendingScope] = useState<{
    run: (scope: 'one' | 'all') => void;
  } | null>(null);

  // Run a scoped edit immediately for a one-off task, or ask first when the
  // task belongs to a repeat group.
  const maybeScoped = (
    isGrouped: boolean,
    run: (scope: 'one' | 'all') => void,
  ) => {
    if (isGrouped) setPendingScope({ run });
    else run('one');
  };
  const [scheduleDialog, setScheduleDialog] = useState<{
    task: Task;
  } | null>(null);

  const [tagPopup, setTagPopup] = useState<{
    open: boolean;
    taskId: string | null;
  }>({ open: false, taskId: null });

  const [delayedCompleted, setDelayedCompleted] = useState<Set<string>>(
    new Set(),
  );
  const [undoToast, setUndoToast] = useState<{
    id: string;
    text: string;
  } | null>(null);
  const undoTimerRef = useRef<number | null>(null);
  const prevCompletedRef = useRef<Map<string, boolean> | null>(null);

  // Any completion — checkmark tap, fly catch, detail sheet — surfaces a
  // transient Undo toast, keyed off the task actually flipping to done.
  useEffect(() => {
    const prev = prevCompletedRef.current;
    prevCompletedRef.current = new Map(tasks.map((t) => [t.id, !!t.completed]));
    if (!prev) return;
    const flipped = tasks.find(
      (t) => t.completed && prev.get(t.id) === false,
    );
    if (!flipped) return;
    setUndoToast({ id: flipped.id, text: flipped.text });
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    undoTimerRef.current = window.setTimeout(() => setUndoToast(null), 4000);
  }, [tasks]);

  useEffect(
    () => () => {
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    },
    [],
  );

  const handleUndoComplete = () => {
    if (!undoToast) return;
    hapticTick();
    const id = undoToast.id;
    setUndoToast(null);
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    setDelayedCompleted((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    toggle(id, false);
  };
  const [isAnyDragging, setIsAnyDragging] = useState(false);
  const [draggingSectionId, setDraggingSectionId] = useState<string | null>(
    null,
  );
  const expandTimerRef = useRef<number | null>(null);
  const clearDraggingSection = (delayMs = 0) => {
    if (expandTimerRef.current !== null) {
      window.clearTimeout(expandTimerRef.current);
      expandTimerRef.current = null;
    }
    if (delayMs <= 0) {
      setDraggingSectionId(null);
      return;
    }
    expandTimerRef.current = window.setTimeout(() => {
      expandTimerRef.current = null;
      setDraggingSectionId(null);
    }, delayMs);
  };
  useEffect(
    () => () => {
      if (expandTimerRef.current !== null)
        window.clearTimeout(expandTimerRef.current);
    },
    [],
  );
  const activeAreaLimitsRef = React.useRef<{
    top: number;
    bottom: number;
  } | null>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isAnyDragging) {
      document.documentElement.classList.add('dragging');

      // Lock the scroll aggressively for the current gesture
      const handleTouchMove = (e: TouchEvent) => {
        if (e.cancelable) e.preventDefault();
      };

      window.addEventListener('touchmove', handleTouchMove, { passive: false });

      return () => {
        document.documentElement.classList.remove('dragging');
        window.removeEventListener('touchmove', handleTouchMove);
      };
    }
  }, [isAnyDragging]);

  const [usesSwipeTrays, setUsesSwipeTrays] = useState(false);
  React.useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setUsesSwipeTrays(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const [, setMinuteTick] = useState(0);
  React.useEffect(() => {
    const id = window.setInterval(() => setMinuteTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'n' && e.key !== '/') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (quickAddOpen || dialog || actionSheetId || menu || scheduleDialog)
        return;
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.isContentEditable)
      )
        return;
      e.preventDefault();
      onAddRequested('', null, { preselectToday: true });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [quickAddOpen, dialog, actionSheetId, menu, scheduleDialog, onAddRequested]);

  // On desktop this matches Planner's 5px mouse pickup. Touch and narrow
  // layouts require a deliberate hold so a regular tap never enters the
  // reorder state, while horizontal task swipes remain available.
  const mouseOptions = useMemo(
    () => ({
      activationConstraint: usesSwipeTrays
        ? { delay: 250, tolerance: 8 }
        : { distance: 5 },
    }),
    [usesSwipeTrays],
  );
  const touchOptions = useMemo(
    () => ({ activationConstraint: { delay: 250, tolerance: 8 } }),
    [],
  );
  // Space picks up / drops a row for keyboard sorting; Enter stays free so a
  // focused row can open its detail sheet.
  const keyboardOptions = useMemo(
    () => ({
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: {
        start: ['Space'],
        cancel: ['Escape'],
        end: ['Space'],
      },
    }),
    [],
  );
  const sensors = useSensors(
    useSensor(MouseSensor, mouseOptions),
    useSensor(TouchSensor, touchOptions),
    useSensor(KeyboardSensor, keyboardOptions),
  );

  // Listen for other menus opening to auto-close this one
  React.useEffect(() => {
    const closeIfOther = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      setMenu((curr) => (curr && curr.id !== id ? null : curr));
    };

    const handleDeleteRequest = (e: Event) => {
      if (isGuest) {
        router.push('/login');
        return;
      }
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      const task = tasks.find((t) => t.id === id);
      if (task) {
        setDialog({ task, kind: taskKind(task) });
        setMenu(null); // Close any open menu
      }
    };

    window.addEventListener('task-menu-open', closeIfOther as EventListener);
    window.addEventListener(
      'task-delete-request',
      handleDeleteRequest as EventListener,
    );

    return () => {
      window.removeEventListener(
        'task-menu-open',
        closeIfOther as EventListener,
      );
      window.removeEventListener(
        'task-delete-request',
        handleDeleteRequest as EventListener,
      );
    };
  }, [tasks]); // Added tasks dependency to find task

  const handleTagSave = async (
    taskId: string,
    newTags: string[],
    scope: 'one' | 'all' = 'one',
  ) => {
    try {
      await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, tags: newTags, scope }),
      });

      window.dispatchEvent(new Event('tags-updated'));
    } catch (e) {
      console.error('Failed to update tags', e);
    }
  };

  const taskKind = (t: Task) => {
    const sourceType = t.type ?? t.origin ?? t.kind;
    if (sourceType === 'weekly') return 'weekly';
    if (sourceType === 'backlog') return 'backlog';
    if (sourceType === 'regular') return 'regular';
    return weeklyIds.has(t.id) ? 'weekly' : 'regular';
  };

  const confirmDeleteToday = async () => {
    if (!dialog) return;
    const taskId = dialog.task.id;
    setBusy(true);
    try {
      await onDeleteToday(taskId);
      setDialog(null);
      setMenu(null);
    } finally {
      setBusy(false);
    }
  };

  const confirmDeleteWeek = async () => {
    if (!dialog) return;
    const taskId = dialog.task.id;
    setBusy(true);
    try {
      await onDeleteFromWeek(taskId);
      setDialog(null);
      setMenu(null);
    } finally {
      setBusy(false);
    }
  };

  const dialogVariant: 'regular' | 'weekly' | 'backlog' | 'edit' = dialog
    ? dialog.kind === 'edit'
      ? 'edit'
      : taskKind(dialog.task)
    : 'regular';

  const handleTaskToggle = (
    task: Task,
    forceState?: boolean,
    skipDelay?: boolean,
  ) => {
    const isCompleting =
      forceState === true || (forceState === undefined && !task.completed);

    if (isCompleting) hapticSuccess();
    else hapticTick();

    if (isCompleting) {
      if (!skipDelay) {
        setDelayedCompleted((prev) => new Set(prev).add(task.id));
        setTimeout(() => {
          setDelayedCompleted((prev) => {
            const next = new Set(prev);
            next.delete(task.id);
            return next;
          });
        }, 3000);
      }
    }

    toggle(task.id, forceState);
  };

  // Determine visible tasks
  const visibleTasks = tasks.filter((t) => {
    const isTemporarilyVisible = delayedCompleted.has(t.id);
    const isActuallyCompleted =
      t.completed && !vSet.has(t.id) && !isTemporarilyVisible;

    // 1. Completion Filter
    if (isActuallyCompleted && !showCompleted) return false;

    // 2. Tag Filter
    if (selectedTags.length > 0) {
      const tTags = t.tags || [];
      // If task has NO tags, but we selected some, hide it? Or show if partial match?
      // Usually filtering by tags means "Show tasks that have at least one of these tags" OR "All of these tags".
      // Let's assume "Has ANY of the selected tags".
      const hasMatch = tTags.some((tagId) => selectedTags.includes(tagId));
      if (!hasMatch) return false;
    }

    return true;
  });

  // Helper: is this task truly completed (not in grace period, not visually uncompleted)
  const isTaskSettledCompleted = (t: Task) =>
    t.completed && !vSet.has(t.id) && !delayedCompleted.has(t.id);

  // Split into two groups: active (including grace-period tasks) and completed
  const activeTasks = visibleTasks
    .filter((t) => !isTaskSettledCompleted(t))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const completedTasks = visibleTasks
    .filter((t) => isTaskSettledCompleted(t))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  // ---- Freeze sort order during tongue animation to prevent layout shifts ----
  const frozenOrderRef = useRef<string[]>([]);
  if (!isFrozen) {
    frozenOrderRef.current = activeTasks.map((t) => t.id);
  }

  const sortedActiveTasks = isFrozen
    ? (() => {
        const taskMap = new Map(activeTasks.map((t) => [t.id, t]));
        const ordered: Task[] = [];
        const placed = new Set<string>();
        for (const id of frozenOrderRef.current) {
          const t = taskMap.get(id);
          if (t) {
            ordered.push(t);
            placed.add(id);
          }
        }
        for (const t of activeTasks) {
          if (!placed.has(t.id)) ordered.push(t);
        }
        return ordered;
      })()
    : activeTasks;

  // Combined for DnD context and empty-state checks
  const sortedVisibleTasks = [...sortedActiveTasks, ...completedTasks];

  // ---- Sections: group active tasks under their headers ----
  // Unsectioned tasks first (no header), then each section in order. Completed
  // tasks keep sinking to the single bottom pile regardless of section.
  const sectionsSorted = [...sections].sort((a, b) => a.order - b.order);
  const hasSections = sectionsSorted.length > 0;
  const knownSectionIds = new Set(sectionsSorted.map((s) => s.id));
  const rows: ListRow[] = (() => {
    if (!hasSections)
      return sortedActiveTasks.map((t) => ({ kind: 'task' as const, task: t }));
    const bySection = new Map<string | null, Task[]>();
    for (const t of sortedActiveTasks) {
      const key =
        t.sectionId && knownSectionIds.has(t.sectionId) ? t.sectionId : null;
      const list = bySection.get(key);
      if (list) list.push(t);
      else bySection.set(key, [t]);
    }
    const doneBySection = new Map<string, number>();
    for (const t of completedTasks) {
      if (t.sectionId && knownSectionIds.has(t.sectionId))
        doneBySection.set(
          t.sectionId,
          (doneBySection.get(t.sectionId) ?? 0) + 1,
        );
    }
    const out: ListRow[] = (bySection.get(null) ?? []).map((t) => ({
      kind: 'task' as const,
      task: t,
    }));
    for (const s of sectionsSorted) {
      const secTasks = bySection.get(s.id) ?? [];
      const done = doneBySection.get(s.id) ?? 0;
      out.push({
        kind: 'header',
        section: s,
        count: secTasks.length + done,
        doneCount: done,
      });
      if (!s.collapsed && draggingSectionId === null)
        for (const t of secTasks) out.push({ kind: 'task', task: t });
    }
    return out;
  })();
  const rowIds = rows.map((r) =>
    r.kind === 'task' ? r.task.id : sectionSortableId(r.section.id),
  );
  // While a header is being dragged, only headers participate in sorting —
  // unsectioned tasks stay frozen in place instead of shifting around it.
  const activeTaskIds =
    draggingSectionId !== null
      ? rowIds.filter((id) => sectionIdFromSortable(id) !== null)
      : rowIds;
  const allTasksCompleted =
    tasks.length > 0 && tasks.every((task) => task.completed);

  // We no longer need a separate completedTasks array for rendering elsewhere.
  const completedCount = tasks.filter(
    (t) => t.completed && !vSet.has(t.id) && !delayedCompleted.has(t.id),
  ).length;

  const handleDragStart = (event: DragStartEvent) => {
    hapticImpact();
    lastDragOverIdRef.current = null;
    setIsAnyDragging(true);
    // Grabbing a header tucks every section down to its bare header row so
    // sections reorder as whole blocks; they re-expand on drop.
    const grabbedSectionId = sectionIdFromSortable(event.active.id);
    if (expandTimerRef.current !== null) {
      window.clearTimeout(expandTimerRef.current);
      expandTimerRef.current = null;
    }
    setDraggingSectionId(grabbedSectionId);
    computeActiveAreaLimits(grabbedSectionId !== null);
  };

  // Boundary for the drag corridor. Header drags are confined to the header
  // stack (a section can never sit between unsectioned tasks). popLayout-
  // exiting rows are position: absolute at their old spot while they fade —
  // they must not count, or the corridor stays sized to the pre-collapse
  // layout.
  const computeActiveAreaLimits = (headersOnly = false) => {
    const activeNodes = Array.from(
      document.querySelectorAll(
        headersOnly ? '[data-section-header="true"]' : '[data-is-active="true"]',
      ),
    ).filter((n) => getComputedStyle(n as HTMLElement).position !== 'absolute');
    const container = scrollContainerRef.current;

    if (activeNodes.length > 0 && container) {
      const containerRect = container.getBoundingClientRect();
      const rects = activeNodes.map((n) => n.getBoundingClientRect());

      // Calculate limits relative to the container's *content* top
      // We add scrollTop because we want the position relative to the start of the scrollable content
      const top = Math.min(
        ...rects.map((r) => r.top - containerRect.top + container.scrollTop),
      );
      const bottom = Math.max(
        ...rects.map((r) => r.bottom - containerRect.top + container.scrollTop),
      );

      activeAreaLimitsRef.current = { top, bottom };
    } else {
      activeAreaLimitsRef.current = null;
    }
  };

  // The tuck-in happens on the render *after* drag start, so the corridor
  // measured at drag start spans the old expanded list — remeasure once the
  // compact layout is in and again when the exit fades finish.
  useEffect(() => {
    if (draggingSectionId === null) return;
    const remeasure = () => computeActiveAreaLimits(true);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(remeasure);
    });
    const settle = window.setTimeout(remeasure, 260);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(settle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingSectionId]);

  const handleDragCancel = () => {
    setIsAnyDragging(false);
    clearDraggingSection();
    activeAreaLimitsRef.current = null;
  };

  const lastDragOverIdRef = useRef<string | number | null>(null);
  const handleDragOver = (event: DragOverEvent) => {
    const overId = event.over?.id;
    if (
      overId != null &&
      overId !== event.active.id &&
      overId !== lastDragOverIdRef.current
    ) {
      lastDragOverIdRef.current = overId;
      hapticTick();
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setIsAnyDragging(false);
    activeAreaLimitsRef.current = null;
    const { active, over } = event;

    const activeSectionId = sectionIdFromSortable(active.id);

    // A held tap on a task can activate the delay-based sort sensor without
    // movement, and dnd-kit then swallows the detail-sheet click. Section
    // headers have a dedicated reorder handle, so a stationary handle release
    // should do nothing rather than toggling the section.
    if (
      Math.abs(event.delta.x) < 5 &&
      Math.abs(event.delta.y) < 5 &&
      typeof active.id === 'string'
    ) {
      clearDraggingSection();
      if (!activeSectionId) {
        setActionSheetId(active.id);
      }
      return;
    }

    if (!over || active.id === over.id) {
      clearDraggingSection();
      return;
    }

    const oldIndex = rowIds.indexOf(String(active.id));
    const newIndex = rowIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
      clearDraggingSection();
      return;
    }

    // Dragging a section header reorders sections; tasks follow their section
    // by id, so only the header order needs persisting. The sections stay
    // tucked until the drop transition finishes settling the header into its
    // compact slot — expanding at the same instant moves the target under it
    // and reads as a bounce.
    if (activeSectionId) {
      if (!onReorderSections) {
        clearDraggingSection();
        return;
      }
      const movedIds = arrayMove(rowIds, oldIndex, newIndex);
      const orderedSectionIds = movedIds
        .map((id) => sectionIdFromSortable(id))
        .filter((id): id is string => !!id);
      hapticTick();
      onReorderSections(orderedSectionIds);
      clearDraggingSection(280);
      return;
    }

    if (!onReorder) return;

    // Dragging a task: recompute its position AND its section from where it
    // landed — every task belongs to the header above it (none = unsectioned).
    const movedRows = arrayMove(rows, oldIndex, newIndex);
    let currentSection: string | null = null;
    const reorderedActive: Task[] = [];
    const sectionByTaskId = new Map<string, string | null>();
    for (const row of movedRows) {
      if (row.kind === 'header') {
        currentSection = row.section.id;
        continue;
      }
      sectionByTaskId.set(row.task.id, currentSection);
      reorderedActive.push({ ...row.task, sectionId: currentSection });
    }
    // Tasks hidden inside collapsed sections aren't in `rows`; keep them in
    // place (after their section's visible block) with their section intact.
    const placedIds = new Set(reorderedActive.map((t) => t.id));
    const collapsedTasks = sortedActiveTasks.filter((t) => !placedIds.has(t.id));

    // Rebuild full list: reordered active + collapsed + completed + hidden
    const activeIds = new Set(sortedActiveTasks.map((t) => t.id));
    const completedIds = new Set(completedTasks.map((t) => t.id));
    const hiddenTasks = tasks.filter(
      (t) => !activeIds.has(t.id) && !completedIds.has(t.id),
    );

    const finalOrder = [
      ...reorderedActive,
      ...collapsedTasks,
      ...completedTasks,
      ...hiddenTasks,
    ];
    hapticTick();
    onReorder(finalOrder);
  };

  const openMenu = (e: React.MouseEvent<HTMLButtonElement>, task: Task) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const id = `task:${task.id}`;
    window.dispatchEvent(
      new CustomEvent('task-menu-open', {
        detail: { id },
      }),
    );

    setMenu((prev) => {
      if (prev?.id === task.id) return null;
      const MENU_W = 160;
      const MENU_H = 80;
      const GAP = 8;
      const MARGIN = 10;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let left = rect.left + rect.width / 2 - MENU_W / 2;
      left = Math.max(MARGIN, Math.min(left, vw - MENU_W - MARGIN));

      let top = rect.bottom + GAP;
      if (top + MENU_H > vh - MARGIN) {
        top = rect.top - MENU_H - GAP;
      }
      return { id: task.id, top, left };
    });
  };

  const restrictToActiveArea: Modifier = ({ transform, draggingNodeRect }) => {
    const limits = activeAreaLimitsRef.current;
    const container = scrollContainerRef.current;

    // Apply parent restriction first
    const parentRestricted = restrictToParentElement({
      transform,
      draggingNodeRect,
    } as any);
    const verticalRestricted = restrictToVerticalAxis({
      transform: parentRestricted,
      draggingNodeRect,
    } as any);

    if (limits !== null && draggingNodeRect && container) {
      const containerRect = container.getBoundingClientRect();
      const currentScrollTop = container.scrollTop;

      // Calculate absolute viewport boundaries for the active area based on current scroll
      const limitTop = containerRect.top - currentScrollTop + limits.top;
      const limitBottom = containerRect.top - currentScrollTop + limits.bottom;

      let newY = verticalRestricted.y;

      // Bottom restriction
      const currentBottom = draggingNodeRect.bottom + newY;
      if (currentBottom > limitBottom) {
        newY = limitBottom - draggingNodeRect.bottom;
      }

      // Top restriction
      const currentTop = draggingNodeRect.top + newY;
      if (currentTop < limitTop) {
        newY = limitTop - draggingNodeRect.top;
      }

      return {
        ...verticalRestricted,
        y: newY,
      };
    }
    return verticalRestricted;
  };
  return (
    <>
      <div dir="ltr" className="w-full px-1.5 pt-0 pb-3 overflow-visible md:px-4">
        <div className="flex flex-row items-center justify-end mb-2 gap-3 relative">
          {tasks.length > 0 && (
            <span
              aria-live="polite"
              className="text-[11px] font-bold tabular-nums text-muted-foreground/70"
            >
              {tasks.filter((t) => t.completed).length} of {tasks.length} done
            </span>
          )}
        </div>

        <div
          className="w-full rounded-[18px] bg-[hsl(150_12%_94%)] dark:bg-background border border-border/50 shadow-sm overflow-hidden"
          data-hint="task-list"
        >
        <div
          className={`p-1.5 pb-0 space-y-0 overflow-y-visible md:p-2 md:pb-0 ${exitAction ? 'overflow-x-visible' : 'overflow-x-hidden'}`}
          ref={scrollContainerRef}
        >
          {tasks.length === 0 && !exitAction ? (
            /* Empty State: No Tasks at all */
            <EmptyAddRow
              label="Add your first task"
              quickAddOpen={quickAddOpen}
              onClick={() => onAddRequested('', null, { preselectToday: true })}
            />
          ) : tasks.length > 0 &&
            sortedVisibleTasks.length === 0 &&
            !exitAction ? (
            /* Empty State: Tasks exist but all filtered/completed */
            allTasksCompleted && selectedTags.length === 0 ? (
              <div
                className={`fly-caught-enter relative mb-2 rounded-2xl border p-3 shadow-sm ${objectiveCardTone(
                  true,
                )} ${
                  quickAddOpen
                    ? 'opacity-0'
                    : 'opacity-100 transition-opacity duration-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-background shadow-sm ring-1 ring-primary/20">
                    <Fly size={30} y={-2} paused={paused} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-black leading-tight tracking-tight text-foreground">
                      Every fly caught!
                    </p>
                    <div
                      className="mt-1.5 flex items-center gap-[5px]"
                      aria-label={`${tasks.length} of ${tasks.length} tasks done`}
                    >
                      {Array.from({
                        length: Math.min(tasks.length, 12),
                      }).map((_, i) => (
                        <span
                          key={i}
                          className="belly-dot h-[7px] w-[7px] rounded-full bg-primary shadow-[0_0_6px_rgba(74,222,128,0.35)]"
                          style={{ animationDelay: `${120 + i * 50}ms` }}
                        />
                      ))}
                      {tasks.length > 12 && (
                        <span className="text-[10px] font-black leading-none text-primary">
                          +{tasks.length - 12}
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-[12px] font-semibold leading-snug text-muted-foreground">
                      Your frog is full and happy.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onAddRequested('', null, { preselectToday: true })
                    }
                    className="flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#4f9149] via-[#5ca355] to-[#4f9149] bg-[length:200%_100%] px-3.5 text-[13px] font-black text-white shadow-[0_3px_0_0_#34631f] transition-all hover:brightness-105 active:translate-y-[2px] active:shadow-none disabled:pointer-events-none disabled:opacity-0"
                    disabled={quickAddOpen}
                  >
                    <Plus className="h-4 w-4" strokeWidth={3.5} />
                    Add
                  </button>
                </div>
              </div>
            ) : (
              <EmptyAddRow
                label={
                  selectedTags.length > 0
                    ? 'No tasks match your filters'
                    : 'Add another task'
                }
                quickAddOpen={quickAddOpen}
                onClick={() =>
                  onAddRequested('', null, { preselectToday: true })
                }
              />
            )
          ) : (
            /* List Content */
            <DndContext
              sensors={sensors}
              collisionDetection={
                draggingSectionId !== null ? closestCenter : closestCorners
              }
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
              modifiers={[restrictToActiveArea]}
              measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
            >
              {/* Single list: finished tasks reorder to the bottom in place,
                  no separate section / fancy transition between groups. */}
              <div className="relative overflow-visible">
                <SortableContext
                  items={activeTaskIds}
                  strategy={verticalListSortingStrategy}
                >
                  <AnimatePresence initial={false} mode="popLayout">
                    {[
                      ...rows,
                      ...(completedTasks.length > 0
                        ? [{ kind: 'completed-divider' } as const]
                        : []),
                      ...completedTasks.map(
                        (task) => ({ kind: 'task', task }) as ListRow,
                      ),
                    ].map((row) => {
                      if (row.kind === 'completed-divider') {
                        return (
                          <div
                            key="completed-divider"
                            className="flex items-center gap-2 px-1.5 pb-1.5 pt-3"
                          >
                            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground/60">
                              Completed
                            </span>
                            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-black tabular-nums leading-none text-muted-foreground">
                              {completedTasks.length}
                            </span>
                            <span className="h-px flex-1 bg-border/60" />
                          </div>
                        );
                      }
                      if (row.kind === 'header') {
                        const s = row.section;
                        return (
                          <SortableSectionHeader
                            key={sectionSortableId(s.id)}
                            section={s}
                            count={row.count}
                            doneCount={row.doneCount}
                            isFirst={rows[0] === row}
                            onToggleCollapsed={() => {
                              hapticTick();
                              onSetSectionCollapsed?.(s.id, !s.collapsed);
                            }}
                            onRename={(name) => onRenameSection?.(s.id, name)}
                            onDelete={() => onDeleteSection?.(s.id)}
                          />
                        );
                      }
                      const task = row.task;
                      const isCompleted = task.completed || vSet.has(task.id);
                      const isHintPeekPrimary =
                        task.id ===
                        sortedVisibleTasks.find(
                          (t) => !(t.completed || vSet.has(t.id)),
                        )?.id;
                      const isMenuOpen = menu?.id === task.id;
                      const isExitingLater =
                        exitAction?.id === task.id &&
                        exitAction.type === 'later';

                      return (
                        <SortableTaskItem
                          key={task.id}
                          task={task}
                          isDone={isCompleted}
                          isMenuOpen={isMenuOpen}
                          isExitingLater={isExitingLater}
                          renderBullet={renderBullet}
                          handleTaskToggle={handleTaskToggle}
                          onMenuOpen={openMenu}
                          getTagDetails={getTagDetails}
                          isDragDisabled={isCompleted}
                          isWeekly={taskKind(task) === 'weekly'}
                          isGlowActive={isCompleted ? false : isGlowActive}
                          disableLayout={isCompleted ? true : isAnyDragging}
                          isSortDragging={isAnyDragging}
                          onDoLater={
                            !isCompleted && onDoLater
                              ? (t) => {
                                  setExitAction({ id: t.id, type: 'later' });
                                  setTimeout(() => onDoLater(t.id), 0);
                                  setTimeout(() => setExitAction(null), 800);
                                }
                              : undefined
                          }
                          onSkipToday={
                            !isCompleted
                              ? (t) => {
                                  void onDeleteToday(t.id);
                                }
                              : undefined
                          }
                          onStartTimer={
                            !isCompleted && onStartTimer
                              ? (t, o) => onStartTimer(t, o)
                              : undefined
                          }
                          onOpenDetail={(t) => setActionSheetId(t.id)}
                          paused={paused}
                          hintPeekPrimary={isHintPeekPrimary}
                          isDesktop={!usesSwipeTrays}
                        />
                      );
                    })}
                  </AnimatePresence>
                </SortableContext>
              </div>
            </DndContext>
          )}

          {/* Show Finished Toggle (Removed from bottom) */}
        </div>

        {/* Add Task footer at the end of the list */}
        {(exitAction ||
          (tasks.length > 0 && sortedVisibleTasks.length > 0)) && (
          <div className="p-1.5 pt-0 bg-card/40 md:p-2 md:pt-0">
            <button
              onClick={() => onAddRequested('', null, { preselectToday: true })}
              disabled={quickAddOpen}
              className="group relative flex w-full items-center gap-1 px-2.5 py-2.5 rounded-xl border border-dashed border-muted-foreground/20 bg-muted/5 cursor-pointer hover:bg-muted/10 transition-all active:scale-[0.99] disabled:pointer-events-none disabled:opacity-0 md:px-3.5 md:py-3.5"
            >
              {/* Spacer matching the task grip column so the label lines up with task text */}
              <span aria-hidden className="flex-shrink-0 w-2.5 md:w-3" />
              <span className="flex-1 min-w-0 text-left text-[15px] font-semibold leading-snug text-muted-foreground group-hover:text-foreground transition-colors md:text-[17px]">
                Add a task
              </span>
              <div className="flex items-center justify-center w-11 h-11 rounded-full bg-muted border border-muted-foreground/10 shrink-0 md:w-12 md:h-12">
                <Plus className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors md:h-6 md:w-6" strokeWidth={2.5} />
              </div>
            </button>
            {onCreateSection && sections.length < 10 && (
              <AddSectionRow
                onCreate={onCreateSection}
                disabled={quickAddOpen}
              />
            )}
          </div>
        )}
        </div>
      </div>

      <TaskMenu
        menu={menu}
        onClose={() => setMenu(null)}
        isDone={
          menu
            ? tasks.find((t) => t.id === menu.id)?.completed ||
              vSet.has(menu.id)
            : false
        }
        onAddTags={(id) => {
          if (isGuest) {
            router.push('/login');
            setMenu(null);
            return;
          }
          setTagPopup({ open: true, taskId: id });
        }}
        addTagsPosition="second"
        onDoLater={
          onDoLater
            ? () => {
                // onDoLater prop is already wrapped in page.tsx for auth check
                if (menu) {
                  const id = menu.id;
                  setExitAction({ id, type: 'later' });
                  setTimeout(() => onDoLater(id), 0);
                  setTimeout(() => setExitAction(null), 800); // Clear after animation
                }
              }
            : undefined
        }
        onToggleRepeat={
          onToggleRepeat
            ? () => {
                // onToggleRepeat prop is already wrapped in page.tsx for auth check
                if (menu) {
                  const id = menu.id;
                  onToggleRepeat(id);
                  setMenu(null);
                }
              }
            : undefined
        }
        isWeekly={
          menu
            ? tasks.find((t) => t.id === menu.id)?.type === 'weekly' ||
              (menu && weeklyIds.has(menu.id))
            : false
        }
        onDelete={() => {
          if (isGuest) {
            router.push('/login');
            setMenu(null);
            return;
          }
          if (menu) {
            const t = tasks.find((it) => it.id === menu.id);
            if (t) {
              setDialog({
                task: t,
                kind: taskKind(t) as 'regular' | 'weekly' | 'backlog',
              });
            }
          }
          setMenu(null);
        }}
        onEdit={(taskId) => {
          if (isGuest) {
            router.push('/login');
            setMenu(null);
            return;
          }
          if (menu) {
            const t = tasks.find((it) => it.id === menu.id);
            if (t) {
              setDialog({ task: t, kind: 'edit' });
            }
          }
          setMenu(null);
        }}
        onSchedule={
          onScheduleTask
            ? (taskId) => {
                if (isGuest) {
                  router.push('/login');
                  setMenu(null);
                  return;
                }
                if (menu) {
                  const t = tasks.find((it) => it.id === menu.id);
                  if (t) {
                    setScheduleDialog({ task: t });
                  }
                }
                setMenu(null);
              }
            : undefined
        }
        onStartTimer={
          onStartTimer
            ? () => {
                if (menu) {
                  const t = tasks.find((it) => it.id === menu.id);
                  if (t) {
                    onStartTimer(t);
                  }
                }
                setMenu(null);
              }
            : undefined
        }
      />

      <TagsPopup
        open={tagPopup.open}
        taskId={tagPopup.taskId}
        initialTags={tasks.find((t) => t.id === tagPopup.taskId)?.tags}
        onClose={() => setTagPopup({ open: false, taskId: null })}
        onSave={(taskId, newTags) => {
          const t = tasks.find((x) => x.id === taskId);
          const save = (scope: 'one' | 'all') =>
            onUpdateTags
              ? onUpdateTags(taskId, newTags, scope)
              : handleTagSave(taskId, newTags, scope);
          maybeScoped(!!t?.repeatGroupId, save);
        }}
      />

      {(() => {
        const sheetTask = actionSheetId
          ? tasks.find((t) => t.id === actionSheetId) ?? null
          : null;
        const close = () => setActionSheetId(null);
        if (!sheetTask) {
          return (
            <TaskDetailSheet
              open={false}
              onOpenChange={(o) => !o && close()}
              task={null}
              isCompleted={false}
              isWeekly={false}
            />
          );
        }
        const isWeekly =
          sheetTask.type === 'weekly' || weeklyIds.has(sheetTask.id);
        const isCompletedTask =
          !!sheetTask.completed || vSet.has(sheetTask.id);
        return (
          <TaskDetailSheet
            open={!!actionSheetId}
            onOpenChange={(o) => !o && close()}
            task={sheetTask as any}
            tags={userTags}
            isCompleted={isCompletedTask}
            isWeekly={isWeekly}
            onComplete={() => toggle(sheetTask.id)}
            onStartTimer={
              onStartTimer ? () => onStartTimer(sheetTask as any) : undefined
            }
            onEdit={
              onEditTask
                ? () =>
                    setDialog({
                      task: sheetTask as any,
                      kind: 'edit',
                    })
                : undefined
            }
            onAddTags={
              !isGuest
                ? () => setTagPopup({ open: true, taskId: sheetTask.id })
                : undefined
            }
            onSchedule={
              onScheduleTask
                ? () => setScheduleDialog({ task: sheetTask as any })
                : undefined
            }
            onSetRepeat={
              onSetRepeat
                ? (mode, dayOfWeek, endDate, rule) =>
                    onSetRepeat(sheetTask.id, mode, dayOfWeek, endDate, rule)
                : undefined
            }
            onDoLater={
              onDoLater && !isCompletedTask
                ? () => {
                    setExitAction({ id: sheetTask.id, type: 'later' });
                    setTimeout(() => onDoLater(sheetTask.id), 0);
                    setTimeout(() => setExitAction(null), 800);
                  }
                : undefined
            }
            onSkipToday={
              (isWeekly ||
                (sheetTask.repeatMode && sheetTask.repeatMode !== 'none')) &&
              !isCompletedTask
                ? () => onDeleteToday(sheetTask.id)
                : undefined
            }
            onDelete={() =>
              setDialog({
                task: sheetTask as any,
                kind: taskKind(sheetTask as any) as
                  | 'regular'
                  | 'weekly'
                  | 'backlog',
              })
            }
            onUpdateDetails={
              onUpdateDetails
                ? (details) => onUpdateDetails(sheetTask.id, details)
                : undefined
            }
            onDuplicate={
              onDuplicate ? (when) => onDuplicate(sheetTask.id, when) : undefined
            }
          />
        );
      })()}

      {onEditTask && (
        <EditTaskDialog
          open={dialog?.kind === 'edit'}
          initialText={dialog?.task.text ?? ''}
          busy={busy}
          onClose={() => setDialog(null)}
          onSave={async (newText) => {
            if (!dialog) return;
            const t = dialog.task;
            setDialog(null);
            maybeScoped(!!t.repeatGroupId, (scope) =>
              onEditTask(t.id, newText, scope),
            );
          }}
        />
      )}

      {onScheduleTask && (
        <TimePopup
          open={!!scheduleDialog}
          taskName={scheduleDialog?.task.text ?? ''}
          initialStartTime={scheduleDialog?.task.startTime || ''}
          initialReminder={scheduleDialog?.task.reminder || ''}
          busy={busy}
          onClose={() => setScheduleDialog(null)}
          onSave={async (data) => {
            if (!scheduleDialog) return;
            const t = scheduleDialog.task;
            setScheduleDialog(null);
            maybeScoped(!!t.repeatGroupId, (scope) =>
              onScheduleTask(t.id, data, scope),
            );
          }}
        />
      )}

      <EditScopeDialog
        open={!!pendingScope}
        onClose={() => setPendingScope(null)}
        onChoose={(scope) => {
          pendingScope?.run(scope);
          setPendingScope(null);
        }}
      />

      <DeleteDialog
        open={!!dialog && dialog.kind !== 'edit'}
        variant={dialogVariant === 'edit' ? 'regular' : dialogVariant}
        itemLabel={dialog?.task.text}
        repeatMode={dialog?.task.repeatMode}
        busy={busy}
        onClose={() => setDialog(null)}
        onDeleteToday={
          dialogVariant !== 'backlog' && dialogVariant !== 'edit'
            ? confirmDeleteToday
            : undefined
        }
        onDeleteAll={
          dialogVariant === 'weekly'
            ? confirmDeleteWeek
            : dialogVariant === 'backlog'
              ? confirmDeleteToday
              : undefined
        }
      />

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {undoToast && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-[9980] flex justify-center px-4 md:bottom-6"
              >
                <div className="pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-2xl border border-border/60 bg-popover py-1.5 pl-3 pr-1.5 shadow-lg">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-foreground">
                    {undoToast.text}
                  </span>
                  <button
                    type="button"
                    onClick={handleUndoComplete}
                    className="shrink-0 rounded-xl px-3 py-2 text-[13px] font-black text-primary transition-colors [@media(hover:hover)]:hover:bg-primary/10"
                  >
                    Undo
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}

      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(15px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
}
