'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  DragDropContext,
  DropResult,
  DragStart,
  DragUpdate,
} from '@hello-pangea/dnd';
import {
  Task,
  DAYS,
  parseDroppable,
  droppableId,
  draggableIdFor,
  todayIndex,
} from './helpers';
import DayColumn from './DayColumn';
import TaskCard from './TaskCard';

type DragMeta = {
  draggableId: string | null;
  sourceDroppableId: string | null;
  overDroppableId: string | null;
};

export default function TaskBoard({
  titles,
  week,
  setWeek,
  saveDay,
  removeTask,
}: {
  titles: string[];
  week: Task[][];
  setWeek: React.Dispatch<React.SetStateAction<Task[][]>>;
  saveDay: (day: number, tasks: Task[]) => Promise<void>;
  removeTask: (day: number, id: string) => Promise<void>;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);

  const [dragMeta, setDragMeta] = useState<DragMeta>({
    draggableId: null,
    sourceDroppableId: null,
    overDroppableId: null,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [pageIndex, setPageIndex] = useState(todayIndex());

  const slides = useMemo(
    () =>
      Array.from({ length: DAYS }, (_, day) => ({ day, key: `day-${day}` })),
    []
  );

  const setSlideRef = useCallback(
    (day: number) =>
      (el: HTMLDivElement | null): void => {
        slideRefs.current[day] = el;
      },
    []
  );

  // Snap to today's column on mount
  useEffect(() => {
    const s = scrollerRef.current;
    const t = todayIndex();
    const el = slideRefs.current[t];
    if (!s || !el) return;
    s.scrollTo({
      left: el.offsetLeft - (s.clientWidth - el.clientWidth) / 2,
      behavior: 'instant' as ScrollBehavior,
    });
    setPageIndex(t);
  }, []);

  // Pagination dots tracking
  useEffect(() => {
    const s = scrollerRef.current;
    if (!s) return;
    const handler = () => {
      const idx = slideRefs.current.findIndex((col) => {
        if (!col) return false;
        const colCenter = col.offsetLeft + col.clientWidth / 2;
        const scrollCenter = s.scrollLeft + s.clientWidth / 2;
        return Math.abs(colCenter - scrollCenter) < col.clientWidth / 2;
      });
      if (idx >= 0) setPageIndex(idx);
    };
    s.addEventListener('scroll', handler, { passive: true });
    return () => s.removeEventListener('scroll', handler);
  }, []);

  // Pointer tracking (for autoscroll)
  const pointerXRef = useRef(0);
  useEffect(() => {
    const move = (ev: MouseEvent | TouchEvent | PointerEvent) => {
      // @ts-ignore
      const x = 'touches' in ev ? ev.touches?.[0]?.clientX : ev.clientX;
      if (typeof x === 'number') pointerXRef.current = x;
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('touchmove', move as any, { passive: true });
    return () => {
      window.removeEventListener('pointermove', move as any);
      window.removeEventListener('touchmove', move as any);
    };
  }, []);

  // Smooth edge autoscroll (velocity + hysteresis)
  useEffect(() => {
    const s = scrollerRef.current;
    if (!s || !isDragging) return;

    let raf = 0;
    let last = performance.now();

    const EDGE = 72;
    const MAX_VEL = 24;
    const MIN_VEL = 3;
    const HYSTERESIS = 14;

    let lastEdgeSide: 'left' | 'right' | null = null;

    const loop = (now: number) => {
      const dt = Math.max(0.5, Math.min(2, (now - last) / 16.67));
      last = now;

      const rect = s.getBoundingClientRect();
      const x = pointerXRef.current;

      let vel = 0;
      let side: 'left' | 'right' | null = null;

      const distRight = x - (rect.right - EDGE);
      const distLeft = rect.left + EDGE - x;

      if (distRight > 0) {
        side = 'right';
        if (distRight > HYSTERESIS) {
          const t = Math.min(1, (distRight - HYSTERESIS) / (EDGE - HYSTERESIS));
          vel = MIN_VEL + (MAX_VEL - MIN_VEL) * t * t;
        }
      } else if (distLeft > 0) {
        side = 'left';
        if (distLeft > HYSTERESIS) {
          const t = Math.min(1, (distLeft - HYSTERESIS) / (EDGE - HYSTERESIS));
          vel = -(MIN_VEL + (MAX_VEL - MIN_VEL) * t * t);
        }
      }

      if (side && lastEdgeSide && side !== lastEdgeSide) vel *= 0.5;
      lastEdgeSide = side;

      if (vel !== 0) s.scrollLeft += vel * dt;

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isDragging]);

  // DnD handlers
  const onDragStart = (start: DragStart) => {
    setIsDragging(true);
    setDragMeta({
      draggableId: start.draggableId,
      sourceDroppableId: start.source.droppableId,
      overDroppableId: start.source.droppableId,
    });
  };

  const onDragUpdate = (update: DragUpdate) => {
    const dest = update.destination?.droppableId ?? null;
    setDragMeta((m) => ({
      ...m,
      overDroppableId: dest ?? m.overDroppableId,
    }));
  };

  const onDragEnd = async (result: DropResult) => {
    setIsDragging(false);
    setDragMeta({
      draggableId: null,
      sourceDroppableId: null,
      overDroppableId: null,
    });

    const { source, destination } = result;
    if (!destination) return;

    const fromDay = parseDroppable(source.droppableId).day % DAYS;
    const toDay = parseDroppable(destination.droppableId).day % DAYS;
    if (fromDay === toDay && source.index === destination.index) return;

    setWeek((prev) => {
      const next = prev.map((d) => d.slice());
      const [moved] = next[fromDay].splice(source.index, 1);
      next[toDay].splice(destination.index, 0, moved);
      Promise.all(
        fromDay === toDay
          ? [saveDay(toDay, next[toDay])]
          : [saveDay(fromDay, next[fromDay]), saveDay(toDay, next[toDay])]
      ).catch(() => {});
      return next;
    });
  };

  return (
    <div className="relative">
      <DragDropContext
        onDragStart={onDragStart}
        onDragUpdate={onDragUpdate}
        onDragEnd={onDragEnd}
      >
        <div
          ref={scrollerRef}
          dir="ltr"
          className={[
            'overflow-x-auto overflow-y-visible scrollbar-none overscroll-x-contain -mx-1 md:-mx-2 px-1 md:px-2',
            isDragging ? 'snap-none' : 'snap-x snap-mandatory scroll-smooth',
          ].join(' ')}
          style={{
            WebkitOverflowScrolling: 'touch',
            scrollBehavior: isDragging ? 'auto' : undefined,
          }}
        >
          <div className="flex gap-3 pb-2 md:gap-5" dir="ltr">
            {slides.map(({ day, key }) => {
              const id = droppableId(day);
              return (
                <div
                  key={key}
                  ref={setSlideRef(day)}
                  className="shrink-0 snap-center w-[92%] sm:w-[420px] md:w-[360px]"
                >
                  <DayColumn title={titles[day]} droppableId={id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={[
                          'flex-1 overflow-y-auto pr-1 rounded-xl transition-colors',
                          snapshot.isDraggingOver
                            ? 'bg-violet-50/60 dark:bg-violet-950/20'
                            : '',
                        ].join(' ')}
                      >
                        {week[day].map((t, index) => (
                          <TaskCard
                            key={t.id}
                            dragId={draggableIdFor(day, t.id)}
                            index={index}
                            task={t}
                            onDelete={() => removeTask(day, t.id)}
                          />
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </DayColumn>
                </div>
              );
            })}
          </div>
        </div>
      </DragDropContext>

      {/* Pagination dots (mobile only) */}
      <div className="flex justify-center mt-3 md:hidden">
        {slides.map((_, i) => (
          <div
            key={i}
            className={`h-2 w-2 rounded-full mx-1 ${
              i === pageIndex ? 'bg-violet-600' : 'bg-gray-300'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
