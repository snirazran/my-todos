'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  GripVertical,
  Trash2,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import { arrayMoveImmutable } from 'array-move';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type Task = { id: string; text: string; order: number };
const hebrewDays = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export default function ManageTasks() {
  /* ───────────────── state ───────────────── */
  const [week, setWeek] = useState<Task[][]>(
    Array.from({ length: 7 }, () => [])
  );
  const [showModal, setShowModal] = useState(false);

  /* ─────────────── fetch once ────────────── */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/manage-tasks');
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();

        // we expect an array[7]; make sure before storing
        if (Array.isArray(data)) {
          setWeek(data);
        } else {
          console.error('Unexpected /api/manage‑tasks payload:', data);
        }
      } catch (err) {
        console.error('Failed to fetch weekly tasks:', err);
        // leave week as the default empty 7‑slot array
      }
    })();
  }, []);

  /* ─────────────── dnd kit ───────────────── */
  const sensors = useSensors(useSensor(PointerSensor));

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

  /* ───────────────── UI ──────────────────── */
  return (
    <main className="min-h-screen p-4 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 md:p-8">
      <div className="mx-auto max-w-7xl">
        {/* Header row (matches today/history pages) */}
        <div className="flex flex-col gap-4 mb-8 md:mb-14 md:flex-row md:items-center md:justify-between">
          {/* title + subtitle */}
          <div className="text-right ">
            <h1 className="text-3xl font-bold md:text-4xl text-slate-900 dark:text-white">
              ניהול משימות שבועי
            </h1>
            <p className="text-base md:text-lg text-slate-600 dark:text-slate-400">
              צעדים קטנים, ניצחונות גדולים
            </p>
          </div>

          {/* buttons wrapper */}
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
              <Plus className="w-5 h-5 text-purple-600" />
              הוסף משימה
            </button>
          </div>
        </div>

        {/* Week grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {(Array.isArray(week) ? week : []).map((dayTasks, idx) => (
            <section
              key={idx}
              className="min-w-[230px] flex flex-col p-4 bg-white shadow dark:bg-slate-800 rounded-2xl"
            >
              <h2 className="mb-4 font-semibold text-center text-slate-900 dark:text-white">
                {hebrewDays[idx]}
              </h2>

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(e) => handleDragEnd(e, idx)}
              >
                <SortableContext
                  items={dayTasks.map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {dayTasks.map((t) => (
                    <SortableTask
                      key={t.id}
                      task={t}
                      onDelete={() => removeTask(idx, t.id)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </section>
          ))}
        </div>
      </div>

      {/* Modal */}
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

/* ─────────────── Sortable row ────────────── */
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
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-center gap-3 p-3 mb-2 transition rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600"
    >
      <GripVertical
        className="cursor-grab text-slate-400 dark:text-slate-500"
        {...attributes}
        {...listeners}
      />
      <span className="flex-1 text-sm text-slate-800 dark:text-slate-200">
        {task.text}
      </span>
      <button onClick={onDelete} title="מחק">
        <Trash2 className="w-4 h-4 text-red-500 hover:text-red-600" />
      </button>
    </div>
  );
}

/* ─────────────── Add‑task modal ───────────── */
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
          className="w-full px-3 py-2 mb-4 text-base border rounded-lg dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-purple-500"
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
            className="px-4 py-2 text-base font-medium text-white bg-violet-600 rounded-lg disabled:opacity-50 hover:bg-purple-700"
          >
            שמירה
          </button>
        </div>
      </div>
    </div>
  );
}
