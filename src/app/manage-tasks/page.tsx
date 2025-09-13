'use client';

import React, { useEffect, useMemo, useState } from 'react';
import AddTaskModal from '@/components/ui/dialog/AddTaskModal';
import TaskBoard from '@/components/board/TaskBoard';
import {
  Task,
  DAYS,
  labelForDisplayDay,
  apiDayFromDisplay,
  displayDayFromApi,
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

  /** 🔁 Map API order (Sun..Sat, extra at 7) → Display order (Mon-first if configured) */
  const mapApiToDisplay = (apiWeek: Task[][]): Task[][] => {
    const out: Task[][] = Array.from({ length: DAYS }, () => []);
    // real days 0..6 (API)
    for (let apiDay = 0; apiDay <= 6; apiDay++) {
      const displayIdx = displayDayFromApi(apiDay); // 0..6 in display order
      out[displayIdx] = apiWeek[apiDay] ?? [];
    }
    // extra bucket stays at 7
    out[7] = apiWeek[7] ?? [];
    return out;
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/manage-tasks');
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as Task[][];
        if (Array.isArray(data)) setWeek(mapApiToDisplay(data));
      } catch (err) {
        console.error('Failed to fetch weekly tasks:', err);
      }
    })();
  }, []);

  /** Save order for one display column (maps → API day) */
  const saveDay = async (displayDay: number, tasks: Task[]) => {
    const ordered = tasks.map((t, i) => ({ ...t, order: i + 1 }));
    try {
      await fetch('/api/manage-tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day: apiDayFromDisplay(displayDay), // 0..6 or -1
          tasks: ordered,
        }),
      });
    } catch (e) {
      console.warn('saveDay failed', e);
    }
  };

  /** Delete from one display column (maps → API day) */
  const removeTask = async (displayDay: number, id: string) => {
    try {
      await fetch('/api/manage-tasks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day: apiDayFromDisplay(displayDay), // 0..6 or -1
          taskId: id,
        }),
      });
    } finally {
      // local optimistic update is already in display order
      setWeek((w) => {
        const clone = [...w];
        clone[displayDay] = clone[displayDay].filter((t) => t.id !== id);
        return clone;
      });
    }
  };

  /** Add task; the modal returns API days (0..6 or -1). After POST, refetch & remap. */
  const onAddTask = async ({
    text,
    days,
    repeat,
  }: {
    text: string;
    days: number[]; // API day numbers (0..6) or -1
    repeat: string;
  }) => {
    await fetch('/api/manage-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        days, // ✅ already API days
        repeat,
        insertAt,
      }),
    });

    // IMPORTANT: refetch and remap to display order
    const data = await fetch('/api/manage-tasks').then((r) => r.json());
    setWeek(mapApiToDisplay(data));

    setShowModal(false);
    setInsertAt(null);
    setPrefillText('');
    setPrefillDays([]);
  };

  /** Titles in display order */
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
          week={week} // ✅ now in display order
          setWeek={setWeek}
          saveDay={saveDay}
          removeTask={removeTask}
          onRequestAdd={(displayDay, text, afterIndex = null) => {
            setPrefillText(text ?? '');
            // Prefill modal with API day for the chosen display column
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
          initialDays={prefillDays} // API day(s)
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
