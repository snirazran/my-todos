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
    setDrag,
    targetDay,
    setTargetDay,
    targetIndex,
    setTargetIndex,
    onGrab,
    endDrag,
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

  // ---- QuickAddSheet state ----
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickText, setQuickText] = useState('');

  // ---- drag reorder commit ----
  const commitDragReorder = useCallback(
    (toDay: DisplayDay, toIndex: number) => {
      if (!drag) return;
      const sameSpot = drag.fromDay === toDay && drag.fromIndex === toIndex;
      if (sameSpot) return;

      setWeek((prev) => {
        const next = prev.map((d) => d.slice());
        const [moved] = next[drag.fromDay].splice(drag.fromIndex, 1);

        let insertIndex = toIndex;

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

  const onDrop = useCallback(() => {
    if (!drag) return;
    const toDay = (targetDay ?? drag.fromDay) as DisplayDay;
    const toIndex = targetIndex ?? drag.fromIndex;

    setDrag(null);
    setTargetDay(null);
    setTargetIndex(null);

    centerColumnSmooth(toDay);
    commitDragReorder(toDay, toIndex);
  }, [
    drag,
    targetDay,
    targetIndex,
    setDrag,
    setTargetDay,
    setTargetIndex,
    commitDragReorder,
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
          <div className="rounded-[28px] bg-white/75 dark:bg:white/8 backdrop-blur-2xl ring-1 ring-black/10 dark:ring-white/10 shadow-[0_8px_32px_rgba(0,0,0,.18)] p-1">
            <button
              onClick={() => {
                setQuickText('');
                setShowQuickAdd(true);
              }}
              disabled={!!drag?.active}
              className={[
                'relative w-full h-12 rounded-full',
                'bg-white/90 dark:bg-white/10 backdrop-blur-xl',
                'text-emerald-900 dark:text-emerald-50 font-semibold tracking-[-0.01em]',
                'shadow-[0_1px_0_rgba(255,255,255,.7)_inset,0_8px_24px_rgba(16,185,129,.28)] ring-1 ring-black/10 dark:ring-white/10',
                'transition-transform duration-200 hover:shadow-[0_1px_0_rgba(255,255,255,.75)_inset,0_12px_30px_rgba(16,185,129,.32)] hover:bg-white',
                'active:scale-[0.995] focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-300',
                !!drag?.active ? 'opacity-60 pointer-events-none' : '',
              ].join(' ')}
            >
              <span className="absolute inset-0 rounded-full pointer-events-none bg-gradient-to-b from-white/55 to-white/0 dark:from-white/10 dark:to-transparent" />
              <span className="relative z-10 flex items-center justify-center h-full gap-2">
                <span>Add a</span>
                <span className="translate-y-[1px]">
                  <Fly size={22} x={-2} y={-3} />
                </span>
              </span>
            </button>
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

      {/* 🔴 UPDATE THIS SECTION 🔴
        We enforce touch-action: none globally on body/html when dragging 
      */}
      <style jsx global>{`
        /* Optional: reduce motion support */
        @media (prefers-reduced-motion: reduce) {
          * {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
          }
        }

        /* LOCK THE BODY / HTML */
        html.dragging,
        html.dragging body {
          touch-action: none !important;
          overscroll-behavior: none !important;
          overflow: hidden !important;
          user-select: none !important;
          -webkit-user-select: none !important;
        }

        /* LOCK THE SCROLLER */
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
