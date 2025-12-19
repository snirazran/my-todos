'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { Calendar, History, LayoutDashboard } from 'lucide-react';
import BacklogPanel from '@/components/ui/BacklogPanel';
import { signIn, useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { mutate } from 'swr';
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

const demoTasks: Task[] = [
  { id: 'g1', text: 'Meditation', completed: true, order: 1 },
  { id: 'g2', text: 'Read a book', completed: true, order: 2 },
  { id: 'g3', text: 'Walk 5,000 steps', completed: true, order: 3 },
  { id: 'g4', text: 'Drink 2 liters of water', completed: true, order: 4 },
  {
    id: 'g5',
    text: 'Check there is no monster under the bed',
    completed: false,
    order: 5,
  },
];

// === NEW HELPER: Calculate where the gifts should occur ===
// === NEW HELPER: Calculate where the gifts should occur ===
function getMilestones(totalTasks: number): number[] {
  if (totalTasks === 0) return [];

  // 1-3 tasks -> 1 gift at the end
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
  const [weeklyIds, setWeeklyIds] = useState<Set<string>>(new Set());
  const [flyStatus, setFlyStatus] = useState<FlyStatus>({
    balance: 0,
    earnedToday: 0,
    limit: 15,
    limitHit: false,
  });

  const [dailyGiftCount, setDailyGiftCount] = useState(0);
  const [lastGiftTaskCount, setLastGiftTaskCount] = useState(0);

  const [laterThisWeek, setLaterThisWeek] = useState<
    { id: string; text: string }[]
  >([]);

  const [activeTab, setActiveTab] = useState<'today' | 'backlog'>('today');
  const [isAnimating, setIsAnimating] = useState(false);
  const [showReward, setShowReward] = useState(false);

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
    const items = await fetch('/api/tasks?view=board&day=-1').then((r) =>
      r.json()
    );
    setLaterThisWeek(
      items.map((t: any) => ({ id: t.id, text: t.text, tags: t.tags }))
    );
  }, [session]);

  const today = new Date();
  const dateStr = format(today, 'yyyy-MM-dd');
  const data = session ? tasks : guestTasks;
  const doneCount = data.filter((t) => t.completed).length;
  // Note: We don't rely purely on 'rate' anymore for triggering, but we keep it for the progress bar
  const rate = data.length > 0 ? (doneCount / data.length) * 100 : 0;
  const flyBalance = session ? flyStatus.balance : undefined;

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
    const res = await fetch(`/api/tasks?date=${dateStr}`);
    const json = await res.json();
    setTasks(json.tasks ?? []);
    setWeeklyIds(new Set(json.weeklyIds ?? []));
    applyFlyStatus(json.flyStatus);

    setDailyGiftCount(json.dailyGiftCount || 0);
    setLastGiftTaskCount(json.taskCountAtLastGift || 0);
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
        const res = await fetch(`/api/tasks?date=${dateStr}`);
        const json = await res.json();
        setTasks(json.tasks ?? []);
        setWeeklyIds(new Set(json.weeklyIds ?? []));
        applyFlyStatus(json.flyStatus);

        setDailyGiftCount(json.dailyGiftCount || 0);
        setLastGiftTaskCount(json.taskCountAtLastGift || 0);
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
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, completed } : t))
      );

      if (completed) {
        setIsAnimating(true);
        setTimeout(() => {
          setTasks((prev) => sortTasks(prev));
          setTimeout(() => setIsAnimating(false), 400);
        }, 250);
      } else {
        setTasks((prev) => sortTasks(prev));
      }

      const res = await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateStr, taskId, completed }),
      });
      if (res.ok) {
        try {
          const body = await res.json();
          applyFlyStatus(body?.flyStatus);
        } catch {}
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

  if (sessionLoading || (session && loading)) {
    return <LoadingScreen message="Loading your day..." />;
  }

  return (
    <main className="min-h-screen pb-48 md:pb-32 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="px-4 py-6 mx-auto max-w-7xl md:px-8">
        <Header session={session} router={router} />

        {!session && (
          <div className="relative p-6 mb-8 overflow-hidden text-center rounded-[20px] bg-white/80 dark:bg-slate-900/60 backdrop-blur-2xl border border-white/50 dark:border-slate-800/50 shadow-sm md:p-8">
            <h2 className="mb-3 text-xl font-bold md:text-2xl text-slate-900 dark:text-white">
              There’s a frog with a rumbling belly! 🐸
            </h2>
            <p className="mb-6 text-sm md:text-base text-slate-600 dark:text-slate-400">
              Sign in to feed it by completing tasks!
            </p>
            <button
              onClick={() => signIn('google')}
              className="inline-flex items-center gap-2 px-6 py-2.5 text-base font-medium text-white shadow-md rounded-xl bg-violet-600 hover:bg-violet-700 active:scale-95 transition-all"
            >
              Sign in / Create account
            </button>
          </div>
        )}

        <div className="relative grid items-start grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="z-10 flex flex-col gap-6 lg:col-span-4 lg:sticky lg:top-8">
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
            />
            <div className="w-full">
              <ProgressCard
                rate={rate}
                done={doneCount}
                total={data.length}
                giftsClaimed={dailyGiftCount}
              />
            </div>
          </div>

          <div
            className="flex flex-col gap-6 lg:col-span-8"
            style={{ pointerEvents: cinematic ? 'none' : 'auto' }}
          >
            <div className="flex self-start w-full p-1 rounded-[20px] bg-white/80 dark:bg-slate-900/60 backdrop-blur-2xl border border-white/50 dark:border-slate-800/50 shadow-sm md:w-auto">
              <button
                onClick={() => setActiveTab('today')}
                className={`
        flex-1 md:flex-none justify-center relative px-6 py-2 text-sm font-bold rounded-xl transition-all flex items-center gap-2
        ${
          activeTab === 'today'
            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
        }
      `}
              >
                Today
                {data.length > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 px-1 text-[10px]">
                    {data.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('backlog')}
                className={`
        flex-1 md:flex-none justify-center relative px-6 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2
        ${
          activeTab === 'backlog'
            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
        }
      `}
              >
                Saved Tasks
                {laterThisWeek.length > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 px-1 text-[10px]">
                    {laterThisWeek.length}
                  </span>
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

                      // 1. Add to backlog
                      await fetch('/api/tasks?view=board', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          text: task.text,
                          repeat: 'backlog',
                          tags: task.tags,
                        }),
                      });

                      // 2. Remove from today
                      // Use the same logic as onDeleteToday/onDeleteFromWeek
                      // If it's weekly, it needs to be suppressed
                      await fetch('/api/tasks', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ date: dateStr, taskId }),
                      });

                      // 3. Refresh
                      await refreshToday();
                      await fetchBacklog();
                    }}
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
                    />
                  ) : (
                    <div className="p-8 text-center text-slate-500 bg-white/50 rounded-2xl dark:bg-slate-800/50">
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
          className="fixed inset-0 z-50 pointer-events-none"
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
        onSubmit={async ({ text, days, repeat, tags }) => {
          await fetch('/api/tasks?view=board', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, days, repeat, tags }),
          });
          if (session) {
            const res = await fetch(`/api/tasks?date=${dateStr}`);
            const json = await res.json();
            setTasks(json.tasks ?? []);
            setWeeklyIds(new Set(json.weeklyIds ?? []));
            applyFlyStatus(json.flyStatus);

            setDailyGiftCount(json.dailyGiftCount || 0);
            setLastGiftTaskCount(json.taskCountAtLastGift || 0);
          } else {
            setGuestTasks((prev) => [
              ...prev,
              { id: crypto.randomUUID(), text, completed: false, tags },
            ]);
          }
          fetchBacklog();
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

      {/* Floating Add Task Button - Home Page Version */}
      <div className="fixed bottom-0 left-0 right-0 z-[40] px-4 sm:px-6 pb-[calc(env(safe-area-inset-bottom)+84px)] md:pb-[calc(env(safe-area-inset-bottom)+80px)] pointer-events-none">
        <div className="pointer-events-auto mx-auto w-full max-w-[400px]">
          <div className="rounded-full bg-white/80 dark:bg-slate-900/70 backdrop-blur-2xl ring-1 ring-slate-200/80 dark:ring-slate-700/60 shadow-[0_8px_32px_rgba(0,0,0,.18)] p-1">
            <AddTaskButton
              onClick={() => {
                setQuickText('');
                setShowQuickAdd(true);
              }}
              label="Add a task"
            />
          </div>
        </div>
      </div>
    </main>
  );
}

// Compact Header
function Header({ session, router }: { session: any; router: any }) {
  return (
    <div className="flex flex-col gap-4 mb-4 md:mb-6 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white md:text-5xl">
          {format(new Date(), 'EEEE')}
        </h1>
        <p className="flex items-center gap-2 font-medium text-md md:text-lg text-slate-600 dark:text-slate-400">
          <Calendar className="w-4 h-4 md:w-5 md:h-5" />
          {format(new Date(), 'MMMM d, yyyy')}
        </p>
      </div>

      <div className="self-start hidden gap-2 md:flex md:self-auto">
        <Link
          href="/history"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition bg-white rounded-lg shadow-sm text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200"
        >
          <History className="w-4 h-4" />
          <span>History</span>
        </Link>

        <button
          onClick={() =>
            session ? router.push('/manage-tasks') : router.push('/login')
          }
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition bg-white rounded-lg shadow-sm text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200"
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Weekly Tasks</span>
        </button>
      </div>
    </div>
  );
}
