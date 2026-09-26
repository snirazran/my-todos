'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname } from 'next/navigation';
import { randomUUID } from '@/lib/uuid';
import { BACKLOG_CLOSED_EVENT } from '@/lib/hints/guides';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDownToLine,
  CalendarCheck,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  ListChecks,
  Plus,
  RotateCw,
} from 'lucide-react';
import useSWR from 'swr';
import {
  Task,
  type DisplayDay,
  type ApiDay,
  ymd,
  parseYmd,
  cmpYmd,
  addDays,
  relativeDayLabel,
  WEEK_ORDER,
} from './helpers';
import DayColumn from './DayColumn';
import TaskList from './TaskList';
import BulkActionBar, { type BulkAction } from './BulkActionBar';
import BulkTagsSheet from './BulkTagsSheet';
import BulkConfirmDialog from './BulkConfirmDialog';
import { EditScopeDialog } from './EditScopeDialog';
import { TaskRepeatPopup } from './TaskRepeatPopup';
import {
  useTaskSelection,
  BACKLOG_KEY,
  type SelectionRef,
} from './hooks/useTaskSelection';
import { monthlyRepeatLabel } from '@/components/ui/quick-add/utils';
import type { RepeatMode, RepeatRule } from '@/components/ui/quick-add/utils';
import { TaskFilterSheet } from '@/components/ui/TaskFilterSheet';
import {
  FilterChipStrip,
  FilterStatusLine,
  FilterTriggerButton,
} from '@/components/ui/TaskFilterBar';
import { useTaskFilters } from '@/hooks/useTaskFilters';
import PaginationDots from './PaginationDots';
import { Skeleton } from '@/components/ui/Skeleton';
import DragOverlay from './DragOverlay';
import PlannerHeader from './PlannerHeader';
import MonthCalendar from './MonthCalendar';
import CalendarSyncRow from './CalendarSyncRow';
import { useDragManager } from './hooks/useDragManager';
import { useBoardPager } from './hooks/useBoardPager';
import QuickAddSheet from '@/components/ui/QuickAddSheet';
import { useSections } from '@/hooks/useSections';
import FrogodoroSheet from '@/components/ui/FrogodoroSheet';
import FrogodoroPill from '@/components/ui/FrogodoroPill';
import BacklogBox from './BacklogBox';
import BacklogTray from './BacklogTray';
import {
  TOUR_EVENT,
  TOUR_SAVED_DROP_EVENT,
  emitTourEvent,
  isSavedDropHidden,
} from '@/lib/tour/plannerTour';
import { useNotification } from '@/components/providers/NotificationProvider';
import { useFrogodoroStore } from '@/lib/frogodoroStore';
import { useFrogodoroUiStore } from '@/lib/frogodoroUiStore';
import { useSheetStore } from '@/lib/sheetStore';
import { useRiveInteractionPause } from '@/lib/riveInteractionPause';
import { notifyQuestClaims } from '@/lib/questClaims';

type RepeatChoice = 'this-week' | 'weekly';

const EDGE_LOAD_DAYS = 7;

// Keep finished tasks pinned to the bottom of a column while preserving the
// relative order within the active and completed groups (stable). Returns the
// original array reference when it's already in order so memoized consumers and
// React.memo children don't re-render needlessly.
function sortCompletedLast(
  tasks: Task[],
  isDone: (t: Task) => boolean = (t) => !!t.completed,
): Task[] {
  let seenCompleted = false;
  let needsSort = false;
  for (const t of tasks) {
    if (isDone(t)) seenCompleted = true;
    else if (seenCompleted) {
      needsSort = true;
      break;
    }
  }
  if (!needsSort) return tasks;
  const active: Task[] = [];
  const completed: Task[] = [];
  for (const t of tasks) (isDone(t) ? completed : active).push(t);
  return [...active, ...completed];
}

export default function TaskBoard({
  windowDates,
  tasksByDate,
  setTasksByDate,
  backlog,
  setBacklog,
  saveDate,
  saveBacklog,
  trackWrite,
  removeOnDate,
  removeFromBacklog,
  onRequestAdd,
  onQuickAdd,
  todayKey,
  activeDateKey,
  setActiveDateKey,
  accountCreatedAt,
  onExtendWindow,
  onJumpToDate,
  onMoveTaskToDate,
  onDuplicateTaskToDate,
  onMoveRepeatInstance,
  onToggleRepeat,
  onScheduleTask,
  onEditTask,
}: {
  windowDates: string[];
  tasksByDate: Record<string, Task[]>;
  setTasksByDate: React.Dispatch<React.SetStateAction<Record<string, Task[]>>>;
  backlog: Task[];
  setBacklog: React.Dispatch<React.SetStateAction<Task[]>>;
  saveDate: (dateKey: string, tasks: Task[]) => Promise<void>;
  saveBacklog: (tasks: Task[]) => Promise<void>;
  /** Marks a write in flight so reconciliation refetches can't land mid-commit
   *  and read back pre-commit state. Every optimistic write must go through it. */
  trackWrite: <T>(run: () => Promise<T>) => Promise<T>;
  removeOnDate: (dateKey: string, id: string) => Promise<void>;
  removeFromBacklog: (id: string) => Promise<void>;
  onRequestAdd: (
    dateKey: string | null,
    text?: string,
    afterIndex?: number | null,
    repeat?: RepeatChoice,
  ) => void;
  onQuickAdd?: (data: {
    text: string;
    dates: string[]; // explicit YYYY-MM-DD list
    repeat: RepeatChoice;
    tags: string[];
    startTime?: string;
    endTime?: string;
    reminder?: string;
    repeatEndDate?: string | null;
    repeatRule?: import('@/components/ui/quick-add/utils').RepeatRule | null;
    sectionId?: string | null;
  }) => Promise<void> | void;
  todayKey: string;
  activeDateKey: string;
  setActiveDateKey: (d: string) => void;
  accountCreatedAt?: string | null;
  onExtendWindow?: (direction: 'past' | 'future') => Promise<boolean | void>;
  onJumpToDate?: (target: string) => void | Promise<void>;
  onMoveTaskToDate?: (
    taskId: string,
    fromDateKey: string,
    targetKey: string,
  ) => void | Promise<void>;
  onDuplicateTaskToDate?: (
    taskId: string,
    targetKey: string,
  ) => void | Promise<void>;
  onMoveRepeatInstance?: (
    taskId: string,
    newId: string,
    fromDate: string,
    toDate: string,
    order?: number,
  ) => void | Promise<void>;
  onToggleRepeat?: (taskId: string, dateKey: string) => Promise<void> | void;
  onScheduleTask?: (
    taskId: string,
    data: { startTime: string; endTime: string; reminder: string },
  ) => Promise<void> | void;
  onEditTask?: (
    dateKey: string,
    taskId: string,
    newText: string,
  ) => Promise<void>;
}) {
  const pathname = usePathname();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const {
    scrollerRef,
    setSlideRef,
    setListRef,
    setCardRef,
    drag,
    targetDay,
    targetIndex,
    onGrab,
    endDrag,
    cancelDrag,
    settleAndEnd,
    registerOverlayEl,
    setFrameCallback,
  } = useDragManager();

  // index range: 0..N-1 = date columns, N = backlog
  const N = windowDates.length;
  const BACKLOG_IDX = N;

  // Grace period: a just-completed task is held in its active position for a
  // beat before it sinks to the finished pile (mirrors the home TaskList feel).
  const COMPLETE_GRACE_MS = 3000;
  const [recentlyCompleted, setRecentlyCompleted] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const graceTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const clearGrace = useCallback((taskId: string) => {
    const t = graceTimersRef.current.get(taskId);
    if (t) {
      clearTimeout(t);
      graceTimersRef.current.delete(taskId);
    }
    setRecentlyCompleted((prev) => {
      if (!prev.has(taskId)) return prev;
      const next = new Set(prev);
      next.delete(taskId);
      return next;
    });
  }, []);

  const markRecentlyCompleted = useCallback((taskId: string) => {
    const existing = graceTimersRef.current.get(taskId);
    if (existing) clearTimeout(existing);
    setRecentlyCompleted((prev) => {
      if (prev.has(taskId)) return prev;
      const next = new Set(prev);
      next.add(taskId);
      return next;
    });
    graceTimersRef.current.set(
      taskId,
      setTimeout(() => {
        graceTimersRef.current.delete(taskId);
        setRecentlyCompleted((prev) => {
          if (!prev.has(taskId)) return prev;
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
      }, COMPLETE_GRACE_MS),
    );
  }, []);

  useEffect(() => {
    const timers = graceTimersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  // Derive a daysOrder array (Sun..Sat ordering) compatible with TaskList helpers,
  // mapping each column index -> dow for that date.
  const daysOrder = useMemo(
    () =>
      windowDates.map((d) => parseYmd(d).getDay()) as ReadonlyArray<
        Exclude<ApiDay, -1>
      >,
    [windowDates],
  );

  const todayIdx = useMemo(() => {
    const i = windowDates.indexOf(todayKey);
    return i >= 0 ? i : 0;
  }, [windowDates, todayKey]);

  const activeIdx = useMemo(() => {
    const i = windowDates.indexOf(activeDateKey);
    return i >= 0 ? i : todayIdx;
  }, [windowDates, activeDateKey, todayIdx]);

  // Day columns with finished tasks pinned to the bottom. Used for both
  // rendering and drag math so the visual order matches array indices.
  const sortedTasksByDate = useMemo(() => {
    const out: Record<string, Task[]> = {};
    const isDone = (t: Task) => !!t.completed && !recentlyCompleted.has(t.id);
    for (const k in tasksByDate) out[k] = sortCompletedLast(tasksByDate[k], isDone);
    return out;
  }, [tasksByDate, recentlyCompleted]);

  const activeTaskCount = useCallback(
    (tasks: Task[]) =>
      tasks.filter((t) => !t.completed || recentlyCompleted.has(t.id)).length,
    [recentlyCompleted],
  );

  // helpers to get/set a column by index
  const colAt = useCallback(
    (i: number): Task[] => {
      if (i === BACKLOG_IDX) return backlog;
      const d = windowDates[i];
      return d ? (sortedTasksByDate[d] ?? []) : [];
    },
    [BACKLOG_IDX, backlog, sortedTasksByDate, windowDates],
  );

  const setColAt = useCallback(
    (i: number, next: Task[]) => {
      if (i === BACKLOG_IDX) {
        setBacklog(next);
      } else {
        const d = windowDates[i];
        if (!d) return;
        setTasksByDate((prev) => ({ ...prev, [d]: next }));
      }
    },
    [BACKLOG_IDX, setBacklog, setTasksByDate, windowDates],
  );

  const draggingTask = useMemo(
    () =>
      drag?.active
        ? (colAt(drag.fromDay).find((t) => t.id === drag.taskId) ?? null)
        : null,
    [drag?.active, drag?.fromDay, drag?.taskId, colAt],
  );
  const draggingRepeating =
    !!draggingTask &&
    draggingTask.type !== 'backlog' &&
    drag?.fromDay !== BACKLOG_IDX &&
    (draggingTask.type === 'weekly' ||
      (!!draggingTask.repeatMode && draggingTask.repeatMode !== 'none'));

  const saveCol = useCallback(
    (i: number, tasks: Task[]) => {
      const ordered = tasks.map((t, idx) => ({ ...t, order: idx + 1 }));
      if (i === BACKLOG_IDX) return saveBacklog(ordered);
      const d = windowDates[i];
      if (!d) return Promise.resolve();
      return saveDate(d, ordered);
    },
    [BACKLOG_IDX, saveBacklog, saveDate, windowDates],
  );

  // One board-wide filter: every day column and the saved tray read from it.
  const {
    filters,
    setFilters,
    baseFilters,
    reset: resetFilters,
    presets,
    savePreset,
    deletePreset,
    isActive: filtersActive,
    activeCount: activeFilterCount,
  } = useTaskFilters('planner');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [stripOpen, setStripOpen] = useState(false);
  const filterPool = useMemo(
    () => [...windowDates.flatMap((d) => tasksByDate[d] ?? []), ...backlog],
    [windowDates, tasksByDate, backlog],
  );

  const { data: tagsData } = useSWR('/api/tags', (url) =>
    fetch(url).then((r) => r.json()),
  );
  const userTags = tagsData?.tags || [];

  useEffect(() => {
    cancelDrag();
  }, [pathname, cancelDrag]);

  const [pageIndex, setPageIndex] = useState<number>(activeIdx);
  // Mirrors pageIndex for callbacks (like onDrop) that need the live "which
  // column is currently most visible" answer without depending on pageIndex
  // and getting recreated on every scroll tick during a drag.
  const pageIndexRef = useRef(pageIndex);
  pageIndexRef.current = pageIndex;

  // Edge "Move to a specific date" drop zones (shown while dragging)
  const pastZoneRef = useRef<HTMLDivElement>(null);
  const futureZoneRef = useRef<HTMLDivElement>(null);
  const [dateZoneActive, setDateZoneActive] = useState(false);
  const [moveCalendarOpen, setMoveCalendarOpen] = useState(false);
  const [pendingMove, setPendingMove] = useState<{
    taskId: string;
    fromDateKey: string;
    mode: 'move' | 'duplicate';
  } | null>(null);

  // Whether the past edge can still load more (bounded by account creation).
  const canLoadPast = useMemo(() => {
    const minBound = accountCreatedAt ?? '1970-01-01';
    return windowDates.length > 0 && cmpYmd(windowDates[0], minBound) > 0;
  }, [windowDates, accountCreatedAt]);


  const [edgeStatus, setEdgeStatus] = useState<
    Record<'past' | 'future', 'idle' | 'loading' | 'error'>
  >({ past: 'idle', future: 'idle' });
  const edgeBusyRef = useRef(false);
  const edgeStatusRef = useRef(edgeStatus);
  edgeStatusRef.current = edgeStatus;
  const extendEdge = useCallback(
    async (side: 'past' | 'future', auto = false) => {
      if (!onExtendWindow || edgeBusyRef.current) return;
      if (side === 'past' && !canLoadPast) return;
      if (auto && edgeStatusRef.current[side] === 'error') return;
      edgeBusyRef.current = true;
      setEdgeStatus((prev) => ({ ...prev, [side]: 'loading' }));
      const ok = await onExtendWindow(side).catch(() => false);
      edgeBusyRef.current = false;
      setEdgeStatus((prev) => ({
        ...prev,
        [side]: ok === false ? 'error' : 'idle',
      }));
    },
    [onExtendWindow, canLoadPast],
  );

  const scrollLocked = useSheetStore((s) => s.count) > 0;
  const trackRef = useRef<HTMLDivElement>(null);
  const dragActiveRef = useRef(false);
  dragActiveRef.current = !!drag?.active;
  const pager = useBoardPager({
    scrollerRef,
    trackRef,
    enabled: !scrollLocked,
    isCardDragging: () => dragActiveRef.current,
  });

  const prevWindowStartRef = useRef(windowDates[0]);
  const prevScrollWidthRef = useRef(0);
  React.useLayoutEffect(() => {
    const s = scrollerRef.current;
    if (!s) return;
    const start = windowDates[0];
    if (
      start !== prevWindowStartRef.current &&
      cmpYmd(start, prevWindowStartRef.current) < 0
    ) {
      s.scrollLeft += s.scrollWidth - prevScrollWidthRef.current;
    }
    prevWindowStartRef.current = start;
    prevScrollWidthRef.current = s.scrollWidth;
  });

  // Backlog state
  const [backlogOpen, setBacklogOpen] = useState(false);
  const backlogBoxRef = useRef<HTMLDivElement>(null);
  const backlogTrayRef = useRef<HTMLDivElement>(null);
  const [isDragOverBacklog, setIsDragOverBacklog] = useState(false);
  const [trayCloseProgress, setTrayCloseProgress] = useState(0);
  const [savedDropHidden, setSavedDropHidden] = useState(isSavedDropHidden);
  const [todayInView, setTodayInView] = useState(true);

  useEffect(() => {
    const onTourSavedDrop = (event: Event) => {
      const hidden = (event as CustomEvent<{ hidden?: boolean }>).detail
        ?.hidden;
      setSavedDropHidden(!!hidden);
    };
    window.addEventListener(TOUR_SAVED_DROP_EVENT, onTourSavedDrop);
    return () =>
      window.removeEventListener(TOUR_SAVED_DROP_EVENT, onTourSavedDrop);
  }, []);

  const { animateToIndex, settle: settleBoard, step: stepBoard } = pager;
  const [atBoardStart, setAtBoardStart] = useState(false);
  const centerColumnSmooth = useCallback(
    (i: number) => animateToIndex(i),
    [animateToIndex],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (scrollLocked || dragActiveRef.current) return;
      const t = e.target as HTMLElement | null;
      if (
        t?.closest(
          'input, textarea, select, [contenteditable], [contenteditable="true"], [role="slider"], [role="listbox"]',
        )
      )
        return;
      e.preventDefault();
      stepBoard(e.key === 'ArrowRight' ? 1 : -1, e.shiftKey ? 'page' : 'day');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [scrollLocked, stepBoard]);

  const updateTodayVisibility = useCallback(() => {
    const s = scrollerRef.current;
    if (!s) return;

    const col = document.querySelector<HTMLElement>(
      `[data-date-key="${todayKey}"]`,
    );
    if (!col) {
      setTodayInView(false);
      return;
    }

    const scrollerRect = s.getBoundingClientRect();
    const colRect = col.getBoundingClientRect();
    const inset = 24;
    const isVisible =
      colRect.right > scrollerRect.left + inset &&
      colRect.left < scrollerRect.right - inset;

    setTodayInView((prev) => (prev === isVisible ? prev : isVisible));
  }, [scrollerRef, todayKey]);

  // Mount: scroll to today's column instantly
  const didInitialCenter = useRef(false);
  React.useLayoutEffect(() => {
    if (didInitialCenter.current) return;
    const s = scrollerRef.current;
    const col = (document.querySelectorAll('[data-col="true"]')[activeIdx] ??
      null) as HTMLElement | null;
    if (!s || !col) return;
    s.scrollTo({
      left: col.offsetLeft - (s.clientWidth - col.clientWidth) / 2,
      // @ts-ignore
      behavior: 'instant',
    });
    setPageIndex(activeIdx);
    didInitialCenter.current = true;
    updateTodayVisibility();
  }, [activeIdx, scrollerRef, updateTodayVisibility]);

  // After a full-window rebuild (jumpToDate / move-to-date / far calendar jump),
  // both bounds change and the old scroll position is meaningless — re-center on
  // the active date. Incremental extends (one bound changes) are skipped.
  const prevBoundsRef = useRef({
    start: windowDates[0],
    end: windowDates[windowDates.length - 1],
  });
  useEffect(() => {
    const start = windowDates[0];
    const end = windowDates[windowDates.length - 1];
    const prev = prevBoundsRef.current;
    const bothChanged = start !== prev.start && end !== prev.end;
    prevBoundsRef.current = { start, end };
    if (!bothChanged) return;
    const i = windowDates.indexOf(activeDateKey);
    if (i < 0) return;
    setPageIndex(i);
    const s = scrollerRef.current;
    if (!s) return;
    requestAnimationFrame(() => {
      const col = document.querySelector<HTMLElement>(
        `[data-date-key="${activeDateKey}"]`,
      );
      if (col) {
        s.scrollTo({
          left: col.offsetLeft - (s.clientWidth - col.clientWidth) / 2,
          // @ts-ignore
          behavior: 'instant',
        });
      }
    });
  }, [windowDates, activeDateKey, scrollerRef]);

  useEffect(() => {
    const s = scrollerRef.current;
    if (!s) return;

    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateTodayVisibility);
    };

    schedule();
    s.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);

    return () => {
      cancelAnimationFrame(frame);
      s.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [scrollerRef, updateTodayVisibility, windowDates.length]);

  // The board is a drag/pan surface. A mouse-drag that starts on a card or
  // column header (where panning is intentionally disabled) would otherwise
  // begin a native text selection that sweeps across columns. CSS
  // `user-select: none` does not reliably stop a drag-initiated selection
  // (the browser can anchor it on a selectable ancestor), so we cancel the
  // `selectstart` event — the documented way to prevent a selection from ever
  // being created. Real form fields are exempt so the composer/edit inputs and
  // any text entry inside the board still work.
  useEffect(() => {
    const s = scrollerRef.current;
    if (!s) return;
    const onSelectStart = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (
        t?.closest(
          'input, textarea, select, [contenteditable], [contenteditable="true"]',
        )
      )
        return;
      e.preventDefault();
    };
    s.addEventListener('selectstart', onSelectStart);
    return () => s.removeEventListener('selectstart', onSelectStart);
  }, [scrollerRef]);

  // Track which column is centered on scroll. Coalesced to one rAF per frame —
  // scroll events can fire several times per frame on mobile, and this handler
  // does layout reads plus state updates, so running it raw made swipes janky.
  useEffect(() => {
    const s = scrollerRef.current;
    if (!s) return;
    let frame = 0;
    const compute = () => {
      frame = 0;
      const cols = Array.from(
        document.querySelectorAll<HTMLElement>('[data-col="true"]'),
      );
      const idx = cols.findIndex((col) => {
        const colCenter = col.offsetLeft + col.clientWidth / 2;
        const scrollCenter = s.scrollLeft + s.clientWidth / 2;
        return Math.abs(colCenter - scrollCenter) < col.clientWidth / 2;
      });
      if (idx >= 0 && idx < N) {
        setPageIndex(idx);
        const dk = windowDates[idx];
        if (dk && dk !== activeDateKey) setActiveDateKey(dk);
      }

      const atStartNow = s.scrollLeft < 2 && !canLoadPast;
      setAtBoardStart((prev) => (prev === atStartNow ? prev : atStartNow));

      const first = cols[0];
      const last = cols[cols.length - 1];
      if (first && last && !drag?.active) {
        const lookahead = first.clientWidth * 3;
        const rightGap =
          last.offsetLeft + last.clientWidth - (s.scrollLeft + s.clientWidth);
        const leftGap = s.scrollLeft - first.offsetLeft;
        if (rightGap < lookahead) void extendEdge('future', true);
        else if (leftGap < lookahead && canLoadPast)
          void extendEdge('past', true);
      }
    };
    const handler = () => {
      if (frame) return;
      frame = requestAnimationFrame(compute);
    };
    s.addEventListener('scroll', handler, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      s.removeEventListener('scroll', handler);
    };
  }, [
    N,
    windowDates,
    activeDateKey,
    setActiveDateKey,
    scrollerRef,
    drag?.active,
    canLoadPast,
    extendEdge,
  ]);

  // Freeze ambient Rive playback while a card is being dragged (scrolling is
  // covered globally by RiveScrollPause). Uses getState() on purpose: no React
  // subscription, so pause/resume can never feed back into the drag renders.
  useEffect(() => {
    if (!drag?.active) return;
    const { acquire, release } = useRiveInteractionPause.getState();
    acquire();
    return release;
  }, [drag?.active]);

  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickText, setQuickText] = useState('');
  const boardSections = useSections();
  const [showTimer, setShowTimer] = useState(false);
  const [timerTask, setTimerTask] = useState<Task | null>(null);
  const { stackHeight: notificationStackHeight, showNotification } =
    useNotification();
  const frogTaskId = useFrogodoroStore((s) => s.selectedTaskId);
  const lastCompletionId = useFrogodoroStore((s) => s.lastCompletionId);
  const lastCompletedTaskId = useFrogodoroStore((s) => s.lastCompletedTaskId);

  // Planner hosts the full timer UI, so suppress the global mini overlay here.
  const addFullTimerHost = useFrogodoroUiStore((s) => s.addFullTimerHost);
  const removeFullTimerHost = useFrogodoroUiStore((s) => s.removeFullTimerHost);
  useEffect(() => {
    addFullTimerHost();
    return () => removeFullTimerHost();
  }, [addFullTimerHost, removeFullTimerHost]);

  const findTaskById = useCallback(
    (id: string | null | undefined): Task | null => {
      if (!id) return null;
      for (const list of Object.values(tasksByDate)) {
        const found = list.find((t) => t.id === id);
        if (found) return found;
      }
      return backlog.find((t) => t.id === id) ?? null;
    },
    [tasksByDate, backlog],
  );

  // On a finished session, prefer this page's own Frogodoro popup when nothing
  // is blocking it; otherwise the global completion popup handles it (above any
  // open popup). Mirrors the home page.
  const lastHandledCompletionRef = useRef<number | null>(null);
  const boardMountTimeRef = useRef<number>(Date.now());
  useEffect(() => {
    if (lastHandledCompletionRef.current === null) {
      lastHandledCompletionRef.current = lastCompletionId;
      return;
    }
    if (lastCompletionId === lastHandledCompletionRef.current) return;

    const isRehydrationArtifact = Date.now() - boardMountTimeRef.current < 4000;
    lastHandledCompletionRef.current = lastCompletionId;
    if (isRehydrationArtifact) return;

    if (useSheetStore.getState().count > 0) return;

    const completedTask =
      findTaskById(lastCompletedTaskId) ?? findTaskById(frogTaskId);
    if (completedTask) setTimerTask(completedTask);
    setShowTimer(true);
  }, [lastCompletionId, lastCompletedTaskId, frogTaskId, findTaskById]);

  // Optimistically patch a task (and its repeat group when scope='all') across
  // the planner's local state, so detail-card edits feel instant.
  const patchTask = useCallback(
    (
      taskId: string,
      patch: Partial<Task>,
      scope: 'one' | 'all' = 'one',
      groupId?: string,
      // When set (scope 'one'), only patch the instance in this date column.
      // Repeating tasks share one id across every column, so without this an
      // id-only match would patch every future instance too.
      dateKey?: string,
    ) => {
      if ('completed' in patch) {
        if (patch.completed) markRecentlyCompleted(taskId);
        else clearGrace(taskId);
      }
      const match = (t: Task, columnKey?: string) =>
        scope === 'all' && groupId
          ? t.repeatGroupId === groupId
          : t.id === taskId && (!dateKey || columnKey === dateKey);
      setTasksByDate((prev) => {
        let changed = false;
        const next: Record<string, Task[]> = {};
        for (const k in prev) {
          next[k] = prev[k].map((t) => {
            if (match(t, k)) {
              changed = true;
              return { ...t, ...patch };
            }
            return t;
          });
        }
        return changed ? next : prev;
      });
      // The backlog isn't tied to a date column; skip it when date-scoped.
      if (!dateKey) {
        setBacklog((prev) =>
          prev.map((t) => (match(t) ? { ...t, ...patch } : t)),
        );
      }
    },
    [setTasksByDate, setBacklog, markRecentlyCompleted, clearGrace],
  );
  const [initialDateKey, setInitialDateKey] = useState<string | undefined>(
    undefined,
  );

  // ---------------------------------------------------------------- selection
  // Multi-select lives here rather than in TaskList so a selection can span day
  // columns — "sweep up what's left across Mon/Wed/Fri and move it to Saturday"
  // is the whole point, and each TaskList only ever sees its own column.
  const selection = useTaskSelection();
  const selectionCount = selection.stats.count;
  useEffect(() => {
    emitTourEvent(TOUR_EVENT.selection, { count: selectionCount });
  }, [selectionCount]);
  const tz =
    typeof window !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'UTC';

  const [bulkTagsOpen, setBulkTagsOpen] = useState(false);
  const [bulkRepeatOpen, setBulkRepeatOpen] = useState(false);
  // Snapshotted when the sheet opens: a background refetch mid-edit would
  // otherwise hand the picker fresh props and wipe the choice in progress.
  const [repeatSeed, setRepeatSeed] = useState<{
    mode: RepeatMode;
    endDate: string | null;
    rule: RepeatRule | null;
    anchor: string;
    count: number;
  }>({ mode: 'none', endDate: null, rule: null, anchor: '', count: 0 });
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDateMode, setBulkDateMode] = useState<'move' | 'duplicate' | null>(
    null,
  );
  // Set while a bulk edit is waiting on the "this task only / all repeats"
  // answer — asked once for the whole selection, never once per task.
  const [pendingBulkScope, setPendingBulkScope] = useState<{
    run: (scope: 'one' | 'all') => void;
  } | null>(null);

  const refFor = useCallback(
    (t: Task, dateKey: string, dayIndex: number): SelectionRef => ({
      taskId: t.id,
      dateKey,
      dayIndex,
      isRepeating: t.type === 'weekly',
      repeatGroupId: t.repeatGroupId,
      completed: !!t.completed,
    }),
    [],
  );

  const selectionFor = useCallback(
    (dk: string, dayIndex: number) => ({
      active: selection.active,
      isSelected: (taskId: string) => selection.isSelected(dk, taskId),
      toggle: (t: Task, mods: { shift: boolean }, visible: Task[]) => {
        if (mods.shift) {
          selection.selectRange(
            refFor(t, dk, dayIndex),
            visible.map((v) => refFor(v, dk, dayIndex)),
          );
        } else {
          selection.toggle(refFor(t, dk, dayIndex));
        }
      },
      enter: (t: Task) => selection.enter(refFor(t, dk, dayIndex)),
    }),
    [selection, refFor],
  );

  /** The picked tasks, resolved back to live Task objects. */
  const selectedTasks = useMemo(() => {
    const out: { ref: SelectionRef; task: Task }[] = [];
    for (const ref of selection.refs) {
      const list =
        ref.dateKey === BACKLOG_KEY ? backlog : (tasksByDate[ref.dateKey] ?? []);
      const task = list.find((t) => t.id === ref.taskId);
      if (task) out.push({ ref, task });
    }
    return out;
  }, [selection.refs, tasksByDate, backlog]);

  const bulkItems = useMemo(
    () =>
      selection.refs.map((r) => ({
        taskId: r.taskId,
        fromDate: r.dateKey === BACKLOG_KEY ? undefined : r.dateKey,
      })),
    [selection.refs],
  );

  /**
   * Seeds the bulk repeat sheet. When every picked task already shares one
   * repeat setting the sheet opens on it, so "these 3 dailies" doesn't read as
   * "Does not repeat"; a mixed selection has no honest shared answer and starts
   * blank.
   */
  const sharedRepeat = useMemo(() => {
    const blank = {
      mode: 'none' as RepeatMode,
      endDate: null as string | null,
      rule: null as RepeatRule | null,
    };
    if (selectedTasks.length === 0) return blank;
    const keyOf = (t: Task) =>
      JSON.stringify([
        t.repeatMode ?? (t.type === 'weekly' ? 'weekly' : 'none'),
        t.repeatEndDate ?? null,
        t.repeatRule ?? null,
      ]);
    const first = keyOf(selectedTasks[0].task);
    if (selectedTasks.some(({ task }) => keyOf(task) !== first)) return blank;
    const t = selectedTasks[0].task;
    return {
      mode: (t.repeatMode ??
        (t.type === 'weekly' ? 'weekly' : 'none')) as RepeatMode,
      endDate: t.repeatEndDate ?? null,
      rule: (t.repeatRule ?? null) as RepeatRule | null,
    };
  }, [selectedTasks]);

  const bulkTagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const { task } of selectedTasks) {
      for (const tag of task.tags ?? []) counts[tag] = (counts[tag] ?? 0) + 1;
    }
    return counts;
  }, [selectedTasks]);

  const runBulk = useCallback(
    async (
      payload: Record<string, unknown>,
      items: { taskId: string; fromDate?: string }[] = bulkItems,
    ) => {
      if (items.length === 0) return null;
      // Tracked like every single-task write: while a bulk PUT is in flight the
      // planner suppresses reconciliation refetches, so a GET fired by some
      // other mutation can't read the not-yet-committed server state and snap
      // the cards back to their old column before settling.
      return trackWrite(async () => {
        try {
          const res = await fetch('/api/tasks', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bulk: { ...payload, items },
              timezone: tz,
            }),
          });
          const json = await res.json().catch(() => ({}));
          window.dispatchEvent(new Event('board-refresh'));
          return json;
        } catch (e) {
          console.error('bulk action failed', e);
          window.dispatchEvent(new Event('board-refresh'));
          return null;
        }
      });
    },
    [bulkItems, tz, trackWrite],
  );

  /**
   * Bulk move with an Undo toast. Undo replays the move per original column, so
   * it's only offered when nothing repeating is involved: moving one occurrence
   * of a repeat detaches it into a fresh one-off, and putting that back would
   * not restore the series.
   */
  const bulkMoveToDate = useCallback(
    async (
      target: string,
      placement?: { atIndex: number; refs: SelectionRef[] },
    ) => {
      const snapshot = (placement?.refs ?? selection.refs).slice();
      selection.exit();
      await runBulk(
        {
          op: 'move',
          date: target,
          ...(placement ? { atIndex: placement.atIndex } : {}),
        },
        snapshot.map((r) => ({
          taskId: r.taskId,
          fromDate: r.dateKey === BACKLOG_KEY ? undefined : r.dateKey,
        })),
      );
    },
    [selection, runBulk],
  );

  const applyScoped = useCallback(
    (run: (scope: 'one' | 'all') => void) => {
      if (selection.stats.hasRepeating) setPendingBulkScope({ run });
      else run('one');
    },
    [selection.stats.hasRepeating],
  );

  const onBulkAction = useCallback(
    (action: BulkAction) => {
      switch (action) {
        case 'move':
          setBulkDateMode('move');
          setMoveCalendarOpen(true);
          break;
        case 'duplicate':
          setBulkDateMode('duplicate');
          setMoveCalendarOpen(true);
          break;
        case 'tags':
          setBulkTagsOpen(true);
          break;
        case 'repeat': {
          // Anchor on the picked tasks' own day when they share one, so the
          // "Every week on …" and "Every month on the …" labels name the day
          // the change will actually key off.
          const keys = new Set(
            selection.refs
              .map((r) => r.dateKey)
              .filter((k) => k !== BACKLOG_KEY),
          );
          const anchor =
            keys.size === 1
              ? Array.from(keys)[0]
              : (windowDates[pageIndexRef.current] ?? activeDateKey);
          setRepeatSeed({
            ...sharedRepeat,
            anchor,
            count: selection.stats.count,
          });
          setBulkRepeatOpen(true);
          break;
        }
        case 'delete':
          setBulkDeleteOpen(true);
          break;
        case 'backlog': {
          const count = selection.stats.count;
          selection.exit();
          void runBulk({ op: 'backlog' }).then(() => {
            showNotification(
              `Saved ${count} ${count === 1 ? 'task' : 'tasks'} for later`,
            );
          });
          break;
        }
        case 'selectAll': {
          const dk = windowDates[pageIndexRef.current];
          if (!dk) break;
          selection.selectAll(
            (sortedTasksByDate[dk] ?? []).map((t) =>
              refFor(t, dk, pageIndexRef.current),
            ),
          );
          break;
        }
      }
    },
    [
      selection,
      runBulk,
      showNotification,
      windowDates,
      activeDateKey,
      sharedRepeat,
      sortedTasksByDate,
      refFor,
    ],
  );

  /**
   * While a multi-card drag is in flight, every card it carries is pulled out
   * of its column so the whole bundle reads as lifted — otherwise only the card
   * under the finger disappears and the rest look left behind.
   */
  const draggingBundleIds = useMemo(() => {
    if (!drag?.active || (drag.bundleCount ?? 1) <= 1) return null;
    const byDate = new Map<string, Set<string>>();
    for (const r of selection.refs) {
      const set = byDate.get(r.dateKey) ?? new Set<string>();
      set.add(r.taskId);
      byDate.set(r.dateKey, set);
    }
    return byDate;
  }, [drag?.active, drag?.bundleCount, selection.refs]);

  // Dragging a card that's part of the selection carries the whole selection.
  const onGrabMaybeBundled = useCallback(
    (p: any) => {
      const dk = p.day === BACKLOG_IDX ? BACKLOG_KEY : windowDates[p.day];
      const bundled =
        !!dk && selection.isSelected(dk, p.taskId) && selection.stats.count > 1;
      onGrab({
        ...p,
        bundleCount: bundled ? selection.stats.count : undefined,
      });
    },
    [onGrab, selection, windowDates, BACKLOG_IDX],
  );

  /**
   * Drop for a multi-card drag. A same-column drop is a pure reorder handled
   * locally; anything crossing columns goes through the single bulk move so the
   * board settles once instead of once per card.
   */
  const commitBundleDrop = useCallback(
    (toDay: number, toIndex: number) => {
      const refs = selection.refs;
      if (refs.length === 0) return;

      // Compared by date, never by column index — loading more days re-indexes
      // every column, and a selection can outlive that.
      const sourceKeys = new Set(refs.map((r) => r.dateKey));
      const toKey = toDay === BACKLOG_IDX ? BACKLOG_KEY : windowDates[toDay];
      if (
        toDay !== BACKLOG_IDX &&
        sourceKeys.size === 1 &&
        sourceKeys.has(toKey)
      ) {
        const list = colAt(toDay);
        const picked = new Set(refs.map((r) => r.taskId));
        const moved = list.filter((t) => picked.has(t.id));
        const rest = list.filter((t) => !picked.has(t.id));
        // The picked cards are unmounted during the drag, so the drop index the
        // manager measured already counts only the cards that stayed.
        const at = Math.max(0, Math.min(toIndex, rest.length));
        const next = [...rest.slice(0, at), ...moved, ...rest.slice(at)];
        setColAt(toDay, next);
        saveCol(toDay, next).catch(() => {});
        selection.exit();
        return;
      }

      const picked = new Set(refs.map((r) => `${r.dateKey}::${r.taskId}`));

      // The bundle keeps its on-screen order, not the order the cards happened
      // to be tapped in — and the optimistic insert below, the request, and the
      // server's renumber all have to agree on it or the refetch reshuffles.
      const colRank = (dateKey: string) => {
        if (dateKey === BACKLOG_KEY) return Number.MAX_SAFE_INTEGER;
        const i = windowDates.indexOf(dateKey);
        return i === -1 ? Number.MAX_SAFE_INTEGER - 1 : i;
      };
      const rowRank = (dateKey: string, taskId: string) => {
        const list =
          dateKey === BACKLOG_KEY ? backlog : (sortedTasksByDate[dateKey] ?? []);
        const i = list.findIndex((t) => t.id === taskId);
        return i === -1 ? Number.MAX_SAFE_INTEGER : i;
      };
      const orderedRefs = refs.slice().sort((a, b) => {
        const c = colRank(a.dateKey) - colRank(b.dateKey);
        if (c !== 0) return c;
        return rowRank(a.dateKey, a.taskId) - rowRank(b.dateKey, b.taskId);
      });

      const taskFor = new Map(
        selectedTasks.map(({ ref, task }) => [
          `${ref.dateKey}::${ref.taskId}`,
          task,
        ]),
      );
      const movedTasks: Task[] = [];
      for (const ref of orderedRefs) {
        if (ref.isRepeating) continue;
        const task = taskFor.get(`${ref.dateKey}::${ref.taskId}`);
        if (task) movedTasks.push(task);
      }

      // Optimistically empty the source columns so the drop reads as instant;
      // repeating occurrences are left to the refetch, since the server mints a
      // fresh one-off id for each and the client can't predict it.
      setTasksByDate((prev) => {
        const next: Record<string, Task[]> = {};
        let changed = false;
        for (const k in prev) {
          const filtered = prev[k].filter((t) => !picked.has(`${k}::${t.id}`));
          if (filtered.length !== prev[k].length) changed = true;
          next[k] = filtered;
        }
        if (!changed) return prev;
        const targetKey = toDay === BACKLOG_IDX ? null : windowDates[toDay];
        if (targetKey && movedTasks.length) {
          const dest = (next[targetKey] ?? []).slice();
          const at = Math.max(0, Math.min(toIndex, dest.length));
          dest.splice(at, 0, ...movedTasks.filter((m) => !dest.some((d) => d.id === m.id)));
          next[targetKey] = dest;
        }
        return next;
      });
      setBacklog((prev) =>
        prev.filter((t) => !picked.has(`${BACKLOG_KEY}::${t.id}`)),
      );

      if (toDay === BACKLOG_IDX) {
        const count = refs.length;
        selection.exit();
        void runBulk(
          { op: 'backlog' },
          refs.map((r) => ({
            taskId: r.taskId,
            fromDate: r.dateKey === BACKLOG_KEY ? undefined : r.dateKey,
          })),
        ).then(() =>
          showNotification(
            `Saved ${count} ${count === 1 ? 'task' : 'tasks'} for later`,
          ),
        );
        return;
      }

      const targetKey = windowDates[toDay];
      if (targetKey)
        void bulkMoveToDate(targetKey, {
          atIndex: Math.max(0, toIndex),
          refs: orderedRefs,
        });
    },
    [
      selection,
      selectedTasks,
      BACKLOG_IDX,
      backlog,
      sortedTasksByDate,
      colAt,
      setColAt,
      saveCol,
      windowDates,
      setTasksByDate,
      setBacklog,
      runBulk,
      showNotification,
      bulkMoveToDate,
    ],
  );

  // Escape leaves multi-select the way it leaves every other transient mode on
  // this board (the drag manager already owns Escape while dragging).
  useEffect(() => {
    if (!selection.active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !drag?.active) selection.exit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection, drag?.active]);

  // Past tasks can be picked up, but they can only move to today/future — so
  // while hovering a past column we hide the drop placeholder entirely (the
  // drop itself is also blocked in onDrop).
  const isPastDay = (day: number | null) =>
    day !== null &&
    day >= 0 &&
    day < N &&
    cmpYmd(windowDates[day], todayKey) < 0;

  const effectiveTargetDay = isPastDay(targetDay) ? null : targetDay;

  // Clamp Target Index Logic (unchanged)
  let clampedTargetIndex = targetIndex;
  if (effectiveTargetDay !== null && effectiveTargetDay < BACKLOG_IDX) {
    const list = colAt(effectiveTargetDay);
    const firstCompleted = list.findIndex(
      (t) => t.completed && !recentlyCompleted.has(t.id),
    );
    if (firstCompleted !== -1 && targetIndex !== null) {
      const isSelfDrag = drag?.fromDay === effectiveTargetDay;
      const limit = isSelfDrag
        ? Math.max(0, firstCompleted - 1)
        : firstCompleted;
      clampedTargetIndex = Math.min(targetIndex, limit);
    }
  }

  // Per-frame drag hit-testing — runs inside the drag manager's rAF loop via
  // a callback instead of reacting to per-frame React state (which re-rendered
  // the whole board at 60fps and could cascade into update-depth errors).
  // Refs hold the authoritative values for the drop logic; state (quantized so
  // it only changes in visible steps) drives the visuals.
  const isDragOverBacklogRef = useRef(false);
  const dateZoneActiveRef = useRef(false);
  const backlogOpenRef = useRef(backlogOpen);
  backlogOpenRef.current = backlogOpen;

  useEffect(() => {
    if (!drag?.active) {
      setFrameCallback(null);
      isDragOverBacklogRef.current = false;
      dateZoneActiveRef.current = false;
      setIsDragOverBacklog(false);
      setTrayCloseProgress(0);
      setDateZoneActive(false);
      return;
    }
    const fromDay = drag.fromDay;
    const quantize = (v: number) => Math.round(v * 20) / 20;

    const onFrame = (x: number, y: number) => {
      if (
        backlogOpenRef.current &&
        fromDay === BACKLOG_IDX &&
        backlogTrayRef.current
      ) {
        const trayTop = backlogTrayRef.current.getBoundingClientRect().top;
        const EXIT_DIST = 200;
        const progress =
          y < trayTop ? Math.min(1, (trayTop - y) / EXIT_DIST) : 0;
        setTrayCloseProgress(quantize(progress));
      } else {
        setTrayCloseProgress(0);
      }

      const box = backlogBoxRef.current;
      if (box) {
        const r = box.getBoundingClientRect();
        const hit = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
        isDragOverBacklogRef.current = hit;
        setIsDragOverBacklog(hit);
      } else {
        isDragOverBacklogRef.current = false;
        setIsDragOverBacklog(false);
      }

      const over = (el: HTMLElement | null) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      };
      const zone = over(pastZoneRef.current) || over(futureZoneRef.current);
      dateZoneActiveRef.current = zone;
      setDateZoneActive(zone);
    };

    setFrameCallback(onFrame);
    return () => setFrameCallback(null);
  }, [drag?.active, drag?.fromDay, BACKLOG_IDX, setFrameCallback]);

  const commitDragReorder = useCallback(
    (toDay: number, toIndex: number) => {
      if (!drag) return;
      if ((drag.bundleCount ?? 1) > 1) {
        commitBundleDrop(toDay, toIndex);
        return;
      }
      const sameSpot = drag.fromDay === toDay && drag.fromIndex === toIndex;
      if (sameSpot) return;

      // Build atomic next state for both source and dest.
      const sourceList = colAt(drag.fromDay).slice();
      const [moved] = sourceList.splice(drag.fromIndex, 1);
      if (!moved) return;

      // Marker type updates
      if (toDay === BACKLOG_IDX) moved.type = 'backlog';
      else if (drag.fromDay === BACKLOG_IDX && moved.type === 'backlog')
        moved.type = 'regular';

      if (drag.fromDay === toDay) {
        sourceList.splice(Math.min(toIndex, sourceList.length), 0, moved);
        setColAt(toDay, sourceList);
        saveCol(toDay, sourceList).catch(() => {});
      } else {
        const destList = colAt(toDay).slice();
        const destIndex = Math.min(toIndex, destList.length);

        // Moving one occurrence of a repeating task to another day must not
        // touch the series: detach it into a standalone one-off (fresh id) on
        // the destination and suppress the source date on the rule.
        const isRepeatInstance =
          moved.type === 'weekly' &&
          drag.fromDay !== BACKLOG_IDX &&
          toDay !== BACKLOG_IDX;
        const fromDate = windowDates[drag.fromDay];
        const toDate = windowDates[toDay];

        if (isRepeatInstance && fromDate && toDate && onMoveRepeatInstance) {
          const newId = randomUUID();
          const instance: Task = {
            ...moved,
            id: newId,
            type: 'regular',
            repeatMode: 'none',
            repeatGroupId: undefined,
            repeatRule: undefined,
            repeatDayOfMonth: undefined,
            repeatStartDate: undefined,
            repeatEndDate: undefined,
            dayOfWeek: undefined,
            completedDates: undefined,
          };
          destList.splice(destIndex, 0, instance);
          setColAt(drag.fromDay, sourceList);
          setColAt(toDay, destList);
          (async () => {
            try {
              await onMoveRepeatInstance(
                moved.id,
                newId,
                fromDate,
                toDate,
                destIndex + 1,
              );
              await saveCol(toDay, destList);
              await saveCol(drag.fromDay, sourceList);
            } catch (e) {
              console.error('move repeat instance failed', e);
            }
          })();
          return;
        }

        // A non-repeating task may already exist on the destination day (e.g. a
        // repeat that recurs there); every occurrence shares the same id, so
        // drop any existing copy before inserting to avoid duplicate keys.
        const existingIdx = destList.findIndex((t) => t.id === moved.id);
        if (existingIdx !== -1) destList.splice(existingIdx, 1);
        destList.splice(destIndex, 0, moved);
        setColAt(drag.fromDay, sourceList);
        setColAt(toDay, destList);
        saveCol(toDay, destList).catch(() => {});
      }
    },
    [
      drag,
      BACKLOG_IDX,
      colAt,
      setColAt,
      saveCol,
      windowDates,
      onMoveRepeatInstance,
      commitBundleDrop,
    ],
  );

  const handleEditTask = useCallback(
    async (dayIdx: number, taskId: string, newText: string) => {
      if (dayIdx === BACKLOG_IDX) {
        setBacklog((prev) => {
          const next = prev.slice();
          const i = next.findIndex((t) => t.id === taskId);
          if (i !== -1) {
            next[i] = { ...next[i], text: newText };
            saveBacklog(next).catch(console.error);
          }
          return next;
        });
        return;
      }
      const dk = windowDates[dayIdx];
      if (!dk) return;
      setTasksByDate((prev) => {
        const list = (prev[dk] ?? []).slice();
        const i = list.findIndex((t) => t.id === taskId);
        if (i !== -1) {
          list[i] = { ...list[i], text: newText };
          saveDate(dk, list).catch(console.error);
        }
        return { ...prev, [dk]: list };
      });
    },
    [
      BACKLOG_IDX,
      setBacklog,
      saveBacklog,
      windowDates,
      setTasksByDate,
      saveDate,
    ],
  );

  const handleDoLater = useCallback(
    async (dayIdx: number, taskId: string) => {
      if (dayIdx === BACKLOG_IDX) return;
      const dk = windowDates[dayIdx];
      if (!dk) return;
      let movedTask: Task | undefined;
      setTasksByDate((prev) => {
        const list = (prev[dk] ?? []).slice();
        const i = list.findIndex((t) => t.id === taskId);
        if (i === -1) return prev;
        const [task] = list.splice(i, 1);
        task.type = 'backlog';
        movedTask = task;
        saveDate(dk, list).catch(console.error);
        return { ...prev, [dk]: list };
      });
      if (movedTask) {
        setBacklog((prev) => {
          const next = [...prev, movedTask!];
          saveBacklog(next).catch(console.error);
          return next;
        });
      }
    },
    [
      BACKLOG_IDX,
      windowDates,
      setTasksByDate,
      saveDate,
      setBacklog,
      saveBacklog,
    ],
  );

  const onDrop = useCallback(() => {
    if (!drag) return;

    // Read the drag-frame hit-test results from refs — always current at the
    // moment of release, with no state-update timing window.
    const overDateZone = dateZoneActiveRef.current;
    const overBacklog = isDragOverBacklogRef.current;

    const bundled = (drag.bundleCount ?? 1) > 1;
    // Dragging a picked card *is* the bulk move — once it lands, the selection
    // has served its purpose, so multi-select gets out of the way rather than
    // leaving the board in a mode the user has to dismiss.
    const fromKeyOfDrag =
      drag.fromDay === BACKLOG_IDX ? BACKLOG_KEY : windowDates[drag.fromDay];
    const draggedWasSelected =
      !!fromKeyOfDrag && selection.isSelected(fromKeyOfDrag, drag.taskId);

    // Dropped on a "Move to a specific date" edge zone: defer to the calendar.
    if (overDateZone && !overBacklog) {
      if (bundled) {
        setBulkDateMode('move');
      } else {
        const fromKey =
          drag.fromDay !== BACKLOG_IDX ? windowDates[drag.fromDay] : '';
        setPendingMove({
          taskId: drag.taskId,
          fromDateKey: fromKey ?? '',
          mode: 'move',
        });
        // The calendar carries the task on its own from here.
        if (draggedWasSelected) selection.exit();
      }
      setMoveCalendarOpen(true);
      endDrag();
      setDateZoneActive(false);
      setIsDragOverBacklog(false);
      setTrayCloseProgress(0);
      return;
    }

    if (overBacklog && draggingRepeating && !bundled) {
      const fromKey = windowDates[drag.fromDay];
      if (fromKey) removeOnDate(fromKey, drag.taskId).catch(console.error);
      if (draggedWasSelected) selection.exit();
      endDrag();
      setIsDragOverBacklog(false);
      setTrayCloseProgress(0);
      return;
    }

    let finalToDay = (targetDay ?? drag.fromDay) as number;
    let finalToIndex = targetIndex ?? drag.fromIndex;

    if (overBacklog) {
      finalToDay = BACKLOG_IDX;
      finalToIndex = backlog.length;
    }

    // BLOCK: a task can never move into the past — only today or future. This
    // applies to every source (past tasks are draggable, but only forward), so
    // dropping onto any past column just cancels back to the origin.
    if (finalToDay !== BACKLOG_IDX && finalToDay >= 0 && finalToDay < N) {
      const toKey = windowDates[finalToDay];
      if (toKey && cmpYmd(toKey, todayKey) < 0) {
        // cancel the drop
        endDrag();
        setIsDragOverBacklog(false);
        setTrayCloseProgress(0);
        return;
      }
    }

    if (finalToDay !== BACKLOG_IDX && finalToDay >= 0 && finalToDay < N) {
      const list = colAt(finalToDay);
      const firstCompleted = list.findIndex((t) => t.completed);
      if (firstCompleted !== -1) {
        const isSelfDrag = drag.fromDay === finalToDay;
        const limit = isSelfDrag
          ? Math.max(0, firstCompleted - 1)
          : firstCompleted;
        finalToIndex = Math.min(finalToIndex, limit);
      }
    }

    if (backlogOpen && finalToDay !== BACKLOG_IDX) setBacklogOpen(false);

    // Glide the ghost into the placeholder slot, then commit the reorder. A
    // backlog drop has no slot — its placeholder still sits in the source
    // column, and settling there would look like the card flying back home.
    const slot = overBacklog
      ? null
      : document.querySelector<HTMLElement>('[data-drop-placeholder]');
    settleAndEnd(slot ? slot.getBoundingClientRect() : null, () => {
      // Where the task gets filed (finalToDay) and where the *view* settles
      // are separate decisions. You can drop a task into a column that's
      // still mostly off-screen — dragging near the edge auto-scrolls the
      // board toward it, but that scroll may not have finished. For a
      // one-column move, snap the view to whichever column is currently
      // more visible (pageIndexRef, the same "current page" tracked while
      // swiping) rather than forcing it to jump to wherever the task
      // landed. For a longer move the user deliberately traveled there, so
      // follow the task to its destination column instead of settling on
      // some column passed along the way.
      const settleDay =
        drag.fromDay !== BACKLOG_IDX &&
        finalToDay !== BACKLOG_IDX &&
        Math.abs(finalToDay - drag.fromDay) > 1
          ? finalToDay
          : pageIndexRef.current;
      const shouldGlideToColumn =
        settleDay !== BACKLOG_IDX && window.innerWidth < 768;

      commitDragReorder(finalToDay, finalToIndex);
      // A drop back into the exact same slot changed nothing, so it shouldn't
      // cost the user their selection either.
      const landedSomewhereNew =
        finalToDay !== drag.fromDay || finalToIndex !== drag.fromIndex;
      if (draggedWasSelected && landedSomewhereNew) selection.exit();

      const fromBacklog = drag.fromDay === BACKLOG_IDX;
      const toBacklog = finalToDay === BACKLOG_IDX;
      const changedDay = finalToDay !== drag.fromDay;
      if (toBacklog && !fromBacklog) {
        emitTourEvent(TOUR_EVENT.parked);
      } else if (fromBacklog && !toBacklog) {
        emitTourEvent(TOUR_EVENT.unparked);
      } else if (changedDay && !toBacklog) {
        emitTourEvent(
          bundled ? TOUR_EVENT.bulkDropped : TOUR_EVENT.movedDay,
        );
      }

      endDrag();
      setIsDragOverBacklog(false);
      setTrayCloseProgress(0);

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (shouldGlideToColumn) centerColumnSmooth(settleDay);
          else settleBoard();
        });
      });
    });
  }, [
    drag,
    targetDay,
    targetIndex,
    BACKLOG_IDX,
    N,
    windowDates,
    todayKey,
    colAt,
    backlogOpen,
    backlog.length,
    centerColumnSmooth,
    settleBoard,
    commitDragReorder,
    endDrag,
    settleAndEnd,
    draggingRepeating,
    removeOnDate,
    selection,
  ]);

  useEffect(() => {
    if (!drag?.active) return;
    const handleUp = () => onDrop();
    window.addEventListener('pointerup', handleUp, { passive: true });
    window.addEventListener('touchend', handleUp as any, { passive: true });
    return () => {
      window.removeEventListener('pointerup', handleUp as any);
      window.removeEventListener('touchend', handleUp as any);
    };
  }, [drag, onDrop]);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const goToToday = useCallback(() => {
    const i = windowDates.indexOf(todayKey);
    if (i >= 0) {
      setActiveDateKey(todayKey);
      setPageIndex(i);
      centerColumnSmooth(i);
      return;
    }

    onJumpToDate?.(todayKey);
  }, [
    centerColumnSmooth,
    onJumpToDate,
    setActiveDateKey,
    todayKey,
    windowDates,
  ]);

  // Visible 7 dots centered on the live pageIndex (tracks scroll for smooth transitions).
  const visibleDateDots = useMemo(() => {
    if (windowDates.length === 0) return [];
    const want = 7;
    const half = Math.floor(want / 2);
    const center = Math.min(Math.max(pageIndex, 0), windowDates.length - 1);
    let start = Math.max(0, center - half);
    let end = start + want;
    if (end > windowDates.length) {
      end = windowDates.length;
      start = Math.max(0, end - want);
    }
    return windowDates.slice(start, end);
  }, [windowDates, pageIndex]);

  // Build per-column titles ("Wed 5/14" on mobile, "Wednesday 5/14" on desktop)
  const titleForIndex = useCallback(
    (i: number) => {
      const dk = windowDates[i];
      if (!dk) return '';
      const d = parseYmd(dk);
      const dayName = d.toLocaleString('en-US', {
        weekday: isMobile ? 'short' : 'long',
      });
      return `${dayName} ${d.getMonth() + 1}/${d.getDate()}`;
    },
    [windowDates, isMobile],
  );

  // Edge slot: a "Move to a specific date" drop zone while dragging, otherwise a
  // "Load more" button that loads 7 more days on that side.
  const renderEdge = (side: 'past' | 'future') => {
    const isPast = side === 'past';

    // Nothing left to load in the past: render no edge slot at all — mounting
    // a drop zone there on drag start would insert width at the front of the
    // row and shunt the whole board. The future zone covers "pick a date".
    if (isPast && !canLoadPast) return null;

    // While dragging a task: an animated "Move to a specific date" drop zone.
    if (drag?.active) {
      return (
        <div
          ref={isPast ? pastZoneRef : futureZoneRef}
          data-edge-zone={side}
          // Must match the idle edge's width exactly — a wider drop zone
          // replacing the idle slot at grab time shifts every column and reads
          // as the view sliding sideways on lift/release.
          className="shrink-0 self-start flex h-[clamp(220px,calc(100svh-430px),480px)] w-[46vw] sm:w-[200px] md:w-[185px]"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{
              scale: dateZoneActive ? 1.02 : 1,
              opacity: 1,
            }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            className={[
              'flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-5 py-8 text-center transition-colors duration-200',
              dateZoneActive
                ? 'border-primary bg-primary/20 text-primary shadow-lg shadow-primary/20'
                : 'border-primary/40 bg-card/40 text-muted-foreground',
            ].join(' ')}
          >
            <motion.div
              animate={
                dateZoneActive
                  ? { y: [0, -5, 0], scale: 1.1 }
                  : { y: 0, scale: 1 }
              }
              transition={
                dateZoneActive
                  ? { y: { repeat: Infinity, duration: 1 }, scale: { duration: 0.2 } }
                  : { duration: 0.2 }
              }
            >
              <CalendarPlus className="h-9 w-9" />
            </motion.div>
            <span className="text-base font-black leading-relaxed">
              {dateZoneActive ? 'Release to pick a date' : 'Drop to pick a date'}
            </span>
            <span className="text-xs font-medium leading-relaxed opacity-70">
              Move this task to a specific day
            </span>
          </motion.div>
        </div>
      );
    }

    if (isPast && !canLoadPast) return null;

    const status = edgeStatus[side];
    const failed = status === 'error';
    const edgeDay = isPast
      ? windowDates[0]
      : windowDates[windowDates.length - 1];
    const upcoming = [1, 2, 3].map((n) => addDays(edgeDay, isPast ? -n : n));
    const rangeFrom = isPast
      ? addDays(edgeDay, -EDGE_LOAD_DAYS)
      : addDays(edgeDay, 1);
    const rangeTo = isPast
      ? addDays(edgeDay, -1)
      : addDays(edgeDay, EDGE_LOAD_DAYS);
    const fmtShort = (dk: string) =>
      parseYmd(dk).toLocaleString('en-US', { month: 'short', day: 'numeric' });
    return (
      <div className="shrink-0 self-start flex h-[clamp(220px,calc(100svh-430px),480px)] w-[46vw] sm:w-[200px] md:w-[185px]">
        <button
          type="button"
          onClick={() => void extendEdge(side)}
          disabled={status === 'loading'}
          aria-label={
            failed
              ? 'Retry loading days'
              : `${isPast ? 'Earlier' : 'Upcoming'} days, ${fmtShort(rangeFrom)} to ${fmtShort(rangeTo)}`
          }
          aria-busy={status === 'loading'}
          className="group/edge relative flex h-full w-full flex-col items-center justify-center gap-4 rounded-[20px] px-3 text-center outline-none"
        >
          <div className="relative h-[168px] w-full max-w-[150px]">
            {upcoming
              .map((dk, n) => ({ dk, n }))
              .reverse()
              .map(({ dk, n }) => {
                const d = parseYmd(dk);
                return (
                  <motion.div
                    key={dk}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{
                      opacity: 1 - n * 0.22,
                      y: n * 14,
                      x: (isPast ? -1 : 1) * n * 6,
                      rotate: (isPast ? -1 : 1) * n * 2.5,
                      scale: 1 - n * 0.06,
                    }}
                    transition={{
                      type: 'spring',
                      stiffness: 320,
                      damping: 28,
                      delay: n * 0.05,
                    }}
                    className={[
                      'absolute inset-x-0 top-0 rounded-2xl border bg-card p-3 text-left shadow-sm',
                      failed ? 'border-destructive/30' : 'border-border/60',
                    ].join(' ')}
                    style={{
                      zIndex: 3 - n,
                      transformOrigin: isPast ? 'bottom left' : 'bottom right',
                    }}
                  >
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-lg font-black leading-none tracking-tight text-foreground/80">
                        {d.getDate()}
                      </span>
                      <span className="text-[11px] font-bold text-muted-foreground">
                        {d.toLocaleString('en-US', { weekday: 'short' })}
                      </span>
                    </div>
                    <div className="mt-2.5 space-y-1.5">
                      {failed ? (
                        <>
                          <div className="h-3 w-full rounded-md bg-muted" />
                          <div className="h-3 w-2/3 rounded-md bg-muted" />
                        </>
                      ) : (
                        <>
                          <Skeleton className="h-3 w-full rounded-md" />
                          <Skeleton className="h-3 w-2/3 rounded-md" />
                        </>
                      )}
                    </div>
                  </motion.div>
                );
              })}
          </div>

          {failed ? (
            <span className="flex flex-col items-center gap-2">
              <span className="text-xs font-bold text-muted-foreground">
                Couldn&apos;t load these days
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[12px] font-black text-primary-foreground shadow-sm transition-transform group-active/edge:scale-95">
                <RotateCw className="h-3.5 w-3.5" strokeWidth={2.75} />
                Retry
              </span>
            </span>
          ) : (
            <span className="flex flex-col items-center gap-1">
              <span className="text-[13px] font-black tracking-tight text-foreground/70">
                {fmtShort(rangeFrom)} – {fmtShort(rangeTo)}
              </span>
              <span className="flex items-center gap-1" aria-hidden>
                {[0, 1, 2].map((dot) => (
                  <motion.span
                    key={dot}
                    className="h-1.5 w-1.5 rounded-full bg-primary"
                    animate={
                      status === 'loading'
                        ? { opacity: [0.25, 1, 0.25], y: [0, -3, 0] }
                        : { opacity: 0.3, y: 0 }
                    }
                    transition={
                      status === 'loading'
                        ? {
                            repeat: Infinity,
                            duration: 0.9,
                            delay: dot * 0.15,
                            ease: 'easeInOut',
                          }
                        : { duration: 0.2 }
                    }
                  />
                ))}
              </span>
            </span>
          )}
        </button>
      </div>
    );
  };

  // A card lifted out of the tray has nowhere to go in the tray, so the whole
  // save-for-later drop affordance stays out of its way.
  const showSavedDrop =
    !!drag?.active && drag.fromDay !== BACKLOG_IDX && !savedDropHidden;

  // One lens for both layouts: the chips sit on the board under the header,
  // directly below the column-header trigger that opened them.
  const lensOpen = stripOpen || filtersActive;

  return (
    <div
      className="relative w-full h-full"
      style={{
        ['--lens' as string]: lensOpen ? '60px' : '0px',
        ['--lens-m' as string]: lensOpen ? '48px' : '0px',
      }}
    >
      {/* SCROLLER — layoutScroll keeps card layout animations scroll-aware so
          horizontal scrolling never reads as cards sliding sideways. */}
      <motion.div
        layoutScroll
        ref={scrollerRef}
        dir="ltr"
        data-role="board-scroller"
        data-drag={drag?.active ? '1' : '0'}
        className={[
          'no-scrollbar absolute inset-0 w-full h-full select-none',
          'flex flex-col items-start overflow-y-hidden overscroll-x-contain',
          scrollLocked ? 'overflow-x-hidden touch-none' : 'overflow-x-auto touch-pan-y',
        ].join(' ')}
      >
        <div
          ref={trackRef}
          className="flex mx-auto gap-3 px-4 pt-[calc(9rem+env(safe-area-inset-top)+var(--lens-m))] md:pt-[calc(108px+var(--lens))] transition-[padding] duration-200 pb-[calc(100px+env(safe-area-inset-bottom))] md:pb-[calc(40px+env(safe-area-inset-bottom))] md:transition-[padding] md:duration-200"
        >
          {renderEdge('past')}
          {windowDates.map((dk, i) => (
            <div
              key={dk}
              ref={setSlideRef(i)}
              data-col="true"
              data-date-key={dk}
              data-hint={
                windowDates[pageIndex] && dk === addDays(windowDates[pageIndex], 1)
                  ? 'tour-next-day'
                  : undefined
              }
              className="shrink-0 origin-center w-[84vw] sm:w-[360px] md:w-[330px] lg:w-[310px] xl:w-[292px] h-full"
            >
              <DayColumn
                title={titleForIndex(i)}
                count={activeTaskCount(tasksByDate[dk] ?? [])}
                totalCount={(tasksByDate[dk] ?? []).length}
                listRef={setListRef(i)}
                maxHeightClass="max-h-[calc(100svh-315px-var(--lens-m)-var(--safe-bottom)-env(safe-area-inset-top))] md:max-h-[calc(100svh-224px-var(--lens)-var(--safe-bottom))]"
                isToday={dk === todayKey}
                isPast={cmpYmd(dk, todayKey) < 0}
                headerAction={
                  <>
                    <FilterTriggerButton
                      compact
                      size="md"
                      onClick={() => setStripOpen((v) => !v)}
                      activeCount={activeFilterCount}
                      open={stripOpen}
                    />
                    <button
                      type="button"
                      aria-label={
                        selection.active ? 'Done selecting' : 'Select tasks'
                      }
                      aria-pressed={selection.active}
                      title={
                        selection.active ? 'Done selecting' : 'Select tasks'
                      }
                      data-hint={i === pageIndex ? 'planner-select' : undefined}
                      disabled={
                        !selection.active &&
                        (tasksByDate[dk] ?? []).length === 0
                      }
                      onClick={() =>
                        selection.active ? selection.exit() : selection.enter()
                      }
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all active:scale-90 disabled:opacity-25 ${
                        selection.active
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground [@media(hover:hover)]:hover:bg-muted [@media(hover:hover)]:hover:text-foreground'
                      }`}
                    >
                      <ListChecks size={18} strokeWidth={2.5} />
                    </button>
                  </>
                }
                note={
                  filtersActive ? (
                    <FilterStatusLine
                      tasks={tasksByDate[dk] ?? []}
                      filters={filters}
                      onClearAll={resetFilters}
                    />
                  ) : undefined
                }
                footer={
                  cmpYmd(dk, todayKey) >= 0 &&
                  (sortedTasksByDate[dk] ?? []).length > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setQuickText('');
                        setInitialDateKey(dk);
                        setPageIndex(i);
                        setShowQuickAdd(true);
                      }}
                      className="mt-1.5 hidden w-full items-center gap-2 rounded-xl px-2.5 py-2 text-[13px] font-bold text-muted-foreground/80 transition-colors md:flex [@media(hover:hover)]:hover:bg-muted [@media(hover:hover)]:hover:text-foreground"
                    >
                      <Plus className="h-4 w-4" strokeWidth={3} />
                      <span>Add a task</span>
                    </button>
                  ) : undefined
                }
              >
                <TaskList
                  day={i as any}
                  items={sortedTasksByDate[dk] ?? []}
                  gracePeriodIds={recentlyCompleted}
                  isDragging={!!drag?.active}
                  dragFromDay={drag?.fromDay}
                  dragFromIndex={drag?.fromIndex}
                  targetDay={effectiveTargetDay as any}
                  targetIndex={clampedTargetIndex}
                  dragHeight={drag?.height}
                  removeTask={async (_d, id) => removeOnDate(dk, id)}
                  onGrab={onGrabMaybeBundled as any}
                  setCardRef={setCardRef}
                  selection={selectionFor(dk, i)}
                  hiddenIds={draggingBundleIds?.get(dk)}
                  onAddRequested={(text) => {
                    setQuickText(text);
                    setInitialDateKey(dk);
                    setPageIndex(i);
                    setShowQuickAdd(true);
                  }}
                  userTags={userTags}
                  onToggleRepeat={
                    onToggleRepeat
                      ? (taskId: string) => onToggleRepeat(taskId, dk)
                      : (undefined as any)
                  }
                  onEditTask={async (_d, taskId, newText) =>
                    handleEditTask(i, taskId, newText)
                  }
                  onDoLater={async (_d, taskId) => handleDoLater(i, taskId)}
                  onScheduleTask={onScheduleTask}
                  onStartTimer={(t) => {
                    setTimerTask(t);
                    setShowTimer(true);
                  }}
                  onPatchTask={patchTask}
                  dateKey={dk}
                  isAnyDragging={!!drag?.active}
                  isToday={dk === todayKey}
                  filters={filters}
                  filtersActive={filtersActive}
                  onClearFilters={resetFilters}
                  daysOrder={daysOrder}
                  emptyMode={cmpYmd(dk, todayKey) < 0 ? 'none' : 'add'}
                  disableDrag={false}
                  isFuture={cmpYmd(dk, todayKey) > 0}
                  onPickDuplicateDate={(taskId) => {
                    setPendingMove({
                      taskId,
                      fromDateKey: dk,
                      mode: 'duplicate',
                    });
                    setMoveCalendarOpen(true);
                  }}
                />
              </DayColumn>
            </div>
          ))}
          {renderEdge('future')}
        </div>
      </motion.div>

      {!drag?.active && !scrollLocked && (
        <>
          {(['past', 'future'] as const).map((side) => {
            const back = side === 'past';
            if (back && atBoardStart) return null;
            const Chevron = back ? ChevronLeft : ChevronRight;
            return (
              <div
                key={side}
                className={[
                  'absolute top-1/2 z-[55] hidden -translate-y-1/2 md:block',
                  back ? 'left-3' : 'right-3',
                ].join(' ')}
              >
                <motion.button
                  type="button"
                  onClick={() => stepBoard(back ? -1 : 1, 'page')}
                  aria-label={back ? 'Earlier days' : 'Later days'}
                  title={back ? 'Earlier days (Shift + ←)' : 'Later days (Shift + →)'}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.08, x: back ? -2 : 2 }}
                  whileTap={{ scale: 0.92 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-border/60 bg-card/90 text-foreground shadow-lg shadow-black/10 backdrop-blur-xl hover:border-primary/40 hover:text-primary"
                >
                  <Chevron className="h-6 w-6" strokeWidth={2.75} />
                </motion.button>
              </div>
            );
          })}
        </>
      )}

      {/* Top header + dot strip (mobile + desktop) */}
      <div
        className={`absolute top-[calc(0.5rem+env(safe-area-inset-top))] left-0 right-0 flex flex-col items-center gap-2 pointer-events-none px-3 md:top-[68px] ${
          calendarOpen ? 'z-[97]' : 'z-[60]'
        } ${moveCalendarOpen ? 'hidden' : ''}`}
      >
        <div className="md:hidden pointer-events-auto flex w-full items-center justify-center">
          <PlannerHeader
            dateKey={activeDateKey}
            expanded={calendarOpen}
            onToggle={() => setCalendarOpen((v) => !v)}
            variant="mobile"
          />
        </div>
        <div className="hidden md:flex items-center gap-2 pointer-events-auto">
          <PlannerHeader
            dateKey={activeDateKey}
            expanded={calendarOpen}
            onToggle={() => setCalendarOpen((v) => !v)}
            variant="desktop"
          />
          {!calendarOpen && !drag?.active && !todayInView && !isMobile && (
            <motion.button
              type="button"
              onClick={goToToday}
              aria-label="Go back to today"
              title="Go back to today"
              initial={{ opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 360, damping: 28 }}
              className="flex items-center gap-2 rounded-2xl bg-primary px-3 py-2 text-sm font-black text-primary-foreground hover:brightness-105 active:scale-95"
            >
              <CalendarCheck className="h-4 w-4" />
              <span>Jump to today</span>
            </motion.button>
          )}
        </div>
        {!calendarOpen && (
          <div className="md:hidden pointer-events-auto w-full px-2 py-1.5 rounded-2xl bg-card/40 backdrop-blur-xl">
            <PaginationDots
              dates={visibleDateDots}
              activeDate={windowDates[pageIndex] ?? activeDateKey}
              onSelectDate={(d) => {
                const i = windowDates.indexOf(d);
                if (i >= 0) centerColumnSmooth(i);
              }}
            />
          </div>
        )}

        {/* Mobile lens — drops out of the column header's filter button and
            pushes the board down, so the chips read as belonging to it. */}
        <AnimatePresence>
          {isMobile && lensOpen && !calendarOpen && !drag?.active && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ type: 'spring', stiffness: 460, damping: 34 }}
              style={{ ['--strip-fade' as string]: 'var(--card)' }}
              className="pointer-events-auto w-full max-w-[420px] rounded-[22px] border border-border/50 bg-card/95 px-2 py-1.5 shadow-sm backdrop-blur-xl md:hidden"
            >
              <FilterChipStrip
                filters={filters}
                base={baseFilters}
                tags={tagsData?.tags || []}
                tasks={filterPool}
                onChange={setFilters}
                onClearAll={resetFilters}
                onOpenMore={() => setFilterSheetOpen(true)}
                menuDirection="down"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Desktop lens — the chips sit on the board, not over it, so the columns
          visibly re-filter under each tap. Toggled from the column header. */}
      {lensOpen && (
        <div className="pointer-events-none fixed inset-x-0 top-[76px] z-[61] hidden justify-center px-6 md:flex lg:px-10">
          <div
            style={{ ['--strip-fade' as string]: 'var(--card)' }}
            className="pointer-events-auto flex min-w-0 max-w-full items-center rounded-[22px] border border-border/50 bg-card/95 px-2 py-1.5 shadow-sm backdrop-blur-xl"
          >
            <FilterChipStrip
              filters={filters}
              base={baseFilters}
              tags={tagsData?.tags || []}
              tasks={filterPool}
              onChange={setFilters}
              onClearAll={resetFilters}
              onOpenMore={() => setFilterSheetOpen(true)}
              className="min-w-0 flex-1"
            />
          </div>
        </div>
      )}

      <TaskFilterSheet
        open={filterSheetOpen}
        onOpenChange={setFilterSheetOpen}
        filters={filters}
        onChange={setFilters}
        onReset={resetFilters}
        tags={tagsData?.tags || []}
        tasks={filterPool}
        presets={presets}
        onSavePreset={savePreset}
        onDeletePreset={deletePreset}
        showTags={false}
        showSort={false}
        showCompletedToggle={false}
        title="More filters"
      />

      {/* Month calendar overlay */}
      <MonthCalendar
        open={calendarOpen}
        selectedDate={activeDateKey}
        minDate={accountCreatedAt ?? undefined}
        footer={<CalendarSyncRow />}
        hasTasksOn={
          new Set(
            Object.entries(tasksByDate)
              .filter(([, list]) => (list?.length ?? 0) > 0)
              .map(([d]) => d),
          )
        }
        onSelect={(d) => {
          const i = windowDates.indexOf(d);
          if (i >= 0) {
            setActiveDateKey(d);
            centerColumnSmooth(i);
          } else {
            // jump outside the window — rebuild centered on the picked date
            onJumpToDate?.(d);
          }
          emitTourEvent(TOUR_EVENT.calendarJumped, { date: d });
        }}
        onClose={() => setCalendarOpen(false)}
      />

      {/* Move-to-date calendar (opened by dropping a task on an edge zone) */}
      <MonthCalendar
        open={moveCalendarOpen}
        selectedDate={todayKey}
        minDate={todayKey}
        heading={(() => {
          if (bulkDateMode) {
            const n = selection.stats.count;
            const what = `${n} ${n === 1 ? 'task' : 'tasks'}`;
            return bulkDateMode === 'duplicate'
              ? `Duplicate ${what} to which day?`
              : `Pick a day to move ${what}`;
          }
          const t = pendingMove ? findTaskById(pendingMove.taskId)?.text : '';
          if (pendingMove?.mode === 'duplicate') {
            return t ? `Duplicate “${t}” to which day?` : 'Duplicate to which day?';
          }
          return t ? `Pick a day to move “${t}”` : 'Pick a day to move this task';
        })()}
        todayLabel={
          (bulkDateMode ?? pendingMove?.mode) === 'duplicate'
            ? 'Duplicate to today'
            : 'Jump back to today'
        }
        hasTasksOn={
          new Set(
            Object.entries(tasksByDate)
              .filter(([, list]) => (list?.length ?? 0) > 0)
              .map(([d]) => d),
          )
        }
        onSelect={(d) => {
          if (bulkDateMode === 'duplicate') {
            const count = selection.stats.count;
            selection.exit();
            void runBulk({ op: 'duplicate', date: d }).then(() =>
              showNotification(
                `Duplicated ${count} ${count === 1 ? 'task' : 'tasks'} to ${relativeDayLabel(d)}`,
              ),
            );
          } else if (bulkDateMode === 'move') {
            void bulkMoveToDate(d);
          } else if (pendingMove?.mode === 'duplicate') {
            onDuplicateTaskToDate?.(pendingMove.taskId, d);
          } else if (pendingMove) {
            onMoveTaskToDate?.(pendingMove.taskId, pendingMove.fromDateKey, d);
          }
          setBulkDateMode(null);
          setPendingMove(null);
          setMoveCalendarOpen(false);
        }}
        onClose={() => {
          setBulkDateMode(null);
          setPendingMove(null);
          setMoveCalendarOpen(false);
        }}
      />

      {/* Bottom toolbar (Backlog) */}
      <div
        style={{
          // Lift above the notification stack like the home FAB does.
          ['--stack' as string]: `${notificationStackHeight}px`,
          transition: 'padding 200ms ease',
        }}
        className={`fixed bottom-0 left-0 right-0 px-3 md:px-4 pb-[calc(env(safe-area-inset-bottom)+84px+var(--stack))] md:pb-[calc(env(safe-area-inset-bottom)+32px+var(--stack))] pointer-events-none transition-opacity duration-150 ${
          // Below the drag ghost (z-[100]): the card under the finger is the
          // object being manipulated and has to stay visible. The strip's fill
          // and border still read as the active target around it.
          drag?.active ? 'z-[95]' : 'z-[40]'
        } ${
          scrollLocked || (selection.active && !drag?.active)
            ? 'invisible opacity-0'
            : ''
        }`}
      >
        <div className="pointer-events-auto mx-auto flex w-[88vw] max-w-none flex-col items-center justify-center md:w-full md:max-w-[480px]">
          {/* One shared surface for the saved-tasks target, the week dots,
              and add — previously three independent floating shapes with no
              visual relationship to each other. At rest it's a normal row;
              the moment a drag starts, that row fades out (kept mounted so
              the bar never resizes) and a single drop strip takes over
              almost the full bar — no per-item growing/shrinking fight, so
              nothing clips or fights for space. */}
          <div
            data-hint="saved-drop-target"
            className="relative flex h-16 w-full max-w-[340px] items-center rounded-[28px] border border-border/50 bg-card px-1.5 shadow-sm md:h-[68px] md:max-w-[360px] md:px-2"
          >
            <div
              className={`flex w-full items-center gap-1 transition-opacity duration-150 ${
                showSavedDrop ? 'pointer-events-none opacity-0' : 'opacity-100'
              }`}
              aria-hidden={showSavedDrop}
            >
              <BacklogBox
                count={backlog.length}
                isDragOver={false}
                isDragging={false}
                isRepeating={draggingRepeating}
                isDesktop={false}
                onClick={() => setBacklogOpen(true)}
              />

              <div
                className="flex min-w-0 flex-1 items-center justify-center gap-1 overflow-hidden"
                aria-label={`Visible day: ${windowDates[pageIndex] ?? activeDateKey}`}
              >
                {WEEK_ORDER.map((day) => {
                  const visibleDate = windowDates[pageIndex] ?? activeDateKey;
                  const active = parseYmd(visibleDate).getDay() === day;
                  return (
                    <span
                      key={day}
                      aria-hidden="true"
                      className={`h-1 shrink-0 rounded-full transition-[width,background-color] ${
                        active ? 'w-4 bg-primary' : 'w-1.5 bg-primary/20'
                      }`}
                    />
                  );
                })}
              </div>

              <button
                type="button"
                aria-label="Add task"
                disabled={
                  scrollLocked ||
                  backlogOpen ||
                  !!drag?.active ||
                  calendarOpen ||
                  moveCalendarOpen ||
                  showQuickAdd ||
                  showTimer
                }
                onClick={() => {
                  const visibleDate = windowDates[pageIndex] ?? activeDateKey;
                  const targetDate =
                    cmpYmd(visibleDate, todayKey) < 0 ? todayKey : visibleDate;
                  setQuickText('');
                  setInitialDateKey(targetDate);
                  setShowQuickAdd(true);
                }}
                className="relative grid h-14 w-14 shrink-0 -translate-y-3 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_18px_-4px_rgba(0,0,0,0.4)] ring-4 ring-card transition-[opacity,transform] active:scale-95 disabled:pointer-events-none disabled:opacity-0"
              >
                <Plus className="h-6 w-6 stroke-[3]" />
              </button>
            </div>

            <AnimatePresence>
              {showSavedDrop && (
                <motion.div
                  ref={backlogBoxRef}
                  data-hint="saved-drop-zone"
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.94 }}
                  transition={{ type: 'spring', stiffness: 480, damping: 32 }}
                  className={`absolute inset-1.5 flex items-center justify-center gap-2 rounded-[22px] border-2 transition-colors ${
                    isDragOverBacklog
                      ? 'border-primary bg-primary/12 text-primary'
                      : 'border-dashed border-primary/30 bg-primary/5 text-primary/70'
                  }`}
                >
                  {draggingRepeating ? (
                    <EyeOff className="h-6 w-6 shrink-0" />
                  ) : (
                    <ArrowDownToLine className="h-6 w-6 shrink-0" />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* The drop label rides above the toolbar rather than inside it: the card
          under the finger sits over the strip, and a label printed on the strip
          disappears underneath it exactly when it matters most. */}
      <AnimatePresence>
        {showSavedDrop && (
          <motion.div
            key="drop-hint"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ type: 'spring', stiffness: 480, damping: 32 }}
            className="pointer-events-none fixed inset-x-0 z-[110] flex justify-center px-4 bottom-[calc(env(safe-area-inset-bottom)+158px)] md:bottom-[calc(env(safe-area-inset-bottom)+110px)]"
          >
            <span
              className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-black shadow-xl backdrop-blur-xl transition-colors ${
                isDragOverBacklog
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-primary/30 bg-card text-primary'
              }`}
            >
              {isDragOverBacklog
                ? draggingRepeating
                  ? 'Release to skip this day'
                  : 'Release to save for later'
                : draggingRepeating
                  ? 'Drop to skip this day'
                  : 'Drop to save for later'}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <BacklogTray
        isOpen={backlogOpen}
        onClose={() => {
          setBacklogOpen(false);
          window.dispatchEvent(new Event(BACKLOG_CLOSED_EVENT));
        }}
        tasks={backlog}
        onGrab={onGrab}
        setCardRef={setCardRef}
        backlogDayIndex={BACKLOG_IDX}
        activeDragId={drag?.active ? drag.taskId : null}
        trayRef={backlogTrayRef}
        closeProgress={trayCloseProgress}
        onRemove={(id) => removeFromBacklog(id)}
        userTags={userTags}
        onEdit={(id, newText) => handleEditTask(BACKLOG_IDX, id, newText)}
        onToggleRepeat={(id) => onToggleRepeat && onToggleRepeat(id, todayKey)}
        onDoToday={async (id) => {
          // Move from backlog to today
          let moved: Task | undefined;
          setBacklog((prev) => {
            const i = prev.findIndex((t) => t.id === id);
            if (i === -1) return prev;
            const next = prev.slice();
            const [t] = next.splice(i, 1);
            if (t.type === 'backlog') t.type = 'regular';
            moved = t;
            saveBacklog(next).catch(console.error);
            return next;
          });
          if (moved) {
            setTasksByDate((prev) => {
              const list = (prev[todayKey] ?? []).slice();
              list.push(moved!);
              saveDate(todayKey, list).catch(console.error);
              return { ...prev, [todayKey]: list };
            });
          }
        }}
        hideDoTodayButton={true}
        filters={filters}
        baseFilters={baseFilters}
        onChangeFilters={setFilters}
        filtersActive={filtersActive}
        activeFilterCount={activeFilterCount}
        onOpenFilters={() => setFilterSheetOpen(true)}
        onClearFilters={resetFilters}
      />

      <FrogodoroSheet
        open={showTimer}
        onOpenChange={setShowTimer}
        task={timerTask as any}
        tags={userTags}
        onMutateToday={() => window.dispatchEvent(new Event('board-refresh'))}
      />

      {!showTimer && (
        <FrogodoroPill
          onClick={() => {
            const t = findTaskById(frogTaskId);
            if (t) setTimerTask(t);
            setShowTimer(true);
          }}
          taskName={findTaskById(frogTaskId)?.text}
        />
      )}

      <QuickAddSheet
        open={showQuickAdd}
        onOpenChange={setShowQuickAdd}
        initialText={quickText}
        defaultRepeat="this-week"
        defaultPickedDay={
          // approximate: the QuickAddSheet uses 0..6 weekday display indices.
          // We derive a best-effort weekday-of-active-date for highlight purposes.
          (() => {
            const dk = initialDateKey ?? activeDateKey;
            const dow = parseYmd(dk).getDay();
            const i = daysOrder.indexOf(dow as any);
            return (i >= 0 ? i : 0) as DisplayDay;
          })()
        }
        defaultDateKey={initialDateKey ?? activeDateKey}
        daysOrder={daysOrder}
        sections={boardSections}
        onBulkSubmit={async (bulkTasks) => {
          const anchor = initialDateKey ?? activeDateKey;
          const anchorDate = parseYmd(anchor);
          const anchorDow = anchorDate.getDay();
          const translatedTasks = bulkTasks.map((task) => {
            if (task.dates?.length || task.repeat !== 'weekly') return task;
            const dates = task.days.flatMap((day) => {
              if (day === -1) return [];
              const offset = (day - anchorDow + 7) % 7;
              return [
                ymd(
                  new Date(
                    anchorDate.getFullYear(),
                    anchorDate.getMonth(),
                    anchorDate.getDate() + offset,
                  ),
                ),
              ];
            });
            return { ...task, dates };
          });

          const res = await fetch('/api/tasks?view=board', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tasks: translatedTasks, timezone: tz }),
          });
          const payload = await res.json().catch(() => ({}));
          if (!res.ok || !payload.ok) {
            throw new Error(payload.error ?? 'Could not add these tasks.');
          }

          window.dispatchEvent(new Event('board-refresh'));
          void notifyQuestClaims(showNotification);
          showNotification(
            `Added ${bulkTasks.length} ${bulkTasks.length === 1 ? 'task' : 'tasks'}`,
            payload.batchId
              ? async () => {
                  const undoRes = await fetch('/api/tasks?view=board', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      creationBatchId: payload.batchId,
                      timezone: tz,
                    }),
                  });
                  const undoPayload = await undoRes.json().catch(() => ({}));
                  if (!undoRes.ok) {
                    throw new Error(undoPayload.error ?? 'Could not undo this batch.');
                  }
                  window.dispatchEvent(new Event('board-refresh'));
                }
              : undefined,
            { durationMs: 6000 },
          );
        }}
        onSubmit={async ({
          text,
          days,
          dates: exactDates,
          repeat,
          tags,
          startTime,
          endTime,
          reminder,
          repeatEndDate,
          repeatRule,
          sectionId,
        }) => {
          if (!onQuickAdd) {
            onRequestAdd(
              initialDateKey ?? null,
              text,
              null,
              repeat as RepeatChoice,
            );
            setShowQuickAdd(false);
            return;
          }

          // Translate weekday-API days back to explicit calendar dates,
          // anchored to the currently active date. Backlog (-1) -> empty dates.
          const anchor = initialDateKey ?? activeDateKey;
          const anchorDate = parseYmd(anchor);
          const anchorDow = anchorDate.getDay();
          const dates: string[] = exactDates ?? [];
          // Anchor the selected weekdays to actual calendar dates for both
          // one-off (this-week) and repeating (weekly) adds, so the API can
          // derive the weekdays and create the repeating tasks.
          if (!exactDates) {
            for (const d of days) {
              if (d === -1) continue;
              const offset = (d - anchorDow + 7) % 7;
              dates.push(
                ymd(
                  new Date(
                    anchorDate.getFullYear(),
                    anchorDate.getMonth(),
                    anchorDate.getDate() + offset,
                  ),
                ),
              );
            }
          }
          await onQuickAdd({
            text,
            dates,
            repeat: repeat as RepeatChoice,
            tags,
            startTime,
            endTime,
            reminder,
            repeatEndDate,
            repeatRule,
            sectionId,
          });
          setShowQuickAdd(false);
        }}
      />

      <AnimatePresence>
        {selection.active && !drag?.active && !scrollLocked && (
          <BulkActionBar
            key="bulk-bar"
            count={selection.stats.count}
            bottomOffset={notificationStackHeight}
            onAction={onBulkAction}
            onClear={selection.exit}
          />
        )}
      </AnimatePresence>

      <BulkTagsSheet
        open={bulkTagsOpen}
        onClose={() => setBulkTagsOpen(false)}
        taskCount={selection.stats.count}
        counts={bulkTagCounts}
        onSave={(delta) => {
          const count = selection.stats.count;
          const snapshot = bulkItems.slice();
          applyScoped((scope) => {
            selection.exit();
            void runBulk({ op: 'tags', ...delta, scope }, snapshot).then(() => {
              window.dispatchEvent(new Event('tags-updated'));
              showNotification(
                `Updated tags on ${count} ${count === 1 ? 'task' : 'tasks'}`,
              );
            });
          });
        }}
      />

      <TaskRepeatPopup
        open={bulkRepeatOpen}
        onClose={() => setBulkRepeatOpen(false)}
        currentMode={repeatSeed.mode}
        repeatDayLabel={parseYmd(
          repeatSeed.anchor || activeDateKey,
        ).toLocaleString('en-US', { weekday: 'long' })}
        monthlyLabel={monthlyRepeatLabel(repeatSeed.anchor || activeDateKey)}
        currentEndDate={repeatSeed.endDate}
        currentRule={repeatSeed.rule}
        anchorYmd={repeatSeed.anchor || activeDateKey}
        description={`Editing ${repeatSeed.count} ${
          repeatSeed.count === 1 ? 'task' : 'tasks'
        }. This replaces whatever they repeat on now.`}
        doneLabel={`Apply to ${repeatSeed.count} ${
          repeatSeed.count === 1 ? 'task' : 'tasks'
        }`}
        onChange={(mode: RepeatMode, endDate: string | null, rule: RepeatRule | null) => {
          const count = selection.stats.count;
          const snapshot = selection.refs.map((r) => ({
            taskId: r.taskId,
            fromDate: r.dateKey === BACKLOG_KEY ? undefined : r.dateKey,
          }));
          setBulkRepeatOpen(false);
          selection.exit();
          // No "this / all repeats" question here: a repeat rule *is* the
          // series, so changing it always applies to the whole thing. The
          // per-task anchor day is resolved server-side from each task's date.
          void runBulk(
            {
              op: 'repeat',
              setRepeat: {
                mode,
                endDate: endDate ?? null,
                rule: rule ?? null,
              },
            },
            snapshot,
          ).then(() =>
            showNotification(
              `Repeat updated on ${count} ${count === 1 ? 'task' : 'tasks'}`,
            ),
          );
        }}
      />

      <BulkConfirmDialog
        open={bulkDeleteOpen}
        title={`Delete ${selection.stats.count} ${
          selection.stats.count === 1 ? 'task' : 'tasks'
        }?`}
        description={
          selection.stats.hasRepeating
            ? 'One-off tasks are removed for good. Repeating ones just skip the day you picked them on — the series keeps going.'
            : 'This removes them for good and can’t be undone.'
        }
        confirmLabel="Delete"
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={() => {
          const count = selection.stats.count;
          const snapshot = bulkItems.slice();
          selection.exit();
          void runBulk({ op: 'delete' }, snapshot).then(() =>
            showNotification(
              `Deleted ${count} ${count === 1 ? 'task' : 'tasks'}`,
            ),
          );
        }}
      />

      <EditScopeDialog
        open={!!pendingBulkScope}
        onClose={() => setPendingBulkScope(null)}
        onChoose={(scope) => {
          pendingBulkScope?.run(scope);
          setPendingBulkScope(null);
        }}
      />

      {drag?.active && (
        <DragOverlay
          x={drag.x}
          y={drag.y}
          dx={drag.dx}
          dy={drag.dy}
          width={drag.width}
          height={drag.height}
          innerRef={registerOverlayEl}
          text={drag.taskText}
          tags={drag.tags}
          taskType={drag.taskType}
          calendarEventId={drag.calendarEventId}
          startTime={drag.startTime}
          endTime={drag.endTime}
          reminder={drag.reminder}
          notes={drag.notes}
          checklist={drag.checklist}
          frogodoroSession={drag.frogodoroSession}
          bundleCount={drag.bundleCount}
        />
      )}

      <style jsx global>{`
        @media (prefers-reduced-motion: reduce) {
          * {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
          }
        }
        html.dragging,
        html.dragging body {
          touch-action: none !important;
          overscroll-behavior: none !important;
          overflow: hidden !important;
          user-select: none !important;
          -webkit-user-select: none !important;
        }
        html.dragging [data-role='board-scroller'] {
          touch-action: none !important;
          overflow: hidden !important;
          scroll-snap-type: none !important;
          overscroll-behavior: none !important;
        }
        html.dragging [data-card-id] {
          touch-action: none !important;
        }
      `}</style>
    </div>
  );
}
