'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import TaskBoard from '@/components/board/TaskBoard';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

import {
  Task,
  DAYS,
  labelForDisplayDay,
  apiDayFromDisplay,
  displayDayFromApi,
  todayDisplayIndex, // Import todayDisplayIndex
  getRollingWeekOrder,
  type ApiDay,
  type DisplayDay,
} from '@/components/board/helpers';

const EXTRA = 'Maybe Today';

export default function ManageTasksPage() {
  const [week, setWeek] = useState<Task[][]>(
    Array.from({ length: DAYS }, () => [])
  );
  const [loading, setLoading] = useState(true);
  // Calculate rolling week order once on mount
  const processingWeekOrder = useMemo(() => getRollingWeekOrder(), []);
  const todayIdx = useMemo(() => todayDisplayIndex(processingWeekOrder), [processingWeekOrder]);

  /** Map API order (Sun..Sat, Later at index 7) -> Display order */
  const mapApiToDisplay = useCallback((apiWeek: Task[][]): Task[][] => {
    const out: Task[][] = Array.from({ length: DAYS }, () => []);
    // API days 0..6 (Sun..Sat)
    for (
      let apiDay = 0 as ApiDay;
      apiDay <= 6;
      apiDay = (apiDay + 1) as ApiDay
    ) {
      const displayIdx = displayDayFromApi(apiDay, processingWeekOrder);
      out[displayIdx] = apiWeek[apiDay] ?? [];
    }
    // Later bucket is already at index 7 from the API
    out[7] = apiWeek[7] ?? [];
    return out;
  }, [processingWeekOrder]);

  const fetchWeek = useCallback(async () => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch(`/api/tasks?view=board&timezone=${encodeURIComponent(tz)}`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as Task[][];
      if (Array.isArray(data)) setWeek(mapApiToDisplay(data));
    } catch (err) {
      console.error('Failed to fetch weekly tasks:', err);
    }
  }, [mapApiToDisplay]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchWeek();
      setLoading(false);
    })();
  }, [fetchWeek]);

  // Listen for global tag updates
  useEffect(() => {
    window.addEventListener('tags-updated', fetchWeek);
    return () => window.removeEventListener('tags-updated', fetchWeek);
  }, [fetchWeek]);

  /** Save order for one display column (maps -> API day) */
  const saveDay = async (displayDay: DisplayDay, tasks: Task[]) => {
    const ordered = tasks.map((t, i) => ({ ...t, order: i + 1 }));
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await fetch('/api/tasks?view=board', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day: apiDayFromDisplay(displayDay, processingWeekOrder), // 7 -> -1, else 0..6
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
          day: apiDayFromDisplay(displayDay, processingWeekOrder), // 7 -> -1, else 0..6
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
    // In this view, 'day' corresponds directly to offset from today if we just used indices,
    // but let's stick to strict API logic:
    // 1. Get API day (0..6)
    const apiDay = apiDayFromDisplay(day, processingWeekOrder);

    // 2. Find closest future date with that weekday
    const currentDow = today.getDay();
    let daysUntil = apiDay - currentDow;
    if (daysUntil < 0) daysUntil += 7;

    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + daysUntil);

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
    today.setHours(0, 0, 0, 0);

    return Array.from({ length: DAYS }, (_, i) => {
      if (i === 7) return EXTRA;
      const displayDay = i as Exclude<DisplayDay, 7>;

      // With rolling order, index 0 is today, 1 is tomorrow, etc.
      // But let's use the robust mapping for labels
      const d = new Date(today);
      d.setDate(today.getDate() + i);

      const dayName = labelForDisplayDay(displayDay, processingWeekOrder);
      // Format d/M
      const dateStr = `${d.getDate()}/${d.getMonth() + 1}`;
      return `${dayName} ${dateStr}`;
    });
  }, [processingWeekOrder]);

  if (loading) {
    return <LoadingScreen message="Loading weekly tasks..." fullscreen />;
  }

  return (
    <main
      className="relative overflow-hidden min-h-100svh pb-safe bg-background"
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
          todayDisplayIndex={todayIdx} // Pass todayIdx as a prop
          daysOrder={processingWeekOrder} // Pass the rolling order
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
