'use client';

import React, { useEffect, useMemo, useState } from 'react';
import TaskBoard from '@/components/board/TaskBoard';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

import {
  Task,
  DAYS,
  labelForDisplayDay,
  apiDayFromDisplay,
  displayDayFromApi,
  todayDisplayIndex, // Import todayDisplayIndex
  type ApiDay,
  type DisplayDay,
} from '@/components/board/helpers';

const EXTRA = 'Maybe Today';

export default function ManageTasksPage() {
  const [week, setWeek] = useState<Task[][]>(
    Array.from({ length: DAYS }, () => [])
  );
  const [loading, setLoading] = useState(true);
  const todayIdx = useMemo(() => todayDisplayIndex(), []); // Calculate todayDisplayIndex once

  /** Map API order (Sun..Sat, Later at index 7) -> Display order */
  const mapApiToDisplay = (apiWeek: Task[][]): Task[][] => {
    const out: Task[][] = Array.from({ length: DAYS }, () => []);
    // API days 0..6 (Sun..Sat)
    for (
      let apiDay = 0 as ApiDay;
      apiDay <= 6;
      apiDay = (apiDay + 1) as ApiDay
    ) {
      const displayIdx = displayDayFromApi(apiDay);
      out[displayIdx] = apiWeek[apiDay] ?? [];
    }
    // Later bucket is already at index 7 from the API
    out[7] = apiWeek[7] ?? [];
    return out;
  };

  const fetchWeek = async () => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch(`/api/tasks?view=board&timezone=${encodeURIComponent(tz)}`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as Task[][];
      if (Array.isArray(data)) setWeek(mapApiToDisplay(data));
    } catch (err) {
      console.error('Failed to fetch weekly tasks:', err);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchWeek();
      setLoading(false);
    })();
  }, []);

  // Listen for global tag updates
  useEffect(() => {
    window.addEventListener('tags-updated', fetchWeek);
    return () => window.removeEventListener('tags-updated', fetchWeek);
  }, []);

  /** Save order for one display column (maps -> API day) */
  const saveDay = async (displayDay: DisplayDay, tasks: Task[]) => {
    const ordered = tasks.map((t, i) => ({ ...t, order: i + 1 }));
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await fetch('/api/tasks?view=board', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day: apiDayFromDisplay(displayDay), // 7 -> -1, else 0..6
          tasks: ordered,
          timezone: tz,
        }),
      });
    } catch (e) {
      console.warn('saveDay failed', e);
    }
  };

  /** Delete from one display column (maps -> API day) */
  const removeTask = async (displayDay: DisplayDay, id: string) => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await fetch('/api/tasks?view=board', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day: apiDayFromDisplay(displayDay), // 7 -> -1, else 0..6
          taskId: id,
          timezone: tz,
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

  /** Direct add from QuickAddSheet: days are API days (0..6) or -1 for "Later" */
  const onAddTask = async ({
    text,
    days,
    repeat,
    tags,
  }: {
    text: string;
    // -1 = Later, 0..6 = Sun..Sat (API days)
    days: (-1 | 0 | 1 | 2 | 3 | 4 | 5 | 6)[];
    repeat: 'this-week' | 'weekly';
    tags: string[];
  }) => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    await fetch('/api/tasks?view=board', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, days, repeat, tags, timezone: tz }),
    });

    const data = (await fetch(`/api/tasks?view=board&timezone=${encodeURIComponent(tz)}`).then((r) =>
      r.json()
    )) as Task[][];
    setWeek(mapApiToDisplay(data));
  };

  const onToggleRepeat = async (taskId: string, day: DisplayDay) => {
    if (day === 7) return; // Ignore backlog for now

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay());

    const apiDay = apiDayFromDisplay(day);
    const targetDate = new Date(start);
    targetDate.setDate(start.getDate() + apiDay);

    if (targetDate < today) {
      targetDate.setDate(targetDate.getDate() + 7);
    }

    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${targetDate.getFullYear()}-${pad(targetDate.getMonth() + 1)}-${pad(targetDate.getDate())}`;

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Optimistic Update
    setWeek((prev) => {
      const next = [...prev];
      if (next[day]) {
        next[day] = next[day].map((t) => {
          if (t.id === taskId) {
            const newType = t.type === 'weekly' ? 'regular' : 'weekly';
            return { ...t, type: newType };
          }
          return t;
        });
      }
      return next;
    });

    await fetch('/api/tasks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: dateStr,
        taskId,
        toggleType: true,
        timezone: tz,
      }),
    });

    fetchWeek();
  };

  /** Titles in display order */
  const titles = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to midnight for comparison

    // Reset to Sunday (0) of current week
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay());

    return Array.from({ length: DAYS }, (_, i) => {
      if (i === 7) return EXTRA;
      const displayDay = i as Exclude<DisplayDay, 7>;
      const apiDay = apiDayFromDisplay(displayDay);

      const d = new Date(start);
      d.setDate(start.getDate() + apiDay);

      // Rolling logic: if date < today, it's next week
      if (d < today) {
        d.setDate(d.getDate() + 7);
      }

      const dayName = labelForDisplayDay(displayDay);
      // Format d/M
      const dateStr = `${d.getDate()}/${d.getMonth() + 1}`;
      return `${dayName} ${dateStr}`;
    });
  }, []);

  if (loading) {
    return <LoadingScreen message="Loading weekly tasks..." fullscreen />;
  }

  return (
    <main
      className="relative overflow-hidden min-h-100svh pb-safe bg-gradient-to-br from-slate-50 via-slate-100 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900"
      style={{
        height: 'calc(100dvh - var(--header-h))',
        minHeight: 'calc(-webkit-fill-available - var(--header-h))',
      }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute right-[-14%] top-[6%] h-72 w-72 rounded-full bg-indigo-200/30 blur-3xl dark:bg-indigo-700/25" />
      </div>

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
          todayDisplayIndex={todayIdx} // Pass todayIdx as a prop
          onToggleRepeat={onToggleRepeat}
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
