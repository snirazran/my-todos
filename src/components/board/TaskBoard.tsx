'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Task, DAYS, todayDisplayIndex } from './helpers';
import DayColumn from './DayColumn';
import TaskList from './TaskList';
import PaginationDots from './PaginationDots';
import DragOverlay from './DragOverlay';
import { useDragManager } from './hooks/useDragManager';
import { usePan } from './hooks/usePan';
import Fly from '../ui/fly';
import { RotateCcw, CalendarCheck, X, Plus } from 'lucide-react';

type RepeatChoice = 'this-week' | 'weekly';

export default function TaskBoard({
  titles,
  week,
  setWeek,
  saveDay,
  removeTask,
  onRequestAdd,
}: {
  titles: string[];
  week: Task[][];
  setWeek: React.Dispatch<React.SetStateAction<Task[][]>>;
  saveDay: (day: number, tasks: Task[]) => Promise<void>;
  removeTask: (day: number, id: string) => Promise<void>;
  onRequestAdd: (
    day: number | null,
    text?: string,
    afterIndex?: number | null,
    repeat?: RepeatChoice
  ) => void;
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

  const [pageIndex, setPageIndex] = useState(todayDisplayIndex());
  const recomputeCanPanRef = useRef<() => void>();

  const centerColumnSmooth = (day: number) => {
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
    const t = todayDisplayIndex();
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
      if (idx >= 0) setPageIndex(idx);
    };
    s.addEventListener('scroll', handler, { passive: true });
    return () => s.removeEventListener('scroll', handler);
  }, []);

  const { panActive, startPanIfEligible, onPanMove, endPan, recomputeCanPan } =
    usePan(scrollerRef);
  recomputeCanPanRef.current = recomputeCanPan;

  const snapSuppressed = !!drag?.active || panActive;

  // ---- Global bottom composer state ----
  const [globalOpen, setGlobalOpen] = useState(false);
  const [gText, setGText] = useState('');
  const [gRepeat, setGRepeat] = useState<RepeatChoice>('this-week');
  const disabled = !gText.trim();

  const openModalFromGlobal = () => {
    if (disabled) return;
    onRequestAdd(null, gText.trim(), null, gRepeat);
    setGlobalOpen(false);
    setGText('');
  };

  // ---- drag reorder commit ----
  const commitDragReorder = useCallback(
    (toDay: number, toIndex: number) => {
      if (!drag) return;
      const sameSpot = drag.fromDay === toDay && drag.fromIndex === toIndex;
      if (sameSpot) return;

      setWeek((prev) => {
        const next = prev.map((d) => d.slice());
        const [moved] = next[drag.fromDay].splice(drag.fromIndex, 1);
        let insertIndex = toIndex;
        if (drag.fromDay === toDay && drag.fromIndex < toIndex) {
          insertIndex = Math.max(0, toIndex - 1);
        }
        next[toDay].splice(Math.min(insertIndex, next[toDay].length), 0, moved);
        Promise.all(
          drag.fromDay === toDay
            ? [saveDay(toDay, next[toDay])]
            : [
                saveDay(drag.fromDay, next[drag.fromDay]),
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
    const toDay = targetDay ?? drag.fromDay;
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
        {/* extra space so the bar never overlaps content */}
        <div className="flex gap-3 px-4 pt-4 md:px-6 md:pt-6 lg:pt-8 pb-[120px] md:pb-[136px]">
          {Array.from({ length: DAYS }, (_, day) => ({
            day,
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
                maxHeightClass="max-h-[74svh]"
              >
                <TaskList
                  day={day}
                  items={week[day]}
                  drag={drag}
                  targetDay={targetDay}
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
      <PaginationDots count={DAYS} activeIndex={pageIndex} />

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

      {/* GLOBAL BOTTOM ADD BAR (Apple-style glass) */}
      <div className="absolute bottom-0 left-0 right-0 z-20 px-4 py-4 pointer-events-none sm:px-6 sm:py-4">
        <div className="pointer-events-auto mx-auto w-full max-w-[820px]">
          {!globalOpen ? (
            <div className="rounded-[28px] bg-white/75 dark:bg-white/8 backdrop-blur-2xl ring-1 ring-black/10 dark:ring-white/10 shadow-[0_8px_32px_rgba(0,0,0,.18)] p-1">
              <button
                onClick={() => setGlobalOpen(true)}
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
                {/* soft top highlight */}
                <span className="absolute inset-0 rounded-full pointer-events-none bg-gradient-to-b from-white/55 to-white/0 dark:from-white/10 dark:to-transparent" />
                <span className="relative z-10 flex items-center justify-center h-full gap-2">
                  <span>Add a</span>
                  <span className="translate-y-[1px]">
                    <Fly size={22} x={-2} y={-3} />
                  </span>
                </span>
              </button>
            </div>
          ) : (
            <div className="rounded-[28px] bg-white/75 dark:bg-white/8 backdrop-blur-2xl ring-1 ring-black/10 dark:ring-white/10 shadow-[0_8px_32px_rgba(0,0,0,.18)] p-3">
              <input
                value={gText}
                onChange={(e) => setGText(e.target.value)}
                placeholder="Task name…"
                className="w-full h-11 px-3 mb-3 rounded-[14px] bg-white/90 dark:bg-white/10 text-emerald-900 dark:text-emerald-50 ring-1 ring-black/10 dark:ring-white/10 shadow-[0_1px_0_rgba(255,255,255,.7)_inset] focus:outline-none focus:ring-2 focus:ring-lime-300"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    openModalFromGlobal();
                  }
                  if (e.key === 'Escape') setGlobalOpen(false);
                }}
                inputMode="text"
                autoFocus
              />

              {/* Segmented control */}
              <div className="relative grid grid-cols-2 gap-1 p-1 rounded-2xl bg-white/65 dark:bg-white/5 ring-1 ring-black/10 dark:ring-white/10">
                <button
                  type="button"
                  onClick={() => setGRepeat('this-week')}
                  aria-pressed={gRepeat === 'this-week'}
                  className={[
                    'h-9 rounded-xl text-[13px] font-medium transition',
                    gRepeat === 'this-week'
                      ? 'bg-white shadow-sm ring-1 ring-black/10 dark:bg-white/10 dark:ring-white/10'
                      : 'bg-transparent text-emerald-900/80 dark:text-emerald-100/80',
                  ].join(' ')}
                  title="This week only"
                >
                  <span className="inline-flex items-center justify-center gap-1.5 px-3 h-full">
                    <CalendarCheck className="w-4 h-4" />
                    One-time
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setGRepeat('weekly')}
                  aria-pressed={gRepeat === 'weekly'}
                  className={[
                    'h-9 rounded-xl text-[13px] font-medium transition',
                    gRepeat === 'weekly'
                      ? 'bg-white shadow-sm ring-1 ring-black/10 dark:bg-white/10 dark:ring-white/10'
                      : 'bg-transparent text-emerald-900/80 dark:text-emerald-100/80',
                  ].join(' ')}
                  title="Every week"
                >
                  <span className="inline-flex items-center justify-center gap-1.5 px-3 h-full">
                    <RotateCcw className="w-4 h-4" />
                    Repeats
                  </span>
                </button>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={openModalFromGlobal}
                  className={[
                    'h-11 rounded-full text-[15px] font-semibold',
                    'bg-gradient-to-b from-emerald-500 to-emerald-600 text-white',
                    'shadow-[0_10px_24px_rgba(16,185,129,.35)] ring-1 ring-emerald-700/30',
                    'hover:brightness-105 active:scale-[0.995]',
                    'disabled:opacity-60',
                  ].join(' ')}
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    <Plus className="w-4 h-4" />
                    Add
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setGlobalOpen(false)}
                  className={[
                    'h-11 rounded-full text-[15px] font-medium',
                    'bg-white/70 dark:bg-white/10 text-emerald-900 dark:text-emerald-50',
                    'ring-1 ring-black/10 dark:ring-white/10',
                    'hover:bg-white/85 dark:hover:bg-white/15 active:scale-[0.995]',
                  ].join(' ')}
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    <X className="w-4 h-4" />
                    Cancel
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Motion preferences */}
      <style jsx global>{`
        @media (prefers-reduced-motion: reduce) {
          * {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
          }
        }
      `}</style>
    </div>
  );
}
