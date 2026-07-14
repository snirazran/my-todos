import {
  CheckCircle2,
  Circle,
  EllipsisVertical,
  CalendarCheck,
  CalendarClock,
  Repeat,
  Filter,
  CalendarDays,
  Plus,
  Flame,
  Pen,
  ListChecks,
  EyeOff,
} from 'lucide-react';
import Fly from '@/components/ui/fly';
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
  useAnimation,
} from 'framer-motion';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  MouseSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
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
}

const animateLayoutChanges: AnimateLayoutChanges = (args) =>
  args.isSorting || args.wasDragging ? defaultAnimateLayoutChanges(args) : true;

const SWIPE_ACTION_WIDTH = 88;
const SWIPE_SNAP_THRESHOLD = 32;
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
    const [isDesktop, setIsDesktop] = useState(false);
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

    useEffect(() => {
      const checkDesktop = () => setIsDesktop(window.innerWidth >= 768);
      checkDesktop();
      window.addEventListener('resize', checkDesktop);
      return () => window.removeEventListener('resize', checkDesktop);
    }, []);

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
      [0, SWIPE_ACTION_WIDTH],
      [0.9, 1],
    );
    const secondaryActionOpacity = useTransform(x, [-25, 0], [1, 0]);
    const secondaryActionScale = useTransform(
      x,
      [-SWIPE_ACTION_WIDTH, 0],
      [1, 0.9],
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
        // The card's own drop shadow has to live here, on the outermost
        // layer — its children below are clipped by this element's own
        // `overflow: hidden` (needed for the swipe-reveal actions), and any
        // box-shadow on a clipped child is invisible no matter how it's
        // styled. This layer's *own* shadow isn't affected by its own
        // overflow setting, only its children's are.
        className={`relative mb-1.5 w-full rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.12)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.5)] md:mb-2 ${isDragging ? 'z-30' : isMenuOpen ? 'z-50 border border-primary/30' : 'z-auto'}`}
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
            dragElastic={0}
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
                            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase md:text-[11px] tracking-normal shadow-sm transition-colors ${
                              !color
                                ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-200 border-indigo-100 dark:border-indigo-800/50'
                                : ''
                            }`}
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
                      className="inline-flex flex-shrink-0 items-center gap-0.5 text-orange-500 no-underline"
                      title={`${task.streak} in a row`}
                    >
                      <Flame className="h-4 w-4" fill="currentColor" />
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
  const [isAnyDragging, setIsAnyDragging] = useState(false);
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

  // On desktop this matches Planner's 5px mouse pickup. In the narrow layout,
  // a very short hold leaves quick horizontal movement available to the swipe
  // tray while making vertical reorder feel effectively immediate.
  const mouseOptions = useMemo(
    () => ({
      activationConstraint: usesSwipeTrays
        ? { delay: 60, tolerance: 8 }
        : { distance: 5 },
    }),
    [usesSwipeTrays],
  );
  const touchOptions = useMemo(
    () => ({ activationConstraint: { delay: 120, tolerance: 8 } }),
    [],
  );
  const keyboardOptions = useMemo(
    () => ({ coordinateGetter: sortableKeyboardCoordinates }),
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
  const activeTaskIds = sortedActiveTasks.map((t) => t.id);
  const allTasksCompleted =
    tasks.length > 0 && tasks.every((task) => task.completed);

  // We no longer need a separate completedTasks array for rendering elsewhere.
  const completedCount = tasks.filter(
    (t) => t.completed && !vSet.has(t.id) && !delayedCompleted.has(t.id),
  ).length;

  const handleDragStart = () => {
    hapticImpact();
    lastDragOverIdRef.current = null;
    setIsAnyDragging(true);
    // Calculate boundary
    const activeNodes = document.querySelectorAll('[data-is-active="true"]');
    const container = scrollContainerRef.current;

    if (activeNodes.length > 0 && container) {
      const containerRect = container.getBoundingClientRect();
      const rects = Array.from(activeNodes).map((n) =>
        n.getBoundingClientRect(),
      );

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

  const handleDragCancel = () => {
    setIsAnyDragging(false);
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

    // A held tap activates the delay-based sort sensor without any movement,
    // and dnd-kit swallows the click that would have opened the detail sheet.
    // Treat a no-movement "drag" as the tap it really was.
    if (
      Math.abs(event.delta.x) < 5 &&
      Math.abs(event.delta.y) < 5 &&
      typeof active.id === 'string'
    ) {
      setActionSheetId(active.id);
      return;
    }

    if (!over || !onReorder) return;

    if (active.id !== over.id) {
      // Only reorder within active tasks (completed are in a separate section)
      const oldIndex = sortedActiveTasks.findIndex((t) => t.id === active.id);
      const newIndex = sortedActiveTasks.findIndex((t) => t.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const reorderedActive = arrayMove(
          sortedActiveTasks,
          oldIndex,
          newIndex,
        );

        // Rebuild full list: reordered active + completed + hidden
        const activeIds = new Set(sortedActiveTasks.map((t) => t.id));
        const completedIds = new Set(completedTasks.map((t) => t.id));
        const hiddenTasks = tasks.filter(
          (t) => !activeIds.has(t.id) && !completedIds.has(t.id),
        );

        const finalOrder = [...reorderedActive, ...completedTasks, ...hiddenTasks];
        hapticTick();
        onReorder(finalOrder);
      }
    }
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
          {/* Header Menu Removed - Moved to Page */}
        </div>

        <div
          className="w-full rounded-[18px] bg-muted/70 dark:bg-background border border-border/50 shadow-sm overflow-hidden"
          data-hint="task-list"
        >
        <div
          className={`p-1.5 pb-0 space-y-0 overflow-y-visible md:p-2 md:pb-0 ${exitAction ? 'overflow-x-visible' : 'overflow-x-hidden'}`}
          ref={scrollContainerRef}
        >
          {tasks.length === 0 && !exitAction ? (
            /* Empty State: No Tasks at all */
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: quickAddOpen ? 0 : 1 }}
                transition={{ duration: quickAddOpen ? 0 : 0.5 }}
                className="mb-2"
              >
                <button
                  onClick={() =>
                    onAddRequested('', null, { preselectToday: true })
                  }
                  className="w-full flex items-center gap-1.5 px-2 py-2 border border-dashed border-muted-foreground/20 bg-muted/5 hover:bg-muted/10 rounded-xl transition-all cursor-pointer group disabled:pointer-events-none"
                  disabled={quickAddOpen}
                >
                  <div className="flex items-center justify-center w-11 h-11 rounded-full bg-muted border border-muted-foreground/10 shrink-0 md:w-12 md:h-12">
                    <Plus className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors md:w-6 md:h-6" strokeWidth={2.5} />
                  </div>
                  <p className="text-[15px] font-semibold text-muted-foreground group-hover:text-foreground transition-colors md:text-[17px]">
                    Add your first task
                  </p>
                </button>
              </motion.div>
            </>
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
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: quickAddOpen ? 0 : 1 }}
                transition={{ duration: quickAddOpen ? 0 : 0.5 }}
                className="mb-2"
              >
                <button
                  onClick={() =>
                    onAddRequested('', null, { preselectToday: true })
                  }
                  className="w-full flex items-center gap-1.5 px-2 py-2 border border-dashed border-muted-foreground/20 bg-muted/5 hover:bg-muted/10 rounded-xl transition-all cursor-pointer group disabled:pointer-events-none"
                  disabled={quickAddOpen}
                >
                  <div className="flex items-center justify-center w-11 h-11 rounded-full bg-muted border border-muted-foreground/10 shrink-0 md:w-12 md:h-12">
                    <Plus className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors md:w-6 md:h-6" strokeWidth={2.5} />
                  </div>
                  <p className="text-[15px] font-semibold text-muted-foreground group-hover:text-foreground transition-colors md:text-[17px]">
                    {selectedTags.length > 0
                      ? 'No tasks match your filters'
                      : 'Add another task'}
                  </p>
                </button>
              </motion.div>
            )
          ) : (
            /* List Content */
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
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
                    {sortedVisibleTasks.map((task) => {
                      const isCompleted = task.completed || vSet.has(task.id);
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
// Helper component for add-only animation
function TaskCounter({
  count,
  pendingCount,
}: {
  count: number;
  pendingCount?: number;
}) {
  const controls = useAnimation();
  const prevCount = React.useRef(count);

  React.useEffect(() => {
    if (count > prevCount.current) {
      // Only animate if count INCREASED
      controls.start({
        scale: [1, 1.35, 1],
        color: [
          'hsl(var(--muted-foreground))',
          'hsl(var(--primary))',
          'hsl(var(--muted-foreground))',
        ],
        transition: { duration: 0.3, ease: 'easeInOut' },
      });
    }
    prevCount.current = count;
  }, [count, controls]);

  if (count === 0 && (!pendingCount || pendingCount === 0)) return null;

  return (
    <div className="flex items-center gap-1.5">
      {count > 0 && (
        <motion.span
          animate={controls}
          className={`flex h-5 min-w-[20px] items-center justify-center rounded-full bg-secondary px-1 text-[11px] font-bold text-muted-foreground ${count === 0 ? 'hidden' : ''}`}
        >
          {count}
        </motion.span>
      )}
      {(pendingCount ?? 0) > 0 && (
        <svg
          className="w-3.5 h-3.5 animate-spin text-muted-foreground/60"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      )}
    </div>
  );
}
