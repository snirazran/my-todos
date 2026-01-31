'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { Calendar, History, LayoutDashboard, CalendarCheck, CalendarClock } from 'lucide-react';
import BacklogPanel from '@/components/ui/BacklogPanel';
//fix
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
import {
  useFrogTongue,
  HIT_AT,
  OFFSET_MS,
  TONGUE_MS,
  TONGUE_STROKE,
} from '@/hooks/useFrogTongue';
import { useNotification } from '@/components/providers/NotificationProvider';
import { useTaskData, Task, FlyStatus, HungerStatus } from '@/hooks/useTaskData';

const FLY_PX = 24;

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

  // -- NEW STATE HOOK --
  const {
    tasks,
    backlogTasks,
    isLoading,
    flyStatus,
    hungerStatus,
    dailyGiftCount,
    weeklyIds,
    toggleTask,
    moveTaskToBacklog,
    moveTaskToToday,
    deleteTask,
    reorderTasks,
    editTask,
    mutateToday,
    mutateBacklog,
    pendingToBacklog,
    pendingToToday,
    toggleRepeat,
    tags
  } = useTaskData();

  const frogRef = useRef<FrogHandle>(null);
  const flyRefs = useRef<Record<string, HTMLElement | null>>({});
  const isInitialLoad = useRef(true);

  const { isWardrobeOpen, setWardrobeOpen } = useUIStore();
  const [guestTasks, setGuestTasks] = useState<Task[]>(demoTasks);

  const [quickText, setQuickText] = useState('');
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddMode, setQuickAddMode] = useState<'pick' | 'later'>('pick');

  const [activeTab, setActiveTab] = useState<'today' | 'backlog'>('today');
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

  const { showNotification } = useNotification();

  // Data Switching
  const data = session ? tasks : guestTasks;
  const doneCount = data.filter((t) => t.completed).length;
  // Note: We don't rely purely on 'rate' anymore for triggering, but we keep it for the progress bar
  const rate = data.length > 0 ? (doneCount / data.length) * 100 : 0;
  const flyBalance = session ? flyStatus.balance : 5;
  const laterThisWeek = session ? backlogTasks : [];

  // Trigger Logic
  useEffect(() => {
    // 1. SAFETY LOCK: Don't do anything while loading
    if (isLoading && session) return;

    // 2. SAFETY LOCK: If this is the very first time data loaded,
    // simply "acknowledge" the current state but DO NOT trigger the popup.
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }

    const milestones = getMilestones(data.length);
    const nextMilestoneTarget = milestones[dailyGiftCount];

    if (
      data.length > 0 &&
      !showReward &&
      dailyGiftCount < 3 &&
      nextMilestoneTarget !== undefined &&
      doneCount >= nextMilestoneTarget
    ) {
      setShowReward(true);
    }
    // IMPORTANT: Add 'isLoading' to the dependency array
  }, [doneCount, data.length, dailyGiftCount, showReward, isLoading, session]);

  // Block Scrolling during cinematic
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

  const persistGuestTask = (taskId: string, completed: boolean) => {
    setGuestTasks((prev) => {
      const toggled = prev.map((t) =>
        t.id === taskId ? { ...t, completed } : t
      );
      // Sort for guest
      return [...toggled].sort((a, b) => {
        if (!!a.completed !== !!b.completed) return a.completed ? 1 : -1;
        return (a.order ?? 0) - (b.order ?? 0);
      });
    });
  };

  const handleToggle = async (taskId: string, explicitCompleted?: boolean) => {
    if (cinematic || grab) return;
    const task = data.find((t) => t.id === taskId);
    if (!task) return;
    const completed = explicitCompleted !== undefined ? explicitCompleted : !task.completed;

    if (!completed) {
      if (session) toggleTask(taskId, false);
      else persistGuestTask(taskId, false);
      return;
    }

    await triggerTongue({
      key: taskId,
      completed,
      onPersist: () => {
        if (session) toggleTask(taskId, true);
        else persistGuestTask(taskId, true);
      },
    });
  };

  const { indices } = useWardrobeIndices(!!session);

  if (sessionLoading || (session && isLoading && tasks.length === 0)) {
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
        flex-1 md:flex-none justify-center relative px-6 py-2 text-sm font-bold rounded-xl transition-all flex items-center gap-2 whitespace-nowrap
        ${activeTab === 'today'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                  }
      `}
              >
                <CalendarCheck className={`w-4 h-4 ${activeTab === 'today' ? 'text-primary' : 'text-muted-foreground'}`} />
                Today
                <TaskCounter count={data.length} pendingCount={pendingToToday} />
              </button>
              <button
                onClick={() => setActiveTab('backlog')}
                className={`
        flex-1 md:flex-none justify-center relative px-6 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2 whitespace-nowrap
        ${activeTab === 'backlog'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                  }
      `}
              >
                <CalendarClock className={`w-4 h-4 ${activeTab === 'backlog' ? 'text-primary' : 'text-muted-foreground'}`} />
                Saved Tasks
                <TaskCounter count={laterThisWeek.length} pendingCount={pendingToBacklog} />
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
                    onDeleteToday={deleteTask}
                    onDeleteFromWeek={async (taskId) => {
                      const dow = new Date().getDay();
                      await fetch('/api/tasks?view=board', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ day: dow, taskId }),
                      });
                      deleteTask(taskId);
                    }}
                    onDoLater={moveTaskToBacklog}
                    onReorder={reorderTasks}
                    pendingToToday={pendingToToday}
                    onToggleRepeat={toggleRepeat}
                    onEditTask={(id, text) => editTask(id, text, false)}
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
                      onRefreshToday={async () => { await mutateToday(); }}
                      onRefreshBacklog={async () => { await mutateBacklog(); }}
                      onMoveToToday={moveTaskToToday}
                      pendingToBacklog={pendingToBacklog}
                      onAddRequested={() => {
                        setQuickText('');
                        setQuickAddMode('later');
                        setShowQuickAdd(true);
                      }}
                      onEditTask={(id, text) => editTask(id, text, true)}
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
            const dateStr = format(new Date(), 'yyyy-MM-dd');

            await fetch('/api/tasks?view=board', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text, days, repeat, tags, timezone: tz }),
            });
            if (session) {
              // SWR mutate
              mutateToday();
              mutateBacklog();
            } else {
              setGuestTasks((prev) => [
                ...prev,
                { id: crypto.randomUUID(), text, completed: false, tags },
              ]);
            }
          } catch (e) {
            console.error('Failed to add task or refresh state:', e);
          }
        }}
      />

      <RewardPopup
        show={showReward}
        onClose={async (claimed) => {
          if (claimed) {
            // Optimistically update gift count to prevent popup from re-triggering
            // immediately due to stale data race condition
            await mutateToday(
              (current) => {
                if (!current) return current;
                return {
                  ...current,
                  dailyGiftCount: (current.dailyGiftCount || 0) + 1,
                };
              },
              { revalidate: false }
            );
          }

          setShowReward(false);

          if (claimed) {
            mutateToday(); // Should get new dailyGiftCount (CONFIRMATION)
            mutate('/api/skins/inventory');
          }
        }}
        dailyGiftCount={dailyGiftCount}
      />

      <HungerWarningModal
        open={!!session && hungerStatus.stolenFlies > 0}
        stolenFlies={hungerStatus.stolenFlies}
        indices={indices}
        onAcknowledge={async () => {
          // Optimistic clear handled in hook? No, exposure should be in hook if commonly used, 
          // but here we can just do manual fetch or add 'acknowledgeHunger' to hook.
          // For now, manual fetch + mutate.
          await fetch('/api/hunger/acknowledge', { method: 'POST' });
          mutateToday();
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
// Helper component for add-only animation
function TaskCounter({ count, pendingCount }: { count: number; pendingCount?: number }) {
  const controls = useAnimation();
  const prevCount = React.useRef(count);

  React.useEffect(() => {
    if (count > prevCount.current) {
      // Only animate if count INCREASED
      controls.start({
        scale: [1, 1.35, 1],
        color: ["hsl(var(--muted-foreground))", "hsl(var(--primary))", "hsl(var(--muted-foreground))"],
        transition: {
          duration: 0.3,
          ease: "easeInOut",
        }
      });
    }
    prevCount.current = count;
  }, [count, controls]);

  if (count === 0 && (!pendingCount || pendingCount === 0)) return null;

  return (
    <div className="flex items-center gap-1.5 ">
      {count > 0 && (
        <motion.span
          animate={controls}
          className={`flex h-5 min-w-[20px] items-center justify-center rounded-full bg-secondary px-1.5 text-[11px] font-black text-muted-foreground shadow-sm ${count === 0 ? 'hidden' : ''}`}
        >
          {count}
        </motion.span>
      )}
      {(pendingCount ?? 0) > 0 && (
        <svg className="w-3.5 h-3.5 animate-spin text-muted-foreground/60" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
    </div>
  );
}
