// src/app/manage-tasks/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, GripVertical, Trash2, ArrowLeft } from 'lucide-react';
import { arrayMoveImmutable } from 'array-move';
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
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
  /* ---------------- state ---------------- */
  const [week, setWeek] = useState<Task[][]>(
    Array.from({ length: 7 }, () => [])
  );
  const [showModal, setShowModal] = useState(false);

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

  const handleDragEnd = async (e: any, day: number) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    setWeek((w) => {
      const clone = [...w];
      const oldIdx = clone[day].findIndex((t) => t.id === active.id);
      const newIdx = clone[day].findIndex((t) => t.id === over.id);
      clone[day] = arrayMoveImmutable(clone[day], oldIdx, newIdx);

      fetch('/api/manage-tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day, tasks: clone[day] }),
      });

      return clone;
    });
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

        {/* ---------- Mobile: one day per screen (horizontal swipe) ---------- */}
        <div className="px-4 -mx-4 md:hidden">
          <div className="flex gap-4 pb-4 overflow-x-auto snap-x snap-mandatory overscroll-x-contain">
            {week.map((dayTasks, idx) => (
              <div key={idx} className="flex-none w-full snap-center">
                <DayColumn
                  idx={idx}
                  dayTasks={dayTasks}
                  sensors={sensors}
                  onDelete={removeTask}
                  onDragEnd={handleDragEnd}
                />
              </div>
            ))}
          </div>
        </div>

        {/* ---------- Desktop: show ~4 columns, horizontal scroll for more ---------- */}
        <div className="hidden md:block">
          <div className="flex gap-6 pb-2 overflow-x-auto">
            {week.map((dayTasks, idx) => (
              <div key={idx} className="flex-none w-[320px]">
                <DayColumn
                  idx={idx}
                  dayTasks={dayTasks}
                  sensors={sensors}
                  onDelete={removeTask}
                  onDragEnd={handleDragEnd}
                />
              </div>
            ))}
          </div>
        </div>
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
/*  SORTABLE TASK ROW                                                  */
/* =================================================================== */
function SortableTask({
  task,
  onDelete,
}: {
  task: Task;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        // allow vertical scroll gestures to pass through on touch
        touchAction: 'pan-y',
      }}
      className="flex items-center gap-3 p-3 mb-2 select-none rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600"
    >
      {/* drag handle ONLY */}
      <button
        {...attributes}
        {...listeners}
        className="p-1 shrink-0 cursor-grab active:cursor-grabbing"
        aria-label="Drag task"
      >
        <GripVertical className="text-slate-400 dark:text-slate-500" />
      </button>

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
/*  DAY COLUMN (mobile: full width page; desktop: fixed width card)    */
/* =================================================================== */
function DayColumn({
  idx,
  dayTasks,
  sensors,
  onDelete,
  onDragEnd,
}: {
  idx: number;
  dayTasks: Task[];
  sensors: any;
  onDelete: (day: number, id: string) => void;
  onDragEnd: (e: any, day: number) => void;
}) {
  return (
    <section className="flex-none min-w-full sm:min-w-[420px] lg:min-w-[320px] p-4 bg-white shadow dark:bg-slate-800 rounded-2xl">
      <h2 className="mb-4 font-semibold text-center text-slate-900 dark:text-white">
        {hebrewDays[idx]}
      </h2>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={(e) => onDragEnd(e, idx)}
      >
        <SortableContext
          items={dayTasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {dayTasks.map((t) => (
            <SortableTask
              key={t.id}
              task={t}
              onDelete={() => onDelete(idx, t.id)}
            />
          ))}
        </SortableContext>
      </DndContext>
    </section>
  );
}
