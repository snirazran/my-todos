'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  Calendar,
  History,
  LayoutDashboard,
  CalendarCheck,
  CalendarClock,
  EllipsisVertical,
  Check,
  FolderOpen,
} from 'lucide-react';
import { HabitPanel } from '@/components/ui/HabitPanel';
import BacklogTray from '@/components/board/BacklogTray';
import BacklogBox from '@/components/board/BacklogBox';
//fix
import { useAuth } from '@/components/auth/AuthContext';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { useUIStore } from '@/lib/uiStore';
import { type FrogHandle } from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import TaskList from '@/components/ui/TaskList';
import QuickAddSheet from '@/components/ui/QuickAddSheet';
import { AddTaskButton } from '@/components/ui/AddTaskButton';
import { FilterDropdown } from '@/components/ui/FilterDropdown';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { FrogDisplay } from '@/components/ui/FrogDisplay';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { HungerWarningModal } from '@/components/ui/HungerWarningModal';
import { DailyRewardPopup } from '@/components/ui/daily-reward/DailyRewardPopup';
import { useFrogTongue, TONGUE_STROKE } from '@/hooks/useFrogTongue';
import { useNotification } from '@/components/providers/NotificationProvider';
import {
  useTaskData,
  Task,
  FlyStatus,
  HungerStatus,
} from '@/hooks/useTaskData';

// Force re-compilation of this file to pick up useTaskData.tsx change

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

export default function Home() {
  const { user, loading } = useAuth();
  const sessionLoading = loading;
  const router = useRouter();

  // -- NEW STATE HOOK --
  const {
    tasks,
    backlogTasks,
    habits,
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
    tags,
  } = useTaskData();

  const frogRef = useRef<FrogHandle>(null);
  const flyRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const isInitialLoad = useRef(true);

  const { isWardrobeOpen, setWardrobeOpen } = useUIStore();
  const [guestTasks, setGuestTasks] = useState<Task[]>(demoTasks);

  const [quickText, setQuickText] = useState('');
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddMode, setQuickAddMode] = useState<'pick' | 'habit'>('pick');

  /* State */
  const [activeTab, setActiveTab] = useState<'today' | 'habits'>('today');
  const [isBacklogOpen, setIsBacklogOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const headerMenuBtnRef = useRef<HTMLButtonElement>(null);
  const headerMenuRef = useRef<HTMLDivElement>(null);

  // Ref for scrolling to task list
  const taskListRef = useRef<HTMLDivElement>(null);
  // State for task glow effect
  const [isTaskGlow, setIsTaskGlow] = useState(false);

  const frogBoxRef = useRef<HTMLDivElement | null>(null);
  const {
    vp,
    cinematic,
    grab,
    tipGroupEl,
    tonguePathEl,
    triggerTongue,
    visuallyDone,
    speedUpTongue,
  } = useFrogTongue({ frogRef, frogBoxRef, flyRefs });

  const { showNotification } = useNotification();
  const [showDailyReward, setShowDailyReward] = useState(false);

  // Check Daily Reward Status
  useEffect(() => {
    if (!user) return;

    const checkReward = async () => {
      try {
        const res = await fetch('/api/daily-reward/status');
        const data = await res.json();
        if (data.dailyRewards) {
          const today = new Date().getDate();
          const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

          // Only show if it's the correct month AND today isn't claimed
          if (data.dailyRewards.month === currentMonthKey) {
            const hasClaimedToday =
              data.dailyRewards.claimedDays.includes(today);
            if (!hasClaimedToday) {
              setShowDailyReward(true);
            }
          } else {
            // New month, definitely show
            setShowDailyReward(true);
          }
        }
      } catch (e) {
        console.error('Failed to check daily reward', e);
      }
    };

    // customizable delay or check
    const timer = setTimeout(checkReward, 1000); // Small delay to let app load
    return () => clearTimeout(timer);
  }, [user]);

  // Data Switching
  const data = user ? tasks : guestTasks;
  const doneCount = data.filter((t) => t.completed).length;
  // Note: We don't rely purely on 'rate' anymore for triggering, but we keep it for the progress bar
  const rate = data.length > 0 ? (doneCount / data.length) * 100 : 0;
  const flyBalance = user ? flyStatus.balance : 5;
  const laterThisWeek = user ? backlogTasks : [];

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
        t.id === taskId ? { ...t, completed } : t,
      );
      // Sort for guest
      return [...toggled].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    });
  };

  const handleToggle = async (taskId: string, explicitCompleted?: boolean) => {
    if (cinematic || grab) return;
    const task =
      data.find((t) => t.id === taskId) || habits.find((h) => h.id === taskId);
    if (!task) return;
    const completed =
      explicitCompleted !== undefined ? explicitCompleted : !task.completed;

    if (!completed) {
      if (user) toggleTask(taskId, false);
      else persistGuestTask(taskId, false);
      return;
    }

    await triggerTongue({
      key: taskId,
      completed,
      onPersist: () => {
        if (user) toggleTask(taskId, true);
        else persistGuestTask(taskId, true);
      },
    });
  };

  const { indices } = useWardrobeIndices(!!user);

  if (sessionLoading || (user && isLoading && tasks.length === 0)) {
    return <LoadingScreen message="Loading your day..." />;
  }

  return (
    <main className="min-h-screen pb-24 md:pb-12 bg-background">
      <div className="px-4 pt-2 pb-6 mx-auto max-w-7xl md:px-8">
        <Header router={router} />

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
              hunger={user ? hungerStatus.hunger : 1000}
              maxHunger={user ? hungerStatus.maxHunger : 10000}
              animateHunger={!!user}
              isGuest={!user}
              onAddTask={() => {
                if (!user) {
                  router.push('/login');
                  return;
                }
                setQuickText('');
                setQuickAddMode(activeTab === 'habits' ? 'habit' : 'pick');
                setShowQuickAdd(true);
              }}
              onMutateToday={() => mutateToday()}
              onOpenDailyReward={() => setShowDailyReward(true)}
            />
          </div>

          <div
            className="flex flex-col gap-4 lg:col-span-8 lg:gap-6"
            style={{ pointerEvents: cinematic ? 'none' : 'auto' }}
          >
            <div className="flex items-center justify-center w-full px-4 md:px-0 md:w-auto md:justify-start">
              <div className="flex items-center w-full max-w-[calc(100vw-2rem)] md:max-w-none md:w-auto p-1 rounded-[20px] bg-card/80 backdrop-blur-2xl border border-border/50 shadow-sm relative group z-20">
                <button
                  onClick={() => setActiveTab('today')}
                  className={`
        flex-1 md:flex-none justify-center relative px-6 py-2 text-sm font-bold rounded-xl transition-all flex items-center gap-2 whitespace-nowrap
        ${
          activeTab === 'today'
            ? 'bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
        }
      `}
                >
                  <CalendarCheck
                    className={`w-4 h-4 ${activeTab === 'today' ? 'text-primary' : 'text-muted-foreground'}`}
                  />
                  Tasks
                  <TaskCounter
                    count={
                      showCompleted
                        ? data.length
                        : data.filter((t) => !t.completed).length
                    }
                    pendingCount={pendingToToday}
                  />
                </button>
                <button
                  onClick={() => setActiveTab('habits')}
                  className={`
        flex-1 md:flex-none justify-center relative px-6 py-2 text-sm font-bold rounded-xl transition-all flex items-center gap-2 whitespace-nowrap
        ${
          activeTab === 'habits'
            ? 'bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
        }
      `}
                >
                  <CalendarClock
                    className={`w-4 h-4 ${activeTab === 'habits' ? 'text-primary' : 'text-muted-foreground'}`}
                  />
                  Habits
                  <TaskCounter count={habits.length} />
                </button>

                {/* 3-DOTS MENU ADDED HERE */}
                <div className="w-[1px] h-6 bg-border/50 mx-1" />
                <button
                  ref={headerMenuBtnRef}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsHeaderMenuOpen(!isHeaderMenuOpen);
                  }}
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                >
                  <EllipsisVertical className="w-5 h-5" />
                </button>

                <FilterDropdown
                  isOpen={isHeaderMenuOpen}
                  onClose={() => setIsHeaderMenuOpen(false)}
                  triggerRef={headerMenuBtnRef}
                  showTypeFilters={false}
                  showCompleted={showCompleted}
                  onShowCompletedChange={setShowCompleted}
                  availableTags={tags || []}
                  selectedTags={selectedTags}
                  onTagsChange={setSelectedTags}
                />
              </div>
            </div>

            <div className="min-h-[400px] pb-20" ref={taskListRef}>
              <AnimatePresence mode="wait">
                {activeTab === 'today' ? (
                  <motion.div
                    key="today"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.2 }}
                  >
                    {!user && (
                      <div className="relative overflow-hidden mb-3 rounded-xl bg-primary/5 border border-primary/10 shadow-sm">
                        <div className="relative flex items-center gap-4 p-4">
                          <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-background text-primary shadow-sm ring-1 ring-primary/20">
                            <span className="text-xl animate-bounce">🍽️</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-black text-foreground tracking-tight mb-0.5">
                              The Frog is Hungry!
                            </h3>
                            <p className="text-xs font-medium text-muted-foreground leading-relaxed">
                              Catch a fly to make her happy and unlock a special{' '}
                              <span className="text-primary font-bold">
                                Gift
                              </span>
                              !
                            </p>
                          </div>
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
                        if (!user) {
                          router.push('/login');
                          return;
                        }
                        setQuickText(prefill || '');
                        setQuickAddMode('pick');
                        setShowQuickAdd(true);
                      }}
                      weeklyIds={weeklyIds}
                      onDeleteToday={(id) => {
                        if (!user) {
                          router.push('/login');
                          return;
                        }
                        deleteTask(id);
                      }}
                      onDeleteFromWeek={async (taskId) => {
                        if (!user) {
                          router.push('/login');
                          return;
                        }
                        const dow = new Date().getDay();
                        await fetch('/api/tasks?view=board', {
                          method: 'DELETE',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ day: dow, taskId }),
                        });
                        deleteTask(taskId);
                      }}
                      onDoLater={(id) => {
                        if (!user) {
                          router.push('/login');
                          return;
                        }
                        moveTaskToBacklog(id);
                      }}
                      onReorder={reorderTasks}
                      pendingToToday={pendingToToday}
                      onToggleRepeat={(id) => {
                        if (!user) {
                          router.push('/login');
                          return;
                        }
                        toggleRepeat(id);
                      }}
                      onEditTask={(id, text) => {
                        if (!user) {
                          router.push('/login');
                          return;
                        }
                        editTask(id, text, false);
                      }}
                      isGuest={!user}
                      tags={tags}
                      showCompleted={showCompleted}
                      selectedTags={selectedTags}
                      onSetSelectedTags={setSelectedTags}
                      isGlowActive={isTaskGlow}
                      isFrozen={cinematic}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="habits"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <HabitPanel
                      habits={habits}
                      onToggle={handleToggle}
                      onEdit={(id, text) => {
                        if (!user) {
                          router.push('/login');
                          return;
                        }
                        editTask(id, text, false);
                      }}
                      onDelete={(id) => {
                        if (!user) {
                          router.push('/login');
                          return;
                        }
                        deleteTask(id, true);
                      }}
                      onAddRequested={(prefill, isHabit) => {
                        if (!user) {
                          router.push('/login');
                          return;
                        }
                        setQuickText(prefill || '');
                        setQuickAddMode(isHabit ? 'habit' : 'pick');
                        setShowQuickAdd(true);
                      }}
                      tags={tags}
                      flyRefs={flyRefs}
                      showCompleted={showCompleted}
                      visuallyCompleted={visuallyDone}
                      date={new Date().toISOString().slice(0, 10)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
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

          {/* Plain <path> — stroke visibility driven entirely by the RAF
              loop via stroke-dasharray (no framer-motion needed). */}
          <path
            ref={tonguePathEl}
            d="M0 0 L0 0"
            fill="none"
            stroke="url(#tongue-grad)"
            strokeWidth={TONGUE_STROKE}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* Tip group is always in the DOM; the RAF loop toggles its
              visibility and transform directly — no React re-renders. */}
          <g ref={tipGroupEl} style={{ visibility: 'hidden' }}>
            <circle r={10} fill="transparent" />
            <image
              href="/fly.svg"
              x={-FLY_PX / 2}
              y={-FLY_PX / 2}
              width={FLY_PX}
              height={FLY_PX}
            />
          </g>
        </svg>
      )}

      {/* Full-screen blocker + skip button during tongue animation */}
      {cinematic && <CinematicOverlay onSkip={speedUpTongue} />}

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

            const res = await fetch('/api/tasks?view=board', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text, days, repeat, tags, timezone: tz }),
            });
            const data = await res.json();

            if (user && data.ok && data.tasks) {
              const newTasks = data.tasks;
              // Check backlog based on days array or repeat type if casted
              const isBacklog =
                (repeat as string) === 'backlog' ||
                (Array.isArray(days) && days.includes(-1));

              if (isBacklog) {
                mutateBacklog((curr) => {
                  if (!curr) return newTasks;
                  return [...curr, ...newTasks];
                });
              } else {
                const currentDayOfWeek = new Date().getDay();
                // Filter to only add tasks that match TODAY's date, or if it's a habit meant for today
                const relevantTasks = newTasks.filter((t: any) => {
                  if (t.type === 'habit') {
                    return (
                      Array.isArray(t.daysOfWeek) &&
                      t.daysOfWeek.includes(currentDayOfWeek)
                    );
                  }
                  return !t.date || t.date === dateStr;
                });

                if (relevantTasks.length > 0) {
                  mutateToday((curr) => {
                    if (!curr) return undefined;
                    return {
                      ...curr,
                      tasks: [...curr.tasks, ...relevantTasks],
                    };
                  });
                }
              }
            } else if (user) {
              // Fallback
              const isBacklog =
                (repeat as string) === 'backlog' ||
                (Array.isArray(days) && days.includes(-1));
              if (isBacklog) mutateBacklog();
              else mutateToday();
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

      <HungerWarningModal
        open={!!user && hungerStatus.stolenFlies > 0 && !showDailyReward}
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

      <DailyRewardPopup
        show={showDailyReward}
        onClose={() => setShowDailyReward(false)}
      />

      {/* Floating Add Task Button - Home Page Version */}
      <div className="fixed bottom-0 left-0 right-0 z-[40] px-4 pb-[calc(env(safe-area-inset-bottom)+100px)] pointer-events-none">
        <div className="pointer-events-auto mx-auto w-full max-w-[400px] relative min-h-[56px] flex items-center justify-center gap-2">
          {(activeTab === 'today' || activeTab === 'habits') && (
            <BacklogBox
              count={laterThisWeek.length}
              isDragOver={false}
              isDragging={false}
              proximity={0}
              onClick={() => setIsBacklogOpen(true)}
              forwardRef={null}
            />
          )}
          <div
            className="flex-1 min-w-0 pointer-events-auto"
            style={{ whiteSpace: 'nowrap' }}
          >
            <AddTaskButton
              className="w-full"
              onClick={() => {
                if (!user) {
                  router.push('/login');
                  return;
                }
                setQuickText('');
                setQuickAddMode(activeTab === 'habits' ? 'habit' : 'pick');
                setShowQuickAdd(true);
              }}
              label={
                <span className="flex items-center">
                  Add a <Fly size={24} y={-3} x={4} />
                </span>
              }
              showFly={false}
            />
          </div>
        </div>
      </div>

      <BacklogTray
        isOpen={isBacklogOpen}
        onClose={() => setIsBacklogOpen(false)}
        tasks={laterThisWeek.map((t) => ({ ...t, order: t.order || 0 }))}
        onGrab={() => {}}
        setCardRef={() => {}}
        activeDragId={null}
        onDoToday={(id) => {
          if (!user) {
            router.push('/login');
            return;
          }
          const item = laterThisWeek.find((t) => t.id === id);
          if (item) moveTaskToToday(item);
        }}
        onEdit={(id, text) => {
          if (!user) {
            router.push('/login');
            return;
          }
          editTask(id, text, true);
        }}
        onRemove={(id) => {
          if (!user) {
            router.push('/login');
            return;
          }
          deleteTask(id);
        }}
        userTags={tags}
      />
    </main>
  );
}

/* ------------------------------------------------------------------ */
/*  Cinematic overlay: full-screen tap blocker + skip indicator       */
/* ------------------------------------------------------------------ */
function CinematicOverlay({ onSkip }: Readonly<{ onSkip: () => void }>) {
  const [active, setActive] = React.useState(false);

  const handleSkip = React.useCallback(() => {
    if (active) return;
    setActive(true);
    onSkip();
  }, [active, onSkip]);

  return (
    <>
      {/* Invisible full-screen tap target */}
      <button
        type="button"
        aria-label="Tap anywhere to fast-forward tongue animation"
        className="fixed inset-0 z-[55] cursor-default bg-transparent"
        onClick={handleSkip}
        onTouchStart={handleSkip}
      />

      {/* Visual skip hint (non-interactive): aligned with bottom notification zone */}
      <div className="fixed bottom-0 left-0 right-0 z-[56] flex justify-center pointer-events-none px-4 pb-[calc(env(safe-area-inset-bottom)+176px)]">
        <div
          className={`
            flex items-center gap-2 rounded-full border px-3 py-2
            shadow-sm backdrop-blur-2xl transition-all duration-200
            ${
              active
                ? 'bg-card/90 border-primary/40'
                : 'bg-card/80 border-border/50'
            }
          `}
        >
          <span
            className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary transition-colors duration-200"
            aria-hidden
          >
            {active ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M13 19V5l8 7-8 7z" fill="currentColor" />
                <path d="M3 19V5l8 7-8 7z" fill="currentColor" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M5 3l14 9-14 9V3z" fill="currentColor" />
              </svg>
            )}
          </span>
          <span
            className={`text-[11px] font-semibold select-none whitespace-nowrap transition-colors duration-200 ${active ? 'text-primary' : 'text-muted-foreground'}`}
          >
            {active ? 'x2 speed' : 'Tap to speed'}
          </span>
        </div>
      </div>
    </>
  );
}

// Compact Header
function Header({ router }: { router: any }) {
  return (
    <div className="flex flex-col gap-4 mb-2 md:mb-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-5xl">
          {format(new Date(), 'EEEE')}
        </h1>
        <p className="flex items-center gap-2 font-medium text-md md:text-lg text-muted-foreground">
          <Calendar className="w-4 h-4 md:w-5 md:h-5" />
          {format(new Date(), 'MMMM d, yyyy')}
        </p>
      </div>
    </div>
  );
}

// Helper component for add-only animation
// Helper component for add-only animation
function TaskCounter({
  count,
  pendingCount,
}: {
  count: number;
  pendingCount?: number;
}) {
  const controls = useAnimation();
  const prevCount = React.useRef(count);

  React.useEffect(() => {
    if (count > prevCount.current) {
      // Only animate if count INCREASED
      controls.start({
        scale: [1, 1.35, 1],
        color: [
          'hsl(var(--muted-foreground))',
          'hsl(var(--primary))',
          'hsl(var(--muted-foreground))',
        ],
        transition: {
          duration: 0.3,
          ease: 'easeInOut',
        },
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
        <svg
          className="w-3.5 h-3.5 animate-spin text-muted-foreground/60"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      )}
    </div>
  );
}
