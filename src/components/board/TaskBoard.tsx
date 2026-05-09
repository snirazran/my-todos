'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import useSWR from 'swr';
import {
  Task,
  type DisplayDay,
  type ApiDay,
  ymd,
  parseYmd,
  cmpYmd,
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
import Fly from '../ui/fly';
import { AddTaskButton } from '../ui/AddTaskButton';
import BacklogBox from './BacklogBox';
import HabitBox from './HabitBox';
import BacklogTray from './BacklogTray';
import HabitTray from './HabitTray';
import { format } from 'date-fns';

type RepeatChoice = 'this-week' | 'weekly' | 'habit';

export default function TaskBoard({
  windowDates,
  tasksByDate,
  setTasksByDate,
  backlog,
  setBacklog,
  habits = [],
  onToggleHabit,
  onEditHabit,
  onDeleteHabit,
  onEditHabitGoal,
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
  onToggleRepeat,
  onScheduleTask,
  onEditTask,
  onAcceptSuggestion,
  aiSuggestionFocusCategoryIds,
}: {
  windowDates: string[];
  tasksByDate: Record<string, Task[]>;
  setTasksByDate: React.Dispatch<
    React.SetStateAction<Record<string, Task[]>>
  >;
  backlog: Task[];
  setBacklog: React.Dispatch<React.SetStateAction<Task[]>>;
  habits?: Task[];
  onToggleHabit?: (id: string) => void;
  onEditHabit?: (id: string, text: string) => void;
  onDeleteHabit?: (id: string) => void;
  onEditHabitGoal?: (id: string, newGoal: number) => void;
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
    timesPerWeek?: number;
    startTime?: string;
    endTime?: string;
    reminder?: string;
  }) => Promise<void> | void;
  todayKey: string;
  activeDateKey: string;
  setActiveDateKey: (d: string) => void;
  accountCreatedAt?: string | null;
  onExtendWindow?: (direction: 'past' | 'future') => void;
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
  onAcceptSuggestion?: (text: string, tagIds?: string[]) => Promise<void> | void;
  aiSuggestionFocusCategoryIds?: string[];
}) {
  const pathname = usePathname();
  const [habitTrayOpen, setHabitTrayOpen] = useState(false);
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

  // helpers to get/set a column by index
  const colAt = useCallback(
    (i: number): Task[] => {
      if (i === BACKLOG_IDX) return backlog;
      const d = windowDates[i];
      return d ? tasksByDate[d] ?? [] : [];
    },
    [BACKLOG_IDX, backlog, tasksByDate, windowDates],
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
    Record<number, 'all' | 'tasks' | 'habits'>
  >({});
  const [columnTags, setColumnTags] = useState<Record<number, string[]>>({});
  const [columnShowCompleted, setColumnShowCompleted] = useState<
    Record<number, boolean>
  >({});

  const getFilter = useCallback(
    (i: number) => columnFilters[i] || 'all',
    [columnFilters],
  );
  const setFilter = useCallback(
    (i: number, f: 'all' | 'tasks' | 'habits') => {
      setColumnFilters((prev) => ({ ...prev, [i]: f }));
    },
    [],
  );
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
  const recomputeCanPanRef = useRef<() => void>();

  // Backlog state
  const [backlogOpen, setBacklogOpen] = useState(false);
  const backlogBoxRef = useRef<HTMLButtonElement>(null);
  const backlogTrayRef = useRef<HTMLDivElement>(null);
  const [isDragOverBacklog, setIsDragOverBacklog] = useState(false);
  const [backlogProximity, setBacklogProximity] = useState(0);
  const [trayCloseProgress, setTrayCloseProgress] = useState(0);

  const centerColumnSmooth = useCallback((i: number) => {
    const s = scrollerRef.current;
    const col = (document.querySelectorAll('[data-col="true"]')[i] ??
      null) as HTMLElement | null;
    if (!s || !col) return;
    s.scrollTo({
      left: col.offsetLeft - (s.clientWidth - col.clientWidth) / 2,
      behavior: 'smooth',
    });
  }, [scrollerRef]);

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
  }, [activeIdx, scrollerRef]);

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

        // Edge-trigger window expansion
        if (onExtendWindow) {
          if (idx <= 3) onExtendWindow('past');
          else if (idx >= N - 4) onExtendWindow('future');
        }
      }
    };
    s.addEventListener('scroll', handler, { passive: true });
    return () => s.removeEventListener('scroll', handler);
  }, [N, windowDates, activeDateKey, setActiveDateKey, onExtendWindow, scrollerRef]);

  const { panActive, startPanIfEligible, onPanMove, endPan, recomputeCanPan } =
    usePan(scrollerRef);
  recomputeCanPanRef.current = recomputeCanPan;

  const snapSuppressed = !!drag?.active || panActive;

  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickText, setQuickText] = useState('');
  const [quickAddMode, setQuickAddMode] = useState<'pick' | 'habit'>('pick');
  const [initialDateKey, setInitialDateKey] = useState<string | undefined>(
    undefined,
  );

  const effectiveTargetDay = targetDay;

  // Clamp Target Index Logic (unchanged)
  let clampedTargetIndex = targetIndex;
  if (effectiveTargetDay !== null && effectiveTargetDay < BACKLOG_IDX) {
    const list = colAt(effectiveTargetDay);
    const firstCompleted = list.findIndex((t) => t.completed);
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
        destList.splice(Math.min(toIndex, destList.length), 0, moved);
        setColAt(drag.fromDay, sourceList);
        setColAt(toDay, destList);
        Promise.all([
          saveCol(drag.fromDay, sourceList),
          saveCol(toDay, destList),
        ]).catch(() => {});
      }
    },
    [drag, BACKLOG_IDX, colAt, setColAt, saveCol],
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
    [BACKLOG_IDX, setBacklog, saveBacklog, windowDates, setTasksByDate, saveDate],
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
    [BACKLOG_IDX, windowDates, setTasksByDate, saveDate, setBacklog, saveBacklog],
  );

  const onDrop = useCallback(() => {
    if (!drag) return;

    let finalToDay = (targetDay ?? drag.fromDay) as number;
    let finalToIndex = targetIndex ?? drag.fromIndex;

    if (isDragOverBacklog) {
      finalToDay = BACKLOG_IDX;
      finalToIndex = backlog.length;
    }

    // BLOCK: no dragging onto a past date when source is today/future.
    if (
      finalToDay !== BACKLOG_IDX &&
      drag.fromDay !== BACKLOG_IDX &&
      finalToDay >= 0 &&
      finalToDay < N
    ) {
      const fromKey = windowDates[drag.fromDay];
      const toKey = windowDates[finalToDay];
      if (
        fromKey &&
        toKey &&
        cmpYmd(fromKey, todayKey) >= 0 &&
        cmpYmd(toKey, todayKey) < 0
      ) {
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

    if (finalToDay !== BACKLOG_IDX) centerColumnSmooth(finalToDay);
    commitDragReorder(finalToDay, finalToIndex);

    endDrag();
    setIsDragOverBacklog(false);
    setTrayCloseProgress(0);
  }, [
    drag,
    targetDay,
    targetIndex,
    isDragOverBacklog,
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

  return (
    <div className="relative w-full h-full">
      {/* SCROLLER */}
      <div
        ref={scrollerRef}
        dir="ltr"
        data-role="board-scroller"
        data-drag={drag?.active ? '1' : '0'}
        onPointerDown={startPanIfEligible}
        onPointerMove={onPanMove}
        onPointerUp={endPan}
        className={[
          'no-scrollbar absolute inset-0 w-full h-full',
          'flex flex-col items-start overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x',
          snapSuppressed
            ? 'snap-none'
            : 'snap-x snap-mandatory scroll-smooth md:snap-none',
        ].join(' ')}
        style={{
          WebkitOverflowScrolling: 'touch',
          scrollBehavior: snapSuppressed ? 'auto' : undefined,
        }}
      >
        <div className="flex mx-auto gap-3 px-4 pt-36 md:pt-16 pb-[calc(100px+env(safe-area-inset-bottom))]">
          {windowDates.map((dk, i) => (
            <div
              key={dk}
              ref={setSlideRef(i)}
              data-col="true"
              className="shrink-0 snap-center w-[88vw] sm:w-[360px] md:w-[330px] lg:w-[310px] xl:w-[292px] h-full"
            >
              <DayColumn
                title={titleForIndex(i)}
                count={(tasksByDate[dk] ?? []).length}
                listRef={setListRef(i)}
                maxHeightClass="max-h-[calc(100svh-340px-var(--safe-bottom))] md:max-h-[calc(100svh-340px-var(--safe-bottom))]"
                isToday={dk === todayKey}
                filter={getFilter(i)}
                onFilterChange={(f) => setFilter(i, f)}
                availableTags={tagsData?.tags || []}
                selectedTags={getSelectedTags(i)}
                onTagsChange={(tags) => setSelectedTags(i, tags)}
                showCompleted={getShowCompleted(i)}
                onShowCompletedChange={(show) => setShowCompleted(i, show)}
              >
                <TaskList
                  day={i as any}
                  items={tasksByDate[dk] ?? []}
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
                      ? (taskId: string) =>
                          onToggleRepeat(taskId, dk)
                      : undefined as any
                  }
                  onEditTask={async (_d, taskId, newText) =>
                    handleEditTask(i, taskId, newText)
                  }
                  onDoLater={async (_d, taskId) => handleDoLater(i, taskId)}
                  onScheduleTask={onScheduleTask}
                  isAnyDragging={!!drag?.active}
                  isToday={dk === todayKey}
                  onAcceptSuggestion={onAcceptSuggestion}
                  aiSuggestionFocusCategoryIds={aiSuggestionFocusCategoryIds}
                  filter={getFilter(i)}
                  selectedTags={getSelectedTags(i)}
                  showCompleted={getShowCompleted(i)}
                  daysOrder={daysOrder}
                  emptyMode={cmpYmd(dk, todayKey) < 0 ? 'none' : 'add'}
                />
              </DayColumn>
            </div>
          ))}
        </div>
      </div>

      {/* Top header + dot strip (mobile + desktop) */}
      <div className="absolute top-2 left-0 right-0 z-[60] flex flex-col items-center gap-2 pointer-events-none px-3">
        <div className="md:hidden">
          <PlannerHeader
            dateKey={activeDateKey}
            expanded={calendarOpen}
            onToggle={() => setCalendarOpen((v) => !v)}
            variant="mobile"
          />
        </div>
        <div className="hidden md:block">
          <PlannerHeader
            dateKey={activeDateKey}
            expanded={calendarOpen}
            onToggle={() => setCalendarOpen((v) => !v)}
            variant="desktop"
          />
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
          setActiveDateKey(d);
          const i = windowDates.indexOf(d);
          if (i >= 0) centerColumnSmooth(i);
          else if (onExtendWindow) {
            // jump outside the window — caller will rebuild
            onExtendWindow(cmpYmd(d, todayKey) < 0 ? 'past' : 'future');
          }
        }}
        onClose={() => setCalendarOpen(false)}
      />

      {/* Bottom toolbar (Backlog / Habits / Add) */}
      <div className="fixed bottom-0 left-0 right-0 z-[40] px-3 md:px-4 pb-[calc(env(safe-area-inset-bottom)+84px)] md:pb-[calc(env(safe-area-inset-bottom)+100px)] pointer-events-none">
        <div className={`pointer-events-auto mx-auto w-full max-w-[300px] md:max-w-[400px] relative min-h-[48px] md:min-h-[56px] flex items-center justify-center transition-all duration-300 ${drag?.active && drag?.taskType !== 'habit' ? 'gap-0' : 'gap-1.5 md:gap-2'}`}>
          <BacklogBox
            count={backlog.length}
            isDragOver={isDragOverBacklog}
            isDragging={!!drag?.active && drag?.taskType !== 'habit'}
            proximity={backlogProximity}
            onClick={() => setBacklogOpen(true)}
            forwardRef={backlogBoxRef}
          />
          <HabitBox
            count={habits.length}
            onClick={() => setHabitTrayOpen(true)}
            isDragging={!!drag?.active && drag?.taskType !== 'habit'}
          />
          <motion.div
            initial={false}
            animate={{
              opacity: drag?.active && drag?.taskType !== 'habit' ? 0 : 1,
              scale: drag?.active && drag?.taskType !== 'habit' ? 0.9 : 1,
              width: drag?.active && drag?.taskType !== 'habit' ? 0 : 'auto',
              flexGrow: drag?.active && drag?.taskType !== 'habit' ? 0 : 1,
            }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className={`min-w-0 ${drag?.active && drag?.taskType !== 'habit' ? 'overflow-hidden' : 'overflow-visible'}`}
            style={{
              pointerEvents: drag?.active && drag?.taskType !== 'habit' ? 'none' : 'auto',
              whiteSpace: 'nowrap',
            }}
          >
            <AddTaskButton
              className="w-full h-12 md:h-[56px]"
              label={
                <span className="flex items-center">
                  Add a <Fly size={32} y={-3} x={4} />
                </span>
              }
              showFly={false}
              onClick={() => {
                setQuickText('');
                setInitialDateKey(undefined);
                setQuickAddMode('pick');
                setShowQuickAdd(true);
              }}
              disabled={!!drag?.active && drag?.taskType !== 'habit'}
            />
          </motion.div>
        </div>
      </div>

      <BacklogTray
        isOpen={backlogOpen}
        onClose={() => setBacklogOpen(false)}
        tasks={backlog}
        onGrab={onGrab}
        setCardRef={setCardRef}
        activeDragId={drag?.active ? drag.taskId : null}
        trayRef={backlogTrayRef}
        closeProgress={trayCloseProgress}
        onRemove={(id) => removeFromBacklog(id)}
        userTags={userTags}
        onEdit={(id, newText) => handleEditTask(BACKLOG_IDX, id, newText)}
        onToggleRepeat={(id) =>
          onToggleRepeat && onToggleRepeat(id, todayKey)
        }
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

      <HabitTray
        isOpen={habitTrayOpen}
        onClose={() => setHabitTrayOpen(false)}
        habits={habits}
        onToggle={(id) => onToggleHabit?.(id)}
        onEdit={(id, text) => onEditHabit?.(id, text)}
        onDelete={(id) => onDeleteHabit?.(id)}
        onEditGoal={(id, goal) => onEditHabitGoal?.(id, goal)}
        onSchedule={(taskId, data) => onScheduleTask?.(taskId, data)}
        onAddRequested={() => {
          setHabitTrayOpen(false);
          setQuickAddMode('habit');
          setShowQuickAdd(true);
        }}
        userTags={userTags}
        date={format(new Date(), 'yyyy-MM-dd')}
      />

      <QuickAddSheet
        open={showQuickAdd}
        onOpenChange={setShowQuickAdd}
        initialText={quickText}
        defaultRepeat="this-week"
        defaultMode={quickAddMode}
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
        daysOrder={daysOrder}
        onSubmit={async ({
          text,
          days,
          repeat,
          tags,
          timesPerWeek,
          startTime,
          endTime,
          reminder,
        }) => {
          if (!onQuickAdd) {
            onRequestAdd(initialDateKey ?? null, text, null, repeat as RepeatChoice);
            setShowQuickAdd(false);
            return;
          }

          // Translate weekday-API days back to explicit calendar dates,
          // anchored to the currently active date. Backlog (-1) -> empty dates.
          const anchor = initialDateKey ?? activeDateKey;
          const anchorDate = parseYmd(anchor);
          const anchorDow = anchorDate.getDay();
          const dates: string[] = [];
          if (repeat === 'this-week') {
            for (const d of days) {
              if (d === -1) continue;
              const offset = ((d - anchorDow) + 7) % 7;
              dates.push(ymd(new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate() + offset)));
            }
          }
          await onQuickAdd({
            text,
            dates,
            repeat: repeat as RepeatChoice,
            tags,
            timesPerWeek,
            startTime,
            endTime,
            reminder,
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
