import useSWR, { mutate } from 'swr';
import { useCallback, useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { useAuth } from '@/components/auth/AuthContext';
import { useNotification } from '@/components/providers/NotificationProvider';
import { useReminderScheduler } from '@/hooks/useReminderScheduler';
import { INVENTORY_KEY, INVENTORY_SUMMARY_KEY } from '@/hooks/useInventory';
import { notifyQuestClaims, seedQuestClaims } from '@/lib/questClaims';
import Fly from '@/components/ui/fly';

// --- Types ---
export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Task {
  id: string;
  text: string;
  completed: boolean;
  order?: number;
  type?: 'regular' | 'weekly' | 'backlog';
  origin?: 'regular' | 'weekly' | 'backlog';
  kind?: 'regular' | 'weekly' | 'backlog';
  tags?: string[];
  notes?: string;
  checklist?: ChecklistItem[];
  repeatMode?:
    | 'none'
    | 'daily'
    | 'weekdays'
    | 'weekend'
    | 'weekly'
    | 'monthly'
    | 'custom';
  repeatGroupId?: string;
  date?: string;
  completedDates?: string[];
  frogodoroSettings?: {
    focusDuration: number;
    breakDuration: number;
  };
  frogodoroSession?: {
    date: string;
    focusTime: number;
    breakTime: number;
  } | null;
  calendarEventId?: string;
  startTime?: string;
  endTime?: string;
  reminder?: string;
}

export type FlyStatus = {
  balance: number;
  earnedToday: number;
  limit: number;
  limitHit: boolean;
  justHitLimit?: boolean;
};

export type HungerStatus = {
  hunger: number;
  stolenFlies: number;
  maxHunger: number;
};

interface TasksResponse {
  tasks: Task[];
  weeklyIds?: string[];
  flyStatus: FlyStatus;
  hungerStatus?: HungerStatus;
  dailyTasksCount?: number;
}

type ExclusionSource = 'today' | 'backlog';

type FrogodoroSession = NonNullable<Task['frogodoroSession']>;

type FrogodoroProgressEvent = CustomEvent<{
  taskId: string;
  session: FrogodoroSession;
}>;

type UseTaskDataOptions = {
  includeBacklog?: boolean;
};

// --- Fetcher ---
const fetcher = (url: string) => fetch(url).then((res) => res.json());

// --- Helper for Optimistic Updates ---
const sortTasks = (ts: Task[]) => {
  return [...ts].sort((a, b) => {
    return (a.order ?? 0) - (b.order ?? 0);
  });
};

export function useTaskData({
  includeBacklog = true,
}: UseTaskDataOptions = {}) {
  const { user } = useAuth();
  const { showNotification, hideNotification } = useNotification();
  const { cancelNotification } = useReminderScheduler();

  useEffect(() => {
    void seedQuestClaims();
  }, []);

  const today = new Date();
  const dateStr = format(today, 'yyyy-MM-dd');
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Map<TaskId, SourceList>
  // Tracks where a task should be HIDDEN from until it appears in destination
  const [pendingExclusions, setPendingExclusions] = useState(
    new Map<string, ExclusionSource>(),
  );

  // Track pending moves for loading indicators (count only)
  const [pendingToBacklog, setPendingToBacklog] = useState(0);
  const [pendingToToday, setPendingToToday] = useState(0);

  // --- SWR Keys ---
  const todayKey = user
    ? `/api/tasks?date=${dateStr}&timezone=${encodeURIComponent(tz)}`
    : null;
  const backlogKey =
    user && includeBacklog ? `/api/tasks?view=board&day=-1` : null;

  // --- Data Fetching ---
  const {
    data: todayData,
    mutate: mutateToday,
    isLoading: isLoadingToday,
  } = useSWR<TasksResponse>(todayKey, fetcher, {
    refreshInterval: 0,
    revalidateOnFocus: false,
  });

  const {
    data: backlogData,
    mutate: mutateBacklog,
    isLoading: isLoadingBacklog,
  } = useSWR<Task[]>(backlogKey, fetcher, {
    refreshInterval: 0,
    revalidateOnFocus: false,
  });

  // --- External Event Listeners ---
  useEffect(() => {
    const handleUpdate = () => {
      mutateToday();
      if (includeBacklog) mutateBacklog();
    };

    window.addEventListener('tags-updated', handleUpdate);
    window.addEventListener('board-refresh', handleUpdate);

    return () => {
      window.removeEventListener('tags-updated', handleUpdate);
      window.removeEventListener('board-refresh', handleUpdate);
    };
  }, [includeBacklog, mutateToday, mutateBacklog]);

  useEffect(() => {
    const handleFrogodoroProgress = (event: Event) => {
      const { taskId, session } = (event as FrogodoroProgressEvent).detail ?? {};
      if (!taskId || !session) return;

      mutateToday((current) => {
        if (!current) return current;
        return {
          ...current,
          tasks: current.tasks.map((task) => {
            if (task.id !== taskId) return task;
            const existing = task.frogodoroSession;
            return {
              ...task,
              frogodoroSession: {
                date: session.date,
                focusTime: (existing?.focusTime ?? 0) + (session.focusTime ?? 0),
                breakTime: (existing?.breakTime ?? 0) + (session.breakTime ?? 0),
              },
            };
          }),
        };
      }, { revalidate: false });
    };

    window.addEventListener('frogodoro-progress-saved', handleFrogodoroProgress);
    return () => {
      window.removeEventListener('frogodoro-progress-saved', handleFrogodoroProgress);
    };
  }, [mutateToday]);

  // --- Cleanup Effect ---
  // Remove exclusions when task is confirmed gone from source list
  useEffect(() => {
    if (pendingExclusions.size === 0) return;

    setPendingExclusions((prev) => {
      const next = new Map(prev);
      let changed = false;

      const effectiveToday = todayData?.tasks || [];
      const effectiveBacklog = backlogData || [];

      // Only cleanup if we actually have data loaded for the check
      if (!todayData && !backlogData) return prev;

      // Check each pending exclusion
      Array.from(next.entries()).forEach(([id, source]) => {
        if (source === 'today') {
          // If excluded from Today, wait until it's actually GONE from Today
          const inToday = effectiveToday.some((t) => t.id === id);
          if (!inToday && todayData) {
            next.delete(id);
            changed = true;
          }
        } else if (source === 'backlog') {
          // If excluded from Backlog, wait until gone from Backlog
          const inBacklog = effectiveBacklog.some((t) => t.id === id);
          if (!inBacklog && backlogData) {
            next.delete(id);
            changed = true;
          }
        }
      });

      return changed ? next : prev;
    });
  }, [todayData, backlogData]);

  // --- Derived State ---
  // Filter Today: Hide if excluded from 'today'
  const tasks = (todayData?.tasks || []).filter(
    (t) => pendingExclusions.get(t.id) !== 'today',
  );

  const weeklyIds = new Set(todayData?.weeklyIds || []);
  const flyStatus = todayData?.flyStatus || {
    balance: 0,
    earnedToday: 0,
    limit: 15,
    limitHit: false,
  };
  const hungerStatus = todayData?.hungerStatus || {
    hunger: 0,
    stolenFlies: 0,
    maxHunger: 0,
  };
  // Filter Backlog: Hide if excluded from 'backlog'
  const backlogTasks = (Array.isArray(backlogData) ? backlogData : []).filter(
    (t) => pendingExclusions.get(t.id) !== 'backlog',
  );

  // --- Actions ---

  /**
   * Toggle Task Completion
   */
  const toggleTask = useCallback(
    async (taskId: string, forceState?: boolean) => {
      if (!todayData || !backlogData) return;
      const task = (todayData.tasks || []).find((t) => t.id === taskId);
      if (!task) return;

      const nextCompleted = forceState ?? !task.completed;
      // Skip if no change
      if (nextCompleted === task.completed) return;

      // Snapshot
      const prevToday = todayData;
      const prevBacklog = backlogData;

      // Optimistic Update
      const updatedTasks = todayData.tasks.map((t) =>
        t.id === taskId ? { ...t, completed: nextCompleted } : t,
      );

      const sortedTasks = sortTasks(updatedTasks);

      // Revalidate: false to prevent immediate fetch override
      mutateToday({ ...todayData, tasks: sortedTasks }, { revalidate: false });

      try {
        const res = await fetch('/api/tasks', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: dateStr,
            taskId,
            completed: nextCompleted,
            timezone: tz,
          }),
        });

        const json = await res.json();

        if (json.ok) {
          void notifyQuestClaims(showNotification);
          // Update Fly/Hunger status if returned
          // We use a functional update to ensure we're modifying the LATEST state (which might include the optimistic change)
          if (json.flyStatus || json.hungerStatus) {
            const newFlyStatus = json.flyStatus as FlyStatus | undefined;

            // Push the new fly balance into the inventory caches so the
            // header's fly counter updates instantly — without this, the
            // header reads from /api/skins/inventory and only refreshes
            // after a page reload.
            if (newFlyStatus) {
              const nextBalance = newFlyStatus.balance;
              const patch = (curr: any) => {
                if (!curr?.wardrobe) return curr;
                if (curr.wardrobe.flies === nextBalance) return curr;
                return {
                  ...curr,
                  wardrobe: { ...curr.wardrobe, flies: nextBalance },
                };
              };
              mutate(INVENTORY_KEY, patch, { revalidate: false });
              mutate(INVENTORY_SUMMARY_KEY, patch, { revalidate: false });
            }

            // NOTIFICATIONS
            if (newFlyStatus) {
              const prevEarned = flyStatus.earnedToday;
              const newEarned = newFlyStatus.earnedToday;

              if (newFlyStatus.justHitLimit) {
                showNotification(
                  <div className="flex items-center gap-3 pr-1">
                    <Fly size={28} y={-4} />
                    <span className="font-bold text-red-500">
                      Daily Target Reached!
                    </span>
                  </div>,
                );
              } else if (newEarned > prevEarned) {
                showNotification(
                  <div className="flex w-full items-center gap-3">
                    <div className="grid h-12 w-12 shrink-0 place-items-center">
                      <Fly size={44} y={-2} />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className="text-[14px] font-black text-foreground">
                        +1 Fly Collected!
                      </span>
                      <span className="mt-0.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Keep it up!
                      </span>
                    </div>
                  </div>,
                );
              }
            }

            mutateToday(
              (curr) => {
                if (!curr) return curr;

                // Check if values actually changed to avoid re-render if identical
                const flyChanged =
                  JSON.stringify(curr.flyStatus) !==
                  JSON.stringify(json.flyStatus);
                const hungerChanged =
                  JSON.stringify(curr.hungerStatus) !==
                  JSON.stringify(json.hungerStatus);
                const tasksCountChanged =
                  curr.dailyTasksCount !== json.dailyTasksCount;

                if (!flyChanged && !hungerChanged && !tasksCountChanged)
                  return curr;

                return {
                  ...curr,
                  flyStatus: json.flyStatus || curr.flyStatus,
                  hungerStatus: json.hungerStatus || curr.hungerStatus,
                  dailyTasksCount: json.dailyTasksCount ?? curr.dailyTasksCount,
                };
              },
              { revalidate: false },
            );
          }
        } else {
          throw new Error(json.error || 'Failed to toggle');
        }
      } catch (e) {
        console.error('Toggle failed', e);
        mutateToday(prevToday, { revalidate: false });
      }
    },
    [dateStr, todayData, backlogData, mutateToday, tz, sortTasks],
  );

  /**
   * Move Task: Today -> Backlog
   */
  const moveTaskToBacklog = useCallback(
    async (taskIdOrTask: string | Task) => {
      if (!todayData || !backlogData) return;
      const taskId =
        typeof taskIdOrTask === 'string' ? taskIdOrTask : taskIdOrTask.id;
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      // Snapshot for rollback
      const prevToday = todayData;
      const prevBacklog = backlogData;

      // 1. Manual Optimistic Update (No Revalidate)
      // Remove from Today
      mutateToday(
        {
          ...todayData,
          tasks: todayData.tasks.filter((t) => t.id !== taskId),
        },
        { revalidate: false },
      );

      // Add to Backlog (Append)
      mutateBacklog(
        [
          ...backlogData,
          { ...task, type: 'backlog', origin: 'regular', order: 9999 }, // provisional order
        ],
        { revalidate: false },
      );

      try {
        await fetch('/api/tasks', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId,
            move: { type: 'backlog' },
            timezone: tz,
          }),
        });

        showNotification('Moved to Saved Tasks', async () => {
          // UNDO Logic: Reverse Manual Update

          // Re-add to Today
          mutateToday(
            (curr) =>
              curr
                ? {
                    ...curr,
                    tasks: sortTasks([...curr.tasks, task]), // approximate sort
                  }
                : curr,
            { revalidate: false },
          );

          // Remove from Backlog
          mutateBacklog((curr) => (curr || []).filter((t) => t.id !== taskId), {
            revalidate: false,
          });

          // API Reverse
          await fetch('/api/tasks', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskId,
              move: { type: 'regular', date: dateStr },
              timezone: tz,
            }),
          });
        });
      } catch (e) {
        console.error('Move to backlog failed', e);
        // Rollback
        mutateToday(prevToday, { revalidate: false });
        mutateBacklog(prevBacklog, { revalidate: false });
      }
    },
    [
      todayData,
      backlogData,
      tasks,
      mutateToday,
      mutateBacklog,
      dateStr,
      showNotification,
      tz,
      sortTasks,
    ],
  );

  /**
   * Move Task: Backlog -> Today
   */
  const moveTaskToToday = useCallback(
    async (item: {
      id: string;
      text: string;
      type?: 'regular' | 'weekly' | 'backlog';
      tags?: string[];
    }) => {
      if (!todayData || !backlogData) return;

      // Snapshot
      const prevToday = todayData;
      const prevBacklog = backlogData;

      // 1. Manual Optimistic Update (No Revalidate)
      // Remove from Backlog
      mutateBacklog(
        backlogData.filter((t) => t.id !== item.id),
        { revalidate: false },
      );

      // Add to Today
      mutateToday(
        {
          ...todayData,
          tasks: [
            ...todayData.tasks,
            {
              ...item,
              id: item.id,
              completed: false,
              type: 'regular',
              order: 9999,
            } as Task,
          ],
        },
        { revalidate: false },
      );

      try {
        await fetch('/api/tasks', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: item.id,
            move: { type: 'regular', date: dateStr },
            timezone: tz,
          }),
        });

        showNotification('Moved to Today', async () => {
          // UNDO Logic: Reverse Manual Update
          // Remove from Today
          mutateToday(
            (curr) =>
              curr
                ? {
                    ...curr,
                    tasks: curr.tasks.filter((t) => t.id !== item.id),
                  }
                : curr,
            { revalidate: false },
          );

          // Add back to Backlog
          mutateBacklog(
            (curr) => [
              ...(curr || []),
              {
                ...item,
                id: item.id,
                completed: false,
                type: 'backlog',
              } as Task,
            ],
            { revalidate: false },
          );

          // Reverse move: Today -> Backlog
          await fetch('/api/tasks', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskId: item.id,
              move: { type: 'backlog' },
              timezone: tz,
            }),
          });
        });
      } catch (e) {
        console.error('Move to today failed', e);
        // Rollback
        mutateToday(prevToday, { revalidate: false });
        mutateBacklog(prevBacklog, { revalidate: false });
      }
    },
    [
      todayData,
      backlogData,
      tasks,
      mutateToday,
      mutateBacklog,
      dateStr,
      showNotification,
      tz,
    ],
  );

  /**
   * Delete Task (Today)
   */
  /**
   * Delete Task (Today)
   */
  const deleteTask = useCallback(
    async (taskId: string, forcePermanent?: boolean) => {
      setPendingExclusions((prev) => new Map(prev).set(taskId, 'today'));
      const prevToday = todayData;

      // Optimistic
      if (todayData) {
        mutateToday(
          {
            ...todayData,
            tasks: todayData.tasks.filter((t) => t.id !== taskId),
          },
          { revalidate: false },
        );
      }

      try {
        await fetch('/api/tasks', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: dateStr,
            taskId,
            permanent: forcePermanent,
          }),
        });
        cancelNotification(taskId);
      } catch (e) {
        console.error('Delete failed', e);
        // Rollback
        if (prevToday) mutateToday(prevToday, { revalidate: false });
        setPendingExclusions((prev) => {
          const next = new Map(prev);
          next.delete(taskId);
          return next;
        });
      }
    },
    [todayData, tasks, mutateToday, dateStr],
  );

  /**
   * Duplicate a task onto today or tomorrow as a fresh, uncompleted task.
   */
  const duplicateTask = useCallback(
    async (taskId: string, when: 'today' | 'tomorrow') => {
      const d = new Date();
      if (when === 'tomorrow') d.setDate(d.getDate() + 1);
      const dateKey = format(d, 'yyyy-MM-dd');
      try {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ duplicateFrom: taskId, date: dateKey, timezone: tz }),
        });
        const data = await res.json();
        if (when === 'today' && data?.tasks?.[0] && todayData) {
          mutateToday(
            { ...todayData, tasks: sortTasks([...todayData.tasks, data.tasks[0]]) },
            { revalidate: false },
          );
        }
      } catch (e) {
        console.error('Duplicate failed', e);
      } finally {
        mutateToday();
        if (includeBacklog) mutateBacklog();
      }
    },
    [todayData, mutateToday, mutateBacklog, tz, includeBacklog, sortTasks],
  );

  /**
   * Delete an entire repeat series — the linked group (daily/weekdays) or a
   * lone weekly task across all weeks.
   */
  const deleteTaskSeries = useCallback(
    async (taskId: string) => {
      const prevToday = todayData;
      const prevBacklog = backlogData;
      const groupId =
        todayData?.tasks.find((t) => t.id === taskId)?.repeatGroupId ??
        (Array.isArray(backlogData)
          ? backlogData.find((t) => t.id === taskId)?.repeatGroupId
          : undefined);
      const matches = (t: Task) =>
        groupId ? t.repeatGroupId === groupId : t.id === taskId;

      if (todayData) {
        mutateToday(
          { ...todayData, tasks: todayData.tasks.filter((t) => !matches(t)) },
          { revalidate: false },
        );
      }
      if (Array.isArray(backlogData)) {
        mutateBacklog(backlogData.filter((t) => !matches(t)), {
          revalidate: false,
        });
      }

      try {
        await fetch('/api/tasks', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId, deleteSeries: true, timezone: tz }),
        });
        cancelNotification(taskId);
      } catch (e) {
        console.error('Delete series failed', e);
        if (prevToday) mutateToday(prevToday, { revalidate: false });
        if (prevBacklog) mutateBacklog(prevBacklog, { revalidate: false });
      }
    },
    [todayData, backlogData, mutateToday, mutateBacklog, tz, cancelNotification],
  );

  /**
   * Delete Task (Backlog)
   */
  const deleteBacklogTask = useCallback(
    async (taskId: string) => {
      setPendingExclusions((prev) => new Map(prev).set(taskId, 'backlog'));
      const prevBacklog = backlogData;

      // Optimistic
      if (backlogData) {
        mutateBacklog(
          backlogData.filter((t) => t.id !== taskId),
          { revalidate: false },
        );
      }

      try {
        await fetch('/api/tasks?view=board', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ day: -1, taskId }),
        });
      } catch (e) {
        console.error('Backlog delete failed', e);
        // Rollback
        if (prevBacklog) mutateBacklog(prevBacklog, { revalidate: false });
        setPendingExclusions((prev) => {
          const next = new Map(prev);
          next.delete(taskId);
          return next;
        });
      }
    },
    [backlogData, mutateBacklog],
  );

  /**
   * Reorder Tasks (Today)
   */
  const reorderTasks = useCallback(
    async (newTasks: Task[]) => {
      // Optimistic
      if (todayData) {
        // CRITICAL: We must update the 'order' property on the tasks themselves,
        // because TaskList now explicitly sorts by 'order'.
        const reorderedOptimistic = newTasks.map((t, i) => ({
          ...t,
          order: i,
        }));

        const reorderedIds = new Set(newTasks.map((t) => t.id));
        const otherTasks = todayData.tasks.filter(
          (t) => !reorderedIds.has(t.id),
        );

        await mutateToday(
          {
            ...todayData,
            tasks: [...reorderedOptimistic, ...otherTasks],
          },
          { revalidate: false },
        );
      }

      const dow = new Date().getDay();
      await fetch('/api/tasks?view=board', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day: dow,
          tasks: newTasks.map((t) => ({ id: t.id })),
        }),
      });
    },
    [todayData, mutateToday],
  );

  /**
   * Edit Task Text
   */
  /**
   * Toggle Repeat (Weekly <-> Regular)
   */
  const toggleRepeat = useCallback(
    async (taskId: string) => {
      if (!todayData) return;
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      const prevToday = todayData;

      // Optimistic
      const isWeekly =
        task.type === 'weekly' || (todayData.weeklyIds || []).includes(taskId);
      const newType: 'regular' | 'weekly' = isWeekly ? 'regular' : 'weekly';

      const updatedTasks = todayData.tasks.map((t) =>
        t.id === taskId ? ({ ...t, type: newType } as Task) : t,
      );

      let newWeeklyIds = todayData.weeklyIds || [];
      if (newType === 'weekly') {
        if (!newWeeklyIds.includes(taskId))
          newWeeklyIds = [...newWeeklyIds, taskId];
      } else {
        newWeeklyIds = newWeeklyIds.filter((id) => id !== taskId);
      }

      mutateToday(
        {
          ...todayData,
          tasks: updatedTasks,
          weeklyIds: newWeeklyIds,
        },
        { revalidate: false },
      );

      try {
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
      } catch (e) {
        console.error('Toggle repeat failed', e);
        mutateToday(prevToday, { revalidate: false });
      }
    },
    [todayData, tasks, mutateToday, dateStr, tz],
  );

  /**
   * Edit Task Text
   */
  const editTask = useCallback(
    async (
      taskId: string,
      newText: string,
      isBacklog: boolean,
      scope: 'one' | 'all' = 'one',
    ) => {
      const prevToday = todayData;
      const prevBacklog = backlogData;

      const groupId =
        todayData?.tasks.find((t) => t.id === taskId)?.repeatGroupId ??
        (Array.isArray(backlogData)
          ? backlogData.find((t) => t.id === taskId)?.repeatGroupId
          : undefined);
      const matches = (t: Task) =>
        scope === 'all' && groupId ? t.repeatGroupId === groupId : t.id === taskId;

      // Optimistic Update
      if (isBacklog && backlogData) {
        const updated = backlogData.map((t) =>
          matches(t) ? { ...t, text: newText } : t,
        );
        mutateBacklog(updated, { revalidate: false });
      } else if (!isBacklog && todayData) {
        const updated = todayData.tasks.map((t) =>
          matches(t) ? { ...t, text: newText } : t,
        );
        mutateToday({ ...todayData, tasks: updated }, { revalidate: false });
      }

      try {
        await fetch('/api/tasks', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId, text: newText, scope, timezone: tz }),
        });
      } catch (e) {
        console.error('Edit failed', e);
        // Rollback
        if (isBacklog && prevBacklog)
          mutateBacklog(prevBacklog, { revalidate: false });
        else if (!isBacklog && prevToday)
          mutateToday(prevToday, { revalidate: false });
      }
    },
    [backlogData, todayData, tasks, mutateBacklog, mutateToday, tz],
  );

  const scheduleTask = useCallback(
    async (
      taskId: string,
      data: { startTime: string; endTime: string; reminder: string },
      scope: 'one' | 'all' = 'one',
    ) => {
      const prevToday = todayData;

      const groupId = todayData?.tasks.find((t) => t.id === taskId)?.repeatGroupId;
      const matches = (t: Task) =>
        scope === 'all' && groupId ? t.repeatGroupId === groupId : t.id === taskId;

      // Optimistic update
      if (todayData) {
        const updated = todayData.tasks.map((t) => {
          if (matches(t)) {
            return {
              ...t,
              startTime: data.startTime || undefined,
              endTime: data.endTime || undefined,
              reminder: data.reminder || undefined,
            };
          }
          return t;
        });
        mutateToday({ ...todayData, tasks: updated }, { revalidate: false });
      }

      try {
        await fetch('/api/tasks', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId, schedule: data, scope, timezone: tz }),
        });

        // Scheduled task reminders are sent by the server cron so they work
        // even when every client app is closed.
        cancelNotification(taskId);
      } catch (e) {
        console.error('Schedule failed', e);
        if (prevToday) mutateToday(prevToday, { revalidate: false });
      }
    },
    [todayData, mutateToday, tz, cancelNotification],
  );

  /**
   * Update task details (notes + checklist) — the Trello-like card.
   * Optimistically patches whichever list holds the task, then persists.
   */
  const updateTaskDetails = useCallback(
    async (
      taskId: string,
      details: { notes?: string; checklist?: ChecklistItem[] },
    ) => {
      const prevToday = todayData;
      const prevBacklog = backlogData;

      const patch = (t: Task): Task =>
        t.id === taskId
          ? {
              ...t,
              ...(details.notes !== undefined ? { notes: details.notes } : {}),
              ...(details.checklist !== undefined
                ? { checklist: details.checklist }
                : {}),
            }
          : t;

      if (todayData?.tasks.some((t) => t.id === taskId)) {
        mutateToday(
          { ...todayData, tasks: todayData.tasks.map(patch) },
          { revalidate: false },
        );
      }
      if (Array.isArray(backlogData) && backlogData.some((t) => t.id === taskId)) {
        mutateBacklog(backlogData.map(patch), { revalidate: false });
      }

      try {
        await fetch('/api/tasks', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId, details, timezone: tz }),
        });
      } catch (e) {
        console.error('Update task details failed', e);
        if (prevToday) mutateToday(prevToday, { revalidate: false });
        if (prevBacklog) mutateBacklog(prevBacklog, { revalidate: false });
      }
    },
    [todayData, backlogData, mutateToday, mutateBacklog, tz],
  );

  /**
   * Set a task's repeat schedule from the detail card, using the same modes as
   * QuickAdd (none / daily / weekdays / weekly). A single task can only live on
   * one weekday, so daily/weekdays additionally create sibling weekly tasks for
   * the other days (mirroring how QuickAdd creates a repeating task).
   */
  const setTaskRepeat = useCallback(
    async (
      taskId: string,
      mode:
        | 'none'
        | 'daily'
        | 'weekdays'
        | 'weekend'
        | 'weekly'
        | 'monthly'
        | 'custom',
      dayOfWeek?: number,
      endDate?: string | null,
      rule?: import('@/components/ui/quick-add/utils').RepeatRule | null,
    ) => {
      // Optimistically reflect the chosen mode so the picker/chip updates
      // instantly; the server then expands daily/weekdays into siblings.
      const optimisticType = mode === 'none' ? 'regular' : 'weekly';
      if (todayData?.tasks.some((t) => t.id === taskId)) {
        mutateToday(
          {
            ...todayData,
            tasks: todayData.tasks.map((t) =>
              t.id === taskId
                ? ({
                    ...t,
                    repeatMode: mode,
                    type: optimisticType,
                    repeatEndDate:
                      mode === 'none' ? undefined : endDate ?? undefined,
                  } as Task)
                : t,
            ),
            weeklyIds:
              mode === 'none'
                ? (todayData.weeklyIds ?? []).filter((id) => id !== taskId)
                : Array.from(
                    new Set([...(todayData.weeklyIds ?? []), taskId]),
                  ),
          },
          { revalidate: false },
        );
      }

      try {
        await fetch('/api/tasks', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId,
            date: dateStr,
            setRepeat: { mode, dayOfWeek, endDate: endDate ?? null, rule: rule ?? null },
            timezone: tz,
          }),
        });
      } catch (e) {
        console.error('Set repeat failed', e);
      } finally {
        mutateToday();
        if (includeBacklog) mutateBacklog();
      }
    },
    [todayData, mutateToday, mutateBacklog, dateStr, tz, includeBacklog],
  );

  /**
   * Update a task's tags optimistically (and across its repeat group when
   * scope is 'all'), then persist.
   */
  const updateTaskTags = useCallback(
    async (taskId: string, tags: string[], scope: 'one' | 'all' = 'one') => {
      const prevToday = todayData;
      const prevBacklog = backlogData;

      const groupId =
        todayData?.tasks.find((t) => t.id === taskId)?.repeatGroupId ??
        (Array.isArray(backlogData)
          ? backlogData.find((t) => t.id === taskId)?.repeatGroupId
          : undefined);
      const matches = (t: Task) =>
        scope === 'all' && groupId ? t.repeatGroupId === groupId : t.id === taskId;

      if (todayData?.tasks.some(matches)) {
        mutateToday(
          { ...todayData, tasks: todayData.tasks.map((t) => (matches(t) ? { ...t, tags } : t)) },
          { revalidate: false },
        );
      }
      if (Array.isArray(backlogData) && backlogData.some(matches)) {
        mutateBacklog(
          backlogData.map((t) => (matches(t) ? { ...t, tags } : t)),
          { revalidate: false },
        );
      }

      try {
        await fetch('/api/tasks', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId, tags, scope, timezone: tz }),
        });
      } catch (e) {
        console.error('Update tags failed', e);
        if (prevToday) mutateToday(prevToday, { revalidate: false });
        if (prevBacklog) mutateBacklog(prevBacklog, { revalidate: false });
      }
    },
    [todayData, backlogData, mutateToday, mutateBacklog, tz],
  );

  const { data: tagsData, mutate: mutateTags } = useSWR<{
    tags: { id: string; name: string; color: string }[];
  }>(user ? '/api/tags' : null, fetcher, {
    revalidateOnFocus: false,
  });

  const tags = tagsData?.tags || [];

  return {
    tasks,
    backlogTasks,
    pendingToBacklog,
    pendingToToday,
    flyStatus,
    hungerStatus,
    weeklyIds,
    tags,
    isLoading: isLoadingToday || isLoadingBacklog,

    mutateToday,
    mutateBacklog,
    mutateTags,
    toggleTask,
    moveTaskToBacklog,
    moveTaskToToday,
    deleteTask,
    deleteBacklogTask,
    reorderTasks,
    editTask,
    scheduleTask,
    toggleRepeat,
    updateTaskDetails,
    setTaskRepeat,
    updateTaskTags,
    deleteTaskSeries,
    duplicateTask,
  };
}
