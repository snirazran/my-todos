'use client';

import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from 'react';
import Link from 'next/link';
import AddTaskModal, { RepeatMode } from '@/components/ui/dialog/AddTaskModal';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
  DragStart,
} from '@hello-pangea/dnd';

/* ---------- types ---------- */
type Task = { id: string; text: string; order: number };
const hebrewDays = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const EXTRA = 'ללא יום (השבוע)';
const DAYS = 8;

/* ---------- helpers ---------- */
const droppableId = (day: number) => `day-${day}`;
const parseDroppable = (id: string) => ({
  day: Number(id.replace('day-', '')) || 0,
});
const draggableIdFor = (day: number, taskId: string) => `${taskId}__d${day}`;

/* =================================================================== */
/*  PAGE                                                               */
/* =================================================================== */
export default function ManageTasks() {
  const [week, setWeek] = useState<Task[][]>(
    Array.from({ length: DAYS }, () => [])
  );
  const [showModal, setShowModal] = useState(false);

  // dragging state for edge autoscroll
  const [isDragging, setIsDragging] = useState(false);

  // native scroller + slides
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);

  const slides = useMemo(
    () =>
      Array.from({ length: DAYS }, (_, day) => ({ day, key: `day-${day}` })),
    []
  );

  /* ---------------- initial fetch ---------------- */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/manage-tasks');
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        if (Array.isArray(data)) setWeek(data);
      } catch (err) {
        console.error('Failed to fetch weekly tasks:', err);
      }
    })();
  }, []);

  /* ---------------- Start on Sunday (index 0) ----------------------- */
  useEffect(() => {
    const scroller = scrollerRef.current;
    const first = slideRefs.current[0];
    if (scroller && first) {
      scroller.scrollTo({
        left: first.offsetLeft,
        behavior: 'instant' as ScrollBehavior,
      });
    }
  }, []);

  /* ---------------- Save helpers ------------------------------------ */
  const saveDay = async (day: number, tasks: Task[]) => {
    const ordered = tasks.map((t, i) => ({ ...t, order: i + 1 }));
    try {
      await fetch('/api/manage-tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day: day === 7 ? -1 : day, tasks: ordered }),
      });
    } catch (e) {
      console.warn('saveDay failed', e);
    }
  };

  const removeTask = async (day: number, id: string) => {
    await fetch('/api/manage-tasks', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day: day === 7 ? -1 : day, taskId: id }),
    });
    setWeek((w) => {
      const clone = [...w];
      clone[day] = clone[day].filter((t) => t.id !== id);
      return clone;
    });
  };

  /* ---------------- Edge autoscroll (native scrollLeft) ------------- */
  const pointerXRef = useRef(0);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    let raf = 0;

    const onMove = (ev: MouseEvent | TouchEvent | PointerEvent) => {
      if ('touches' in ev && ev.touches?.[0])
        pointerXRef.current = ev.touches[0].clientX;
      // @ts-ignore
      else if ('clientX' in ev)
        pointerXRef.current = ev.clientX ?? pointerXRef.current;
    };

    const tick = () => {
      if (!isDragging) return;
      const rect = scroller.getBoundingClientRect();
      const x = pointerXRef.current;
      const edge = 36; // px from edges
      const max = scroller.scrollWidth - scroller.clientWidth;

      if (x > rect.right - edge && scroller.scrollLeft < max) {
        scroller.scrollBy({ left: 10 }); // small native step
      } else if (x < rect.left + edge && scroller.scrollLeft > 0) {
        scroller.scrollBy({ left: -10 });
      }
      raf = requestAnimationFrame(tick);
    };

    if (isDragging) {
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('touchmove', onMove as any, { passive: true });
      raf = requestAnimationFrame(tick);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove as any);
      window.removeEventListener('touchmove', onMove as any);
    };
  }, [isDragging]);

  /* ---------------- DND handlers ----------------------------------- */
  const onDragStart = (_: DragStart) => setIsDragging(true);

  const onDragEnd = async (result: DropResult) => {
    setIsDragging(false);
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

  /* ---------------- Arrows (native) -------------------------------- */
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  const updateArrows = useCallback(() => {
    const s = scrollerRef.current;
    if (!s) return;
    const max = Math.max(0, s.scrollWidth - s.clientWidth - 1);
    setCanPrev(s.scrollLeft > 0);
    setCanNext(s.scrollLeft < max);
  }, []);

  useEffect(() => {
    const s = scrollerRef.current;
    if (!s) return;
    updateArrows();
    const onScroll = () => updateArrows();
    s.addEventListener('scroll', onScroll, { passive: true });
    return () => s.removeEventListener('scroll', onScroll);
  }, [updateArrows]);

  const snapTo = (dir: 'prev' | 'next') => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const width = scroller.clientWidth; // one "page"
    scroller.scrollBy({
      left: dir === 'next' ? width : -width,
      behavior: 'smooth',
    });
  };

  return (
    <main className="min-h-screen p-4 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 md:p-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="flex flex-col gap-4 mb-8 md:mb-14 md:flex-row md:items-center md:justify-between">
          <div className="text-right">
            <h1 className="text-3xl font-bold md:text-4xl text-slate-900 dark:text-white">
              ניהול משימות שבועי
            </h1>
            <p className="text-base md:text-lg text-slate-600 dark:text-slate-400">
              צעדים קטנים, ניצחונות גדולים
            </p>
          </div>

          <div className="flex self-start gap-2 md:self-auto">
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 font-medium transition bg-white shadow-md dark:bg-slate-800 rounded-xl hover:shadow-lg text-slate-700 dark:text-slate-200"
            >
              <ArrowLeft className="w-5 h-5 rotate-180" />
              חזרה להיום
            </Link>

            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 px-6 py-3 font-medium transition bg-white shadow-md dark:bg-slate-800 rounded-xl hover:shadow-lg text-slate-700 dark:text-slate-200"
            >
              <Plus className="w-5 h-5 text-violet-600" />
              הוסף משימה
            </button>
          </div>
        </div>

        {/* Native scroll-snap board + DnD */}
        <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="relative">
            {/* dir=ltr for scroll math; content inside stays RTL */}
            <div
              ref={scrollerRef}
              dir="ltr"
              className="overflow-x-auto overflow-y-visible scroll-smooth snap-x snap-mandatory scrollbar-none"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              <div className="flex gap-6 pb-2" dir="ltr">
                {slides.map(({ day, key }) => (
                  <div
                    key={key}
                    ref={(el: HTMLDivElement | null) => {
                      slideRefs.current[day] = el;
                    }}
                    dir="rtl"
                    className="shrink-0 basis-full sm:basis-[420px] md:basis-[320px] snap-start"
                  >
                    <DayColumn
                      dayIdx={day}
                      tasks={week[day]}
                      onDelete={(id) => removeTask(day, id)}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Arrows (mobile + desktop) */}
            <button
              aria-label="Previous"
              className={`flex items-center justify-center absolute top-1/2 -translate-y-1/2 left-2 h-10 w-10 rounded-full bg-white/80 dark:bg-slate-800/80 shadow z-10 ${
                !canPrev ? 'opacity-40 pointer-events-none' : ''
              }`}
              onClick={() => snapTo('prev')}
            >
              ›
            </button>
            <button
              aria-label="Next"
              className={`flex items-center justify-center absolute top-1/2 -translate-y-1/2 right-2 h-10 w-10 rounded-full bg-white/80 dark:bg-slate-800/80 shadow z-10 ${
                !canNext ? 'opacity-40 pointer-events-none' : ''
              }`}
              onClick={() => snapTo('next')}
            >
              ‹
            </button>
          </div>
        </DragDropContext>
      </div>

      {/* Modal */}
      {showModal && (
        <AddTaskModal
          defaultRepeat="weekly" // Manage default = weekly
          onClose={() => setShowModal(false)}
          onSave={async ({ text, days, repeat }) => {
            await fetch('/api/manage-tasks', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text, days, repeat }),
            });
            setWeek(await fetch('/api/manage-tasks').then((r) => r.json()));
            setShowModal(false);
          }}
        />
      )}
    </main>
  );
}

/* =================================================================== */
/*  DAY COLUMN (Droppable)                                             */
/* =================================================================== */
function DayColumn({
  dayIdx,
  tasks,
  onDelete,
}: {
  dayIdx: number;
  tasks: Task[];
  onDelete: (id: string) => void;
}) {
  const id = droppableId(dayIdx);

  return (
    <section className="p-4 transition-colors bg-white shadow dark:bg-slate-800 rounded-2xl">
      <h2 className="mb-4 font-semibold text-center text-slate-900 dark:text-white">
        {dayIdx === 7 ? EXTRA : hebrewDays[dayIdx]}
      </h2>

      <Droppable droppableId={id} direction="vertical">
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={[
              'rounded-xl',
              snapshot.isDraggingOver
                ? 'bg-violet-50/70 dark:bg-violet-950/20'
                : '',
            ].join(' ')}
          >
            {tasks.length === 0 && !snapshot.isDraggingOver && (
              <div className="py-6 mb-2 text-xs text-center border border-dashed rounded-lg border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400">
                שחרר כאן כדי להוסיף ליום הזה
              </div>
            )}

            {tasks.map((t, index) => (
              <TaskCard
                key={t.id}
                dragId={draggableIdFor(dayIdx, t.id)}
                task={t}
                index={index}
                onDelete={() => onDelete(t.id)}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </section>
  );
}

/* =================================================================== */
/*  TASK CARD                                                          */
/* =================================================================== */
function TaskCard({
  dragId,
  task,
  index,
  onDelete,
}: {
  dragId: string;
  task: Task;
  index: number;
  onDelete: () => void;
}) {
  return (
    <Draggable draggableId={dragId} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          // Keep scroll under control while dragging
          onPointerDownCapture={(e) => e.stopPropagation()}
          onMouseDownCapture={(e) => e.stopPropagation()}
          onTouchStartCapture={(e) => e.stopPropagation()}
          style={{
            ...provided.draggableProps.style,
            touchAction: snapshot.isDragging ? 'none' : 'pan-x pan-y',
          }}
          className={[
            'flex items-center gap-3 p-3 mb-2 select-none rounded-xl transition-all duration-150',
            'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600',
            'cursor-grab active:cursor-grabbing',
            snapshot.isDragging
              ? 'ring-2 ring-violet-500 ring-offset-2 ring-offset-white dark:ring-offset-slate-800 shadow-2xl scale-[1.03] rotate-[0.25deg]'
              : 'ring-0 shadow-sm',
          ].join(' ')}
        >
          <span className="flex-1 text-sm text-slate-800 dark:text-slate-200">
            {task.text}
          </span>
          <button onClick={onDelete} title="מחק">
            <Trash2 className="w-4 h-4 text-red-500 hover:text-red-600" />
          </button>
        </div>
      )}
    </Draggable>
  );
}
