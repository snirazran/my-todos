'use client';

import React, { useEffect, useMemo, useState } from 'react';
import AddTaskModal from '@/components/ui/dialog/AddTaskModal';
import TaskBoard from '@/components/board/TaskBoard';
import { Task, DAYS, hebrewDays } from '@/components/board/helpers';

const EXTRA = 'ללא יום (השבוע)';

export default function ManageTasksPage() {
  const [week, setWeek] = useState<Task[][]>(
    Array.from({ length: DAYS }, () => [])
  );
  const [showModal, setShowModal] = useState(false);
  const [prefillText, setPrefillText] = useState<string>('');
  const [prefillDays, setPrefillDays] = useState<number[]>([]);

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
    try {
      await fetch('/api/manage-tasks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day: day === 7 ? -1 : day, taskId: id }),
      });
    } finally {
      setWeek((w) => {
        const clone = [...w];
        clone[day] = clone[day].filter((t) => t.id !== id);
        return clone;
      });
    }
  };

  const onAddTask = async ({
    text,
    days,
    repeat,
  }: {
    text: string;
    days: number[];
    repeat: string;
  }) => {
    await fetch('/api/manage-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, days, repeat }),
    });
    const data = await fetch('/api/manage-tasks').then((r) => r.json());
    setWeek(data);
    setShowModal(false);
  };

  const titles = useMemo(
    () =>
      Array.from({ length: DAYS }, (_, i) => (i === 7 ? EXTRA : hebrewDays[i])),
    []
  );

  return (
    <main className="min-h-screen px-3 pt-8 pb-6 md:px-6 md:pt-12 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="w-full px-2 mx-auto md:px-6">
        {/* Header (no buttons) */}
        <div className="mb-4 text-right md:mb-8">
          <h1 className="text-3xl font-bold md:text-4xl text-slate-900 dark:text-white">
            ניהול משימות שבועי
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            צעדים קטנים, ניצחונות גדולים
          </p>
        </div>

        <TaskBoard
          titles={titles}
          week={week}
          setWeek={setWeek}
          saveDay={saveDay}
          removeTask={removeTask}
          onRequestAdd={(day, text) => {
            setPrefillText(text ?? '');
            setPrefillDays([day === 7 ? -1 : day]);
            setShowModal(true);
          }}
        />
      </div>

      {showModal && (
        <AddTaskModal
          initialText={prefillText}
          initialDays={prefillDays}
          defaultRepeat="weekly"
          onClose={() => setShowModal(false)}
          onSave={onAddTask}
        />
      )}
    </main>
  );
}
