'use client';

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import TaskBoard from '@/components/board/TaskBoard';
import { LeftTongueProvider } from '@/components/board/LeftTongue';
import { FlyGainPopup } from '@/components/ui/FlyGainPopup';
import { seedQuestClaims } from '@/lib/questClaims';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { useFrogodoroStore } from '@/lib/frogodoroStore';
import {
  Task,
  parseYmd,
  todayYmd,
  addDays,
  cmpYmd,
  relativeDayLabel,
} from '@/components/board/helpers';
import { useNotification } from '@/components/providers/NotificationProvider';

type DateRangeResponse = {
  byDate: Record<string, Task[]>;
  backlog: Task[];
  accountCreatedAt: string | null;
};

const INITIAL_PAST = 7;
const INITIAL_FUTURE = 7;
const EXTEND_STEP = 7;

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

  useEffect(() => {
    void seedQuestClaims();
  }, []);

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

  const { showNotification } = useNotification();

  // Guards against out-of-order full refetches: rapid completions fire several
  // overlapping board-refresh GETs, and a slower earlier one must not clobber a
  // newer one's state. Only the latest full (non-merge) refetch is applied;
  // merges target disjoint date keys and always apply.
  const fullFetchSeqRef = useRef(0);
  const fetchRange = useCallback(
    async (from: string, to: string, mergeOnly = false) => {
      const seq = mergeOnly ? 0 : ++fullFetchSeqRef.current;
      const res = await fetch(
        `/api/tasks?view=dateRange&from=${from}&to=${to}&timezone=${encodeURIComponent(tz)}`,
      );
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as DateRangeResponse;
      if (!mergeOnly && seq !== fullFetchSeqRef.current) return;
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

  // Coalesce reconciliation refetches. board-refresh is dispatched in each
  // mutation's PUT .then (post-commit), so a trailing debounce guarantees the
  // single full refetch runs only after the LAST committed mutation — never
  // mid-commit. Without this, rapidly toggling tasks fires overlapping
  // destructive refetches that read pre-commit state and flash the task back to
  // its old completed value (and re-sort it) before settling.
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    refetchTimerRef.current = setTimeout(() => {
      refetchTimerRef.current = null;
      void refetchAll();
    }, 300);
  }, [refetchAll]);

  useEffect(() => {
    window.addEventListener('tags-updated', scheduleRefetch);
    window.addEventListener('board-refresh', scheduleRefetch);
    return () => {
      window.removeEventListener('tags-updated', scheduleRefetch);
      window.removeEventListener('board-refresh', scheduleRefetch);
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    };
  }, [scheduleRefetch]);

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

  // Jump to an arbitrary date: rebuild the window centered on it (±7) and fetch
  // fresh. Used for far calendar navigation, "Today" when off-window, and after
  // moving a task to a specific date.
  const jumpToDate = useCallback(
    async (target: string) => {
      const minBound = accountCreatedAt ?? '1970-01-01';
      let start = addDays(target, -INITIAL_PAST);
      if (cmpYmd(start, minBound) < 0) start = minBound;
      const end = addDays(target, INITIAL_FUTURE);
      try {
        await fetchRange(start, end);
        setWindowStart(start);
        setWindowEnd(end);
        setActiveDateKey(target);
      } catch (e) {
        console.error('jumpToDate failed', e);
      }
    },
    [accountCreatedAt, fetchRange],
  );

  // Move a single task to any date (possibly outside the loaded window) via the
  // atomic move API, then re-center the board on the destination.
  const moveTaskToDate = useCallback(
    async (taskId: string, fromDateKey: string, targetKey: string) => {
      // Optimistically remove from source column.
      setTasksByDate((prev) => {
        if (!prev[fromDateKey]) return prev;
        return {
          ...prev,
          [fromDateKey]: prev[fromDateKey].filter((t) => t.id !== taskId),
        };
      });
      try {
        await fetch('/api/tasks', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId,
            move: { type: 'regular', date: targetKey },
            timezone: tz,
          }),
        });
      } catch (e) {
        console.error('moveTaskToDate failed', e);
      }
      await jumpToDate(targetKey);
    },
    [tz, jumpToDate],
  );

  const duplicateTaskToDate = useCallback(
    async (taskId: string, targetKey: string) => {
      try {
        await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            duplicateFrom: taskId,
            date: targetKey,
            timezone: tz,
          }),
        });
        showNotification(`Duplicated to ${relativeDayLabel(targetKey)}`);
      } catch (e) {
        console.error('duplicateTaskToDate failed', e);
      }
      await jumpToDate(targetKey);
    },
    [tz, jumpToDate, showNotification],
  );

  // Move a single occurrence of a repeating task to another day: suppress the
  // source date on the rule and create a standalone one-off on the target,
  // leaving the rest of the series intact.
  const moveRepeatInstance = useCallback(
    async (
      taskId: string,
      newId: string,
      fromDate: string,
      toDate: string,
      order?: number,
    ) => {
      try {
        await fetch('/api/tasks', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            moveInstance: { taskId, newId, fromDate, toDate, order },
            timezone: tz,
          }),
        });
      } catch (e) {
        console.error('moveRepeatInstance failed', e);
      }
    },
    [tz],
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
      repeatEndDate,
      repeatRule,
    }: {
      text: string;
      dates: string[];
      repeat: 'this-week' | 'weekly' | 'monthly' | 'custom';
      tags: string[];
      startTime?: string;
      endTime?: string;
      reminder?: string;
      repeatEndDate?: string | null;
      repeatRule?: import('@/components/ui/quick-add/utils').RepeatRule | null;
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
            repeatEndDate,
            repeatRule,
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
    phaseElapsed: frogPhaseElapsed,
  } = useFrogodoroStore();

  const liveTasksByDate = useMemo(() => {
    if (!frogTaskId) return tasksByDate;
    const phaseDuration =
      frogPhase === 'focus'
        ? frogSettings.focusDuration * 60
        : frogSettings.breakDuration * 60;
    const liveElapsed = phaseDuration - frogTimeLeft;
    const unsavedLiveElapsed = Math.max(0, liveElapsed - frogPhaseElapsed);
    const hasActivity =
      sessionStats.focusTime > 0 ||
      sessionStats.breakTime > 0 ||
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
              focusTime:
                Math.max(
                  sessionStats.focusTime,
                  t.frogodoroSession?.focusTime ?? 0,
                ) + (frogPhase === 'focus' ? unsavedLiveElapsed : 0),
              breakTime:
                Math.max(
                  sessionStats.breakTime,
                  t.frogodoroSession?.breakTime ?? 0,
                ) + (frogPhase === 'break' ? unsavedLiveElapsed : 0),
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
    frogPhaseElapsed,
    sessionStats,
  ]);

  if (loading) {
    return <LoadingScreen fullscreen />;
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-background">
      <FlyGainPopup />
      <LeftTongueProvider>
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
          onJumpToDate={jumpToDate}
          onMoveTaskToDate={moveTaskToDate}
          onDuplicateTaskToDate={duplicateTaskToDate}
          onMoveRepeatInstance={moveRepeatInstance}
          onToggleRepeat={onToggleRepeat}
          onScheduleTask={onScheduleTask}
        />
      </div>
      </LeftTongueProvider>

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
