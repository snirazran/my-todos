'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { Calendar, History, LayoutDashboard, CalendarCheck, CalendarClock } from 'lucide-react';
import BacklogPanel from '@/components/ui/BacklogPanel';
import { signIn, useSession } from 'next-auth/react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { useUIStore } from '@/lib/uiStore';
import { type FrogHandle } from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import ProgressCard from '@/components/ui/ProgressCard';
import TaskList from '@/components/ui/TaskList';
import QuickAddSheet from '@/components/ui/QuickAddSheet';
import { AddTaskButton } from '@/components/ui/AddTaskButton';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { FrogDisplay } from '@/components/ui/FrogDisplay';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { RewardPopup } from '@/components/ui/gift-box/RewardPopup';
import { HungerWarningModal } from '@/components/ui/HungerWarningModal';
import { mutate } from 'swr';
import { MAX_HUNGER_MS } from '@/lib/hungerLogic';
import {
  useFrogTongue,
  HIT_AT,
  OFFSET_MS,
  TONGUE_MS,
  TONGUE_STROKE,
} from '@/hooks/useFrogTongue';

const FLY_PX = 24;

interface Task {
  id: string;
  text: string;
  completed: boolean;
  order?: number;
  type?: 'regular' | 'weekly' | 'backlog';
  origin?: 'regular' | 'weekly' | 'backlog';
  kind?: 'regular' | 'weekly' | 'backlog';
  tags?: string[];
}

type FlyStatus = {
  balance: number;
  earnedToday: number;
  limit: number;
  limitHit: boolean;
  justHitLimit?: boolean;
};

type HungerStatus = {
  hunger: number;
  stolenFlies: number;
  maxHunger: number;
};

const demoTasks: Task[] = [
  {
    id: 'g6',
    text: 'Check there is no monster under the bed',
    completed: false,
    order: 1,
  },
  { id: 'g1', text: 'Meditation', completed: true, order: 2 },
  { id: 'g2', text: 'Read a book', completed: true, order: 3 },
  { id: 'g3', text: 'Walk 5,000 steps', completed: true, order: 4 },
  { id: 'g4', text: 'Drink 2 liters of water', completed: true, order: 5 },
  { id: 'g5', text: 'Eat a healthy meal', completed: true, order: 6 },
];

// === NEW HELPER: Calculate where the gifts should occur ===
// === NEW HELPER: Calculate where the gifts should occur ===
function getMilestones(totalTasks: number): number[] {
  if (totalTasks < 2) return [];

  // 2-3 tasks -> 1 gift at the end
  if (totalTasks <= 3) {
    return [totalTasks];
  }

  // 4-5 tasks -> 2 gifts: at task 2 and at the end
  if (totalTasks <= 5) {
    return [2, totalTasks];
  }

  // 6+ tasks -> 3 gifts spread out
  const milestones: number[] = [];
  milestones.push(Math.round(totalTasks / 3));
  milestones.push(Math.round((totalTasks * 2) / 3));
  milestones.push(totalTasks);

  return Array.from(new Set(milestones)).sort((a, b) => a - b);
}
export default function Home() {
  const { data: session, status } = useSession();
  const sessionLoading = status === 'loading';
  const router = useRouter();
  const frogRef = useRef<FrogHandle>(null);
  const flyRefs = useRef<Record<string, HTMLElement | null>>({});
  const isInitialLoad = useRef(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const { isWardrobeOpen, setWardrobeOpen } = useUIStore();
  const [guestTasks, setGuestTasks] = useState<Task[]>(demoTasks);
  const [loading, setLoading] = useState(true);
  const [quickText, setQuickText] = useState('');
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddMode, setQuickAddMode] = useState<'pick' | 'later'>('pick');
  const [weeklyIds, setWeeklyIds] = useState<Set<string>>(new Set());
  const [flyStatus, setFlyStatus] = useState<FlyStatus>({
    balance: 0,
    earnedToday: 0,
    limit: 15,
    limitHit: false,
  });
  const [hungerStatus, setHungerStatus] = useState<HungerStatus>({
    hunger: MAX_HUNGER_MS,
    stolenFlies: 0,
    maxHunger: MAX_HUNGER_MS,
  });

  const [dailyGiftCount, setDailyGiftCount] = useState(2);
  const [lastGiftTaskCount, setLastGiftTaskCount] = useState(0);

  const [laterThisWeek, setLaterThisWeek] = useState<
    { id: string; text: string }[]
  >([]);

  const [activeTab, setActiveTab] = useState<'today' | 'backlog'>('today');
  const [isAnimating, setIsAnimating] = useState(false);
  const [showReward, setShowReward] = useState(false);
  const pendingIds = useRef(new Set<string>());
  const pendingDeletionsRef = useRef(new Set<string>());

  const frogBoxRef = useRef<HTMLDivElement | null>(null);
  const {
    vp,
    cinematic,
    grab,
    tip,
    tipVisible,
    tonguePathEl,
    triggerTongue,
    visuallyDone,
  } = useFrogTongue({ frogRef, frogBoxRef, flyRefs });

  const applyFlyStatus = useCallback((incoming?: FlyStatus | null) => {
    if (!incoming) return;
    setFlyStatus(incoming);
  }, []);

  const fetchBacklog = useCallback(async () => {
    if (!session) return;
    try {
      const res = await fetch('/api/tasks?view=board&day=-1');
      if (!res.ok) return;
      const items = await res.json();
      if (!Array.isArray(items)) return;
      
       setLaterThisWeek(
        items
          .filter((t: any) => !pendingDeletionsRef.current.has(t.id))
          .map((t: any) => ({ id: t.id, text: t.text, tags: t.tags }))
      );
    } catch (e) {
      console.error('Failed to fetch backlog:', e);
    }
  }, [session]);

  const today = new Date();
  const dateStr = format(today, 'yyyy-MM-dd');
  const data = session ? tasks : guestTasks;
  const doneCount = data.filter((t) => t.completed).length;
  // Note: We don't rely purely on 'rate' anymore for triggering, but we keep it for the progress bar
  const rate = data.length > 0 ? (doneCount / data.length) * 100 : 0;
  const flyBalance = session ? flyStatus.balance : 5;

  // === UPDATED TRIGGER LOGIC ===
  useEffect(() => {
    // 1. SAFETY LOCK: Don't do anything while loading
    if (loading) return;

    // 2. SAFETY LOCK: If this is the very first time data loaded,
    // simply "acknowledge" the current state but DO NOT trigger the popup.
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }

    // 1. Calculate milestones
    const milestones = getMilestones(data.length);

    // 2. Determine target
    const nextMilestoneTarget = milestones[dailyGiftCount];

    // 3. Trigger Condition
    if (
      data.length > 0 &&
      !showReward &&
      dailyGiftCount < 3 &&
      nextMilestoneTarget !== undefined &&
      doneCount >= nextMilestoneTarget
    ) {
      setShowReward(true);
    }
    // IMPORTANT: Add 'loading' to the dependency array
  }, [doneCount, data.length, dailyGiftCount, showReward, loading]);

  const refreshToday = useCallback(async () => {
    if (!session) return;
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch(`/api/tasks?date=${dateStr}&timezone=${encodeURIComponent(tz)}`);
      if (!res.ok) {
        console.error('Failed to fetch tasks:', res.status, res.statusText);
        return;
      }
      const json = await res.json();
      setTasks((json.tasks ?? []).filter((t: Task) => !pendingDeletionsRef.current.has(t.id)));
      setWeeklyIds(new Set(json.weeklyIds ?? []));
      applyFlyStatus(json.flyStatus);
      if (json.hungerStatus) setHungerStatus(json.hungerStatus);

      setDailyGiftCount(json.dailyGiftCount || 0);
      setLastGiftTaskCount(json.taskCountAtLastGift || 0);
    } catch (e) {
      console.error('Error in refreshToday:', e);
    }
  }, [session, dateStr, applyFlyStatus]);

  useEffect(() => {
    fetchBacklog();
  }, [fetchBacklog]);

  useEffect(() => {
    if (!session) {
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const res = await fetch(`/api/tasks?date=${dateStr}&timezone=${encodeURIComponent(tz)}`);
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        const json = await res.json();
        setTasks(json.tasks ?? []);
        setWeeklyIds(new Set(json.weeklyIds ?? []));
        applyFlyStatus(json.flyStatus);
        if (json.hungerStatus) setHungerStatus(json.hungerStatus);

        setDailyGiftCount(json.dailyGiftCount || 0);
        setLastGiftTaskCount(json.taskCountAtLastGift || 0);
      } catch (e) {
        console.error('Initial load failed:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [session, dateStr, applyFlyStatus]);

  useEffect(() => {
    if (!cinematic) return;
    const stop = (e: Event) => e.preventDefault();
    window.addEventListener('wheel', stop, { passive: false });
    window.addEventListener('touchmove', stop, { passive: false });
    return () => {
      window.removeEventListener('wheel', stop as any);
      window.removeEventListener('touchmove', stop as any);
    };
  }, [cinematic]);

  // Listen for global tag updates
  useEffect(() => {
    const handleTagsUpdated = () => {
      refreshToday();
      fetchBacklog();
    };
    window.addEventListener('tags-updated', handleTagsUpdated);
    return () => window.removeEventListener('tags-updated', handleTagsUpdated);
  }, [refreshToday, fetchBacklog]);

  const sortTasks = (ts: Task[]) => {
    return [...ts].sort((a, b) => {
      if (!!a.completed !== !!b.completed) {
        return a.completed ? 1 : -1;
      }
      return (a.order ?? 0) - (b.order ?? 0);
    });
  };

  const persistTask = async (taskId: string, completed: boolean) => {
    if (session) {
      let apiOrder: number | undefined;

      if (completed) {
        // Calculate new order to ensure task stays above existing completed tasks
        const completedTasks = tasks.filter((t) => t.completed && t.id !== taskId);
        const currentTask = tasks.find((t) => t.id === taskId);
        
        let newOrder = currentTask?.order;
        if (currentTask && completedTasks.length > 0) {
           const minOrder = Math.min(...completedTasks.map((t) => t.order ?? 0));
           // If current order puts it below the top completed task, bump it up
           if ((currentTask.order ?? 0) >= minOrder) {
              newOrder = minOrder - 1;
           }
        }
        apiOrder = newOrder;

        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, completed, order: newOrder } : t))
        );

        setIsAnimating(true);
        setTimeout(() => {
          setTasks((prev) => sortTasks(prev));
          setTimeout(() => setIsAnimating(false), 50);
        }, 350);
      } else {
        // Optimistically move to bottom
        setTasks((prev) => {
          const maxOrder = Math.max(0, ...prev.map((t) => t.order ?? 0));
          const updated = prev.map((t) =>
            t.id === taskId ? { ...t, completed, order: maxOrder + 1 } : t
          );
          return sortTasks(updated);
        });
      }

      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateStr, taskId, completed, timezone: tz, order: apiOrder }),
      });
      if (res.ok) {
        try {
          const body = await res.json();
          applyFlyStatus(body?.flyStatus);
          if (body?.hungerStatus) setHungerStatus(body.hungerStatus);
        } catch (e) {
           console.error('Failed to parse PUT response', e);
        }
      }
    } else {
      setGuestTasks((prev) => {
        const toggled = prev.map((t) =>
          t.id === taskId ? { ...t, completed } : t
        );
        if (completed) {
          return toggled;
        }
        return sortTasks(toggled);
      });

      if (completed) {
        setIsAnimating(true);
        setTimeout(() => {
          setGuestTasks((prev) => sortTasks(prev));
          setTimeout(() => setIsAnimating(false), 400);
        }, 250);
      }
    }
  };

  const { indices } = useWardrobeIndices(!!session);

  const handleToggle = async (taskId: string, explicitCompleted?: boolean) => {
    if (cinematic || grab || isAnimating) return;
    const task = data.find((t) => t.id === taskId);
    if (!task) return;
    const completed =
      explicitCompleted !== undefined ? explicitCompleted : !task.completed;
    if (!completed) {
      persistTask(taskId, false);
      return;
    }
    await triggerTongue({
      key: taskId,
      completed,
      onPersist: () => persistTask(taskId, true),
    });
  };

  const handleEditTask = async (taskId: string, newText: string) => {
    // Optimistic Update
    setTasks((prev) =>
       prev.map((t) => (t.id === taskId ? { ...t, text: newText } : t))
    );
    // Also update backlog optimistically if needed (though usually separate)
    setLaterThisWeek((prev) => 
       prev.map((t) => (t.id === taskId ? { ...t, text: newText } : t))
    );

    if (session) {
        try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            await fetch('/api/tasks', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId, text: newText, timezone: tz }),
            });
        } catch (e) {
            console.error("Failed to edit task", e);
            // Revert? For now, we assume success or user refresh.
        }
    } else {
        setGuestTasks((prev) =>
             prev.map((t) => (t.id === taskId ? { ...t, text: newText } : t))
        );
    }
  };

  if (sessionLoading || (session && loading)) {
    return <LoadingScreen message="Loading your day..." />;
  }

  return (
    <main className="min-h-screen pb-24 md:pb-12 bg-background">
      <div className="px-4 py-6 mx-auto max-w-7xl md:px-8">
        <Header session={session} router={router} />

        <div className="relative grid items-start grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-8">
          <div className="z-10 flex flex-col gap-4 lg:col-span-4 lg:sticky lg:top-8 lg:gap-6">
            <FrogDisplay
              frogRef={frogRef}
              frogBoxRef={frogBoxRef}
              mouthOpen={!!grab}
              mouthOffset={{ y: -4 }}
              indices={indices}
              openWardrobe={isWardrobeOpen}
              onOpenChange={setWardrobeOpen}
              flyBalance={flyBalance}
              rate={rate}
              done={doneCount}
              total={data.length}
              giftsClaimed={dailyGiftCount}
              isCatching={cinematic}
              hunger={hungerStatus.hunger}
              maxHunger={hungerStatus.maxHunger}
            />
            <div className="w-full">
              <ProgressCard
                rate={rate}
                done={doneCount}
                total={data.length}
                giftsClaimed={dailyGiftCount}
                onAddRequested={() => {
                  setQuickText('');
                  // Context-aware add: if backlog tab is active, default to 'later' mode
                  setQuickAddMode(activeTab === 'backlog' ? 'later' : 'pick');
                  setShowQuickAdd(true);
                }}
              />
            </div>
          </div>

          <div
            className="flex flex-col gap-4 lg:col-span-8 lg:gap-6"
            style={{ pointerEvents: cinematic ? 'none' : 'auto' }}
          >
            <div className="flex self-start w-full p-1 rounded-[20px] bg-card/80 backdrop-blur-2xl border border-border/50 shadow-sm md:w-auto">
              <button
                onClick={() => setActiveTab('today')}
                className={`
        flex-1 md:flex-none justify-center relative px-6 py-2 text-sm font-bold rounded-xl transition-all flex items-center gap-2
        ${
          activeTab === 'today'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }
      `}
              >
                <CalendarCheck className={`w-4 h-4 ${activeTab === 'today' ? 'text-primary' : 'text-muted-foreground'}`} />
                Today
                {data.length > 0 && (
                  <TaskCounter count={data.length} />
                )}
              </button>
              <button
                onClick={() => setActiveTab('backlog')}
                className={`
        flex-1 md:flex-none justify-center relative px-6 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2
        ${
          activeTab === 'backlog'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }
      `}
              >
                <CalendarClock className={`w-4 h-4 ${activeTab === 'backlog' ? 'text-primary' : 'text-muted-foreground'}`} />
                Saved Tasks
                {laterThisWeek.length > 0 && (
                  <TaskCounter count={laterThisWeek.length} />
                )}
              </button>
            </div>

            <div className="min-h-[400px] pb-20">
              {activeTab === 'today' ? (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.2 }}
                >
                  {!session && (
                    <div className="flex items-center gap-3 p-3 mb-4 border border-indigo-100 rounded-xl bg-indigo-50/50 dark:bg-indigo-900/20 dark:border-indigo-800/50">
                       <div className="flex items-center justify-center w-8 h-8 bg-white rounded-full shadow-sm dark:bg-slate-800 text-xl animate-bounce">
                         🍽️
                       </div>
                       <div>
                         <p className="text-sm font-bold text-indigo-900 dark:text-indigo-200">
                           The Frog is Hungry!
                         </p>
                         <p className="text-xs text-indigo-700 dark:text-indigo-400">
                           Catch a fly to make her happy and unlock a special <span className="font-bold">Gift</span>!
                         </p>
                       </div>
                    </div>
                  )}
                  <TaskList
                    tasks={data}
                    toggle={handleToggle}
                    showConfetti={rate === 100}
                    visuallyCompleted={visuallyDone}
                    renderBullet={(task, isVisuallyDone) =>
                      task.completed || isVisuallyDone ? null : (
                        <Fly
                          ref={(el) => {
                            flyRefs.current[task.id] = el;
                          }}
                          onClick={() => null}
                          size={28}
                          y={-4}
                          x={-2}
                        />
                      )
                    }
                    onAddRequested={(prefill) => {
                      setQuickText(prefill || '');
                      setQuickAddMode('pick');
                      setShowQuickAdd(true);
                    }}
                    weeklyIds={weeklyIds}
                    onDeleteToday={async (taskId) => {
                      await fetch('/api/tasks', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ date: dateStr, taskId }),
                      });
                      await refreshToday();
                    }}
                    onDeleteFromWeek={async (taskId) => {
                      const dow = new Date().getDay();
                      await fetch('/api/tasks?view=board', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ day: dow, taskId }),
                      });
                      await fetch('/api/tasks', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ date: dateStr, taskId }),
                      });
                      await refreshToday();
                    }}
                    onDoLater={async (taskId) => {
                      const task = tasks.find((t) => t.id === taskId);
                      if (!task) return;

                      // --- Optimistic Update ---
                      // 0. Track pending deletion to prevent ghosting
                      pendingDeletionsRef.current.add(taskId);

                      // 1. Remove from today
                      setTasks((prev) => prev.filter((t) => t.id !== taskId));
                      
                      // 2. Add to backlog (laterThisWeek)
                      setLaterThisWeek((prev) => [
                          ...prev,
                          { id: task.id, text: task.text, tags: task.tags }
                      ]);

                      // API calls to transfer task
                      try {
                          await Promise.all([
                            fetch('/api/tasks?view=board', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                text: task.text,
                                repeat: 'backlog',
                                tags: task.tags,
                              }),
                            }),
                            fetch('/api/tasks', {
                              method: 'DELETE',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ date: dateStr, taskId }),
                            }),
                          ]);
                      } catch (e) {
                          console.error("Failed to move to later", e);
                          pendingDeletionsRef.current.delete(taskId);
                      }
                      
                      // Refresh to show updated state (sync with server)
                      // Delayed to prevent "ghost" task from reappearing if DB is slow
                      setTimeout(async () => {
                          try {
                              await Promise.all([refreshToday(), fetchBacklog()]);
                          } finally {
                              // Clear pending deletion after we're reasonably sure sync is done
                              // or just keep it until next hard refresh? 
                              // Clearing it here is safer if the user moves it back again.
                              pendingDeletionsRef.current.delete(taskId);
                          }
                      }, 800);
                    }}
                    onReorder={async (newTasks) => {
                      setTasks(newTasks);
                      if (session) {
                        const dow = new Date().getDay();
                        await fetch('/api/tasks?view=board', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            day: dow,
                            tasks: newTasks.map((t) => ({ id: t.id })),
                          }),
                        });
                      }
                    }}
                    onToggleRepeat={async (taskId) => {
                      const task = tasks.find((t) => t.id === taskId);
                      if (!task) return;

                      const isWeekly =
                        task.type === 'weekly' || weeklyIds.has(taskId);
                      const newType = isWeekly ? 'regular' : 'weekly';

                      // Optimistic update
                      setTasks((prev) =>
                        prev.map((t) =>
                          t.id === taskId ? { ...t, type: newType } : t
                        )
                      );
                      setWeeklyIds((prev) => {
                        const next = new Set(prev);
                        if (newType === 'weekly') next.add(taskId);
                        else next.delete(taskId);
                        return next;
                      });

                      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
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
                      
                      refreshToday();
                    }}
                    onEditTask={handleEditTask}
                  />
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {session ? (
                    <BacklogPanel
                      later={laterThisWeek}
                      onRefreshToday={refreshToday}
                      onRefreshBacklog={fetchBacklog}
                      onMoveToToday={async (item) => {
                        // --- Optimistic Update ---
                        // 0. Track pending deletion
                        pendingDeletionsRef.current.add(item.id);

                        // 1. Remove from backlog
                        setLaterThisWeek((prev) => prev.filter((t) => t.id !== item.id));

                        // 2. Add to today
                        setTasks((prev) => [
                            ...prev,
                            { 
                                id: item.id, 
                                text: item.text, 
                                completed: false, 
                                type: 'regular',
                                tags: item.tags 
                            }
                        ]);

                        const dow = new Date().getDay();

                        // API Calls to transfer task
                        try {
                            await Promise.all([
                              fetch('/api/tasks?view=board', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  text: item.text,
                                  days: [dow],
                                  repeat: 'this-week',
                                  tags: item.tags,
                                }),
                              }),
                              fetch('/api/tasks?view=board', {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ day: -1, taskId: item.id }),
                              }),
                            ]);
                        } catch (e) {
                            console.error("Failed to move to today", e);
                            pendingDeletionsRef.current.delete(item.id);
                        }
                        
                        // Refresh to show updated state and get real IDs if changed
                        // Delayed to prevent "ghost" task from reappearing
                        setTimeout(async () => {
                             try {
                                await Promise.all([refreshToday(), fetchBacklog()]);
                             } finally {
                                pendingDeletionsRef.current.delete(item.id);
                             }
                        }, 800);
                      }}
                      onAddRequested={() => {
                        setQuickText('');
                        setQuickAddMode('later');
                        setShowQuickAdd(true);
                      }}
                      onEditTask={handleEditTask}
                    />
                  ) : (
                    <div className="p-8 text-center text-muted-foreground bg-card/50 rounded-2xl">
                      Sign in to use the Backlog feature!
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SVG Tongue Overlay */}
      {grab && (
        <svg
          key={grab.startAt}
          className="fixed inset-0 z-40 pointer-events-none"
          width={vp.w}
          height={vp.h}
          viewBox={`0 0 ${vp.w} ${vp.h}`}
          preserveAspectRatio="none"
          style={{ width: vp.w, height: vp.h }}
        >
          <defs>
            <linearGradient id="tongue-grad" x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="#ff6b6b" />
              <stop offset="1" stopColor="#f43f5e" />
            </linearGradient>
          </defs>

          <motion.path
            key={`tongue-${grab.startAt}`}
            ref={tonguePathEl}
            d="M0 0 L0 0"
            fill="none"
            stroke="url(#tongue-grad)"
            strokeWidth={TONGUE_STROKE}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: [0, 1, 0] }}
            transition={{
              delay: OFFSET_MS / 1000,
              duration: TONGUE_MS / 1000,
              times: [0, HIT_AT, 1],
              ease: 'linear',
            }}
          />

          {tipVisible && tip && (
            <g transform={`translate(${tip.x}, ${tip.y})`}>
              <circle r={10} fill="transparent" />
              <image
                href="/fly.svg"
                x={-FLY_PX / 2}
                y={-FLY_PX / 2}
                width={FLY_PX}
                height={FLY_PX}
              />
            </g>
          )}
        </svg>
      )}

      <QuickAddSheet
        open={showQuickAdd}
        onOpenChange={setShowQuickAdd}
        initialText={quickText}
        defaultRepeat="this-week"
        defaultMode={quickAddMode}
        onSubmit={async ({ text, days, repeat, tags }) => {
          try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            await fetch('/api/tasks?view=board', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text, days, repeat, tags, timezone: tz }),
            });
            if (session) {
              const res = await fetch(`/api/tasks?date=${dateStr}&timezone=${encodeURIComponent(tz)}`);
              if (!res.ok) return;
              const json = await res.json();
              
              setTasks(json.tasks ?? []);
              setWeeklyIds(new Set(json.weeklyIds ?? []));
              applyFlyStatus(json.flyStatus);
              if (json.hungerStatus) setHungerStatus(json.hungerStatus);

              setDailyGiftCount(json.dailyGiftCount || 0);
              setLastGiftTaskCount(json.taskCountAtLastGift || 0);
            } else {
              setGuestTasks((prev) => [
                ...prev,
                { id: crypto.randomUUID(), text, completed: false, tags },
              ]);
            }
            fetchBacklog();
          } catch (e) {
            console.error('Failed to add task or refresh state:', e);
          }
        }}
      />

      <RewardPopup
        show={showReward}
        onClose={(claimed) => {
          setShowReward(false);
          if (claimed) {
            setDailyGiftCount((prev) => prev + 1);
            mutate('/api/skins/inventory');
          }
          refreshToday();
        }}
        dailyGiftCount={dailyGiftCount}
      />
      
      <HungerWarningModal 
        open={!!session && hungerStatus.stolenFlies > 0} 
        stolenFlies={hungerStatus.stolenFlies}
        indices={indices}
        onAcknowledge={async () => {
           // Optimistic clear
           setHungerStatus(prev => ({ ...prev, stolenFlies: 0 }));
           await fetch('/api/hunger/acknowledge', { method: 'POST' });
        }}
      />

      {/* Floating Add Task Button - Home Page Version */}
      <div className="fixed bottom-0 left-0 right-0 z-[40] px-6 pb-[calc(env(safe-area-inset-bottom)+88px)] md:pb-[calc(env(safe-area-inset-bottom)+24px)] pointer-events-none">
        <div className="pointer-events-auto mx-auto w-full max-w-[420px] flex justify-center">
          <AddTaskButton
            onClick={() => {
              setQuickText('');
              setQuickAddMode(activeTab === 'backlog' ? 'later' : 'pick');
              setShowQuickAdd(true);
            }}
            label="Add a task"
          />
        </div>
      </div>
    </main>
  );
}

// Compact Header
function Header({ session, router }: { session: any; router: any }) {
  return (
    <div className="flex flex-col gap-4 mb-2 md:mb-6 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-5xl">
          {format(new Date(), 'EEEE')}
        </h1>
        <p className="flex items-center gap-2 font-medium text-md md:text-lg text-muted-foreground">
          <Calendar className="w-4 h-4 md:w-5 md:h-5" />
          {format(new Date(), 'MMMM d, yyyy')}
        </p>
      </div>

      <div className="self-start hidden gap-3 md:flex md:self-auto">
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Link
            href="/history"
            className="group flex items-center gap-2.5 px-5 py-2.5 text-sm font-bold transition-all bg-card/80 backdrop-blur-xl rounded-2xl border border-border/50 shadow-sm text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-card active:shadow-inner"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
              <History className="w-4 h-4" strokeWidth={2.5} />
            </div>
            <span>History</span>
          </Link>
        </motion.div>

        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <button
            onClick={() =>
              session ? router.push('/manage-tasks') : router.push('/login')
            }
            className="group flex items-center gap-2.5 px-5 py-2.5 text-sm font-bold transition-all bg-card/80 backdrop-blur-xl rounded-2xl border border-border/50 shadow-sm text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-card active:shadow-inner"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
              <LayoutDashboard className="w-4 h-4" strokeWidth={2.5} />
            </div>
            <span>Weekly Tasks</span>
          </button>
        </motion.div>
      </div>
    </div>
  );
}

// Helper component for add-only animation
function TaskCounter({ count }: { count: number }) {
  const controls = useAnimation();
  const prevCount = React.useRef(count);

  React.useEffect(() => {
    if (count > prevCount.current) {
      // Only animate if count INCREASED
      controls.start({
        scale: [1, 1.5, 1],
        transition: { 
          duration: 0.5,
          ease: [0.34, 1.56, 0.64, 1], // Bouncy spring
        }
      });
    }
    prevCount.current = count;
  }, [count, controls]);

  return (
    <motion.span
      animate={controls}
      className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-secondary px-1.5 text-[11px] font-black text-muted-foreground shadow-sm"
    >
      {count}
    </motion.span>
  );
}
