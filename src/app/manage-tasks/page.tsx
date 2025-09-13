'use client';

import React, { useEffect, useMemo, useState } from 'react';
import AddTaskModal from '@/components/ui/dialog/AddTaskModal';
import TaskBoard from '@/components/board/TaskBoard';
import {
  Task,
  DAYS,
  labelForDisplayDay,
  apiDayFromDisplay,
} from '@/components/board/helpers';

const EXTRA = 'No day (this week)';

export default function ManageTasksPage() {
  const [week, setWeek] = useState<Task[][]>(
    Array.from({ length: DAYS }, () => [])
  );

  const [showModal, setShowModal] = useState(false);
  const [prefillText, setPrefillText] = useState<string>('');
  const [prefillDays, setPrefillDays] = useState<number[]>([]);
  const [insertAt, setInsertAt] = useState<number | null>(null);

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

  const saveDay = async (displayDay: number, tasks: Task[]) => {
    const ordered = tasks.map((t, i) => ({ ...t, order: i + 1 }));
    try {
      await fetch('/api/manage-tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day: apiDayFromDisplay(displayDay), // ✅ map to API (-1 for extra)
          tasks: ordered,
        }),
      });
    } catch (e) {
      console.warn('saveDay failed', e);
    }
  };

  const removeTask = async (displayDay: number, id: string) => {
    try {
      await fetch('/api/manage-tasks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day: apiDayFromDisplay(displayDay), // ✅ map to API
          taskId: id,
        }),
      });
    } finally {
      setWeek((w) => {
        const clone = [...w];
        clone[displayDay] = clone[displayDay].filter((t) => t.id !== id);
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
    days: number[]; // these will be API day numbers coming from the modal
    repeat: string;
  }) => {
    await fetch('/api/manage-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        days,
        repeat,
        insertAt,
      }),
    });

    const data = await fetch('/api/manage-tasks').then((r) => r.json());
    setWeek(data);
    setShowModal(false);
    setInsertAt(null);
    setPrefillText('');
    setPrefillDays([]);
  };

  const titles = useMemo(
    () =>
      Array.from({ length: DAYS }, (_, i) =>
        i === 7 ? EXTRA : labelForDisplayDay(i)
      ),
    []
  );

  return (
    <main
      className="relative overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 min-h-100svh pb-safe"
      style={{
        height: 'calc(100dvh - var(--header-h))',
        minHeight: 'calc(-webkit-fill-available - var(--header-h))',
      }}
    >
      <div className="absolute inset-0">
        <TaskBoard
          titles={titles}
          week={week}
          setWeek={setWeek}
          saveDay={saveDay}
          removeTask={removeTask}
          onRequestAdd={(displayDay, text, afterIndex = null) => {
            setPrefillText(text ?? '');
            // Prefill modal with the API day (0..6) or -1 for extra:
            setPrefillDays([apiDayFromDisplay(displayDay)]);
            setInsertAt(
              afterIndex === null ? null : Math.max(0, afterIndex + 1)
            );
            setShowModal(true);
          }}
        />
      </div>

      {showModal && (
        <AddTaskModal
          initialText={prefillText}
          initialDays={prefillDays} // expects API days (0..6) or -1
          defaultRepeat="weekly"
          onClose={() => {
            setShowModal(false);
            setInsertAt(null);
          }}
          onSave={onAddTask}
        />
      )}
    </main>
  );
}
