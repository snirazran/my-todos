'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import { Loader2 } from 'lucide-react';
import {
  startOfMonth,
  endOfMonth,
  format,
  startOfDay,
} from 'date-fns';
import useSWR, { useSWRConfig } from 'swr';

import { LoadingScreen } from '@/components/ui/LoadingScreen';
import HistoryCalendar from '@/components/history/HistoryCalendar';
import DayDetailSheet from '@/components/history/DayDetailSheet';
import { EditTaskDialog } from '@/components/ui/EditTaskDialog';

import { useFrogodoroStore } from '@/lib/frogodoroStore';

export default function HistoryPage() {
  const { user, loading } = useAuth();
  const { mutate } = useSWRConfig();
  const router = useRouter();

  // --- State: Calendar View ---
  const [viewDate, setViewDate] = useState(new Date());
  const [calendarData, setCalendarData] = useState<any[]>([]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);

  // --- State: Selection (Day Popup) ---
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<{
    id: string;
    text: string;
    type?: string;
  } | null>(null);

  // Filters for Popup
  const [popupSelectedTags, setPopupSelectedTags] = useState<string[]>([]);
  const [popupShowCompleted, setPopupShowCompleted] = useState(true);

  useSWR('/api/tags', (url) =>
    fetch(url).then((r) => r.json()),
  );

  const revalidateTaskCaches = useCallback(() => {
    mutate(
      (key: unknown) =>
        typeof key === 'string' && key.startsWith('/api/tasks'),
    );
  }, [mutate]);

  // Fetch user data to get join date
  const { data: userData } = useSWR(user ? '/api/user' : null, (url) =>
    fetch(url).then((r) => r.json()),
  );

  const todayStatusKey =
    user && selectedDate
      ? `/api/tasks?date=${format(new Date(), 'yyyy-MM-dd')}&timezone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`
      : null;
  const { data: todayStatusData } = useSWR(todayStatusKey, (url) =>
    fetch(url).then((r) => r.json()),
  );

  // Calculate date constraints
  const minDate = userData?.createdAt
    ? startOfDay(new Date(userData.createdAt))
    : undefined;
  const maxDate = startOfDay(new Date()); // Today

  const calendarFetchRange = useMemo(
    () => ({
      from: format(startOfMonth(viewDate), 'yyyy-MM-dd'),
      to: format(endOfMonth(viewDate), 'yyyy-MM-dd'),
    }),
    [viewDate],
  );

  // --- Auth Check ---
  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push('/login');
    }
  }, [loading, user, router]);

  // --- 1. Fetch Calendar Data (View Month) ---
  useEffect(() => {
    if (!user) return;

    const fetchMonth = async () => {
      setLoadingCalendar(true);
      try {
        const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        const res = await fetch(
          `/api/history?from=${calendarFetchRange.from}&to=${calendarFetchRange.to}&timezone=${encodeURIComponent(userTimezone)}`,
        );
        if (res.ok) {
          const data = await res.json();
          setCalendarData(data);
        }
      } catch (e) {
        console.error('Calendar fetch error', e);
      } finally {
        setLoadingCalendar(false);
      }
    };

    fetchMonth();
  }, [calendarFetchRange, user]);

  // Live frogodoro overlay for today
  const { selectedTaskId: frogTaskId, sessionStats, settings: frogSettings, phase: frogPhase, timeLeft: frogTimeLeft, isRunning: frogRunning } = useFrogodoroStore();
  const frogPhaseDuration = frogPhase === 'focus' ? frogSettings.cycleDuration * 60 : frogPhase === 'shortBreak' ? frogSettings.shortBreakDuration * 60 : frogSettings.longBreakDuration * 60;
  const frogLiveElapsed = frogPhaseDuration - frogTimeLeft;
  const frogHasActivity = sessionStats.focusSessions > 0 || sessionStats.shortBreaks > 0 || sessionStats.longBreaks > 0 || frogRunning || frogLiveElapsed > 0;

  const [lastSelectedDate, setLastSelectedDate] = useState<string | null>(null);
  useEffect(() => {
    if (selectedDate) setLastSelectedDate(selectedDate);
  }, [selectedDate]);

  const popupTasks = useMemo(() => {
    const dateToUse = selectedDate || lastSelectedDate;
    if (!dateToUse) return [];
    const day = calendarData.find((d) => d.date === dateToUse);
    const tasks = day ? day.tasks : [];
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    if (dateToUse !== todayStr || !frogTaskId || !frogHasActivity) return tasks;
    return tasks.map((t: any) =>
      t.id === frogTaskId
        ? {
            ...t,
            frogodoroSession: {
              date: todayStr,
              completedCycles: sessionStats.focusSessions + (frogPhase === 'focus' && frogLiveElapsed > 0 ? 1 : 0),
              timeSpent: sessionStats.focusTime + (frogPhase === 'focus' ? frogLiveElapsed : 0),
              shortBreaks: sessionStats.shortBreaks + (frogPhase === 'shortBreak' && frogLiveElapsed > 0 ? 1 : 0),
              shortBreakTime: sessionStats.shortBreakTime + (frogPhase === 'shortBreak' ? frogLiveElapsed : 0),
              longBreaks: sessionStats.longBreaks + (frogPhase === 'longBreak' && frogLiveElapsed > 0 ? 1 : 0),
              longBreakTime: sessionStats.longBreakTime + (frogPhase === 'longBreak' ? frogLiveElapsed : 0),
            },
          }
        : t,
    );
  }, [calendarData, selectedDate, lastSelectedDate, frogTaskId, frogHasActivity, sessionStats, frogPhase, frogLiveElapsed]);

  // Refactored Toggle for Popup
  const handleToggleTask = async (
    taskId: string,
    date: string,
    currentStatus: boolean,
  ) => {
    // Optimistic update
    const updateData = (prev: any[]) =>
      prev.map((day) => {
        if (day.date !== date) return day;
        return {
          ...day,
          tasks: day.tasks.map((t: any) => {
            if (t.id === taskId) {
              const nextCompleted = !currentStatus;
              let updatedCompletedDates = t.completedDates || [];
              if (t.type === 'habit') {
                if (nextCompleted) {
                  if (!updatedCompletedDates.includes(date)) {
                    updatedCompletedDates = [...updatedCompletedDates, date];
                  }
                } else {
                  updatedCompletedDates = updatedCompletedDates.filter((d: string) => d !== date);
                }
              }
              return { 
                ...t, 
                completed: nextCompleted,
                completedDates: updatedCompletedDates
              };
            }
            return t;
          }),
        };
      });

    setCalendarData(updateData);

    try {
      await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, date, completed: !currentStatus }),
      });
    } catch (error) {
      console.error('Toggle failed', error);
      // Revert
      const revertData = (prev: any[]) =>
        prev.map((day) => {
          if (day.date !== date) return day;
          return {
            ...day,
            tasks: day.tasks.map((t: any) => {
              if (t.id === taskId) return { ...t, completed: currentStatus };
              return t;
            }),
          };
        });
      setCalendarData(revertData);
    }
  };

  const handleDeleteTask = async (taskId: string, date: string) => {
    // Optimistic
    const updateData = (prev: any[]) =>
      prev.map((day) => {
        if (day.date !== date) return day;
        return {
          ...day,
          tasks: day.tasks.filter((t: any) => t.id !== taskId),
        };
      });
    setCalendarData(updateData);

    try {
      await fetch('/api/tasks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, date }),
      });
      // Also mutate today/backlog just in case
      revalidateTaskCaches();
    } catch (error) {
      console.error('Delete failed', error);
    }
  };

  const handleSaveEdit = async (newText: string) => {
    const date = selectedDate || lastSelectedDate;
    if (!editingTask || !date) return;
    const taskId = editingTask.id;

    // Optimistic
    const updateData = (prev: any[]) =>
      prev.map((day) => {
        if (day.date !== date) return day;
        return {
          ...day,
          tasks: day.tasks.map((t: any) => {
            if (t.id === taskId) return { ...t, text: newText };
            return t;
          }),
        };
      });
    setCalendarData(updateData);

    try {
      await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, text: newText }),
      });
      revalidateTaskCaches();
    } catch (error) {
      console.error('Edit failed', error);
    }
    setEditingTask(null);
  };

  // Frog Props for Day Detail
  const frogProps = {
    flyBalance: todayStatusData?.flyStatus?.balance,
    animateBalance: false,
    animateHunger: false,
    hunger: todayStatusData?.hungerStatus?.hunger,
    maxHunger: todayStatusData?.hungerStatus?.maxHunger,
  };

  if (loading) return <LoadingScreen message="Loading..." />;

  return (
    <main className="min-h-screen pb-12 bg-background flex flex-col items-center">
      <div className="w-full max-w-3xl px-4 py-8 md:px-8">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-black tracking-tight text-foreground">
            History
          </h1>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">
            Review past tasks and habits by day.
          </p>
        </div>

        <div className="relative w-full">
          {loadingCalendar && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50 backdrop-blur-sm rounded-3xl">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}
          <HistoryCalendar
            currentDate={viewDate}
            onDateChange={setViewDate}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            historyData={calendarData}
            disableSwipe={!!selectedDate}
            minDate={minDate}
            maxDate={maxDate}
          />
        </div>

        {/* Day Popup */}
        <DayDetailSheet
          open={!!selectedDate}
          onClose={() => setSelectedDate(null)}
          date={selectedDate || lastSelectedDate || format(new Date(), 'yyyy-MM-dd')}
          tasks={popupTasks}
          onToggleTask={handleToggleTask}
          onDeleteTask={handleDeleteTask}
          onEditTask={(id, text, type) => setEditingTask({ id, text, type })}
          frogProps={{
            ...frogProps,
          }}
          selectedTags={popupSelectedTags}
          onTagsChange={setPopupSelectedTags}
          showCompleted={popupShowCompleted}
          onShowCompletedChange={setPopupShowCompleted}
        />

        <EditTaskDialog
          open={!!editingTask}
          onClose={() => setEditingTask(null)}
          initialText={editingTask?.text || ''}
          title={editingTask?.type === 'habit' ? 'Edit Habit' : 'Edit Task'}
          subtitle={
            editingTask?.type === 'habit'
              ? 'Make changes to your habit below.'
              : 'Make changes to your task below.'
          }
          onSave={handleSaveEdit}
        />
      </div>
    </main>
  );
}
