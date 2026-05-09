'use client';

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import TaskBoard from '@/components/board/TaskBoard';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { useFrogodoroStore } from '@/lib/frogodoroStore';
import {
  Task,
  parseYmd,
  todayYmd,
  addDays,
  cmpYmd,
} from '@/components/board/helpers';

type DateRangeResponse = {
  byDate: Record<string, Task[]>;
  backlog: Task[];
  accountCreatedAt: string | null;
};

const INITIAL_PAST = 14;
const INITIAL_FUTURE = 30;
const EXTEND_STEP = 30;

export default function ManageTasksPage() {
  const today = todayYmd();
  const [tasksByDate, setTasksByDate] = useState<Record<string, Task[]>>({});
  const [backlog, setBacklog] = useState<Task[]>([]);
  const [accountCreatedAt, setAccountCreatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Sliding window of dates currently rendered
  const [windowStart, setWindowStart] = useState<string>(addDays(today, -INITIAL_PAST));
  const [windowEnd, setWindowEnd] = useState<string>(addDays(today, INITIAL_FUTURE));
  const [activeDateKey, setActiveDateKey] = useState<string>(today);

  // Prevent parent <main> from scrolling on this page
  useEffect(() => {
    const main = document.querySelector('main');
    if (main) {
      main.style.overflow = 'hidden';
      return () => {
        main.style.overflow = '';
      };
    }
  }, []);

  const tz = typeof window !== 'undefined'
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : 'UTC';

  const fetchRange = useCallback(
    async (from: string, to: string, mergeOnly = false) => {
      const res = await fetch(
        `/api/tasks?view=dateRange&from=${from}&to=${to}&timezone=${encodeURIComponent(tz)}`,
      );
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as DateRangeResponse;
      setTasksByDate((prev) =>
        mergeOnly ? { ...prev, ...data.byDate } : data.byDate,
      );
      setBacklog(data.backlog ?? []);
      if (data.accountCreatedAt) setAccountCreatedAt(data.accountCreatedAt);
    },
    [tz],
  );

  // Initial load
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await fetchRange(windowStart, windowEnd);
      } catch (e) {
        console.error('Initial planner fetch failed', e);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch helpers for board updates
  const refetchAll = useCallback(async () => {
    try {
      await fetchRange(windowStart, windowEnd);
    } catch (e) {
      console.error('Planner refetch failed', e);
    }
  }, [fetchRange, windowStart, windowEnd]);

  useEffect(() => {
    window.addEventListener('tags-updated', refetchAll);
    window.addEventListener('board-refresh', refetchAll);
    return () => {
      window.removeEventListener('tags-updated', refetchAll);
      window.removeEventListener('board-refresh', refetchAll);
    };
  }, [refetchAll]);

  const windowDates = useMemo(() => {
    const out: string[] = [];
    let cur = windowStart;
    while (cmpYmd(cur, windowEnd) <= 0) {
      out.push(cur);
      cur = addDays(cur, 1);
    }
    return out;
  }, [windowStart, windowEnd]);

  // Window expansion (called when user nears edge or jumps via calendar)
  const extendingRef = useRef(false);
  const onExtendWindow = useCallback(
    async (direction: 'past' | 'future') => {
      if (extendingRef.current) return;
      extendingRef.current = true;
      try {
        if (direction === 'past') {
          const minBound = accountCreatedAt ?? '1970-01-01';
          if (cmpYmd(windowStart, minBound) <= 0) return;
          const newStart = addDays(windowStart, -EXTEND_STEP);
          const clamped = cmpYmd(newStart, minBound) < 0 ? minBound : newStart;
          if (clamped === windowStart) return;
          await fetchRange(clamped, addDays(windowStart, -1), true);
          setWindowStart(clamped);
        } else {
          const newEnd = addDays(windowEnd, EXTEND_STEP);
          await fetchRange(addDays(windowEnd, 1), newEnd, true);
          setWindowEnd(newEnd);
        }
      } catch (e) {
        console.error('extend window failed', e);
      } finally {
        extendingRef.current = false;
      }
    },
    [accountCreatedAt, fetchRange, windowStart, windowEnd],
  );

  // Save tasks for a specific date (full reorder for that column)
  const saveDate = useCallback(
    async (dateKey: string, tasks: Task[]) => {
      const ordered = tasks.map((t, i) => ({ ...t, order: i + 1 }));
      try {
        await fetch('/api/tasks?view=board', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dateKey,
            tasks: ordered,
            timezone: tz,
          }),
        });
      } catch (e) {
        console.warn('saveDate failed', e);
      }
    },
    [tz],
  );

  const saveBacklog = useCallback(
    async (tasks: Task[]) => {
      const ordered = tasks.map((t, i) => ({ ...t, order: i + 1 }));
      try {
        await fetch('/api/tasks?view=board', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            day: -1,
            tasks: ordered,
            timezone: tz,
          }),
        });
      } catch (e) {
        console.warn('saveBacklog failed', e);
      }
    },
    [tz],
  );

  const removeOnDate = useCallback(
    async (dateKey: string, id: string) => {
      setTasksByDate((prev) => {
        const list = (prev[dateKey] ?? []).filter((t) => t.id !== id);
        return { ...prev, [dateKey]: list };
      });
      try {
        await fetch('/api/tasks?view=board', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dateKey, taskId: id, timezone: tz }),
        });
      } catch (e) {
        console.error('Delete failed', e);
        refetchAll();
      }
    },
    [tz, refetchAll],
  );

  const removeFromBacklog = useCallback(
    async (id: string) => {
      setBacklog((prev) => prev.filter((t) => t.id !== id));
      try {
        await fetch('/api/tasks?view=board', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ day: -1, taskId: id, timezone: tz }),
        });
      } catch (e) {
        console.error('Delete failed', e);
        refetchAll();
      }
    },
    [tz, refetchAll],
  );

  const onAddTask = useCallback(
    async ({
      text,
      dates,
      repeat,
      tags,
      startTime,
      endTime,
      reminder,
    }: {
      text: string;
      dates: string[];
      repeat: 'this-week' | 'weekly';
      tags: string[];
      startTime?: string;
      endTime?: string;
      reminder?: string;
    }) => {
      try {
        await fetch('/api/tasks?view=board', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            dates,
            // include 'days' as well (sun..sat dows derived) for backwards compat with weekly repeat
            days:
              repeat === 'weekly'
                ? dates.map((d) => parseYmd(d).getDay())
                : [],
            repeat,
            tags,
            timezone: tz,
            startTime,
            endTime,
            reminder,
          }),
        });
      } catch (e) {
        console.error('Add failed', e);
      }
      await refetchAll();
    },
    [tz, refetchAll],
  );

  const onToggleRepeat = useCallback(
    async (taskId: string, dateKey: string) => {
      await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: dateKey,
          taskId,
          toggleType: true,
          timezone: tz,
        }),
      });
      refetchAll();
    },
    [tz, refetchAll],
  );

  const onScheduleTask = useCallback(
    async (
      taskId: string,
      data: { startTime: string; endTime: string; reminder: string },
    ) => {
      await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, schedule: data, timezone: tz }),
      });
      refetchAll();
    },
    [tz, refetchAll],
  );

  // Live frogodoro overlay for today's column
  const {
    selectedTaskId: frogTaskId,
    sessionStats,
    settings: frogSettings,
    phase: frogPhase,
    timeLeft: frogTimeLeft,
    isRunning: frogRunning,
  } = useFrogodoroStore();

  const liveTasksByDate = useMemo(() => {
    if (!frogTaskId) return tasksByDate;
    const phaseDuration =
      frogPhase === 'focus'
        ? frogSettings.cycleDuration * 60
        : frogPhase === 'shortBreak'
          ? frogSettings.shortBreakDuration * 60
          : frogSettings.longBreakDuration * 60;
    const liveElapsed = phaseDuration - frogTimeLeft;
    const hasActivity =
      sessionStats.focusSessions > 0 ||
      sessionStats.shortBreaks > 0 ||
      sessionStats.longBreaks > 0 ||
      frogRunning ||
      liveElapsed > 0;
    if (!hasActivity) return tasksByDate;

    const todayList = tasksByDate[today];
    if (!todayList) return tasksByDate;
    const updated = todayList.map((t) =>
      t.id !== frogTaskId
        ? t
        : {
            ...t,
            frogodoroSession: {
              date: today,
              completedCycles:
                sessionStats.focusSessions +
                (frogPhase === 'focus' && liveElapsed > 0 ? 1 : 0),
              timeSpent:
                sessionStats.focusTime +
                (frogPhase === 'focus' ? liveElapsed : 0),
              shortBreaks:
                sessionStats.shortBreaks +
                (frogPhase === 'shortBreak' && liveElapsed > 0 ? 1 : 0),
              shortBreakTime:
                sessionStats.shortBreakTime +
                (frogPhase === 'shortBreak' ? liveElapsed : 0),
              longBreaks:
                sessionStats.longBreaks +
                (frogPhase === 'longBreak' && liveElapsed > 0 ? 1 : 0),
              longBreakTime:
                sessionStats.longBreakTime +
                (frogPhase === 'longBreak' ? liveElapsed : 0),
            },
          },
    );
    return { ...tasksByDate, [today]: updated };
  }, [
    tasksByDate,
    today,
    frogTaskId,
    frogPhase,
    frogSettings,
    frogTimeLeft,
    frogRunning,
    sessionStats,
  ]);

  if (loading) {
    return <LoadingScreen message="Loading planner..." fullscreen />;
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-background">
      <div className="absolute inset-0">
        <TaskBoard
          windowDates={windowDates}
          tasksByDate={liveTasksByDate}
          setTasksByDate={setTasksByDate}
          backlog={backlog}
          setBacklog={setBacklog}
          saveDate={saveDate}
          saveBacklog={saveBacklog}
          removeOnDate={removeOnDate}
          removeFromBacklog={removeFromBacklog}
          onRequestAdd={() => {
            /* no-op: QuickAddSheet path is used */
          }}
          onQuickAdd={onAddTask}
          todayKey={today}
          activeDateKey={activeDateKey}
          setActiveDateKey={setActiveDateKey}
          accountCreatedAt={accountCreatedAt}
          onExtendWindow={onExtendWindow}
          onToggleRepeat={onToggleRepeat}
          onScheduleTask={onScheduleTask}
        />
      </div>

      <style jsx global>{`
        @keyframes ripple {
          0% { transform: scale(0.9); opacity: 0.3; }
          50% { transform: scale(1.05); opacity: 0.6; }
          100% { transform: scale(0.9); opacity: 0.3; }
        }
        .animate-ripple { animation: ripple 11s ease-in-out infinite; }
        .animate-ripple-slow { animation: ripple 16s ease-in-out infinite; }
        @keyframes bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        .animate-bob { animation: bob 3.6s ease-in-out infinite; }
        @keyframes buzz {
          0% { transform: translate(0, 0) rotate(0deg); }
          25% { transform: translate(-1px, 1px) rotate(-1deg); }
          50% { transform: translate(1px, -1px) rotate(1deg); }
          75% { transform: translate(-1px, 0) rotate(0deg); }
          100% { transform: translate(0, 0) rotate(0deg); }
        }
        .animate-buzz { animation: buzz 400ms linear infinite; }
        @keyframes cardShine {
          0% { background-position: -150% 0; }
          100% { background-position: 250% 0; }
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
        .shine:hover { animation: cardShine 1200ms ease; }
      `}</style>
    </div>
  );
}
