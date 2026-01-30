import useSWR, { mutate } from 'swr';
import { useCallback, useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { useSession } from 'next-auth/react';
import { useNotification } from '@/components/providers/NotificationProvider';

// --- Types ---
export interface Task {
    id: string;
    text: string;
    completed: boolean;
    order?: number;
    type?: 'regular' | 'weekly' | 'backlog';
    origin?: 'regular' | 'weekly' | 'backlog';
    kind?: 'regular' | 'weekly' | 'backlog';
    tags?: string[];
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
    dailyGiftCount?: number;
    taskCountAtLastGift?: number;
}

type ExclusionSource = 'today' | 'backlog';

// --- Fetcher ---
const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useTaskData() {
    const { data: session } = useSession();
    const { showNotification } = useNotification();

    const today = new Date();
    const dateStr = format(today, 'yyyy-MM-dd');
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Map<TaskId, SourceList>
    // Tracks where a task should be HIDDEN from until it appears in destination
    const [pendingExclusions, setPendingExclusions] = useState(new Map<string, ExclusionSource>());

    // --- SWR Keys ---
    const todayKey = session ? `/api/tasks?date=${dateStr}&timezone=${encodeURIComponent(tz)}` : null;
    const backlogKey = session ? `/api/tasks?view=board&day=-1` : null;

    // --- Data Fetching ---
    const {
        data: todayData,
        mutate: mutateToday,
        isLoading: isLoadingToday
    } = useSWR<TasksResponse>(todayKey, fetcher, {
        refreshInterval: 0,
        revalidateOnFocus: true,
    });

    const {
        data: backlogData,
        mutate: mutateBacklog,
        isLoading: isLoadingBacklog
    } = useSWR<Task[]>(backlogKey, fetcher, {
        refreshInterval: 0,
        revalidateOnFocus: true,
    });

    // --- Cleanup Effect ---
    // Remove exclusions when task is confirmed gone from source list
    useEffect(() => {
        if (pendingExclusions.size === 0) return;

        setPendingExclusions(prev => {
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
                    const inToday = effectiveToday.some(t => t.id === id);
                    if (!inToday && todayData) {
                        next.delete(id);
                        changed = true;
                    }
                } else if (source === 'backlog') {
                    // If excluded from Backlog, wait until gone from Backlog
                    const inBacklog = effectiveBacklog.some(t => t.id === id);
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
    const tasks = (todayData?.tasks || []).filter(t => pendingExclusions.get(t.id) !== 'today');

    const weeklyIds = new Set(todayData?.weeklyIds || []);
    const flyStatus = todayData?.flyStatus || { balance: 0, earnedToday: 0, limit: 15, limitHit: false };
    const hungerStatus = todayData?.hungerStatus || { hunger: 0, stolenFlies: 0, maxHunger: 0 };
    const dailyGiftCount = todayData?.dailyGiftCount || 0;

    // Filter Backlog: Hide if excluded from 'backlog'
    const backlogTasks = (backlogData || []).filter(t => pendingExclusions.get(t.id) !== 'backlog');

    // --- Helper for Optimistic Updates ---
    const sortTasks = (ts: Task[]) => {
        return [...ts].sort((a, b) => {
            if (!!a.completed !== !!b.completed) {
                return a.completed ? 1 : -1; // Completed items at bottom
            }
            return (a.order ?? 0) - (b.order ?? 0);
        });
    };

    // --- Actions ---

    /**
     * Toggle Task Completion
     */
    const toggleTask = useCallback(async (taskId: string, forceState?: boolean) => {
        if (!todayData) return;

        const task = tasks.find((t) => t.id === taskId);
        if (!task) return;

        const newCompleted = forceState !== undefined ? forceState : !task.completed;

        // 1. Optimistic Update
        const updatedTasks = tasks.map(t =>
            t.id === taskId ? { ...t, completed: newCompleted } : t
        );
        const optimisticallySorted = sortTasks(updatedTasks);

        await mutateToday({
            ...todayData,
            tasks: optimisticallySorted
        }, { revalidate: false });

        // 2. API Call
        try {
            let apiOrder: number | undefined;
            if (newCompleted) {
                const completedTasks = tasks.filter((t) => t.completed && t.id !== taskId);
                const currentTask = tasks.find((t) => t.id === taskId);
                if (currentTask && completedTasks.length > 0) {
                    const minOrder = Math.min(...completedTasks.map((t) => t.order ?? 0));
                    if ((currentTask.order ?? 0) >= minOrder) {
                        apiOrder = minOrder - 1;
                    }
                }
            }

            await fetch('/api/tasks', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date: dateStr,
                    taskId,
                    completed: newCompleted,
                    timezone: tz,
                    order: apiOrder
                }),
            });
            await mutateToday();
        } catch (e) {
            console.error("Toggle failed", e);
            await mutateToday(); // Rollback
        }
    }, [dateStr, tasks, todayData, mutateToday, tz]);

    /**
     * Move Task: Today -> Backlog
     */
    const moveTaskToBacklog = useCallback(async (taskIdOrTask: string | Task) => {
        if (!todayData || !backlogData) return;

        // Normalize input - accept both task ID string or task object
        const taskId = typeof taskIdOrTask === 'string' ? taskIdOrTask : taskIdOrTask.id;
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        // Mark as pending removal from Today
        setPendingExclusions(prev => new Map(prev).set(taskId, 'today'));

        // 1. Optimistic Update 
        // Remove from Today (handled by exclusion, but we enforce it for optimistic cache too)
        const newTodayTasks = tasks.filter(t => t.id !== taskId);
        await mutateToday({ ...todayData, tasks: newTodayTasks }, { revalidate: false });

        // Don't optimistically add to backlog - let revalidation handle it

        // 2. API Call
        try {
            // POST to backlog
            const postRes = await fetch('/api/tasks?view=board', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: task.text,
                    repeat: 'backlog',
                    tags: task.tags,
                }),
            });
            const postJson = await postRes.json();
            const newBacklogId = postJson.ids?.[0];

            // DELETE from today
            await fetch('/api/tasks', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: dateStr, taskId }),
            });

            showNotification("Moved to Saved Tasks", async () => {
                // UNDO Logic
                setPendingExclusions(prev => {
                    const next = new Map(prev);
                    next.delete(taskId); // Show in Today
                    if (newBacklogId) next.set(newBacklogId, 'backlog'); // Hide from Backlog
                    return next;
                });

                // 1. Optimistically restore
                const restoredTask = { ...task };
                await mutateToday(curr => (curr ? { ...curr, tasks: [...curr.tasks, restoredTask] } : curr), { revalidate: false });

                await mutateBacklog(curr => curr ? curr.filter(t => t.id !== (newBacklogId || taskId)) : [], { revalidate: false });

                // 2. API Undo
                const dow = new Date().getDay();
                await fetch('/api/tasks?view=board', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: task.text,
                        days: [dow],
                        repeat: 'this-week',
                        tags: task.tags,
                    }),
                });

                if (newBacklogId) {
                    await fetch('/api/tasks?view=board', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ day: -1, taskId: newBacklogId }),
                    });
                }

                // mutate to sync
                mutateToday();
                mutateBacklog();
            });

            // Final revalidate
            await Promise.all([mutateToday(), mutateBacklog()]);

        } catch (e) {
            console.error("Move to backlog failed", e);
            setPendingExclusions(prev => {
                const next = new Map(prev);
                next.delete(taskId);
                return next;
            });
            mutateToday();
            mutateBacklog();
        }
    }, [todayData, backlogData, tasks, mutateToday, mutateBacklog, dateStr, showNotification]);

    /**
     * Move Task: Backlog -> Today
     */
    const moveTaskToToday = useCallback(async (item: { id: string; text: string; tags?: string[] }) => {
        if (!todayData || !backlogData) return;

        // Mark as pending removal from Backlog
        setPendingExclusions(prev => new Map(prev).set(item.id, 'backlog'));

        // 1. Optimistic Update
        // Remove from Backlog
        const newBacklog = backlogData.filter(t => t.id !== item.id);
        await mutateBacklog(newBacklog, { revalidate: false });

        // Don't optimistically add to today - let revalidation handle it

        // 2. API Call
        try {
            const dow = new Date().getDay();
            // POST to Today
            const postRes = await fetch('/api/tasks?view=board', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: item.text,
                    days: [dow],
                    repeat: 'this-week',
                    tags: item.tags,
                }),
            });
            const postJson = await postRes.json();
            const newTodayId = postJson.ids?.[0];

            // DELETE from Backlog
            await fetch('/api/tasks?view=board', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ day: -1, taskId: item.id }),
            });

            showNotification("Moved to Today", async () => {
                // UNDO Logic
                setPendingExclusions(prev => {
                    const next = new Map(prev);
                    next.delete(item.id); // Show in Backlog
                    if (newTodayId) next.set(newTodayId, 'today'); // Hide from Today
                    return next;
                });

                // Remove from Today
                await mutateToday(curr => curr ? { ...curr, tasks: curr.tasks.filter(t => t.id !== (newTodayId || item.id)) } : curr, { revalidate: false });

                // Restore to Backlog
                await mutateBacklog(curr => curr ? [...curr, { ...item, completed: false } as Task] : [{ ...item, completed: false } as Task], { revalidate: false });

                // API Undo
                await fetch('/api/tasks?view=board', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: item.text,
                        repeat: 'backlog',
                        tags: item.tags,
                    }),
                });
                if (newTodayId) {
                    await fetch('/api/tasks', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ date: dateStr, taskId: newTodayId }),
                    });
                }
                mutateToday();
                mutateBacklog();
            });

            await Promise.all([mutateToday(), mutateBacklog()]);

        } catch (e) {
            console.error("Move to today failed", e);
            setPendingExclusions(prev => {
                const next = new Map(prev);
                next.delete(item.id);
                return next;
            });
            mutateToday();
            mutateBacklog();
        }
    }, [todayData, backlogData, tasks, mutateToday, mutateBacklog, dateStr, showNotification]);

    /**
     * Delete Task (Today)
     */
    const deleteTask = useCallback(async (taskId: string) => {
        setPendingExclusions(prev => new Map(prev).set(taskId, 'today'));

        // Optimistic
        if (todayData) {
            await mutateToday({
                ...todayData,
                tasks: tasks.filter(t => t.id !== taskId)
            }, { revalidate: false });
        }

        await fetch('/api/tasks', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: dateStr, taskId }),
        });

        mutateToday();
    }, [todayData, tasks, mutateToday, dateStr]);

    /**
    * Reorder Tasks (Today)
    */
    const reorderTasks = useCallback(async (newTasks: Task[]) => {
        // Optimistic
        if (todayData) {
            await mutateToday({
                ...todayData,
                tasks: newTasks
            }, { revalidate: false });
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
    }, [todayData, mutateToday]);


    /**
     * Edit Task Text
     */
    const editTask = useCallback(async (taskId: string, newText: string, isBacklog: boolean) => {
        if (isBacklog && backlogData) {
            const updated = backlogData.map(t => t.id === taskId ? { ...t, text: newText } : t);
            await mutateBacklog(updated, { revalidate: false });
        } else if (!isBacklog && todayData) {
            const updated = tasks.map(t => t.id === taskId ? { ...t, text: newText } : t);
            await mutateToday({ ...todayData, tasks: updated }, { revalidate: false });
        }

        await fetch('/api/tasks', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId, text: newText, timezone: tz }),
        });

        if (isBacklog) mutateBacklog();
        else mutateToday();

    }, [backlogData, todayData, tasks, mutateBacklog, mutateToday, tz]);


    return {
        tasks,
        backlogTasks,
        flyStatus,
        hungerStatus,
        dailyGiftCount,
        weeklyIds,
        isLoading: isLoadingToday || isLoadingBacklog,

        mutateToday,
        mutateBacklog,
        toggleTask,
        moveTaskToBacklog,
        moveTaskToToday,
        deleteTask,
        reorderTasks,
        editTask,
    };
}
