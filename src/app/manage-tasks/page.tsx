// src/app/manage-tasks/page.tsx
'use client';

import React, {
  useEffect,
  useRef,
  useState,
  ReactNode,
  forwardRef,
} from 'react';
import Link from 'next/link';
import {
  Plus,
  GripVertical,
  Trash2,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { arrayMoveImmutable } from 'array-move';
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragMoveEvent,
  DragOverEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/* ---------- types ---------- */
type Task = { id: string; text: string; order: number };
const hebrewDays = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

/* =================================================================== */
/*  PAGE                                                               */
/* =================================================================== */
export default function ManageTasks() {
  const [week, setWeek] = useState<Task[][]>(
    Array.from({ length: 7 }, () => [])
  );
  const [showModal, setShowModal] = useState(false);

  // drag state
  const [activeId, setActiveId] = useState<string | null>(null);
  const dragFromDayRef = useRef<number | null>(null);

  // horizontal row ref (for grab-to-pan + auto-scroll)
  const rowRef = useRef<HTMLDivElement | null>(null);

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

  /* ---------------- dnd-kit sensors ---------------- */
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 220, tolerance: 6 },
    })
  );

  /* ---------------- helpers ---------------- */
  const findDayByItem = (id: string): number | null => {
    for (let d = 0; d < week.length; d++) {
      if (week[d].some((t) => t.id === id)) return d;
    }
    return null;
  };

  const saveDay = async (day: number, tasks: Task[]) => {
    const ordered = tasks.map((t, i) => ({ ...t, order: i + 1 }));
    await fetch('/api/manage-tasks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day, tasks: ordered }),
    });
  };

  /* ---------------- autoscroll (slow + delayed) ---------------- */
  const autoDirRef = useRef<'left' | 'right' | null>(null);
  const autoTickRef = useRef<number | null>(null);
  const autoDelayRef = useRef<number | null>(null);

  const startAutoScroll = (dir: 'left' | 'right') => {
    const el = rowRef.current;
    if (!el) return;

    if (autoDirRef.current !== dir) {
      stopAutoScroll();
      autoDirRef.current = dir;
      autoDelayRef.current = window.setTimeout(() => {
        autoTickRef.current = window.setInterval(() => {
          el.scrollLeft += dir === 'left' ? -6 : 6; // slow + smooth
        }, 16);
      }, 250); // must linger at edge
    }
  };
  const stopAutoScroll = () => {
    if (autoDelayRef.current) {
      clearTimeout(autoDelayRef.current);
      autoDelayRef.current = null;
    }
    if (autoTickRef.current) {
      clearInterval(autoTickRef.current);
      autoTickRef.current = null;
    }
    autoDirRef.current = null;
  };

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(e.active.id as string);
    dragFromDayRef.current = findDayByItem(e.active.id as string);
  };

  const handleDragMove = (e: DragMoveEvent) => {
    const el = rowRef.current;
    if (!el || !activeId) return;

    const rect = el.getBoundingClientRect();
    const tr = (e.active.rect.current.translated ||
      e.active.rect.current) as any;
    const left = tr?.left ?? rect.left;
    const right = tr?.right ?? rect.right;

    const threshold = 28;
    if (right > rect.right - threshold) startAutoScroll('right');
    else if (left < rect.left + threshold) startAutoScroll('left');
    else stopAutoScroll();
  };

  // live cross-day rearrange while hovering other lists
  const handleDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;
    const fromDay = findDayByItem(activeId);
    const toDay = findDayByItem(overId);
    if (fromDay == null || toDay == null || fromDay === toDay) return;

    setWeek((prev) => {
      const clone = prev.map((d) => [...d]);
      const fromIdx = clone[fromDay].findIndex((t) => t.id === activeId);
      const overIdx = clone[toDay].findIndex((t) => t.id === overId);
      const [moved] = clone[fromDay].splice(fromIdx, 1);
      clone[toDay].splice(Math.max(0, overIdx), 0, moved);
      return clone;
    });
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    stopAutoScroll();
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;

    const id = active.id as string;
    const fromDay = dragFromDayRef.current;
    const toDay = findDayByItem(id);

    if (fromDay != null && toDay != null) {
      if (fromDay === toDay) {
        await saveDay(toDay, week[toDay]);
      } else {
        await Promise.all([
          saveDay(fromDay, week[fromDay]),
          saveDay(toDay, week[toDay]),
        ]);
      }
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

        {/* ---------- One responsive row (mobile full width, desktop 320px) ---------- */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <DragScroll ref={rowRef} hint>
            <div className="flex gap-6 pb-2">
              {week.map((dayTasks, idx) => (
                <div
                  key={idx}
                  className="flex-none min-w-full sm:min-w-[420px] md:min-w-[320px] w-[320px]"
                >
                  <DayColumn
                    idx={idx}
                    dayTasks={dayTasks}
                    onDelete={removeTask}
                    activeId={activeId}
                  />
                </div>
              ))}
            </div>
          </DragScroll>
        </DndContext>
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
/*  SORTABLE TASK ROW — drag from entire row; block row-swipe while active */
/* =================================================================== */
function SortableTask({
  task,
  onDelete,
  isActive,
}: {
  task: Task;
  onDelete: () => void;
  isActive: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      data-dnd-item // ← lets DragScroll know this is a draggable
      {...attributes}
      {...listeners} // ← drag from anywhere
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        // While dragging this item on touch, prevent the row from swiping.
        touchAction: isActive ? 'none' : 'pan-y',
      }}
      className="flex items-center gap-3 p-3 mb-2 select-none rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 cursor-grab active:cursor-grabbing"
    >
      <GripVertical className="shrink-0 text-slate-400 dark:text-slate-500" />
      <span className="flex-1 text-sm text-slate-800 dark:text-slate-200">
        {task.text}
      </span>
      <button onClick={onDelete} title="מחק">
        <Trash2 className="w-4 h-4 text-red-500 hover:text-red-600" />
      </button>
    </div>
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

/* =================================================================== */
/*  DAY COLUMN                                                         */
/* =================================================================== */
function DayColumn({
  idx,
  dayTasks,
  onDelete,
  activeId,
}: {
  idx: number;
  dayTasks: Task[];
  onDelete: (day: number, id: string) => void;
  activeId: string | null;
}) {
  return (
    <section className="p-4 bg-white shadow dark:bg-slate-800 rounded-2xl">
      <h2 className="mb-4 font-semibold text-center text-slate-900 dark:text-white">
        {hebrewDays[idx]}
      </h2>
      <SortableContext
        items={dayTasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        {dayTasks.map((t) => (
          <SortableTask
            key={t.id}
            task={t}
            onDelete={() => onDelete(idx, t.id)}
            isActive={activeId === t.id}
          />
        ))}
      </SortableContext>
    </section>
  );
}

/* =================================================================== */
/*  DragScroll — grab-to-pan on desktop; ignores drags starting on items */
/* =================================================================== */
type DragScrollProps = {
  children: ReactNode;
  className?: string;
  hint?: boolean;
};

const DragScroll = forwardRef<HTMLDivElement, DragScrollProps>(
  function DragScroll({ children, className = '', hint = false }, ref) {
    const localRef = useRef<HTMLDivElement | null>(null);
    const setRef = (el: HTMLDivElement | null) => {
      localRef.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref)
        (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
    };

    const [showHint, setShowHint] = useState(hint);

    useEffect(() => {
      const el = localRef.current;
      if (!el) return;

      let isDown = false;
      let startX = 0;
      let startScroll = 0;

      const onMouseDown = (e: MouseEvent) => {
        // 🔒 if the mousedown is on a draggable task, DO NOT start grab-to-pan
        const target = e.target as HTMLElement;
        if (target.closest('[data-dnd-item]')) return;

        isDown = true;
        startX = e.pageX - el.offsetLeft;
        startScroll = el.scrollLeft;
        el.classList.add('cursor-grabbing');
        setShowHint(false);
      };
      const onMouseLeave = () => {
        isDown = false;
        el.classList.remove('cursor-grabbing');
      };
      const onMouseUp = () => {
        isDown = false;
        el.classList.remove('cursor-grabbing');
      };
      const onMouseMove = (e: MouseEvent) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - el.offsetLeft;
        const walk = x - startX;
        el.scrollLeft = startScroll - walk;
      };
      const onAnyScroll = () => setShowHint(false);

      el.addEventListener('mousedown', onMouseDown);
      el.addEventListener('mouseleave', onMouseLeave);
      el.addEventListener('mouseup', onMouseUp);
      el.addEventListener('mousemove', onMouseMove);
      el.addEventListener('wheel', onAnyScroll, { passive: true });
      el.addEventListener('scroll', onAnyScroll, { passive: true });

      return () => {
        el.removeEventListener('mousedown', onMouseDown);
        el.removeEventListener('mouseleave', onMouseLeave);
        el.removeEventListener('mouseup', onMouseUp);
        el.removeEventListener('mousemove', onMouseMove);
        el.removeEventListener('wheel', onAnyScroll);
        el.removeEventListener('scroll', onAnyScroll);
      };
    }, []);

    return (
      <div
        ref={setRef}
        className={`relative overflow-x-auto overscroll-x-contain cursor-grab ${className}`}
      >
        {/* arrows only, no fades */}
        {showHint && (
          <>
            <div className="absolute inset-y-0 flex items-center pointer-events-none right-3">
              <ChevronRight className="animate-pulse text-slate-400" />
            </div>
            <div className="absolute inset-y-0 flex items-center pointer-events-none left-3">
              <ChevronLeft className="animate-pulse text-slate-400" />
            </div>
          </>
        )}
        {children}
      </div>
    );
  }
);
