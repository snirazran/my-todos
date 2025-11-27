'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  Task,
  DAYS,
  todayDisplayIndex,
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

type RepeatChoice = 'this-week' | 'weekly';

export default function TaskBoard({
  titles,
  week,
  setWeek,
  saveDay,
  removeTask,
  onRequestAdd,
  onQuickAdd,
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
  }) => Promise<void> | void;
}) {
  const pathname = usePathname();
  const {
    scrollerRef,
    setSlideRef,
    setListRef,
    setCardRef,
    drag,
    // setDrag,      <-- remove or ignore this
    // setTargetDay, <-- remove or ignore this
    // setTargetIndex, <-- remove or ignore this
    targetDay,
    targetIndex,
    onGrab,
    endDrag, // 🟢 WE NEED TO USE THIS
    cancelDrag,
  } = useDragManager();

  useEffect(() => {
    cancelDrag();
  }, [pathname, cancelDrag]);

  const [pageIndex, setPageIndex] = useState<DisplayDay>(
    todayDisplayIndex() as DisplayDay
  );
  const recomputeCanPanRef = useRef<() => void>();

  const centerColumnSmooth = (day: DisplayDay) => {
    const s = scrollerRef.current;
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
    const t = todayDisplayIndex() as DisplayDay;
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

  const commitDragReorder = useCallback(
    (toDay: DisplayDay, toIndex: number) => {
      if (!drag) return;
      const sameSpot = drag.fromDay === toDay && drag.fromIndex === toIndex;
      if (sameSpot) return;

      setWeek((prev) => {
        const next = prev.map((d) => d.slice());
        const [moved] = next[drag.fromDay].splice(drag.fromIndex, 1);
        let insertIndex = toIndex;
        // Fix index if moving within same list downwards
        if (drag.fromDay === toDay && drag.fromIndex < toIndex) {
          insertIndex = Math.max(0, toIndex - 1);
        }
        next[toDay].splice(Math.min(insertIndex, next[toDay].length), 0, moved);

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

  // 🟢 UPDATED ONDROP FUNCTION
  const onDrop = useCallback(() => {
    if (!drag) return;
    const toDay = (targetDay ?? drag.fromDay) as DisplayDay;
    const toIndex = targetIndex ?? drag.fromIndex;

    // 1. Commit changes first (while drag state exists)
    centerColumnSmooth(toDay);
    commitDragReorder(toDay, toIndex);

    // 2. Use endDrag() to clear state AND restore browser scrolling
    endDrag();
  }, [
    drag,
    targetDay,
    targetIndex,
    commitDragReorder,
    endDrag, // <--- Dependency added
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
          'overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x',
          snapSuppressed ? 'snap-none' : 'snap-x snap-mandatory scroll-smooth',
        ].join(' ')}
        style={{
          WebkitOverflowScrolling: 'touch',
          scrollBehavior: snapSuppressed ? 'auto' : undefined,
        }}
      >
        <div className="flex gap-3 px-4 pt-4 md:px-6 md:pt-6 lg:pt-8 pb-[220px] sm:pb-[180px] md:pb-[188px]">
          {Array.from({ length: DAYS }, (_, day) => ({
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
                listRef={setListRef(day)}
                maxHeightClass="max-h-[73svh]"
              >
                <TaskList
                  day={day}
                  items={week[day]}
                  drag={drag}
                  targetDay={targetDay as DisplayDay | null}
                  targetIndex={targetIndex}
                  removeTask={removeTask}
                  onGrab={onGrab}
                  setCardRef={setCardRef}
                />
              </DayColumn>
            </div>
          ))}
        </div>
      </div>

      {/* Pagination */}
      <div
        className="absolute left-0 right-0 z-[60] flex justify-center pointer-events-none"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 112px)' }}
      >
        <div className="pointer-events-auto">
          <PaginationDots count={DAYS} activeIndex={pageIndex} />
        </div>
      </div>

      {/* Drag overlay */}
      {drag?.active && (
        <DragOverlay
          x={drag.x}
          y={drag.y}
          dx={drag.dx}
          dy={drag.dy}
          width={drag.width}
          height={drag.height}
          text={drag.taskText}
        />
      )}

      {/* GLOBAL BOTTOM ADD (trigger only) */}
      <div className="absolute bottom-0 left-0 right-0 z-[40] px-4 py-12 pointer-events-none sm:px-6 sm:py-5">
        <div className="pointer-events-auto mx-auto w-full max-w-[820px] pb-[env(safe-area-inset-bottom)]">
          <div className="rounded-[28px] bg-white/80 dark:bg-slate-900/70 backdrop-blur-2xl ring-1 ring-slate-200/80 dark:ring-slate-700/60 shadow-[0_8px_32px_rgba(0,0,0,.18)] p-1">
            <AddTaskButton
              onClick={() => {
                setQuickText('');
                setShowQuickAdd(true);
              }}
              disabled={!!drag?.active}
            />
          </div>
        </div>
      </div>

      <QuickAddSheet
        open={showQuickAdd}
        onOpenChange={setShowQuickAdd}
        initialText={quickText}
        defaultRepeat="this-week"
        onSubmit={async ({ text, days, repeat }) => {
          if (onQuickAdd) {
            await onQuickAdd({
              text,
              days,
              repeat: repeat as RepeatChoice,
            });
          } else {
            onRequestAdd(null, text, null, repeat as RepeatChoice);
          }
          setShowQuickAdd(false);
        }}
      />

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
