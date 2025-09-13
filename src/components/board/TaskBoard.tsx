'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Task, DAYS, todayIndex } from './helpers';
import DayColumn from './DayColumn';
import TaskList from './TaskList';
import PaginationDots from './PaginationDots';
import DragOverlay from './DragOverlay';
import { useDragManager } from './hooks/useDragManager';
import { usePan } from './hooks/usePan';

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
    day: number,
    text?: string,
    afterIndex?: number | null
  ) => void;
}) {
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

  const [pageIndex, setPageIndex] = useState(todayIndex());
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
    const t = todayIndex();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const [composer, setComposer] = useState<{
    day: number;
    afterIndex: number | null;
  } | null>(null);
  const [draft, setDraft] = useState('');

  const openBottomComposer = (day: number) => {
    setComposer({ day, afterIndex: null });
    setDraft('');
  };
  const openBetweenComposer = (day: number, afterIndex: number) => {
    setComposer({ day, afterIndex });
    setDraft('');
  };
  const cancelComposer = () => {
    setComposer(null);
    setDraft('');
  };
  const confirmComposer = (day: number) => {
    const text = draft.trim();
    if (!text) return;
    const after = composer?.afterIndex ?? null;
    cancelComposer();
    onRequestAdd(day, text, after);
  };

  const slides = useMemo(
    () =>
      Array.from({ length: DAYS }, (_, day) => ({ day, key: `day-${day}` })),
    []
  );

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
    // Fill the parent (which is absolute inset-0 from the page)
    <div className="relative w-full h-full">
      {/* Full-bleed horizontal scroller that owns the whole content area */}
      <div
        ref={scrollerRef}
        dir="ltr"
        data-role="board-scroller"
        data-drag={drag?.active ? '1' : '0'}
        onPointerDown={startPanIfEligible}
        onPointerMove={onPanMove}
        onPointerUp={endPan}
        className={[
          'no-scrollbar',
          'absolute inset-0', // take entire area (except header, which the page already subtracted)
          'w-full h-full',
          'overflow-x-auto overflow-y-hidden overscroll-x-contain',
          'touch-pan-x',
          snapSuppressed ? 'snap-none' : 'snap-x snap-mandatory scroll-smooth',
        ].join(' ')}
        style={{
          WebkitOverflowScrolling: 'touch',
          scrollBehavior: snapSuppressed ? 'auto' : undefined,
        }}
      >
        <div
          className="flex gap-3 md:gap-3
           px-3 md:px-6
           pt-3 md:pt-6 lg:pt-8   /* top padding you can drag on */
           pb-3"
          dir="ltr"
        >
          {slides.map(({ day, key }) => (
            <div
              key={key}
              ref={setSlideRef(day)}
              data-col="true"
              className="shrink-0 snap-center
            w-[84vw]        /* mobile */
            sm:w-[380px]    /* small screens */
            md:w-[340px]    /* laptops */
            lg:w-[320px]    /* desktops */
            xl:w-[300px]" /* big desktops */
            >
              <DayColumn
                title={titles[day]}
                listRef={setListRef(day)}
                // Make each day column's list height track the available height.
                // This avoids any vertical scroll on the page itself.
                maxHeightClass="max-h-[calc(100%-84px)] md:max-h-[calc(100%-84px)]"
                footer={
                  !(
                    composer &&
                    composer.day === day &&
                    composer.afterIndex === null
                  ) && (
                    <button
                      onClick={() => openBottomComposer(day)}
                      disabled={!!drag?.active}
                      className={[
                        'w-full px-3 py-2 text-right rounded-xl',
                        'bg-violet-50/70 dark:bg-violet-950/20',
                        'text-violet-700 dark:text-violet-300',
                        !!drag?.active
                          ? 'opacity-60 pointer-events-none'
                          : 'hover:bg-violet-100 dark:hover:bg-violet-900/30',
                      ].join(' ')}
                    >
                      + הוסף משימה
                    </button>
                  )
                }
              >
                <TaskList
                  day={day}
                  items={week[day]}
                  drag={drag}
                  targetDay={targetDay}
                  targetIndex={targetIndex}
                  composer={composer}
                  draft={draft}
                  setDraft={setDraft}
                  openBetweenComposer={openBetweenComposer}
                  openBottomComposer={openBottomComposer}
                  cancelComposer={cancelComposer}
                  confirmComposer={confirmComposer}
                  removeTask={removeTask}
                  onGrab={onGrab}
                  setCardRef={setCardRef}
                />
              </DayColumn>
            </div>
          ))}
        </div>
      </div>

      {/* Mobile pagination dots (positioned over content; doesn't affect layout height) */}
      <PaginationDots count={DAYS} activeIndex={pageIndex} />

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
    </div>
  );
}
