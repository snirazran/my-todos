'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Task, DAYS, todayDisplayIndex, apiDayFromDisplay } from './helpers';
import DayColumn from './DayColumn';
import TaskList from './TaskList';
import PaginationDots from './PaginationDots';
import DragOverlay from './DragOverlay';
import { useDragManager } from './hooks/useDragManager';
import { usePan } from './hooks/usePan';
import Fly from '../ui/fly';
import {
  RotateCcw,
  CalendarCheck,
  CalendarDays,
  Sun,
  X,
  Plus,
  Info,
} from 'lucide-react';

type RepeatChoice = 'this-week' | 'weekly';
type WhenChoice = 'today' | 'pick' | 'later';

export default function TaskBoard({
  titles,
  week,
  setWeek,
  saveDay,
  removeTask,
  onRequestAdd,
  /** NEW: let TaskBoard add directly without modal */
  onQuickAdd,
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
  onQuickAdd?: (data: {
    text: string;
    days: number[]; // API days (0..6 or 7 for “later”)
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

  // ---- Global bottom quick composer state ----
  const [globalOpen, setGlobalOpen] = useState(false);
  const [gText, setGText] = useState('');
  const [gRepeat, setGRepeat] = useState<RepeatChoice>('this-week'); // default one-time
  const [when, setWhen] = useState<WhenChoice>('today');
  const [pickedDays, setPickedDays] = useState<number[]>([]); // display indices
  const disabled = !gText.trim();

  // For “Pick days” chips
  const toggleDay = (d: number) => {
    setPickedDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );
  };

  const submitQuickAdd = async () => {
    if (disabled) return;

    // Compute display-day array
    const daysDisplay =
      when === 'today'
        ? [todayDisplayIndex()]
        : when === 'later'
        ? [7] // “Later this week” bucket
        : pickedDays.slice().sort((a, b) => a - b);

    if (daysDisplay.length === 0) return; // nothing picked

    const daysApi = daysDisplay.map(apiDayFromDisplay);

    if (onQuickAdd) {
      await onQuickAdd({ text: gText.trim(), days: daysApi, repeat: gRepeat });
    } else {
      // Fallback: open existing modal if parent didn’t wire quick add
      onRequestAdd(null, gText.trim(), null, gRepeat);
    }

    // Reset UI
    setGlobalOpen(false);
    setGText('');
    setWhen('today');
    setPickedDays([]);
    setGRepeat('this-week');
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

  // Weekday labels
  const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

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
        {/* extra space so the bar and pagination never overlap content */}
        <div className="flex gap-3 px-4 pt-4 md:px-6 md:pt-6 lg:pt-8 pb-[220px] sm:pb-[180px] md:pb-[188px]">
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
                maxHeightClass="max-h-[73svh]"
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

      {/* Pagination — under day columns, above the add bar. */}
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

      {/* GLOBAL BOTTOM QUICK ADD (Apple-style glass) */}
      <div className="absolute bottom-0 left-0 right-0 z-[40] px-4 py-12 pointer-events-none sm:px-6 sm:py-5">
        <div className="pointer-events-auto mx-auto w-full max-w-[820px] pb-[env(safe-area-inset-bottom)]">
          {!globalOpen ? (
            <div className="rounded-[28px] bg-white/75 dark:bg-white/8 backdrop-blur-2xl ring-1 ring-black/10 dark:ring-white/10 shadow-[0_8px_32px_rgba(0,0,0,.18)] p-1">
              <button
                onClick={() => {
                  setGlobalOpen(true);
                  setWhen('today');
                  setPickedDays([]);
                  setGRepeat('this-week');
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
          ) : (
            <div className="rounded-[28px] bg-white/75 dark:bg-white/8 backdrop-blur-2xl ring-1 ring-black/10 dark:ring-white/10 shadow-[0_8px_32px_rgba(0,0,0,.18)] p-3">
              {/* Task input */}
              <input
                value={gText}
                onChange={(e) => setGText(e.target.value)}
                placeholder="New task…"
                className="w-full h-11 px-3 mb-3 rounded-[14px] bg-white/90 dark:bg-white/10 text-emerald-900 dark:text-emerald-50 ring-1 ring-black/10 dark:ring-white/10 shadow-[0_1px_0_rgba(255,255,255,.7)_inset] focus:outline-none focus:ring-2 focus:ring-lime-300"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submitQuickAdd();
                  }
                  if (e.key === 'Escape') setGlobalOpen(false);
                }}
                inputMode="text"
                autoFocus
              />

              {/* When chooser */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setWhen('today')}
                  aria-pressed={when === 'today'}
                  className={[
                    'h-9 px-3 rounded-full text-[13px] font-medium inline-flex items-center gap-1.5 ring-1 transition',
                    when === 'today'
                      ? 'bg-white shadow-sm ring-black/10 dark:bg-white/10 dark:ring-white/10'
                      : 'bg-transparent ring-black/10 dark:ring-white/10 text-emerald-900/85 dark:text-emerald-100/85',
                  ].join(' ')}
                  title="Add to today"
                >
                  <Sun className="w-4 h-4" />
                  Today
                </button>

                <button
                  type="button"
                  onClick={() => setWhen('pick')}
                  aria-pressed={when === 'pick'}
                  className={[
                    'h-9 px-3 rounded-full text-[13px] font-medium inline-flex items-center gap-1.5 ring-1 transition',
                    when === 'pick'
                      ? 'bg-white shadow-sm ring-black/10 dark:bg-white/10 dark:ring-white/10'
                      : 'bg-transparent ring-black/10 dark:ring-white/10 text-emerald-900/85 dark:text-emerald-100/85',
                  ].join(' ')}
                  title="Pick specific day(s)"
                >
                  <CalendarDays className="w-4 h-4" />
                  Pick day
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setWhen('later');
                    setPickedDays([]); // clear selected chips when switching to later
                  }}
                  aria-pressed={when === 'later'}
                  className={[
                    'h-9 px-3 rounded-full text-[13px] font-medium inline-flex items-center gap-1.5 ring-1 transition',
                    when === 'later'
                      ? 'bg-white shadow-sm ring-black/10 dark:bg-white/10 dark:ring-white/10'
                      : 'bg-transparent ring-black/10 dark:ring-white/10 text-emerald-900/85 dark:text-emerald-100/85',
                  ].join(' ')}
                  title="Save to Later this week"
                >
                  <CalendarCheck className="w-4 h-4" />
                  Later this week
                </button>

                {/* Repeats toggle */}
                <button
                  type="button"
                  onClick={() =>
                    setGRepeat((r) => (r === 'weekly' ? 'this-week' : 'weekly'))
                  }
                  aria-pressed={gRepeat === 'weekly'}
                  className={[
                    'ml-auto h-9 px-3 rounded-full text-[13px] font-medium inline-flex items-center gap-1.5 ring-1 transition',
                    gRepeat === 'weekly'
                      ? 'bg-white shadow-sm ring-black/10 dark:bg-white/10 dark:ring-white/10'
                      : 'bg-transparent ring-black/10 dark:ring-white/10 text-emerald-900/85 dark:text-emerald-100/85',
                  ].join(' ')}
                  title="Toggle weekly repeat"
                >
                  <RotateCcw className="w-4 h-4" />
                  {gRepeat === 'weekly' ? 'Repeats' : 'One-time'}
                </button>
              </div>

              {/* Pick-day chips */}
              {when === 'pick' && (
                <div className="grid grid-cols-7 gap-1 mt-2">
                  {dayNames.map((label, d) => {
                    const on = pickedDays.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDay(d)}
                        title={label}
                        className={[
                          'h-8 rounded-md text-sm font-medium ring-1 transition-colors',
                          on
                            ? 'bg-emerald-500 text-white ring-emerald-600/40'
                            : 'bg-white/70 dark:bg-white/10 text-emerald-900 dark:text-emerald-50 ring-black/10 dark:ring-white/10',
                        ].join(' ')}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Later hint */}
              {when === 'later' && (
                <div className="mt-2 flex items-start gap-2 rounded-xl bg-emerald-50/70 dark:bg-emerald-900/30 ring-1 ring-emerald-700/15 p-2.5 text-[13px] text-emerald-900/90 dark:text-emerald-100/90">
                  <Info className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    Saved to{' '}
                    <span className="font-medium">Later this week</span> under
                    your daily list. Drop it onto a day when you’re up for it.
                  </span>
                </div>
              )}

              {/* Actions */}
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={submitQuickAdd}
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
