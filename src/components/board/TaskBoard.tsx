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
import { motion } from 'framer-motion';
import {
  CalendarCheck,
  CalendarPlus,
  ChevronsLeft,
  ChevronsRight,
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
} from './helpers';
import DayColumn from './DayColumn';
import TaskList from './TaskList';
import PaginationDots from './PaginationDots';
import DragOverlay from './DragOverlay';
import PlannerHeader from './PlannerHeader';
import MonthCalendar from './MonthCalendar';
import { useDragManager } from './hooks/useDragManager';
import { usePan } from './hooks/usePan';
import QuickAddSheet from '@/components/ui/QuickAddSheet';
import FrogodoroSheet from '@/components/ui/FrogodoroSheet';
import FrogodoroPill from '@/components/ui/FrogodoroPill';
import BacklogBox from './BacklogBox';
import BacklogTray from './BacklogTray';
import { useNotification } from '@/components/providers/NotificationProvider';
import { useFrogodoroStore } from '@/lib/frogodoroStore';
import { useFrogodoroUiStore } from '@/lib/frogodoroUiStore';
import { useSheetStore } from '@/lib/sheetStore';
import { useRiveInteractionPause } from '@/lib/riveInteractionPause';

type RepeatChoice = 'this-week' | 'weekly';

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
  }) => Promise<void> | void;
  todayKey: string;
  activeDateKey: string;
  setActiveDateKey: (d: string) => void;
  accountCreatedAt?: string | null;
  onExtendWindow?: (direction: 'past' | 'future') => void;
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

  // Column filters per-index (transient; cleared if window shifts a lot)
  const [columnFilters, setColumnFilters] = useState<
    Record<number, 'all' | 'tasks'>
  >({});
  const [columnTags, setColumnTags] = useState<Record<number, string[]>>({});
  const [columnShowCompleted, setColumnShowCompleted] = useState<
    Record<number, boolean>
  >({});

  const getFilter = useCallback(
    (i: number) => columnFilters[i] || 'all',
    [columnFilters],
  );
  const setFilter = useCallback((i: number, f: 'all' | 'tasks') => {
    setColumnFilters((prev) => ({ ...prev, [i]: f }));
  }, []);
  const getSelectedTags = useCallback(
    (i: number) => columnTags[i] || [],
    [columnTags],
  );
  const setSelectedTags = useCallback((i: number, tags: string[]) => {
    setColumnTags((prev) => ({ ...prev, [i]: tags }));
  }, []);
  const getShowCompleted = useCallback(
    (i: number) =>
      columnShowCompleted[i] === undefined ? true : columnShowCompleted[i],
    [columnShowCompleted],
  );
  const setShowCompleted = useCallback((i: number, show: boolean) => {
    setColumnShowCompleted((prev) => ({ ...prev, [i]: show }));
  }, []);

  const { data: tagsData } = useSWR('/api/tags', (url) =>
    fetch(url).then((r) => r.json()),
  );
  const userTags = tagsData?.tags || [];

  useEffect(() => {
    cancelDrag();
  }, [pathname, cancelDrag]);

  const [pageIndex, setPageIndex] = useState<number>(activeIdx);
  const recomputeCanPanRef = useRef<(() => void) | undefined>(undefined);

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

  // Elastic edge "pull": how far past the first/last day the user has scrolled.
  // Drives the Load-more expansion and arms a load-on-release gesture (mobile).
  const PULL_ARM = 0.82; // fraction of PULL_FULL needed to trigger a load
  const [edgePull, setEdgePull] = useState<{
    side: 'past' | 'future' | null;
    amount: number;
  }>({ side: null, amount: 0 });
  const edgePullRef = useRef(edgePull);
  edgePullRef.current = edgePull;
  const pullArmedRef = useRef(false);
  // After an edge load, smooth-center this date once it enters the window.
  const pendingCenterKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const key = pendingCenterKeyRef.current;
    if (!key) return;
    const i = windowDates.indexOf(key);
    if (i < 0) return;
    pendingCenterKeyRef.current = null;
    requestAnimationFrame(() => centerColumnSmooth(i));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowDates]);

  // Load 7 more days on an edge and glide one day in that direction. Used by
  // both the "Load more" click (web) and the pull-to-load release (mobile).
  const pastAnchorRef = useRef<{ key: string; offsetLeft: number } | null>(null);
  const triggerEdgeLoad = useCallback(
    (side: 'past' | 'future') => {
      const target =
        side === 'future'
          ? addDays(windowDates[windowDates.length - 1], 1)
          : addDays(windowDates[0], -1);
      pendingCenterKeyRef.current = target;
      if (side === 'past') {
        // Anchor the current column across the prepend so the follow-up glide
        // to the previous day starts from the right place (no jump).
        const dk = windowDates[pageIndex];
        const col = document.querySelector<HTMLElement>(
          `[data-date-key="${dk}"]`,
        );
        if (col) pastAnchorRef.current = { key: dk, offsetLeft: col.offsetLeft };
      }
      onExtendWindow?.(side);
    },
    [windowDates, pageIndex, onExtendWindow],
  );

  // After the window start changes (past prepend), restore scroll position so
  // the anchored column stays under the same viewport offset.
  const prevWindowStartRef = useRef(windowDates[0]);
  React.useLayoutEffect(() => {
    const start = windowDates[0];
    if (start === prevWindowStartRef.current) return;
    prevWindowStartRef.current = start;
    const anchor = pastAnchorRef.current;
    const s = scrollerRef.current;
    if (!anchor || !s) return;
    const col = document.querySelector<HTMLElement>(
      `[data-date-key="${anchor.key}"]`,
    );
    if (col) {
      // Instant correction (bypass the scroller's smooth behavior) so the
      // anchor doesn't visibly slide; the follow-up glide handles the motion.
      const prev = s.style.scrollBehavior;
      s.style.scrollBehavior = 'auto';
      s.scrollLeft += col.offsetLeft - anchor.offsetLeft;
      s.style.scrollBehavior = prev;
    }
    pastAnchorRef.current = null;
  }, [windowDates, scrollerRef]);

  // Backlog state
  const [backlogOpen, setBacklogOpen] = useState(false);
  const backlogBoxRef = useRef<HTMLButtonElement>(null);
  const backlogTrayRef = useRef<HTMLDivElement>(null);
  const [isDragOverBacklog, setIsDragOverBacklog] = useState(false);
  const [backlogProximity, setBacklogProximity] = useState(0);
  const [trayCloseProgress, setTrayCloseProgress] = useState(0);
  const [todayInView, setTodayInView] = useState(true);

  const centerColumnSmooth = useCallback(
    (i: number) => {
      const s = scrollerRef.current;
      const col = (document.querySelectorAll('[data-col="true"]')[i] ??
        null) as HTMLElement | null;
      if (!s || !col) return;
      s.scrollTo({
        left: col.offsetLeft - (s.clientWidth - col.clientWidth) / 2,
        behavior: 'smooth',
      });
    },
    [scrollerRef],
  );

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
  useEffect(() => {
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
    recomputeCanPanRef.current?.();
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

  // Track which column is centered on scroll
  useEffect(() => {
    const s = scrollerRef.current;
    if (!s) return;
    const handler = () => {
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

      // Elastic edge pull: how far the viewport extends past the first/last day.
      const first = cols[0];
      const last = cols[cols.length - 1];
      if (first && last && !drag?.active) {
        const PULL_FULL = 110;
        const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
        const futureExtra =
          s.scrollLeft + s.clientWidth - (last.offsetLeft + last.clientWidth);
        const pastExtra = first.offsetLeft - s.scrollLeft;
        if (futureExtra > 2) {
          setEdgePull({ side: 'future', amount: clamp01(futureExtra / PULL_FULL) });
        } else if (pastExtra > 2 && canLoadPast) {
          setEdgePull({ side: 'past', amount: clamp01(pastExtra / PULL_FULL) });
        } else {
          setEdgePull((prev) => (prev.side ? { side: null, amount: 0 } : prev));
        }
      }
    };
    s.addEventListener('scroll', handler, { passive: true });
    return () => s.removeEventListener('scroll', handler);
  }, [
    N,
    windowDates,
    activeDateKey,
    setActiveDateKey,
    scrollerRef,
    drag?.active,
    canLoadPast,
  ]);

  // Load-on-release: when the user lifts after pulling an edge past the arm
  // threshold, load 7 more days on that side and glide to the next day.
  useEffect(() => {
    const s = scrollerRef.current;
    if (!s) return;
    const onRelease = (e: Event) => {
      // Touch-only: ignore mouse so the web edge stays a plain click.
      if (e instanceof PointerEvent && e.pointerType === 'mouse') return;
      const { side, amount } = edgePullRef.current;
      if (!side || amount < PULL_ARM || pullArmedRef.current) return;
      if (side === 'past' && !canLoadPast) return;
      pullArmedRef.current = true;
      setEdgePull({ side: null, amount: 0 });
      triggerEdgeLoad(side);
      // Allow the next gesture once state has settled.
      requestAnimationFrame(() => {
        pullArmedRef.current = false;
      });
    };
    s.addEventListener('touchend', onRelease, { passive: true });
    s.addEventListener('pointerup', onRelease, { passive: true });
    return () => {
      s.removeEventListener('touchend', onRelease);
      s.removeEventListener('pointerup', onRelease);
    };
  }, [scrollerRef, canLoadPast, triggerEdgeLoad]);

  const { panActive, startPanIfEligible, onPanMove, endPan, recomputeCanPan } =
    usePan(scrollerRef);
  recomputeCanPanRef.current = recomputeCanPan;

  // Freeze ambient Rive playback while a card is being dragged (scrolling is
  // covered globally by RiveScrollPause). Uses getState() on purpose: no React
  // subscription, so pause/resume can never feed back into the drag renders.
  useEffect(() => {
    if (!drag?.active) return;
    const { acquire, release } = useRiveInteractionPause.getState();
    acquire();
    return release;
  }, [drag?.active]);

  const snapSuppressed = !!drag?.active || panActive;

  // Lock the horizontal board scroller while any sheet/popup is open so the
  // page behind the backdrop can't be slid around.
  const scrollLocked = useSheetStore((s) => s.count) > 0;

  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickText, setQuickText] = useState('');
  const [showTimer, setShowTimer] = useState(false);
  const [timerTask, setTimerTask] = useState<Task | null>(null);
  const { stackHeight: notificationStackHeight } = useNotification();
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

  // Backlog hover detection (unchanged)
  useEffect(() => {
    if (
      drag?.active &&
      backlogOpen &&
      drag.fromDay === BACKLOG_IDX &&
      backlogTrayRef.current
    ) {
      const trayRect = backlogTrayRef.current.getBoundingClientRect();
      const trayTop = trayRect.top;
      const EXIT_DIST = 200;
      if (drag.y < trayTop) {
        const distOut = trayTop - drag.y;
        const progress = Math.min(1, distOut / EXIT_DIST);
        setTrayCloseProgress(progress);
      } else {
        setTrayCloseProgress(0);
      }
    } else {
      setTrayCloseProgress(0);
    }

    if (!drag?.active || !backlogBoxRef.current) {
      setIsDragOverBacklog(false);
      setBacklogProximity(0);
      return;
    }

    const r = backlogBoxRef.current.getBoundingClientRect();
    const hit =
      drag.x >= r.left &&
      drag.x <= r.right &&
      drag.y >= r.top &&
      drag.y <= r.bottom;
    setIsDragOverBacklog(hit);

    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dist = Math.hypot(drag.x - cx, drag.y - cy);
    const MAX_DIST = 200;
    const prox = Math.max(0, 1 - dist / MAX_DIST);
    setBacklogProximity(prox);
  }, [drag?.x, drag?.y, drag?.active, backlogOpen, drag?.fromDay, BACKLOG_IDX]);

  // "Move to a specific date" edge-zone hover detection.
  useEffect(() => {
    if (!drag?.active) {
      setDateZoneActive(false);
      return;
    }
    const over = (el: HTMLElement | null) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return (
        drag.x >= r.left &&
        drag.x <= r.right &&
        drag.y >= r.top &&
        drag.y <= r.bottom
      );
    };
    setDateZoneActive(over(pastZoneRef.current) || over(futureZoneRef.current));
  }, [drag?.x, drag?.y, drag?.active]);

  const commitDragReorder = useCallback(
    (toDay: number, toIndex: number) => {
      if (!drag) return;
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

    // Dropped on a "Move to a specific date" edge zone: defer to the calendar.
    if (dateZoneActive && !isDragOverBacklog) {
      const fromKey =
        drag.fromDay !== BACKLOG_IDX ? windowDates[drag.fromDay] : '';
      setPendingMove({
        taskId: drag.taskId,
        fromDateKey: fromKey ?? '',
        mode: 'move',
      });
      setMoveCalendarOpen(true);
      endDrag();
      setDateZoneActive(false);
      setIsDragOverBacklog(false);
      setTrayCloseProgress(0);
      return;
    }

    if (isDragOverBacklog && draggingRepeating) {
      const fromKey = windowDates[drag.fromDay];
      if (fromKey) removeOnDate(fromKey, drag.taskId).catch(console.error);
      endDrag();
      setIsDragOverBacklog(false);
      setTrayCloseProgress(0);
      return;
    }

    let finalToDay = (targetDay ?? drag.fromDay) as number;
    let finalToIndex = targetIndex ?? drag.fromIndex;

    if (isDragOverBacklog) {
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

    if (finalToDay !== BACKLOG_IDX && window.innerWidth < 768)
      centerColumnSmooth(finalToDay);
    commitDragReorder(finalToDay, finalToIndex);

    endDrag();
    setIsDragOverBacklog(false);
    setTrayCloseProgress(0);
  }, [
    drag,
    targetDay,
    targetIndex,
    isDragOverBacklog,
    dateZoneActive,
    BACKLOG_IDX,
    N,
    windowDates,
    todayKey,
    colAt,
    backlogOpen,
    backlog.length,
    centerColumnSmooth,
    commitDragReorder,
    endDrag,
    draggingRepeating,
    removeOnDate,
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

    // While dragging a task: an animated "Move to a specific date" drop zone.
    if (drag?.active) {
      return (
        <div
          ref={isPast ? pastZoneRef : futureZoneRef}
          data-edge-zone={side}
          className="shrink-0 self-start flex h-[clamp(220px,calc(100svh-430px),480px)] w-[52vw] sm:w-[200px] md:w-[185px]"
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

    // Not dragging: a "Load more" affordance. On touch it elastically scales as
    // you slide toward it and loads on release; on web it's a plain click.
    const pull = edgePull.side === side ? edgePull.amount : 0;
    const armed = pull >= PULL_ARM;
    // Progressive color: a muted resting state that ramps up to full primary
    // right as the pull crosses the arm threshold — mirrors the TaskList
    // swipe-icon fill. Works for both the mobile pull and the desktop edge-pan;
    // the REST floor keeps the button looking tappable when it's idle.
    const REST_FILL = 0.4;
    const fill = Math.max(REST_FILL, Math.min(1, pull / PULL_ARM));
    const Chevron = isPast ? ChevronsLeft : ChevronsRight;
    const label = !isMobile
      ? 'Click to load'
      : armed
        ? 'Release to load'
        : 'Load more';
    return (
      <div className="shrink-0 self-center flex items-center justify-center w-[52vw] sm:w-[200px] md:w-[185px]">
        <button
          type="button"
          onClick={() => triggerEdgeLoad(side)}
          style={{
            transform: `scale(${1 + pull * 0.14})`,
            transition: pull > 0 ? 'transform 60ms linear' : 'transform 260ms ease',
          }}
          className="group flex flex-col items-center gap-3 outline-none"
        >
          {/* Solid pill — clearly a button, fully filled, no ring */}
          <motion.span
            animate={{ scale: armed ? 1.06 : 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22 }}
            style={{
              filter: `grayscale(${1 - fill})`,
              opacity: 0.5 + 0.5 * fill,
            }}
            className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground transition-transform group-hover:scale-105 group-active:scale-95"
          >
            <Chevron className="h-5 w-5" strokeWidth={2.75} />
          </motion.span>

          {/* Label */}
          <span className="flex flex-col items-center gap-0.5 leading-none">
            <span
              style={{ opacity: 0.55 + 0.45 * fill }}
              className="text-[13px] font-black tracking-tight text-primary"
            >
              {label}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
              +7 days
            </span>
          </span>
        </button>
      </div>
    );
  };

  return (
    <div className="relative w-full h-full">
      {/* SCROLLER */}
      <div
        ref={scrollerRef}
        dir="ltr"
        data-role="board-scroller"
        data-drag={drag?.active ? '1' : '0'}
        onPointerDown={scrollLocked ? undefined : startPanIfEligible}
        onPointerMove={scrollLocked ? undefined : onPanMove}
        onPointerUp={scrollLocked ? undefined : endPan}
        className={[
          'no-scrollbar absolute inset-0 w-full h-full select-none',
          'flex flex-col items-start overflow-y-hidden overscroll-x-contain',
          scrollLocked ? 'overflow-x-hidden touch-none' : 'overflow-x-auto touch-pan-x',
          snapSuppressed
            ? 'snap-none'
            : 'snap-x snap-mandatory scroll-smooth md:snap-none',
        ].join(' ')}
        style={{
          WebkitOverflowScrolling: 'touch',
          scrollBehavior: snapSuppressed ? 'auto' : undefined,
        }}
      >
        <div className="flex mx-auto gap-3 px-4 pt-[calc(9rem+env(safe-area-inset-top))] md:pt-16 pb-[calc(100px+env(safe-area-inset-bottom))]">
          {renderEdge('past')}
          {windowDates.map((dk, i) => (
            <div
              key={dk}
              ref={setSlideRef(i)}
              data-col="true"
              data-date-key={dk}
              className="shrink-0 snap-center w-[88vw] sm:w-[360px] md:w-[330px] lg:w-[310px] xl:w-[292px] h-full"
            >
              <DayColumn
                title={titleForIndex(i)}
                count={(tasksByDate[dk] ?? []).length}
                listRef={setListRef(i)}
                maxHeightClass="max-h-[calc(100svh-315px-var(--safe-bottom))] md:max-h-[calc(100svh-340px-var(--safe-bottom))]"
                isToday={dk === todayKey}
                isPast={cmpYmd(dk, todayKey) < 0}
                filter={getFilter(i)}
                onFilterChange={(f) => setFilter(i, f)}
                availableTags={tagsData?.tags || []}
                selectedTags={getSelectedTags(i)}
                onTagsChange={(tags) => setSelectedTags(i, tags)}
                showCompleted={getShowCompleted(i)}
                onShowCompletedChange={(show) => setShowCompleted(i, show)}
                onAddClick={
                  cmpYmd(dk, todayKey) < 0
                    ? undefined
                    : () => {
                        setQuickText('');
                        setInitialDateKey(dk);
                        setPageIndex(i);
                        setShowQuickAdd(true);
                      }
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
                  removeTask={async (_d, id) => removeOnDate(dk, id)}
                  onGrab={onGrab as any}
                  setCardRef={setCardRef}
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
                  filter={getFilter(i)}
                  selectedTags={getSelectedTags(i)}
                  showCompleted={getShowCompleted(i)}
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
      </div>

      {/* Top header + dot strip (mobile + desktop) */}
      <div
        className={`absolute top-[calc(0.5rem+env(safe-area-inset-top))] left-0 right-0 flex flex-col items-center gap-2 pointer-events-none px-3 ${
          calendarOpen ? 'z-[97]' : 'z-[60]'
        } ${moveCalendarOpen ? 'hidden' : ''}`}
      >
        <div className="md:hidden">
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
      </div>

      {/* Month calendar overlay */}
      <MonthCalendar
        open={calendarOpen}
        selectedDate={activeDateKey}
        minDate={accountCreatedAt ?? undefined}
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
        }}
        onClose={() => setCalendarOpen(false)}
      />

      {/* Move-to-date calendar (opened by dropping a task on an edge zone) */}
      <MonthCalendar
        open={moveCalendarOpen}
        selectedDate={todayKey}
        minDate={todayKey}
        heading={(() => {
          const t = pendingMove ? findTaskById(pendingMove.taskId)?.text : '';
          if (pendingMove?.mode === 'duplicate') {
            return t ? `Duplicate “${t}” to which day?` : 'Duplicate to which day?';
          }
          return t ? `Pick a day to move “${t}”` : 'Pick a day to move this task';
        })()}
        todayLabel={
          pendingMove?.mode === 'duplicate'
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
          if (pendingMove?.mode === 'duplicate') {
            onDuplicateTaskToDate?.(pendingMove.taskId, d);
          } else if (pendingMove) {
            onMoveTaskToDate?.(pendingMove.taskId, pendingMove.fromDateKey, d);
          }
          setPendingMove(null);
          setMoveCalendarOpen(false);
        }}
        onClose={() => {
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
        className="fixed bottom-0 left-0 right-0 z-[40] px-3 md:px-4 pb-[calc(env(safe-area-inset-bottom)+84px+var(--stack))] md:pb-[calc(env(safe-area-inset-bottom)+92px+var(--stack))] pointer-events-none"
      >
        <div className="pointer-events-auto mx-auto w-full max-w-[300px] md:max-w-[480px] relative min-h-[48px] md:min-h-[72px] flex items-center justify-center">
          <BacklogBox
            count={backlog.length}
            isDragOver={isDragOverBacklog}
            isDragging={!!drag?.active}
            isRepeating={draggingRepeating}
            isDesktop={!isMobile}
            proximity={backlogProximity}
            onClick={() => setBacklogOpen(true)}
            forwardRef={backlogBoxRef}
          />
        </div>
      </div>

      <BacklogTray
        isOpen={backlogOpen}
        onClose={() => setBacklogOpen(false)}
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
        filter={getFilter(BACKLOG_IDX)}
        onFilterChange={(f) => setFilter(BACKLOG_IDX, f)}
        selectedTags={getSelectedTags(BACKLOG_IDX)}
        onTagsChange={(tags) => setSelectedTags(BACKLOG_IDX, tags)}
        showCompleted={getShowCompleted(BACKLOG_IDX)}
        onShowCompletedChange={(show) => setShowCompleted(BACKLOG_IDX, show)}
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
          });
          setShowQuickAdd(false);
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
