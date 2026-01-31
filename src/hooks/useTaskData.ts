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

// --- Helper for Optimistic Updates ---
const sortTasks = (ts: Task[]) => {
    return [...ts].sort((a, b) => {
        if (!!a.completed !== !!b.completed) {
            return a.completed ? 1 : -1; // Completed items at bottom
        }
        return (a.order ?? 0) - (b.order ?? 0);
    });
};

export function useTaskData() {
    const { data: session } = useSession();
    const { showNotification } = useNotification();

    const today = new Date();
    const dateStr = format(today, 'yyyy-MM-dd');
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Map<TaskId, SourceList>
    // Tracks where a task should be HIDDEN from until it appears in destination
    const [pendingExclusions, setPendingExclusions] = useState(new Map<string, ExclusionSource>());

    // Track pending moves for loading indicators (count only)
    const [pendingToBacklog, setPendingToBacklog] = useState(0);
    const [pendingToToday, setPendingToToday] = useState(0);

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
        revalidateOnFocus: false,
    });

    const {
        data: backlogData,
        mutate: mutateBacklog,
        isLoading: isLoadingBacklog
    } = useSWR<Task[]>(backlogKey, fetcher, {
        refreshInterval: 0,
        revalidateOnFocus: false,
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

    // --- Actions ---

    /**
     * Toggle Task Completion
     */
    const toggleTask = useCallback(async (taskId: string, forceState?: boolean) => {

        if (!todayData || !backlogData) return;
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        const nextCompleted = forceState ?? !task.completed;
        // Skip if no change
        if (nextCompleted === task.completed) return;

        // Snapshot
        const prevToday = todayData;
        const prevBacklog = backlogData;

        // Optimistic Update
        const updatedTasks = tasks.map(t => {
            if (t.id !== taskId) return t;
            return { ...t, completed: nextCompleted };
        });

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
                // Update Fly/Hunger status if returned
                // We use a functional update to ensure we're modifying the LATEST state (which might include the optimistic change)
                if (json.flyStatus || json.hungerStatus) {
                    mutateToday(curr => {
                        if (!curr) return curr;

                        // Check if values actually changed to avoid re-render if identical
                        const flyChanged = JSON.stringify(curr.flyStatus) !== JSON.stringify(json.flyStatus);
                        const hungerChanged = JSON.stringify(curr.hungerStatus) !== JSON.stringify(json.hungerStatus);

                        if (!flyChanged && !hungerChanged) return curr;

                        return {
                            ...curr,
                            flyStatus: json.flyStatus || curr.flyStatus,
                            hungerStatus: json.hungerStatus || curr.hungerStatus
                        };
                    }, { revalidate: false });
                }
            } else {
                throw new Error(json.error || 'Failed to toggle');
            }

        } catch (e) {
            console.error("Toggle failed", e);
            mutateToday(prevToday, { revalidate: false });
        }
    }, [dateStr, tasks, todayData, backlogData, mutateToday, tz, sortTasks]);

    /**
     * Move Task: Today -> Backlog
     */
    const moveTaskToBacklog = useCallback(async (taskIdOrTask: string | Task) => {
        if (!todayData || !backlogData) return;
        const taskId = typeof taskIdOrTask === 'string' ? taskIdOrTask : taskIdOrTask.id;
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        // Snapshot for rollback
        const prevToday = todayData;
        const prevBacklog = backlogData;

        // 1. Manual Optimistic Update (No Revalidate)
        // Remove from Today
        mutateToday({
            ...todayData,
            tasks: todayData.tasks.filter(t => t.id !== taskId)
        }, { revalidate: false });

        // Add to Backlog (Append)
        mutateBacklog([
            ...backlogData,
            { ...task, type: 'backlog', origin: 'regular', order: 9999 } // provisional order
        ], { revalidate: false });

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

            showNotification("Moved to Saved Tasks", async () => {
                // UNDO Logic: Reverse Manual Update

                // Re-add to Today
                mutateToday(curr => curr ? ({
                    ...curr,
                    tasks: sortTasks([...curr.tasks, task]) // approximate sort
                }) : curr, { revalidate: false });

                // Remove from Backlog
                mutateBacklog(curr => (curr || []).filter(t => t.id !== taskId), { revalidate: false });

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
            console.error("Move to backlog failed", e);
            // Rollback
            mutateToday(prevToday, { revalidate: false });
            mutateBacklog(prevBacklog, { revalidate: false });
        }
    }, [todayData, backlogData, tasks, mutateToday, mutateBacklog, dateStr, showNotification, tz, sortTasks]);

    /**
     * Move Task: Backlog -> Today
     */
    const moveTaskToToday = useCallback(async (item: { id: string; text: string; tags?: string[] }) => {
        if (!todayData || !backlogData) return;

        // Snapshot
        const prevToday = todayData;
        const prevBacklog = backlogData;

        // 1. Manual Optimistic Update (No Revalidate)
        // Remove from Backlog
        mutateBacklog(backlogData.filter(t => t.id !== item.id), { revalidate: false });

        // Add to Today
        mutateToday({
            ...todayData,
            tasks: [...todayData.tasks, {
                ...item,
                id: item.id,
                completed: false,
                type: 'regular',
                order: 9999
            } as Task]
        }, { revalidate: false });

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

            showNotification("Moved to Today", async () => {
                // UNDO Logic: Reverse Manual Update
                // Remove from Today
                mutateToday(curr => curr ? ({
                    ...curr,
                    tasks: curr.tasks.filter(t => t.id !== item.id)
                }) : curr, { revalidate: false });

                // Add back to Backlog
                mutateBacklog(curr => [...(curr || []), { ...item, id: item.id, completed: false, type: 'backlog' } as Task], { revalidate: false });

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
            console.error("Move to today failed", e);
            // Rollback
            mutateToday(prevToday, { revalidate: false });
            mutateBacklog(prevBacklog, { revalidate: false });
        }
    }, [todayData, backlogData, tasks, mutateToday, mutateBacklog, dateStr, showNotification, tz]);

    /**
     * Delete Task (Today)
     */
    /**
     * Delete Task (Today)
     */
    const deleteTask = useCallback(async (taskId: string) => {
        setPendingExclusions(prev => new Map(prev).set(taskId, 'today'));
        const prevToday = todayData;

        // Optimistic
        if (todayData) {
            mutateToday({
                ...todayData,
                tasks: tasks.filter(t => t.id !== taskId)
            }, { revalidate: false });
        }

        try {
            await fetch('/api/tasks', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: dateStr, taskId }),
            });
        } catch (e) {
            console.error("Delete failed", e);
            // Rollback
            if (prevToday) mutateToday(prevToday, { revalidate: false });
            setPendingExclusions(prev => {
                const next = new Map(prev);
                next.delete(taskId);
                return next;
            });
        }
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
    /**
     * Toggle Repeat (Weekly <-> Regular)
     */
    const toggleRepeat = useCallback(async (taskId: string) => {
        if (!todayData) return;
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        const prevToday = todayData;

        // Optimistic
        const isWeekly = task.type === 'weekly' || (todayData.weeklyIds || []).includes(taskId);
        const newType: 'regular' | 'weekly' = isWeekly ? 'regular' : 'weekly';

        const updatedTasks = tasks.map(t => t.id === taskId ? { ...t, type: newType } as Task : t);

        let newWeeklyIds = todayData.weeklyIds || [];
        if (newType === 'weekly') {
            if (!newWeeklyIds.includes(taskId)) newWeeklyIds = [...newWeeklyIds, taskId];
        } else {
            newWeeklyIds = newWeeklyIds.filter(id => id !== taskId);
        }

        mutateToday({
            ...todayData,
            tasks: updatedTasks,
            weeklyIds: newWeeklyIds
        }, { revalidate: false });

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
            console.error("Toggle repeat failed", e);
            mutateToday(prevToday, { revalidate: false });
        }
    }, [todayData, tasks, mutateToday, dateStr, tz]);

    /**
     * Edit Task Text
     */
    const editTask = useCallback(async (taskId: string, newText: string, isBacklog: boolean) => {
        const prevToday = todayData;
        const prevBacklog = backlogData;

        // Optimistic Update
        if (isBacklog && backlogData) {
            const updated = backlogData.map(t => t.id === taskId ? { ...t, text: newText } : t);
            mutateBacklog(updated, { revalidate: false });
        } else if (!isBacklog && todayData) {
            const updated = tasks.map(t => t.id === taskId ? { ...t, text: newText } : t);
            mutateToday({ ...todayData, tasks: updated }, { revalidate: false });
        }

        try {
            await fetch('/api/tasks', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId, text: newText, timezone: tz }),
            });
        } catch (e) {
            console.error("Edit failed", e);
            // Rollback
            if (isBacklog && prevBacklog) mutateBacklog(prevBacklog, { revalidate: false });
            else if (!isBacklog && prevToday) mutateToday(prevToday, { revalidate: false });
        }
    }, [backlogData, todayData, tasks, mutateBacklog, mutateToday, tz]);


    const {
        data: tagsData,
        mutate: mutateTags
    } = useSWR<{ tags: { id: string; name: string; color: string }[] }>('/api/tags', fetcher, {
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
        dailyGiftCount,
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
        reorderTasks,
        editTask,
        toggleRepeat,
    };
}
