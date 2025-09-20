'use client';

import React, { useEffect, useMemo, useState } from 'react';
import TaskBoard from '@/components/board/TaskBoard';
import useSWR from 'swr';

import {
  Task,
  DAYS,
  labelForDisplayDay,
  apiDayFromDisplay,
  displayDayFromApi,
} from '@/components/board/helpers';

const EXTRA = 'Later this week';

export default function ManageTasksPage() {
  const [week, setWeek] = useState<Task[][]>(
    Array.from({ length: DAYS }, () => [])
  );

  /** Map API order (Sun..Sat, Later at index 7) → Display order */
  const mapApiToDisplay = (apiWeek: Task[][]): Task[][] => {
    const out: Task[][] = Array.from({ length: DAYS }, () => []);
    for (let apiDay = 0; apiDay <= 6; apiDay++) {
      const displayIdx = displayDayFromApi(apiDay);
      out[displayIdx] = apiWeek[apiDay] ?? [];
    }
    // Later bucket
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
          day: apiDayFromDisplay(displayDay),
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
          day: apiDayFromDisplay(displayDay),
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

  /** Direct add from QuickAddSheet: days are API days (0..6 or 7 for “Later”) */
  const onAddTask = async ({
    text,
    days,
    repeat,
  }: {
    text: string;
    days: number[];
    repeat: 'this-week' | 'weekly';
  }) => {
    await fetch('/api/manage-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, days, repeat }),
    });

    const data = await fetch('/api/manage-tasks').then((r) => r.json());
    setWeek(mapApiToDisplay(data));
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
      className="relative overflow-hidden min-h-100svh pb-safe bg-gradient-to-br from-emerald-900 via-emerald-800 to-lime-900/90"
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
          onRequestAdd={() => {
            /* no-op: QuickAddSheet path is used */
          }}
          onQuickAdd={onAddTask}
        />
      </div>

      <style jsx global>{`
        @keyframes ripple {
          0% {
            transform: scale(0.9);
            opacity: 0.3;
          }
          50% {
            transform: scale(1.05);
            opacity: 0.6;
          }
          100% {
            transform: scale(0.9);
            opacity: 0.3;
          }
        }
        .animate-ripple {
          animation: ripple 11s ease-in-out infinite;
        }
        .animate-ripple-slow {
          animation: ripple 16s ease-in-out infinite;
        }
        @keyframes bob {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-4px);
          }
        }
        .animate-bob {
          animation: bob 3.6s ease-in-out infinite;
        }
        @keyframes buzz {
          0% {
            transform: translate(0, 0) rotate(0deg);
          }
          25% {
            transform: translate(-1px, 1px) rotate(-1deg);
          }
          50% {
            transform: translate(1px, -1px) rotate(1deg);
          }
          75% {
            transform: translate(-1px, 0) rotate(0deg);
          }
          100% {
            transform: translate(0, 0) rotate(0deg);
          }
        }
        .animate-buzz {
          animation: buzz 400ms linear infinite;
        }
        @keyframes cardShine {
          0% {
            background-position: -150% 0;
          }
          100% {
            background-position: 250% 0;
          }
        }
        .shine {
          background-image: linear-gradient(
            120deg,
            transparent 0%,
            rgba(255, 255, 255, 0.35) 30%,
            transparent 60%
          );
          background-size: 200% 100%;
        }
        .shine:hover {
          animation: cardShine 1200ms ease;
        }
      `}</style>
    </main>
  );
}
