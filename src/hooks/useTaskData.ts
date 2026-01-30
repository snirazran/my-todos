import useSWR, { mutate } from 'swr';
import { useCallback, useState, useRef } from 'react';
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

// --- Fetcher ---
const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useTaskData() {
    const { data: session } = useSession();
    const { showNotification } = useNotification();

    const today = new Date();
    const dateStr = format(today, 'yyyy-MM-dd');
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const pendingOperations = useRef(new Set<string>());

    // --- SWR Keys ---
    const todayKey = session ? `/api/tasks?date=${dateStr}&timezone=${encodeURIComponent(tz)}` : null;
    const backlogKey = session ? `/api/tasks?view=board&day=-1` : null;

    // --- Data Fetching ---
    const {
        data: todayData,
        mutate: mutateToday,
        isLoading: isLoadingToday
    } = useSWR<TasksResponse>(todayKey, fetcher, {
        refreshInterval: 0, // Disable auto-refresh to prevent flickering unless needed
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

    // --- Derived State ---
    const tasks = (todayData?.tasks || []).filter(t => !pendingOperations.current.has(t.id));
    const weeklyIds = new Set(todayData?.weeklyIds || []);
    const flyStatus = todayData?.flyStatus || { balance: 0, earnedToday: 0, limit: 15, limitHit: false };
    const hungerStatus = todayData?.hungerStatus || { hunger: 0, stolenFlies: 0, maxHunger: 0 };
    const dailyGiftCount = todayData?.dailyGiftCount || 0;

    const backlogTasks = (backlogData || []).filter(t => !pendingOperations.current.has(t.id));

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
            // We assume successful toggle means state is settled.
        } catch (e) {
            console.error("Toggle failed", e);
            await mutateToday(); // Rollback
        }
    }, [dateStr, tasks, todayData, mutateToday, tz]);

    /**
     * Move Task: Today -> Backlog
     */
    const moveTaskToBacklog = useCallback(async (taskId: string) => {
        if (!todayData || !backlogData) return;
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        pendingOperations.current.add(taskId);

        // 1. Optimistic Update
        // Remove from Today
        const newTodayTasks = tasks.filter(t => t.id !== taskId);
        await mutateToday({ ...todayData, tasks: newTodayTasks }, { revalidate: false });

        // Add to Backlog
        const newBacklogItem = { id: task.id, text: task.text, tags: task.tags, completed: false } as Task;
        await mutateBacklog([...backlogData, newBacklogItem], { revalidate: false });

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

            pendingOperations.current.delete(taskId);

            showNotification("Moved to Saved Tasks", async () => {
                // UNDO Logic
                pendingOperations.current.delete(taskId);
                if (newBacklogId) pendingOperations.current.add(newBacklogId);

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

                if (newBacklogId) pendingOperations.current.delete(newBacklogId);

                // Final sync
                mutateToday();
                mutateBacklog();
            });

            // Final revalidate to ensure IDs are correct
            await Promise.all([mutateToday(), mutateBacklog()]);

        } catch (e) {
            console.error("Move to backlog failed", e);
            pendingOperations.current.delete(taskId);
            mutateToday();
            mutateBacklog();
        }
    }, [todayData, backlogData, tasks, mutateToday, mutateBacklog, dateStr, showNotification]);

    /**
     * Move Task: Backlog -> Today
     */
    const moveTaskToToday = useCallback(async (item: { id: string; text: string; tags?: string[] }) => {
        if (!todayData || !backlogData) return;

        pendingOperations.current.add(item.id);

        // 1. Optimistic Update
        // Remove from Backlog
        const newBacklog = backlogData.filter(t => t.id !== item.id);
        await mutateBacklog(newBacklog, { revalidate: false });

        // Add to Today
        const newTask = {
            ...item,
            completed: false,
            order: tasks.length + 1
        } as Task;
        await mutateToday({ ...todayData, tasks: [...tasks, newTask] }, { revalidate: false });

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

            pendingOperations.current.delete(item.id);

            showNotification("Moved to Today", async () => {
                // UNDO Logic
                if (newTodayId) pendingOperations.current.add(newTodayId);

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
                    if (newTodayId) pendingOperations.current.delete(newTodayId);
                }
                mutateToday();
                mutateBacklog();
            });

            await Promise.all([mutateToday(), mutateBacklog()]);

        } catch (e) {
            console.error("Move to today failed", e);
            pendingOperations.current.delete(item.id);
            mutateToday();
            mutateBacklog();
        }
    }, [todayData, backlogData, tasks, mutateToday, mutateBacklog, dateStr, showNotification]);

    /**
     * Delete Task (Today)
     */
    const deleteTask = useCallback(async (taskId: string) => {
        pendingOperations.current.add(taskId);

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

        pendingOperations.current.delete(taskId);
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
