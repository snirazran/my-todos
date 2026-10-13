import {
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  EllipsisVertical,
  CalendarCheck,
  CalendarClock,
  Filter,
  Pencil,
  Plus,
  ListChecks,
  EyeOff,
} from 'lucide-react';
import Fly from '@/components/ui/fly';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/ui/Icon';
import { TaskMetaLine } from '@/components/ui/TaskMeta';
import { StepPips, StreakPill } from '@/components/ui/TaskAdornments';
import {
  HOME_CARD_RADIUS,
  HOME_CARD_SURFACE,
} from '@/components/ui/taskSurfaces';
import { StepsStrip } from '@/components/ui/TaskSteps';
import {
  hapticGrab,
  hapticImpact,
  hapticSuccess,
  hapticTick,
} from '@/lib/haptics';
import { useTaskTimerPhase } from '@/hooks/useTaskTimerPhase';
import { emitCampaignTrigger } from '@/lib/campaigns/orchestrator';
import {
  AnimatePresence,
  motion,
  PanInfo,
  useMotionValue,
  useTransform,
  animate,
} from 'framer-motion';
import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import {
  hasPendingFreshTasks,
  isFreshTask,
  playTaskEntrance,
} from '@/lib/taskEntrance';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent,
  TouchSensor,
  Modifier,
  MeasuringStrategy,
  DragOverlay,
  defaultDropAnimationSideEffects,
  type CollisionDetection,
  type DropAnimation,
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
import { DeleteDialog } from '@/components/ui/DeleteDialog';
import { AddTaskButton } from '@/components/ui/AddTaskButton';
import TaskMenu from '../board/TaskMenu';
import TaskDetailSheet from '../board/TaskDetailSheet';
import { EditScopeDialog } from '../board/EditScopeDialog';
import TagsPopup from '@/components/ui/TagsPopup';
import { SectionEditorSheet } from '@/components/ui/SectionEditorSheet';
import { EditTaskDialog } from '@/components/ui/EditTaskDialog';
import { TimePopup } from '@/components/ui/TimePopup';
import { BuddyLine } from '@/components/ui/BuddyBadge';
import {
  ChecklistCheckbox,
} from '../board/ChecklistEditor';
import { checklistPayout, type ChecklistItem } from '@/lib/checklist';
import {
  matchesTaskFilters,
  sortTasks,
  type TaskFilters,
} from '@/lib/taskFilters';
import { FilteredEmptyState } from '@/components/ui/TaskFilterBar';
import { useNotification } from '@/components/providers/NotificationProvider';
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
  checklist?: ChecklistItem[];
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
  /** Flies ticking this row would pay right now, streak rate included. */
  flyWorth?: number;
  isStarter?: boolean;
  sectionId?: string | null;
}

export interface TaskListSection {
  id: string;
  name: string;
  order: number;
  collapsed: boolean;
  tagIds?: string[];
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
  args.isSorting || args.wasDragging
    ? defaultAnimateLayoutChanges(args)
    : !hasPendingFreshTasks();

const pointerMidpointCollision: CollisionDetection = (args) => {
  const {
    active,
    collisionRect,
    droppableContainers,
    droppableRects,
    pointerCoordinates,
  } = args;
  const probeY = collisionRect
    ? collisionRect.top + collisionRect.height / 2
    : pointerCoordinates?.y;
  if (probeY == null) return closestCenter(args);

  const rows = droppableContainers
    .filter((c) => !c.disabled && droppableRects.get(c.id))
    .map((c) => ({ container: c, rect: droppableRects.get(c.id)! }))
    .sort((a, b) => a.rect.top - b.rect.top);

  if (rows.length === 0) return [];

  const passed = rows.filter(
    (r) =>
      r.container.id !== active.id &&
      probeY > r.rect.top + r.rect.height / 2,
  ).length;
  const hit = rows[Math.min(passed, rows.length - 1)];

  return [{ id: hit.container.id, data: { droppableContainer: hit.container } }];
};

const SWIPE_ACTION_WIDTH = 88;
const SWIPE_SNAP_THRESHOLD = 32;
const SWIPE_COMMIT_X = SWIPE_ACTION_WIDTH + 40;
const SWIPE_SPRING = { type: 'spring' as const, stiffness: 900, damping: 80, mass: 1 };
const SWIPE_MAX_RELEASE_VELOCITY = 1500;
const TASK_CARD_GAP = 'pb-2';

const SORT_TRANSITION = {
  duration: 240,
  easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
};

const DROP_ANIMATION: DropAnimation = {
  duration: 240,
  easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)',
  sideEffects: (params) => {
    params.dragOverlay.node
      .querySelector<HTMLElement>('[data-drag-lift]')
      ?.setAttribute('data-dropping', 'true');
    return defaultDropAnimationSideEffects({
      styles: { active: { opacity: '0' } },
    })(params);
  },
};

function TaskDragPreview({
  task,
  tags,
}: {
  task: Task;
  tags: { id: string; name: string; color: string }[];
}) {
  const steps = task.checklist ?? [];
  const stepsDone = steps.filter((step) => step.done).length;
  const nextStep = steps.find((step) => !step.done);
  return (
    <div className={`h-full w-full ${TASK_CARD_GAP}`}>
    <div
      data-drag-lift
      data-tilt
      className={`relative flex h-full w-full items-center gap-3 overflow-hidden py-[15px] pl-3.5 pr-2.5 md:pl-4 md:pr-3 ${HOME_CARD_SURFACE}`}
    >
      {tags.length > 0 && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-[26px] max-h-[60%] w-[3px] -translate-y-1/2 rounded-r-full opacity-90"
          style={{ backgroundColor: tags[0].color }}
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="text-[17px] font-semibold leading-snug text-foreground md:text-[17.5px]">
            {task.text}
            {(task.streak ?? 0) > 0 && (
              <StreakPill
                count={task.streak ?? 0}
                size="sm"
                className="ml-1.5 translate-y-[-1px] align-middle"
              />
            )}
          </span>
        </span>
        <TaskMetaLine
          tags={tags}
          startTime={task.startTime}
          endTime={task.endTime}
        />
        <BuddyLine
          className="mt-0.5"
          taskId={task.id}
          date={new Intl.DateTimeFormat('en-CA').format(new Date())}
        />
        {steps.length > 0 && (
          <span className="mt-0.5 flex h-7 min-w-0 items-center gap-2 text-muted-foreground/70">
            <span className="flex w-[22px] shrink-0 justify-center">
              {nextStep ? (
                <ChecklistCheckbox
                  size={18}
                  checked={false}
                  onToggle={() => {}}
                  interactive={false}
                />
              ) : (
                <CheckCircle2 className="h-[18px] w-[18px] text-primary" />
              )}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground/65 md:text-[14px]">
              {nextStep ? nextStep.text || 'Untitled step' : `All ${steps.length} steps done`}
            </span>
            <StepPips items={steps} done={stepsDone} />
          </span>
        )}
      </span>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/[0.16] ring-1 ring-inset ring-primary/25 md:h-12 md:w-12">
        <Fly size={40} y={-3} paused interactive={false} alwaysPlay />
      </span>
    </div>
    </div>
  );
}

function SectionDragPreview({ name }: { name: string }) {
  return (
    <div className="h-full w-full pt-2">
    <div
      data-drag-lift
      className="relative flex h-full w-full items-center gap-1 rounded-xl bg-card pl-2.5 pr-2 ring-1 ring-black/[0.06] dark:ring-white/10 md:pl-3"
    >
      <span className="-ml-1 grid h-7 w-5 shrink-0 place-items-center text-muted-foreground/70">
        <ChevronDown className="h-4 w-4" strokeWidth={2.75} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-black text-foreground/70 md:text-[14px]">
        {name}
      </span>
    </div>
    </div>
  );
}

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
  onToggleChecklistItem?: (task: Task, itemId: string) => void;
  stepsOpen?: boolean;
  onToggleSteps?: () => void;
  paused?: boolean;
  hintPeekPrimary?: boolean;
  isDesktop?: boolean;
  isNextTimed?: boolean;
}

const clockMinutes = (hhmm?: string): number | null => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

type TaskRowBodyProps = SortableTaskItemProps & {
  isDragging: boolean;
  onSwipeOpenChange: (open: boolean) => void;
};

const TaskRowBody = React.memo(function TaskRowBody(
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
      onToggleChecklistItem,
      stepsOpen = false,
      onToggleSteps,
      paused = false,
      hintPeekPrimary = false,
      isDesktop = false,
      isNextTimed = false,
      isDragging,
      onSwipeOpenChange,
    }: TaskRowBodyProps,
  ) {
    const checklist = task.checklist ?? [];
    const checklistPayoutState = React.useMemo(
      () => checklistPayout(checklist),
      [checklist],
    );

    const metaTags = (task.tags ?? [])
      .map((tagId) => getTagDetails(tagId))
      .filter((tag): tag is NonNullable<typeof tag> => !!tag);
    const focusSecondsToday = task.frogodoroSession?.focusTime ?? 0;

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

    const [rowWidth, setRowWidth] = useState(360);
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const measure = () => setRowWidth(el.offsetWidth || 360);
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }, []);
    const commitX = Math.max(SWIPE_COMMIT_X, Math.round(rowWidth * 0.5));
    const commitXRef = React.useRef(commitX);
    commitXRef.current = commitX;

    const pastCommitRef = React.useRef(false);
    useEffect(() => {
      const unsub = x.on('change', (v) => {
        const past = Math.abs(v) >= commitXRef.current;
        if (isDraggingRef.current && past !== pastCommitRef.current) {
          if (past) hapticImpact();
          else hapticTick();
        }
        pastCommitRef.current = past;
      });
      return unsub;
    }, [x]);

    const snapSwipe = React.useCallback(
      (side: 'timer' | 'secondary' | null, velocity = 0) => {
        setOpenSide(side);
        const target =
          side === 'timer'
            ? SWIPE_ACTION_WIDTH
            : side === 'secondary'
              ? -SWIPE_ACTION_WIDTH
              : 0;
        animate(x, target, { ...SWIPE_SPRING, velocity });
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

    useEffect(() => {
      onSwipeOpenChange(isOpen);
    }, [isOpen, onSwipeOpenChange]);
    const showSwipeActions =
      !isDesktop && !isDragging && !isSortDragging && !isExitingLater;

    const activeHint = useUIStore((s) => s.activeHint);
    const hintBeat = activeHint
      ? (guideById(activeHint.guideId)?.beats[activeHint.beatIndex] ?? null)
      : null;
    const hintStepKey = activeHint
      ? `${activeHint.runId}:${activeHint.guideId}:${activeHint.beatIndex}`
      : null;
    const hintPeekTarget =
      !isDone && hintBeat?.show === 'row-peek' && hintPeekPrimary;
    const hintRowGlow = hintPeekTarget && hintBeat?.scope === 'tagged';

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
    const timerTrayWidth = useTransform(x, (v) => Math.max(0, v));
    const secondaryTrayWidth = useTransform(x, (v) => Math.max(0, -v));
    const secondaryActionOpacity = useTransform(x, [-25, 0], [1, 0]);

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

    const pressPointRef = React.useRef<{ x: number; y: number } | null>(null);

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
      const releaseVelocity = Math.max(
        -SWIPE_MAX_RELEASE_VELOCITY,
        Math.min(SWIPE_MAX_RELEASE_VELOCITY, info.velocity.x),
      );
      const startSide = dragStartSideRef.current;
      dragStartSideRef.current = null;

      // A swipe held past the commit threshold runs the action directly on
      // release — no second tap needed. Short swipes still just reveal.
      // It opens the timer rather than starting one: how long to focus is a
      // decision, and a swipe must never commit you to the last length used.
      if (x.get() >= commitXRef.current && onStartTimer && !isDone) {
        blockImmediatePostSwipeClick();
        snapSwipe(null);
        onStartTimer(task);
        return;
      }
      if (x.get() <= -commitXRef.current && secondaryAction && !isDone) {
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
          releaseVelocity,
        );
      } else if (startSide === 'secondary') {
        blockImmediatePostSwipeClick();
        snapSwipe(
          projectedX < -SWIPE_SNAP_THRESHOLD && secondaryAction && !isDone
            ? 'secondary'
            : null,
          releaseVelocity,
        );
      } else if (
        projectedX > SWIPE_SNAP_THRESHOLD &&
        onStartTimer &&
        !isDone
      ) {
        blockImmediatePostSwipeClick();
        snapSwipe('timer', releaseVelocity);
      } else if (
        projectedX < -SWIPE_SNAP_THRESHOLD &&
        secondaryAction &&
        !isDone
      ) {
        blockImmediatePostSwipeClick();
        snapSwipe('secondary', releaseVelocity);
      } else {
        snapSwipe(null, releaseVelocity);
      }
    };

    const handleTimerAction = (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (!onStartTimer || isDone) return;
      blockImmediatePostSwipeClick();
      snapSwipe(null);
      onStartTimer(task);
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
      if (performance.now() - lastSortDragAt < 400) return;
      const press = pressPointRef.current;
      pressPointRef.current = null;
      if (
        press &&
        Math.hypot(e.clientX - press.x, e.clientY - press.y) > TAP_SLOP_PX
      )
        return;
      if (isExitingLater || hasActionTriggeredRef.current) return;

      if (isOpen) {
        snapSwipe(null);
        return;
      }
      // Clicking the row body opens the detail card; only the fly/circle on the
      // right toggles completion.
      onOpenDetail?.(task);
    };

    return (
      <motion.div
        ref={containerRef}
        style={{ overflow: isDragging ? 'visible' : 'hidden' }}
        className={`relative w-full ${isDragging ? `${HOME_CARD_RADIUS} bg-muted/60` : HOME_CARD_SURFACE} ${hintRowGlow ? 'hint-row-glow' : ''}`}
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
          className={`group relative w-full ${isDragging ? 'invisible' : isExitingLater ? 'overflow-visible shadow-none' : isGlowActive && !isDone ? 'overflow-visible shadow-none' : isOpen || isSwiping ? 'overflow-hidden shadow-none' : 'overflow-hidden'} ${isExitingLater ? 'will-change-transform' : ''}`}
        >
          {/* Swipe actions stay behind the row until the drag snaps open. A
              swipe never performs an action by itself. */}
          {onStartTimer && !isDone && showSwipeActions && (
            <motion.button
              type="button"
              aria-label={`Start focus timer for ${task.text}`}
              aria-hidden={openSide !== 'timer'}
              tabIndex={openSide === 'timer' ? 0 : -1}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={handleTimerAction}
              style={{ width: timerTrayWidth }}
              className="absolute inset-y-0 left-0 flex items-center justify-center overflow-hidden bg-[#447d3f] text-white"
            >
              <motion.span
                className="flex w-[88px] shrink-0 flex-col items-center justify-center gap-0.5"
                style={{ opacity: timerActionOpacity }}
              >
                <Icon name="clock" className="-mb-1 h-10 w-10 drop-shadow-sm" />
                <span className="text-[12px] font-black tracking-wide">
                  Focus
                </span>
              </motion.span>
            </motion.button>
          )}

          {secondaryAction && !isDone && showSwipeActions && (
            <motion.button
              type="button"
              aria-label={
                isRepeating
                  ? `Skip ${task.text} today`
                  : `Save ${task.text} for later`
              }
              aria-hidden={openSide !== 'secondary'}
              tabIndex={openSide === 'secondary' ? 0 : -1}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={handleSecondaryAction}
              style={{ width: secondaryTrayWidth }}
              className={`absolute inset-y-0 right-0 flex items-center justify-center overflow-hidden text-white ${
                isRepeating ? 'bg-slate-500' : 'bg-amber-500'
              }`}
            >
              <motion.span
                className="flex w-[88px] shrink-0 flex-col items-center justify-center gap-1"
                style={{ opacity: secondaryActionOpacity }}
              >
                {isRepeating ? (
                  <EyeOff className="h-6 w-6" strokeWidth={2.75} />
                ) : (
                  <Icon name="saved" className="h-8 w-8" />
                )}
                <span className="text-[12px] font-black tracking-wide">
                  {secondaryLabel}
                </span>
              </motion.span>
            </motion.button>
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
                  : secondaryAction && !isDone
                    ? -(rowWidth - 24)
                    : 0,
              right:
                openSide === 'secondary'
                  ? 0
                  : onStartTimer && !isDone
                    ? rowWidth - 24
                    : 0,
            }}
            dragElastic={{
              right: onStartTimer && !isDone ? 0.12 : 0.04,
              left: secondaryAction && !isDone ? 0.12 : 0.04,
            }}
            dragMomentum={false}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            // Hover handlers for robust desktop behavior
            onMouseEnter={() => isDesktop && !isDragging && setIsHovered(true)}
            onMouseLeave={() => isDesktop && setIsHovered(false)}
            initial={false}
            animate={
              isExitingLater ? { x: isDesktop ? 800 : 450 } : undefined
            }
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
                : SWIPE_SPRING
            }
            className={`
              relative flex w-full flex-col py-[15px] pl-3.5 pr-2.5 md:py-4 md:pl-4 md:pr-3
              ${HOME_CARD_RADIUS}
              transition-[box-shadow,background-color] duration-200
              bg-card
              shadow-none
              ${isHovered && isDesktop && !isDone ? 'bg-muted/40' : ''}
              ${
                isGlowActive && !isDone
                  ? 'ring-2 ring-inset ring-primary'
                  : ''
              }

              select-none active:bg-muted/50
              has-[[data-completion-target]:active]:bg-card
              ${isDragging ? 'z-[100] opacity-100 ring-2 ring-primary/40' : ''}
              ${isDone && !isDragging && isHovered && isDesktop ? 'bg-muted/40' : ''}
              cursor-pointer
            `}
            // Note: We are using 'style' prop for x motion value to avoid re-renders
            // combined with the style object above, so we pass x via the style prop on the motion component directly
            onPointerDownCapture={(e) => {
              pressPointRef.current = { x: e.clientX, y: e.clientY };
            }}
            onClick={handleCardClick}
          >
            {metaTags.length > 0 && (
              <span
                aria-hidden
                className={`pointer-events-none absolute left-0 top-1/2 h-[26px] max-h-[60%] w-[3px] -translate-y-1/2 rounded-r-full transition-opacity duration-200 ${isDone ? 'opacity-30' : 'opacity-90'}`}
                style={{
                  background:
                    metaTags.length > 1
                      ? `linear-gradient(to bottom, ${metaTags[0].color} 50%, ${metaTags[1].color} 50%)`
                      : metaTags[0].color,
                }}
              />
            )}

            {/* Glow Animation Overlay */}
            {isGlowActive && !isDone && (
              <div
                className="absolute inset-0 z-0 pointer-events-none bg-gradient-to-r from-transparent via-primary/10 to-transparent animate-shimmer"
                style={{ backgroundSize: '200% 100%' }}
              />
            )}

            <div className="relative z-10 flex w-full items-center gap-3">
            {/* Visual grab affordance. The full row remains the sortable
                activator so vertical movement is measured correctly. */}
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute -left-3.5 top-0 bottom-0 z-10 hidden w-3.5 items-center justify-center transition-opacity md:-left-4 md:flex md:w-4 ${isDragging ? 'text-primary opacity-100' : 'text-muted-foreground/50 opacity-0 md:group-hover:opacity-100'}`}
            >
              <EllipsisVertical className="h-4 w-4" />
            </div>

            {/* Content — clicking the row toggles completion */}
            <div
              className={`relative z-10 min-w-0 flex-1 self-center transition-opacity duration-200 ${isDone && !isDragging ? 'opacity-60' : 'opacity-100'}`}
            >
                <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <motion.span
                    className={`text-[17px] font-semibold leading-snug break-words line-through decoration-2 transition-[color,text-decoration-color] duration-300 md:text-[17.5px] ${
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
                    {(task.streak ?? 0) > 0 && !isDone && (
                      <StreakPill
                        count={task.streak ?? 0}
                        size="sm"
                        className="ml-1.5 translate-y-[-1px] align-middle"
                      />
                    )}
                  </motion.span>
                </span>
                <TaskMetaLine
                  tags={metaTags}
                  startTime={task.startTime}
                  endTime={task.endTime}
                  isNext={isNextTimed}
                  isDone={isDone}
                  activePhase={!isDone && timerPhase ? timerPhase : null}
                  fromCalendar={!!task.calendarEventId}
                  focusSeconds={focusSecondsToday}
                />

                <BuddyLine
                  className="mt-0.5"
                  taskId={task.id}
                  isDone={isDone}
                  date={new Intl.DateTimeFormat('en-CA').format(new Date())}
                />

                {checklist.length > 0 && (
                  <StepsStrip
                    taskText={task.text}
                    items={checklistPayoutState.items}
                    doneCount={checklistPayoutState.doneCount}
                    open={stepsOpen}
                    isDone={isDone}
                    onToggleOpen={() => {
                      hapticTick();
                      onToggleSteps?.();
                    }}
                    onToggleItem={
                      onToggleChecklistItem
                        ? (itemId) => onToggleChecklistItem(task, itemId)
                        : undefined
                    }
                  />
                )}
            </div>

            {isDesktop &&
              !isDone &&
              ((onStartTimer && !task.isStarter) || secondaryAction) && (
              <div
                className={`relative z-10 hidden flex-shrink-0 items-center gap-0.5 md:flex transition-[opacity,transform] duration-200 ease-out ${
                  isHovered && !isDragging
                    ? 'translate-x-0 opacity-100'
                    : 'pointer-events-none translate-x-2 opacity-0'
                }`}
              >
                {onStartTimer && !task.isStarter && (
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
                      <CheckCircle2 className="text-primary w-9 h-9 drop-shadow-sm md:w-10 md:h-10" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            </div>

          </motion.div>
        </motion.div>
      </motion.div>
    );
});

const SortableTaskItem = React.forwardRef<
  HTMLDivElement,
  SortableTaskItemProps
>(function SortableTaskItem(props, ref) {
  const {
    task,
    isDone,
    isDragDisabled,
    isWeekly,
    isMenuOpen,
    isExitingLater,
    onDoLater,
    onOpenDetail,
  } = props;
  const [swipeOpen, setSwipeOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    disabled: isDragDisabled || swipeOpen,
    animateLayoutChanges,
    transition: SORT_TRANSITION,
  });

  useLayoutEffect(() => {
    if (rowRef.current && isFreshTask(task.id)) {
      playTaskEntrance(rowRef.current, task.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      data-row
      ref={(node: HTMLDivElement | null) => {
        rowRef.current = node;
        setNodeRef(node);
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      style={{
        transform: pixelSnappedTranslate(transform),
        transition,
        zIndex: swipeOpen ? 20 : isMenuOpen ? 50 : isExitingLater ? 0 : 1,
      }}
      {...attributes}
      {...listeners}
      onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
        (listeners as any)?.onKeyDown?.(e);
        if (
          e.key === 'Enter' &&
          !e.defaultPrevented &&
          e.target === e.currentTarget &&
          !isDragging &&
          !swipeOpen
        ) {
          e.preventDefault();
          onOpenDetail?.(task);
        }
      }}
      className={`relative w-full ${TASK_CARD_GAP}`}
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
    >
      <TaskRowBody
        {...props}
        isDragging={isDragging}
        onSwipeOpenChange={setSwipeOpen}
      />
    </div>
  );
});

let lastSortDragAt = 0;
const TAP_SLOP_PX = 8;

function pixelSnappedTranslate(
  transform: { x: number; y: number } | null,
): string | undefined {
  if (!transform) return undefined;
  return `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`;
}
const TAP_AFTER_LIFT_MS = 180;

function SortableSectionHeader({
  section,
  count,
  doneCount,
  onToggleCollapsed,
  onEdit,
  onAddTask,
}: {
  section: TaskListSection;
  count: number;
  doneCount: number;
  onToggleCollapsed: () => void;
  onEdit: () => void;
  onAddTask?: () => void;
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
        transform: pixelSnappedTranslate(transform),
        transition,
        zIndex: isDragging ? 30 : 1,
      }}
      data-is-active="true"
      data-section-header="true"
      className={`relative w-full select-none pt-2 ${
        isDragging ? 'rounded-xl bg-muted/70' : ''
      }`}
    >
      <div
        {...attributes}
        {...listeners}
        onClick={onToggleCollapsed}
        className={`group flex min-h-[40px] cursor-pointer items-center gap-1 py-1 pl-2.5 pr-0.5 transition-colors md:pl-3 ${
          isDragging ? 'invisible' : ''
        }`}
      >
        <motion.span
          initial={false}
          animate={{ rotate: section.collapsed ? -90 : 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="-ml-1 grid h-7 w-5 shrink-0 place-items-center text-muted-foreground/70"
        >
          <ChevronDown className="h-4 w-4" strokeWidth={2.75} />
        </motion.span>

        <span className="min-w-0 truncate text-[14px] font-black text-foreground/75 md:text-[15px]">
          {section.name}
        </span>

        <span
          aria-hidden
          className="mx-1.5 h-px min-w-3 flex-1 bg-border/80"
        />

        {count > 0 && (
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

        {onAddTask && (
          <button
            type="button"
            aria-label={`Add a task to ${section.name}`}
            title="Add task"
            {...stopDndActivation}
            onClick={(e) => {
              e.stopPropagation();
              onAddTask();
            }}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground/60 transition-colors [@media(hover:hover)]:hover:bg-primary/10 [@media(hover:hover)]:hover:text-primary"
          >
            <Plus className="h-[18px] w-[18px]" strokeWidth={2.5} />
          </button>
        )}

        {!section.collapsed && (
          <button
            type="button"
            aria-label={`Edit section ${section.name}`}
            {...stopDndActivation}
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground/50 transition-colors [@media(hover:hover)]:hover:bg-muted [@media(hover:hover)]:hover:text-foreground"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </div>
      {count === 0 && !section.collapsed && !isDragging && (
        <button
          type="button"
          {...stopDndActivation}
          onClick={(e) => {
            e.stopPropagation();
            onAddTask?.();
          }}
          disabled={!onAddTask}
          className={`mb-2 flex w-full items-center border-[1.5px] border-dashed border-border px-3.5 py-3 text-left text-[13px] font-semibold text-muted-foreground/70 transition-colors disabled:pointer-events-none md:px-4 [@media(hover:hover)]:hover:border-primary/40 [@media(hover:hover)]:hover:text-foreground ${HOME_CARD_RADIUS}`}
        >
          No tasks yet · tap to add, or drag one in
        </button>
      )}
    </div>
  );
}

function AddSectionRow({
  onOpen,
  disabled,
}: {
  onOpen: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      className="group mt-1 flex min-h-[40px] items-center gap-1 rounded-xl px-3.5 text-[13px] font-bold text-muted-foreground/70 transition-colors disabled:pointer-events-none md:px-4 [@media(hover:hover)]:hover:text-primary"
    >
      <Plus className="-ml-0.5 h-4 w-4" strokeWidth={2.75} />
      <span className="shrink-0">New section</span>
    </button>
  );
}

const CLEARED_SPARKS = [0, 45, 90, 135, 180, 225, 270, 315];

function DayClearedState({
  doneCount,
  hideActions,
  onPlanTomorrow,
  onAddTask,
  onShowCompleted,
  addDisabled,
}: {
  doneCount: number;
  hideActions: boolean;
  onPlanTomorrow: () => void;
  onAddTask: () => void;
  onShowCompleted?: () => void;
  addDisabled: boolean;
}) {
  return (
    <div className="fly-caught-enter">
      <div className="flex flex-col items-center px-5 pb-5 pt-7 text-center">
        <span className="relative grid h-16 w-16 place-items-center">
          <span
            aria-hidden
            className="absolute inset-0 rounded-full bg-primary/10 motion-safe:animate-[day-cleared-halo_2.8s_ease-in-out_3]"
          />
          {CLEARED_SPARKS.map((angle, i) => (
            <span
              key={angle}
              aria-hidden
              className="day-cleared-spark absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full"
              style={
                {
                  '--spark-angle': `${angle}deg`,
                  animationDelay: `${120 + i * 18}ms`,
                  backgroundColor: i % 2 ? '#f59e0b' : '#447d3f',
                } as React.CSSProperties
              }
            />
          ))}
          <span className="day-cleared-seal relative grid h-12 w-12 place-items-center rounded-full bg-gradient-to-b from-[#68b85c] to-[#447d3f] text-white shadow-[0_8px_18px_-8px_rgba(79,145,73,0.8),inset_0_-2px_0_rgba(0,0,0,0.12)]">
            <Check className="h-7 w-7" strokeWidth={3.5} />
          </span>
        </span>
        <p className="mt-3 text-[20px] font-black leading-tight tracking-tight text-foreground">
          Day cleared!
        </p>
        <p className="mt-1 text-[13px] font-semibold text-muted-foreground">
          {doneCount} {doneCount === 1 ? 'task' : 'tasks'} done today
        </p>
        {!hideActions && (
          <div className="mt-5 flex w-full gap-2">
            <button
              type="button"
              onClick={onPlanTomorrow}
              className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-primary text-[14px] font-black text-primary-foreground shadow-[inset_0_-2px_0_rgba(0,0,0,0.12)] transition-transform active:scale-[0.97]"
            >
              <CalendarClock className="h-4 w-4" strokeWidth={2.75} />
              Plan tomorrow
            </button>
            <button
              type="button"
              onClick={onAddTask}
              disabled={addDisabled}
              className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-muted text-[14px] font-black text-foreground transition-transform active:scale-[0.97] disabled:opacity-50"
            >
              <Plus className="h-4 w-4" strokeWidth={3} />
              Add task
            </button>
          </div>
        )}
      </div>
      {onShowCompleted && (
        <button
          type="button"
          onClick={onShowCompleted}
          className="flex w-full items-center justify-between border-t border-border/60 py-3 pl-4 pr-3.5 text-left transition-colors active:bg-muted/50 [@media(hover:hover)]:hover:bg-muted/40"
        >
          <span className="inline-flex items-center gap-2 text-[13px] font-bold text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            {doneCount} done today
          </span>
          <span className="inline-flex items-center gap-0.5 text-[13px] font-black text-primary">
            Show
            <ChevronDown className="h-4 w-4" strokeWidth={2.75} />
          </span>
        </button>
      )}
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
    >
      <button
        onClick={onClick}
        className="group flex w-full cursor-pointer items-center gap-3 py-2 pl-3.5 pr-2.5 text-left transition-colors active:bg-muted/50 disabled:pointer-events-none md:pl-4 md:pr-3 [@media(hover:hover)]:hover:bg-muted/40"
        disabled={quickAddOpen}
      >
        <p className="min-w-0 flex-1 text-[15px] font-semibold text-muted-foreground transition-colors group-hover:text-foreground md:text-[16px]">
          {label}
        </p>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-[1.5px] border-dashed border-muted-foreground/30 text-muted-foreground transition-colors group-hover:border-primary/50 group-hover:text-primary">
          <Plus className="h-5 w-5" strokeWidth={2.5} />
        </span>
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
  filters,
  onClearFilters,
  filtersActive,
  onShowCompleted,
  isGuest,
  isGlowActive,
  isFrozen = false,
  quickAddOpen = false,
  paused = false,
  hideAddControls = false,
  header,
  sections = [],
  onCreateSection,
  onUpdateSection,
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
    opts?: { preselectToday?: boolean; sectionId?: string },
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
    details: { notes?: string; checklist?: ChecklistItem[] },
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
  filters: TaskFilters;
  onClearFilters: () => void;
  filtersActive: boolean;
  /** Reveals the day's finished tasks from the all-done card. */
  onShowCompleted?: () => void;
  isGuest?: boolean;
  isGlowActive?: boolean;
  /** When true the current sort order is frozen (prevents layout shifts during tongue animation) */
  isFrozen?: boolean;
  quickAddOpen?: boolean;
  paused?: boolean;
  hideAddControls?: boolean;
  header?: React.ReactNode;
  sections?: TaskListSection[];
  onCreateSection?: (name: string, tagIds: string[]) => void;
  onUpdateSection?: (
    sectionId: string,
    patch: { name?: string; tagIds?: string[] },
  ) => void;
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


  // Which rows have their steps showing. Held here rather than per-row so a
  // sort drag can collapse them: verticalListSortingStrategy translates rows by
  // measured neighbours, and a row that is several times taller than the rest
  // makes drops land short or overlap.
  const [openSteps, setOpenSteps] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [collapsedForDrag, setCollapsedForDrag] = useState(false);
  const toggleSteps = React.useCallback((taskId: string) => {
    setOpenSteps((prev) => {
      const next = new Set(prev);
      if (!next.delete(taskId)) next.add(taskId);
      return next;
    });
  }, []);

  // Checking a step straight from the list persists through the same details
  // endpoint the detail sheet uses, so a passed reward pays out immediately.
  const toggleChecklistItem = React.useCallback(
    (task: Task, itemId: string) => {
      if (!onUpdateDetails || !task.checklist) return;
      const next = task.checklist.map((it) =>
        it.id === itemId ? { ...it, done: !it.done } : it,
      );
      const wasComplete = task.checklist.every((it) => it.done);
      const isComplete = next.every((it) => it.done);
      if (isComplete && !wasComplete) hapticSuccess();
      else hapticTick();
      onUpdateDetails(task.id, { checklist: next });
    },
    [onUpdateDetails],
  );

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
  const { showNotification } = useNotification();
  const prevCompletedRef = useRef<Map<string, boolean> | null>(null);
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;

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
    emitCampaignTrigger('task_completed');
    if (flipped.isStarter) return;
    const id = flipped.id;
    showNotification(
      <span className="flex min-w-0 items-center gap-2.5">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
        <span className="min-w-0 truncate font-semibold">{flipped.text}</span>
      </span>,
      () => {
        hapticTick();
        setDelayedCompleted((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        return toggleRef.current(id, false);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);
  const [isAnyDragging, setIsAnyDragging] = useState(false);
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);
  const [sectionEditor, setSectionEditor] = useState<
    { mode: 'create' } | { mode: 'edit'; sectionId: string } | null
  >(null);
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
    const media = window.matchMedia(
      '(max-width: 767px), (hover: none), (pointer: coarse)',
    );
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
        ? { delay: 150, tolerance: 8 }
        : { distance: 5 },
    }),
    [usesSwipeTrays],
  );
  const touchOptions = useMemo(
    () => ({ activationConstraint: { delay: 120, tolerance: 8 } }),
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

  const requestSkipToday = (taskId: string) => {
    void onDeleteToday(taskId);
  };

  const confirmDeleteToday = async () => {
    await runDeleteToday();
  };

  const runDeleteToday = async () => {
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
    await runDeleteWeek();
  };

  const runDeleteWeek = async () => {
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

  const [nowMinutes, setNowMinutes] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNowMinutes(d.getHours() * 60 + d.getMinutes());
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  const seenStartTimesRef = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    const prev = seenStartTimesRef.current;
    seenStartTimesRef.current = new Map(
      tasks.map((t) => [t.id, t.startTime ?? '']),
    );
    if (!prev || !onReorder || isFrozen) return;
    const changed = tasks
      .filter(
        (t) =>
          !t.completed &&
          clockMinutes(t.startTime) !== null &&
          prev.get(t.id) !== t.startTime,
      )
      .sort(
        (a, b) => (clockMinutes(a.startTime) ?? 0) - (clockMinutes(b.startTime) ?? 0),
      );
    if (changed.length === 0) return;

    const ordered = [...tasks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const before = ordered.map((t) => t.id).join('|');
    for (const task of changed) {
      const from = ordered.findIndex((t) => t.id === task.id);
      if (from === -1) continue;
      const [moving] = ordered.splice(from, 1);
      const start = clockMinutes(moving.startTime)!;
      const section = moving.sectionId ?? null;
      const peers = ordered
        .map((t, index) => ({ t, index }))
        .filter(
          ({ t }) =>
            !t.completed &&
            (t.sectionId ?? null) === section &&
            clockMinutes(t.startTime) !== null,
        );
      const later = peers.find(({ t }) => clockMinutes(t.startTime)! > start);
      const to = later
        ? later.index
        : peers.length > 0
          ? peers[peers.length - 1].index + 1
          : from;
      ordered.splice(to, 0, moving);
    }
    if (ordered.map((t) => t.id).join('|') !== before) onReorder(ordered);
  }, [tasks]); // eslint-disable-line react-hooks/exhaustive-deps

  // Determine visible tasks
  const visibleTasks = tasks.filter((t) => {
    const isTemporarilyVisible = delayedCompleted.has(t.id);
    const isActuallyCompleted =
      t.completed && !vSet.has(t.id) && !isTemporarilyVisible;
    return matchesTaskFilters(t, filters, isActuallyCompleted);
  });

  // Helper: is this task truly completed (not in grace period, not visually uncompleted)
  const isTaskSettledCompleted = (t: Task) =>
    t.completed && !vSet.has(t.id) && !delayedCompleted.has(t.id);

  // Split into two groups: active (including grace-period tasks) and completed
  const tagSortOrder = userTags.map((t) => t.id);

  const activeTasks = sortTasks(
    visibleTasks
      .filter((t) => !isTaskSettledCompleted(t))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    filters.sort,
    tagSortOrder,
  );

  const completedTasks = sortTasks(
    visibleTasks
      .filter((t) => isTaskSettledCompleted(t))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    filters.sort,
    tagSortOrder,
  );

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

  let nextTimedTaskId: string | undefined;
  let nextTimedStart = Infinity;
  if (nowMinutes !== null) {
    for (const t of sortedActiveTasks) {
      if (t.completed || vSet.has(t.id)) continue;
      const start = clockMinutes(t.startTime);
      if (start === null) continue;
      const end = clockMinutes(t.endTime) ?? start;
      if (Math.max(start, end) >= nowMinutes && start < nextTimedStart) {
        nextTimedStart = start;
        nextTimedTaskId = t.id;
      }
    }
  }

  // Exactly one row demos the swipe: the same one the coach has spotlit, so a
  // tagged guide never nudges rows sitting behind its own dim.
  const listHint = useUIStore((s) => s.activeHint);
  const listHintTagIds = listHint?.context?.tagIds ?? [];
  const listHintTagged =
    guideById(listHint?.guideId)?.beats[listHint?.beatIndex ?? 0]?.scope ===
    'tagged';
  const hintPeekTaskId = sortedActiveTasks.find(
    (t) =>
      !(t.completed || vSet.has(t.id)) &&
      (!listHintTagged ||
        (t.tags ?? []).some((id) => listHintTagIds.includes(id))),
  )?.id;

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
    maxDragDistRef.current = 0;
    dragStartedAtRef.current = performance.now();
    hapticGrab();
    lastDragOverIdRef.current = null;
    setIsAnyDragging(true);
    setDragActiveId(String(event.active.id));
    if (openSteps.size) {
      setOpenSteps(new Set());
      setCollapsedForDrag(true);
    }
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

  // Same story as the section tuck-in above: the steps panel closes on the
  // render *after* drag start, so the corridor measured at drag start still
  // spans the expanded row and lets the drag run far past the list.
  useEffect(() => {
    if (!collapsedForDrag) return;
    const remeasure = () =>
      computeActiveAreaLimits(draggingSectionId !== null);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(remeasure);
    });
    const settle = window.setTimeout(remeasure, 300);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(settle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsedForDrag]);

  const maxDragDistRef = useRef(0);
  const dragStartedAtRef = useRef(0);
  const handleDragMove = (event: DragMoveEvent) => {
    const dist = Math.max(Math.abs(event.delta.x), Math.abs(event.delta.y));
    if (dist > maxDragDistRef.current) maxDragDistRef.current = dist;
  };

  const handleDragCancel = () => {
    if (maxDragDistRef.current >= 5) lastSortDragAt = performance.now();
    setIsAnyDragging(false);
    setDragActiveId(null);
    setCollapsedForDrag(false);
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
    const travelled = Math.max(
      maxDragDistRef.current,
      Math.abs(event.delta.x),
      Math.abs(event.delta.y),
    );
    if (travelled >= 5) lastSortDragAt = performance.now();
    setIsAnyDragging(false);
    setDragActiveId(null);
    setCollapsedForDrag(false);
    activeAreaLimitsRef.current = null;
    const { active, over } = event;

    const activeSectionId = sectionIdFromSortable(active.id);

    // A held tap on a task can activate the delay-based sort sensor without
    // movement, and dnd-kit then swallows the detail-sheet click. Section
    // headers have a dedicated reorder handle, so a stationary handle release
    // should do nothing rather than toggling the section.
    if (travelled < 5 && typeof active.id === 'string') {
      clearDraggingSection();
      const heldMs = performance.now() - dragStartedAtRef.current;
      if (!activeSectionId && heldMs < TAP_AFTER_LIFT_MS) {
        setActionSheetId(active.id);
      } else {
        lastSortDragAt = performance.now();
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
    hapticImpact();
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

  const dragActiveTask = dragActiveId
    ? tasks.find((t) => t.id === dragActiveId) ?? null
    : null;
  const dragActiveSectionId = dragActiveId
    ? sectionIdFromSortable(dragActiveId)
    : null;
  const dragActiveSection = dragActiveSectionId
    ? sections.find((sec) => sec.id === dragActiveSectionId) ?? null
    : null;

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

      const overhang = draggingNodeRect.height / 2;

      const currentBottom = draggingNodeRect.bottom + newY;
      if (currentBottom > limitBottom + overhang) {
        newY = limitBottom + overhang - draggingNodeRect.bottom;
      }

      const currentTop = draggingNodeRect.top + newY;
      if (currentTop < limitTop - overhang) {
        newY = limitTop - overhang - draggingNodeRect.top;
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
        <div className="w-full" data-hint="task-list">
        {header}
        <div
          className={`-mx-1.5 -mt-0.5 space-y-0 overflow-y-visible px-1.5 pt-0.5 md:-mx-4 md:px-4 ${exitAction ? 'overflow-x-visible' : 'overflow-x-hidden'}`}
          ref={scrollContainerRef}
        >
          {tasks.length === 0 && !exitAction ? (
            /* Empty State: No Tasks at all */
            <div className={`overflow-hidden ${HOME_CARD_SURFACE}`}>
              <EmptyAddRow
                label="Add your first task"
                quickAddOpen={quickAddOpen}
                onClick={() =>
                  onAddRequested('', null, { preselectToday: true })
                }
              />
            </div>
          ) : tasks.length > 0 &&
            sortedVisibleTasks.length === 0 &&
            !exitAction ? (
            /* Empty State: Tasks exist but all filtered/completed */
            <div className={`overflow-hidden ${HOME_CARD_SURFACE}`}>
            {allTasksCompleted && !filtersActive ? (
              <DayClearedState
                doneCount={tasks.length}
                hideActions={hideAddControls}
                onPlanTomorrow={() => router.push('/planner')}
                onAddTask={() =>
                  onAddRequested('', null, { preselectToday: true })
                }
                onShowCompleted={onShowCompleted}
                addDisabled={quickAddOpen}
              />
            ) : filtersActive ? (
              <FilteredEmptyState
                hidden={tasks.length}
                onClearAll={onClearFilters}
              />
            ) : (
              <EmptyAddRow
                label="Add another task"
                quickAddOpen={quickAddOpen}
                onClick={() =>
                  onAddRequested('', null, { preselectToday: true })
                }
              />
            )}
            </div>
          ) : (
            /* List Content */
            <DndContext
              sensors={sensors}
              collisionDetection={
                draggingSectionId !== null
                  ? closestCenter
                  : pointerMidpointCollision
              }
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragMove={handleDragMove}
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
                            className="relative flex items-center gap-2 px-3 pb-2 pt-3 md:px-3.5"
                          >
                            <span className="text-[13px] font-black text-muted-foreground/70">
                              Completed
                            </span>
                            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-black tabular-nums leading-none text-muted-foreground">
                              {completedTasks.length}
                            </span>
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
                            onToggleCollapsed={() => {
                              hapticTick();
                              onSetSectionCollapsed?.(s.id, !s.collapsed);
                            }}
                            onEdit={() =>
                              setSectionEditor({
                                mode: 'edit',
                                sectionId: s.id,
                              })
                            }
                            onAddTask={
                              quickAddOpen
                                ? undefined
                                : () =>
                                    onAddRequested('', null, {
                                      preselectToday: true,
                                      sectionId: s.id,
                                    })
                            }
                          />
                        );
                      }
                      const task = row.task;
                      const isCompleted = task.completed || vSet.has(task.id);
                      const isHintPeekPrimary = task.id === hintPeekTaskId;
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
                          isDragDisabled={isCompleted || filters.sort !== 'manual'}
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
                                  requestSkipToday(t.id);
                                }
                              : undefined
                          }
                          onStartTimer={
                            !isCompleted && onStartTimer
                              ? (t, o) => onStartTimer(t, o)
                              : undefined
                          }
                          onOpenDetail={(t) => setActionSheetId(t.id)}
                          onToggleChecklistItem={
                            isCompleted ? undefined : toggleChecklistItem
                          }
                          stepsOpen={!isAnyDragging && openSteps.has(task.id)}
                          onToggleSteps={() => toggleSteps(task.id)}
                          paused={paused}
                          hintPeekPrimary={isHintPeekPrimary}
                          isDesktop={!usesSwipeTrays}
                          isNextTimed={task.id === nextTimedTaskId}
                        />
                      );
                    })}
                  </AnimatePresence>
                </SortableContext>
              </div>
              {typeof document !== 'undefined' &&
                createPortal(
                  <DragOverlay dropAnimation={DROP_ANIMATION} zIndex={70}>
                    {dragActiveTask ? (
                      <TaskDragPreview
                        task={dragActiveTask}
                        tags={(dragActiveTask.tags ?? [])
                          .map((tagId) => getTagDetails(tagId))
                          .filter(
                            (tag): tag is NonNullable<typeof tag> => !!tag,
                          )}
                      />
                    ) : dragActiveSection ? (
                      <SectionDragPreview name={dragActiveSection.name} />
                    ) : null}
                  </DragOverlay>,
                  document.body,
                )}
            </DndContext>
          )}

          {/* Show Finished Toggle (Removed from bottom) */}
        </div>

        {/* Add Task footer at the end of the list */}
        {!hideAddControls &&
          (exitAction ||
          (tasks.length > 0 && sortedVisibleTasks.length > 0)) && (
          <div>
            <button
              onClick={() => onAddRequested('', null, { preselectToday: true })}
              disabled={quickAddOpen}
              className={`group relative flex w-full items-center gap-3 py-1.5 pl-3.5 pr-2.5 text-left transition-colors active:bg-muted/60 disabled:pointer-events-none disabled:opacity-0 md:pl-4 md:pr-3 [@media(hover:hover)]:hover:bg-muted/50 ${HOME_CARD_RADIUS}`}
            >
              <span className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-muted-foreground transition-colors group-hover:text-foreground md:text-[16px]">
                Add a task
              </span>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-[1.5px] border-dashed border-muted-foreground/30 text-muted-foreground transition-colors group-hover:border-primary/50 group-hover:text-primary">
                <Plus className="h-5 w-5" strokeWidth={2.5} />
              </span>
            </button>
          </div>
        )}
        </div>
        {!hideAddControls &&
          onCreateSection &&
          sections.length < 10 &&
          (exitAction ||
            (tasks.length > 0 && sortedVisibleTasks.length > 0)) && (
            <AddSectionRow
              onOpen={() => setSectionEditor({ mode: 'create' })}
              disabled={quickAddOpen}
            />
          )}
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

      {(() => {
        const editing =
          sectionEditor?.mode === 'edit'
            ? sections.find((s) => s.id === sectionEditor.sectionId) ?? null
            : null;
        return (
          <SectionEditorSheet
            open={!!sectionEditor}
            mode={sectionEditor?.mode === 'edit' ? 'edit' : 'create'}
            initialName={editing?.name ?? ''}
            initialTagIds={editing?.tagIds ?? []}
            tags={userTags}
            tagOwners={Object.fromEntries(
              sections
                .filter((sec) => sec.id !== editing?.id)
                .flatMap((sec) =>
                  (sec.tagIds ?? []).map((id) => [id, sec.name] as const),
                ),
            )}
            existingNames={sections.map((sec) => sec.name)}
            onClose={() => setSectionEditor(null)}
            onSave={(name, tagIds) => {
              for (const other of sections) {
                if (other.id === editing?.id) continue;
                const kept = (other.tagIds ?? []).filter(
                  (id) => !tagIds.includes(id),
                );
                if (kept.length !== (other.tagIds ?? []).length) {
                  onUpdateSection?.(other.id, { tagIds: kept });
                }
              }
              if (editing) onUpdateSection?.(editing.id, { name, tagIds });
              else onCreateSection?.(name, tagIds);
            }}
            onDelete={
              editing ? () => onDeleteSection?.(editing.id) : undefined
            }
          />
        );
      })()}

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
                ? () => requestSkipToday(sheetTask.id)
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
