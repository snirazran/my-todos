'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import useSWR from 'swr';
import {
  Task,
  DAYS,
  type DisplayDay,
  type ApiDay,
} from './helpers';
import DayColumn from './DayColumn';
import TaskList from './TaskList';
import PaginationDots from './PaginationDots';
import DragOverlay from './DragOverlay';
import { useDragManager } from './hooks/useDragManager';
import { usePan } from './hooks/usePan';
import QuickAddSheet from '@/components/ui/QuickAddSheet';
import Fly from '../ui/fly';
import { AddTaskButton } from '../ui/AddTaskButton';
import BacklogBox from './BacklogBox';
import BacklogTray from './BacklogTray';

type RepeatChoice = 'this-week' | 'weekly';

export default function TaskBoard({
  titles,
  week,
  setWeek,
  saveDay,
  removeTask,
  onRequestAdd,
  onQuickAdd,
  todayDisplayIndex,
  onToggleRepeat,
}: {
  titles: string[];
  week: Task[][];
  setWeek: React.Dispatch<React.SetStateAction<Task[][]>>;
  saveDay: (day: DisplayDay, tasks: Task[]) => Promise<void>;
  removeTask: (day: DisplayDay, id: string) => Promise<void>;
  onRequestAdd: (
    day: DisplayDay | null,
    text?: string,
    afterIndex?: number | null,
    repeat?: RepeatChoice
  ) => void;
  onQuickAdd?: (data: {
    text: string;
    days: ApiDay[];
    repeat: RepeatChoice;
    tags: string[];
  }) => Promise<void> | void;
  todayDisplayIndex: Exclude<DisplayDay, 7>;
  onToggleRepeat?: (taskId: string, day: DisplayDay) => Promise<void> | void;
}) {
  const pathname = usePathname();
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

  const { data: tagsData } = useSWR('/api/tags', (url) =>
    fetch(url).then((r) => r.json())
  );
  const userTags = tagsData?.tags || [];

  useEffect(() => {
    cancelDrag();
  }, [pathname, cancelDrag]);

  const [pageIndex, setPageIndex] = useState<DisplayDay>(
    todayDisplayIndex as DisplayDay
  );
  const recomputeCanPanRef = useRef<() => void>();

  // Backlog State
  const [backlogOpen, setBacklogOpen] = useState(false);
  // FIX: changed from HTMLDivElement to HTMLButtonElement to match BacklogBox props
  const backlogBoxRef = useRef<HTMLButtonElement>(null);
  const backlogTrayRef = useRef<HTMLDivElement>(null);
  const [isDragOverBacklog, setIsDragOverBacklog] = useState(false);
  const [backlogProximity, setBacklogProximity] = useState(0); // 0..1
  const [trayCloseProgress, setTrayCloseProgress] = useState(0); // 0..1 (0=open, 1=closed)

  const centerColumnSmooth = (day: DisplayDay) => {
    const s = scrollerRef.current;
    // If we target day 7 (backlog) but it's not in the DOM columns, do nothing or snap to end
    if (day >= DAYS - 1) return;

    const col = (document.querySelectorAll('[data-col="true"]')[day] ??
      null) as HTMLElement | null;
    if (!s || !col) return;
    s.scrollTo({
      left: col.offsetLeft - (s.clientWidth - col.clientWidth) / 2,
      behavior: 'smooth',
    });
  };

  useEffect(() => {
    const s = scrollerRef.current;
    const t = todayDisplayIndex as DisplayDay;
    const col = (document.querySelectorAll('[data-col="true"]')[t] ??
      null) as HTMLElement | null;
    if (!s || !col) return;
    s.scrollTo({
      left: col.offsetLeft - (s.clientWidth - col.clientWidth) / 2,
      // @ts-ignore
      behavior: 'instant',
    });
    setPageIndex(t);
    recomputeCanPanRef.current?.();
  }, []);

  useEffect(() => {
    const s = scrollerRef.current;
    if (!s) return;
    const handler = () => {
      const cols = Array.from(
        document.querySelectorAll<HTMLElement>('[data-col="true"]')
      );
      const idx = cols.findIndex((col) => {
        const colCenter = col.offsetLeft + col.clientWidth / 2;
        const scrollCenter = s.scrollLeft + s.clientWidth / 2;
        return Math.abs(colCenter - scrollCenter) < col.clientWidth / 2;
      });
      if (idx >= 0) setPageIndex(idx as DisplayDay);
    };
    s.addEventListener('scroll', handler, { passive: true });
    return () => s.removeEventListener('scroll', handler);
  }, []);

  const { panActive, startPanIfEligible, onPanMove, endPan, recomputeCanPan } =
    usePan(scrollerRef);
  recomputeCanPanRef.current = recomputeCanPan;

  const snapSuppressed = !!drag?.active || panActive;

  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickText, setQuickText] = useState('');

  // Derived state for masking targetDay (Placeholder Suppression)
  let effectiveTargetDay = targetDay;
  if (drag?.active && backlogOpen && backlogTrayRef.current) {
    // If dragging within the visual bounds of the tray, suppress column placeholders
    // The tray might be animating down (trayCloseProgress > 0).
    // We consider it "covering" if we are below its current visual top.

    const trayHeight = backlogTrayRef.current.offsetHeight;
    // Calculate visual top based on close progress (0=open, 1=closed/down)
    const visualTrayTop =
      window.innerHeight - trayHeight * (1 - trayCloseProgress);

    if (drag.y > visualTrayTop) {
      effectiveTargetDay = null;
    }
  }

  // --- Clamp Target Index Logic ---
  // If we are targeting a regular day (0..6), we must not allow the targetIndex
  // to exceed the index of the first completed task.
  let clampedTargetIndex = targetIndex;

  if (
    effectiveTargetDay !== null &&
    effectiveTargetDay < 7 &&
    week[effectiveTargetDay]
  ) {
    const list = week[effectiveTargetDay];
    const firstCompleted = list.findIndex((t) => t.completed);
    if (firstCompleted !== -1 && targetIndex !== null) {
      // If dragging from same column, the "gap" means we effectively have one less item
      // before the completed block.
      // So the limit should be (firstCompleted - 1).
      // If dragging from another column, the limit is firstCompleted (insert before it).
      const isSelfDrag = drag?.fromDay === effectiveTargetDay;
      const limit = isSelfDrag ? Math.max(0, firstCompleted - 1) : firstCompleted;
      clampedTargetIndex = Math.min(targetIndex, limit);
    }
  }

  // Detect drag over backlog box
  useEffect(() => {
    // 1. Handle Tray Animation (Dragging FROM backlog)
    if (
      drag?.active &&
      backlogOpen &&
      drag.fromDay === 7 &&
      backlogTrayRef.current
    ) {
      const trayRect = backlogTrayRef.current.getBoundingClientRect();
      const trayTop = trayRect.top;

      // Threshold: Start closing when above trayTop. Fully closed after 150px.
      const EXIT_DIST = 200;
      if (drag.y < trayTop) {
        const distOut = trayTop - drag.y;
        const progress = Math.min(1, distOut / EXIT_DIST);
        setTrayCloseProgress(progress);
      } else {
        setTrayCloseProgress(0);
      }
      // Don't return here, we might still want proximity logic if we drag back near the box?
      // Actually, if tray is open, box proximity is less relevant, or maybe we want it to highlight if we drop back "into" the button?
      // For simplicity, let's prioritize tray animation.
      setIsDragOverBacklog(false);
      setBacklogProximity(0);
      return;
    }

    // Reset tray progress if not dragging from backlog
    setTrayCloseProgress(0);

    // 2. Handle Box Proximity (Dragging TO backlog)
    if (!drag?.active || !backlogBoxRef.current) {
      setIsDragOverBacklog(false);
      setBacklogProximity(0);
      return;
    }

    const r = backlogBoxRef.current.getBoundingClientRect();

    // 1. Hit Test (Strict)
    const hit =
      drag.x >= r.left &&
      drag.x <= r.right &&
      drag.y >= r.top &&
      drag.y <= r.bottom;
    setIsDragOverBacklog(hit);

    // 2. Proximity Calculation
    // Center of the box
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    // Distance from pointer to center
    const dist = Math.hypot(drag.x - cx, drag.y - cy);

    // Radius of influence (e.g., 200px)
    const MAX_DIST = 200;
    // Normalize 0..1 (1 is closest)
    const prox = Math.max(0, 1 - dist / MAX_DIST);
    setBacklogProximity(prox);
  }, [drag?.x, drag?.y, drag?.active, backlogOpen, drag?.fromDay]);

  const commitDragReorder = useCallback(
    (toDay: DisplayDay, toIndex: number) => {
      if (!drag) return;
      const sameSpot = drag.fromDay === toDay && drag.fromIndex === toIndex;
      if (sameSpot) return;

      setWeek((prev) => {
        const next = prev.map((d) => d.slice());

        // Remove from source
        const [moved] = next[drag.fromDay].splice(drag.fromIndex, 1);

        // Insert into dest
        // Logic simplification: The `toIndex` from useDragManager corresponds
        // to the insertion index in the *reduced* list (current visual state).
        // So we don't need to adjust by -1 even when dragging downwards.
        const insertIndex = toIndex;

        // Safety for backlog array
        if (!next[toDay]) next[toDay] = [];

        next[toDay].splice(Math.min(insertIndex, next[toDay].length), 0, moved);

        // If moved to backlog, update type
        if (toDay === 7) {
          moved.type = 'backlog';
        } else if (drag.fromDay === 7) {
          // If moved FROM backlog, revert to regular (unless it was weekly, but let's assume regular for now)
          if (moved.type === 'backlog') moved.type = 'regular';
        }

        Promise.all(
          drag.fromDay === toDay
            ? [saveDay(toDay, next[toDay])]
            : [
                saveDay(drag.fromDay as DisplayDay, next[drag.fromDay]),
                saveDay(toDay, next[toDay]),
              ]
        ).catch(() => {});
        return next;
      });
    },
    [drag, saveDay, setWeek]
  );

  const onDrop = useCallback(() => {
    if (!drag) return;

    // Check Backlog Drop
    let finalToDay = (targetDay ?? drag.fromDay) as DisplayDay;
    let finalToIndex = targetIndex ?? drag.fromIndex;

    // 1. If hovering the box, force drop to backlog (Index 7)
    if (isDragOverBacklog) {
      finalToDay = 7 as DisplayDay;
      finalToIndex = week[7]?.length || 0; // Append to end
    }
    // 2. If hovering the tray (while open), force drop to backlog to avoid "ghost drop" onto background column
    //    BUT only if we haven't dragged it "out" (trayCloseProgress < 1)
    else if (backlogOpen && backlogTrayRef.current && trayCloseProgress < 0.9) {
      const tr = backlogTrayRef.current.getBoundingClientRect();
      // Only capture if we are physically over the tray (or what's left of it)
      // Although with the animation, the tray moves down.
      // But conceptually, if the user is dragging "out", we want them to hit the columns.
      if (
        drag.x >= tr.left &&
        drag.x <= tr.right &&
        drag.y >= tr.top &&
        drag.y <= tr.bottom
      ) {
        finalToDay = 7 as DisplayDay;
        if (drag.fromDay === 7) {
          finalToIndex = drag.fromIndex;
        } else {
          finalToIndex = week[7]?.length || 0;
        }
      }
    }
    // 3. If we dragged it OUT of the tray (trayCloseProgress >= 0.9), we implicitly "close" the tray logic for this drop.
    //    So we let it fall through to the calculated `finalToDay` (which is based on column geometry).

    // Clamp drop index if dropping into a regular column (to avoid mixing with completed tasks)
    if (finalToDay < 7 && week[finalToDay]) {
      const list = week[finalToDay];
      const firstCompleted = list.findIndex((t) => t.completed);
      if (firstCompleted !== -1) {
        const isSelfDrag = drag.fromDay === finalToDay;
        const limit = isSelfDrag
          ? Math.max(0, firstCompleted - 1)
          : firstCompleted;
        finalToIndex = Math.min(finalToIndex, limit);
      }
    }

    // If we dropped effectively "outside" (which means valid column drop), we should also close the backlog UI
    if (backlogOpen && finalToDay !== 7) {
      setBacklogOpen(false);
    }

    // 1. Commit changes first
    if (finalToDay < 7) {
      centerColumnSmooth(finalToDay);
    }
    commitDragReorder(finalToDay, finalToIndex);

    // 2. End drag
    endDrag();
    setIsDragOverBacklog(false);
    setTrayCloseProgress(0); // Reset
  }, [
    drag,
    targetDay,
    targetIndex,
    isDragOverBacklog,
    week,
    backlogOpen,
    trayCloseProgress, // Added dependency
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
          snapSuppressed ? 'snap-none' : 'snap-x snap-mandatory scroll-smooth',
        ].join(' ')}
        style={{
          WebkitOverflowScrolling: 'touch',
          scrollBehavior: snapSuppressed ? 'auto' : undefined,
        }}
      >
        <div className="flex mx-auto gap-3 px-4 pt-16 pb-[220px] sm:pb-[180px] md:pb-[188px]">
          {/* Render only 0..6 (Exclude Backlog Column 7) */}
          {Array.from({ length: DAYS - 1 }, (_, day) => ({
            day: day as DisplayDay,
            key: `day-${day}`,
          })).map(({ day, key }) => (
            <div
              key={key}
              ref={setSlideRef(day)}
              data-col="true"
              className="shrink-0 snap-center w-[88vw] sm:w-[360px] md:w-[330px] lg:w-[310px] xl:w-[292px] h-full"
            >
              <DayColumn
                title={titles[day]}
                count={week[day]?.length || 0}
                listRef={setListRef(day)}
                maxHeightClass="max-h-[calc(100svh-340px-var(--safe-bottom))] md:max-h-[calc(100svh-280px-var(--safe-bottom))]"
                isToday={day === todayDisplayIndex}
              >
                <TaskList
                  day={day}
                  items={week[day]}
                  isDragging={!!drag?.active}
                  dragFromDay={drag?.fromDay}
                  dragFromIndex={drag?.fromIndex}
                  targetDay={effectiveTargetDay as DisplayDay | null}
                  targetIndex={clampedTargetIndex}
                  removeTask={removeTask}
                  onGrab={onGrab}
                  setCardRef={setCardRef}
                  userTags={userTags}
                  onToggleRepeat={onToggleRepeat}
                  isAnyDragging={!!drag?.active}
                />
              </DayColumn>
            </div>
          ))}
        </div>
      </div>

      {/* Top Pagination - Mobile Only */}
      <div className="absolute top-4 left-0 right-0 z-[60] flex justify-center pointer-events-none md:hidden">
        <div className="pointer-events-auto px-1.5 py-1 rounded-2xl bg-card/40 backdrop-blur-xl">
          <PaginationDots
            count={DAYS - 1}
            activeIndex={Math.min(pageIndex, 6) as any}
            todayIndex={todayDisplayIndex}
            onSelectDay={(idx) => centerColumnSmooth(idx as any)}
          />
        </div>
      </div>
      {/* GLOBAL BOTTOM AREA - Floating Toolbar */}
      <div className="absolute bottom-0 left-0 right-0 z-[40] px-6 pb-[calc(env(safe-area-inset-bottom)+88px)] md:pb-[calc(env(safe-area-inset-bottom)+24px)] pointer-events-none">
        <div className="pointer-events-auto mx-auto w-full max-w-[420px] flex flex-col items-center gap-4">
          {/* Backlog Trigger */}
          <BacklogBox
            count={week[7]?.length || 0}
            isDragOver={isDragOverBacklog}
            isDragging={!!drag?.active}
            proximity={backlogProximity}
            onClick={() => setBacklogOpen(true)}
            forwardRef={backlogBoxRef}
          />

          {/* Add Task Button */}
          <div className="w-full flex justify-center">
            <AddTaskButton
              className="w-full"
              label="Add a task"
              onClick={() => {
                setQuickText('');
                setShowQuickAdd(true);
              }}
              disabled={!!drag?.active}
            />
          </div>
        </div>
      </div>

      {/* Backlog Tray Overlay */}
      <BacklogTray
        isOpen={backlogOpen}
        onClose={() => setBacklogOpen(false)}
        tasks={week[7] || []}
        onGrab={onGrab}
        setCardRef={setCardRef}
        activeDragId={drag?.active ? drag.taskId : null}
        trayRef={backlogTrayRef}
        closeProgress={trayCloseProgress}
        onRemove={(id) => removeTask(7 as DisplayDay, id)}
        userTags={userTags}
      />

      <QuickAddSheet
        open={showQuickAdd}
        onOpenChange={setShowQuickAdd}
        initialText={quickText}
        defaultRepeat="this-week"
        onSubmit={async ({ text, days, repeat, tags }) => {
          if (onQuickAdd) {
            await onQuickAdd({
              text,
              days,
              repeat: repeat as RepeatChoice,
              tags,
            });
          } else {
            onRequestAdd(null, text, null, repeat as RepeatChoice);
          }
          setShowQuickAdd(false);
        }}
      />

      {/* Drag overlay - Rendered LAST to ensure top z-index */}
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
