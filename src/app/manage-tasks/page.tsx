// src/app/manage-tasks/page.tsx
'use client';

import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from 'react';
import Link from 'next/link';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';

import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
  DragStart,
} from '@hello-pangea/dnd';

import useEmblaCarousel from 'embla-carousel-react';

/* ---------- types ---------- */
type Task = { id: string; text: string; order: number };
const hebrewDays = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const DAYS = 7;
const SEGMENTS = 3; // prev | current | next (virtual infinite)
const MID_SEG = 1; // middle segment index

/* ---------- helpers ---------- */
const droppableId = (seg: number, day: number) => `seg-${seg}-day-${day}`;
const parseDroppable = (id: string) => {
  const m = id.match(/^seg-(\d+)-day-(\d+)$/);
  if (!m) return { seg: 0, day: 0 };
  return { seg: Number(m[1]) || 0, day: Number(m[2]) || 0 };
};
const draggableIdFor = (seg: number, day: number, taskId: string) =>
  `${taskId}__s${seg}d${day}`;

/* =================================================================== */
/*  PAGE                                                               */
/* =================================================================== */
export default function ManageTasks() {
  const [week, setWeek] = useState<Task[][]>(
    Array.from({ length: DAYS }, () => [])
  );
  const [showModal, setShowModal] = useState(false);

  // drag state
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragResetToken, setDragResetToken] = useState(0);

  // Embla (we simulate “infinite” with 3 segments)
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    align: 'start',
    dragFree: false,
    containScroll: 'trimSnaps',
    skipSnaps: false,
  });

  // Keep the viewport element for edge detection
  const viewportElRef = useRef<HTMLDivElement | null>(null);
  const setViewportRef = useCallback(
    (el: HTMLDivElement | null) => {
      viewportElRef.current = el;
      (emblaRef as (el: HTMLDivElement | null) => void)(el);
    },
    [emblaRef]
  );

  // Build virtual slides: 3x the 7 days
  const slides = useMemo(
    () =>
      Array.from({ length: SEGMENTS * DAYS }, (_, i) => ({
        seg: Math.floor(i / DAYS),
        day: i % DAYS,
        key: `seg-${Math.floor(i / DAYS)}-day-${i % DAYS}`,
      })),
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

  /* ---------------- Embla: start centered on today ---------------- */
  useEffect(() => {
    if (!emblaApi) return;
    const today = new Date().getDay(); // 0..6
    emblaApi.scrollTo(MID_SEG * DAYS + today, true);
  }, [emblaApi]);

  /* ---------------- Embla: virtual infinite re-centering ----------- */
  useEffect(() => {
    if (!emblaApi) return;

    const maybeRecentre = () => {
      const i = emblaApi.selectedScrollSnap();
      const day = i % DAYS;
      if (i < DAYS) {
        emblaApi.scrollTo(MID_SEG * DAYS + day, true);
      } else if (i >= (MID_SEG + 1) * DAYS) {
        emblaApi.scrollTo(MID_SEG * DAYS + day, true);
      }
    };

    emblaApi.on('select', maybeRecentre);
    emblaApi.on('settle', maybeRecentre);
    return () => {
      emblaApi.off('select', maybeRecentre);
      emblaApi.off('settle', maybeRecentre);
    };
  }, [emblaApi]);

  /* ---------------- Save helpers ---------------- */
  const saveDay = async (day: number, tasks: Task[]) => {
    const ordered = tasks.map((t, i) => ({ ...t, order: i + 1 }));
    try {
      await fetch('/api/manage-tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day, tasks: ordered }),
      });
    } catch (e) {
      console.warn('saveDay failed', e);
    }
  };

  const removeTask = async (day: number, id: string) => {
    await fetch('/api/manage-tasks', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day, taskId: id }),
    });
    setWeek((w) => {
      const clone = [...w];
      clone[day] = clone[day].filter((t) => t.id !== id);
      return clone;
    });
  };

  /* ---------------- Edge step (while dragging) --------------------- */
  const pointerXRef = useRef<number>(0);
  const draggingRef = useRef<boolean>(false);
  const tickTimerRef = useRef<number | null>(null);
  const lastStepRef = useRef<number>(0);

  useEffect(() => {
    if (!emblaApi) return;

    const onMove = (ev: MouseEvent | TouchEvent | PointerEvent) => {
      if ('touches' in ev && ev.touches && ev.touches[0]) {
        pointerXRef.current = ev.touches[0].clientX;
      } else if ('clientX' in ev) {
        // @ts-ignore
        pointerXRef.current = ev.clientX || pointerXRef.current;
      }
    };

    if (draggingRef.current) {
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('mousemove', onMove as any, { passive: true });
      window.addEventListener('touchmove', onMove as any, { passive: true });

      const tick = () => {
        const vp = viewportElRef.current;
        if (!vp || !emblaApi) return;

        const rect = vp.getBoundingClientRect();
        const x = pointerXRef.current;
        const threshold = 30; // px near edges
        const now = Date.now();
        const minLinger = 260; // ms between steps

        if (x > rect.right - threshold) {
          if (
            emblaApi.canScrollNext() &&
            now - lastStepRef.current > minLinger
          ) {
            emblaApi.scrollNext();
            lastStepRef.current = now;
          }
        } else if (x < rect.left + threshold) {
          if (
            emblaApi.canScrollPrev() &&
            now - lastStepRef.current > minLinger
          ) {
            emblaApi.scrollPrev();
            lastStepRef.current = now;
          }
        }
        tickTimerRef.current = window.setTimeout(tick, 60);
      };
      tick();
    }

    return () => {
      if (tickTimerRef.current) {
        clearTimeout(tickTimerRef.current);
        tickTimerRef.current = null;
      }
      window.removeEventListener('pointermove', onMove as any);
      window.removeEventListener('mousemove', onMove as any);
      window.removeEventListener('touchmove', onMove as any);
    };
  }, [emblaApi, draggingTaskId]); // restart per drag

  /* ---------------- DND: handlers --------------------------------- */
  const onDragStart = (_s: DragStart) => {
    draggingRef.current = true;
  };

  const onDragEnd = async (result: DropResult) => {
    draggingRef.current = false;
    setDraggingTaskId(null);
    setDragResetToken((x) => x + 1);

    const { source, destination } = result;
    if (!destination) return;

    const from = parseDroppable(source.droppableId);
    const to = parseDroppable(destination.droppableId);

    const fromDay = ((from.day % DAYS) + DAYS) % DAYS;
    const toDay = ((to.day % DAYS) + DAYS) % DAYS;

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

  /* ---------------- UI ---------------- */
  return (
    <main className="min-h-screen p-4 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 md:p-8">
      <div className="mx-auto max-w-7xl">
        {/* ---------- header ---------- */}
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

        {/* ---------- Embla viewport (virtual infinite) + DND ---------- */}
        <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="relative">
            <div ref={setViewportRef} dir="ltr" className="overflow-hidden">
              <div className="flex gap-6 pb-2" dir="ltr">
                {slides.map(({ seg, day, key }) => (
                  <div
                    key={key}
                    // LTR layout for the carousel, RTL content inside the column
                    dir="rtl"
                    className="shrink-0 basis-full sm:basis-[420px] md:basis-[320px]"
                  >
                    <DayColumn
                      seg={seg}
                      dayIdx={day}
                      tasks={week[day]}
                      onDelete={(id) => removeTask(day, id)}
                      draggingTaskId={draggingTaskId}
                      setDraggingTaskId={setDraggingTaskId}
                      dragResetToken={dragResetToken}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DragDropContext>
      </div>

      {/* ---------- modal ---------- */}
      {showModal && (
        <AddTaskModal
          onClose={() => setShowModal(false)}
          onSave={async (text, days) => {
            await fetch('/api/manage-tasks', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text, days }),
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
  seg,
  dayIdx,
  tasks,
  onDelete,
  draggingTaskId,
  setDraggingTaskId,
  dragResetToken,
}: {
  seg: number;
  dayIdx: number;
  tasks: Task[];
  onDelete: (id: string) => void;
  draggingTaskId: string | null;
  setDraggingTaskId: (id: string | null) => void;
  dragResetToken: number;
}) {
  const id = droppableId(seg, dayIdx);

  return (
    <section className="p-4 transition-colors bg-white shadow dark:bg-slate-800 rounded-2xl">
      <h2 className="mb-4 font-semibold text-center text-slate-900 dark:text-white">
        {hebrewDays[dayIdx]}
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

            {tasks.map((t, index) => {
              const dragId = draggableIdFor(seg, dayIdx, t.id);
              return (
                <TaskCard
                  key={dragId}
                  dragId={dragId}
                  task={t}
                  index={index}
                  onDelete={() => onDelete(t.id)}
                  draggingTaskId={draggingTaskId}
                  setDraggingTaskId={setDraggingTaskId}
                  dragResetToken={dragResetToken}
                />
              );
            })}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </section>
  );
}

/* =================================================================== */
/*  TASK CARD (Draggable with long-press gating)                       */
/* =================================================================== */
function TaskCard({
  dragId,
  task,
  index,
  onDelete,
  draggingTaskId,
  setDraggingTaskId,
  dragResetToken,
}: {
  dragId: string;
  task: Task;
  index: number;
  onDelete: () => void;
  draggingTaskId: string | null;
  setDraggingTaskId: (id: string | null) => void;
  dragResetToken: number;
}) {
  const [canDrag, setCanDrag] = useState(false);
  const pressTimerRef = useRef<number | null>(null);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);

  const clearTimer = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const onPressStart = (clientX: number, clientY: number) => {
    startPointRef.current = { x: clientX, y: clientY };
    clearTimer();
    pressTimerRef.current = window.setTimeout(() => {
      setCanDrag(true);
      setDraggingTaskId(task.id);
    }, 320);
  };

  const onPressMove = (clientX: number, clientY: number) => {
    const start = startPointRef.current;
    if (!start || canDrag) return;
    const dx = Math.abs(clientX - start.x);
    const dy = Math.abs(clientY - start.y);
    if (dx > 10 || dy > 10) {
      clearTimer(); // user is swiping/scrolling, cancel drag intent
    }
  };

  const onPressEnd = () => {
    clearTimer();
    if (!canDrag) setDraggingTaskId(null);
  };

  useEffect(() => {
    setCanDrag(false);
  }, [dragResetToken]);

  return (
    <Draggable
      draggableId={dragId} // <<< UNIQUE across all slides
      index={index}
      isDragDisabled={!canDrag && draggingTaskId !== task.id}
    >
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onMouseDown={(e) => onPressStart(e.clientX, e.clientY)}
          onMouseMove={(e) => onPressMove(e.clientX, e.clientY)}
          onMouseUp={onPressEnd}
          onMouseLeave={onPressEnd}
          onTouchStart={(e) => {
            const t = e.touches[0];
            if (t) onPressStart(t.clientX, t.clientY);
          }}
          onTouchMove={(e) => {
            const t = e.touches[0];
            if (t) onPressMove(t.clientX, t.clientY);
          }}
          onTouchEnd={onPressEnd}
          style={{
            ...provided.draggableProps.style,
            touchAction: snapshot.isDragging ? 'none' : 'pan-x pan-y',
          }}
          className={[
            'flex items-center gap-3 p-3 mb-2 select-none rounded-xl',
            'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600',
            'cursor-grab active:cursor-grabbing',
            snapshot.isDragging
              ? 'ring-2 ring-violet-500 shadow-lg scale-[1.02]'
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

/* =================================================================== */
/*  ADD-TASK MODAL                                                     */
/* =================================================================== */
function AddTaskModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (text: string, days: number[]) => void;
}) {
  const [text, setText] = useState('');
  const [days, setDays] = useState<number[]>([]);

  const toggleDay = (d: number) =>
    setDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="p-6 bg-white shadow-lg w-96 dark:bg-slate-800 rounded-2xl">
        <h3 className="mb-4 text-xl font-bold text-center text-slate-900 dark:text-white">
          הוסף משימה
        </h3>
        <input
          autoFocus
          placeholder="שם משימה"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full px-3 py-2 mb-4 text-base border rounded-lg dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-violet-500"
        />
        <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          בחר ימים:
        </p>
        <div className="grid grid-cols-4 gap-2 mb-6 text-sm">
          {hebrewDays.map((d, i) => (
            <button
              key={i}
              onClick={() => toggleDay(i)}
              className={`px-2 py-1 rounded-lg font-medium ${
                days.includes(i)
                  ? 'bg-violet-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-base rounded-lg bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-500"
          >
            ביטול
          </button>
          <button
            disabled={!text || days.length === 0}
            onClick={() => onSave(text, days)}
            className="px-4 py-2 text-base font-medium text-white rounded-lg bg-violet-600 disabled:opacity-50 hover:bg-violet-700"
          >
            שמירה
          </button>
        </div>
      </div>
    </div>
  );
}
