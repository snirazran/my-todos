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
import BacklogPanel from '@/components/ui/BacklogPanel';
//fix
import { useAuth } from '@/components/auth/AuthContext';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { useUIStore } from '@/lib/uiStore';
import { type FrogHandle } from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import TaskList from '@/components/ui/TaskList';
import QuickAddSheet from '@/components/ui/QuickAddSheet';
import { AddTaskButton } from '@/components/ui/AddTaskButton';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { FrogDisplay } from '@/components/ui/FrogDisplay';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { HungerWarningModal } from '@/components/ui/HungerWarningModal';
import { useFrogTongue, TONGUE_STROKE } from '@/hooks/useFrogTongue';
import { useNotification } from '@/components/providers/NotificationProvider';
import {
  useTaskData,
  Task,
  FlyStatus,
  HungerStatus,
} from '@/hooks/useTaskData';

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
  const flyRefs = useRef<Record<string, HTMLElement | null>>({});
  const isInitialLoad = useRef(true);

  const { isWardrobeOpen, setWardrobeOpen } = useUIStore();
  const [guestTasks, setGuestTasks] = useState<Task[]>(demoTasks);

  const [quickText, setQuickText] = useState('');
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddMode, setQuickAddMode] = useState<'pick' | 'later'>('pick');

  /* State */
  const [activeTab, setActiveTab] = useState<'today' | 'backlog'>('today');
  const [showCompleted, setShowCompleted] = useState(true);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const headerMenuBtnRef = useRef<HTMLButtonElement>(null);
  const headerMenuRef = useRef<HTMLDivElement>(null);

  // Ref for scrolling to task list
  const taskListRef = useRef<HTMLDivElement>(null);
  // State for task glow effect
  const [isTaskGlow, setIsTaskGlow] = useState(false);

  // Close menu on click outside
  useEffect(() => {
    if (!isHeaderMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        headerMenuRef.current &&
        !headerMenuRef.current.contains(e.target as Node) &&
        headerMenuBtnRef.current &&
        !headerMenuBtnRef.current.contains(e.target as Node)
      ) {
        setIsHeaderMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isHeaderMenuOpen]);

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
    const task = data.find((t) => t.id === taskId);
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
                setQuickAddMode(activeTab === 'backlog' ? 'later' : 'pick');
                setShowQuickAdd(true);
              }}
              onMutateToday={() => mutateToday()}
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
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }
      `}
                >
                  <CalendarCheck
                    className={`w-4 h-4 ${activeTab === 'today' ? 'text-primary' : 'text-muted-foreground'}`}
                  />
                  Today
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
                  onClick={() => setActiveTab('backlog')}
                  className={`
        flex-1 md:flex-none justify-center relative px-6 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2 whitespace-nowrap
        ${
          activeTab === 'backlog'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }
      `}
                >
                  <FolderOpen
                    className={`w-4 h-4 ${activeTab === 'backlog' ? 'text-primary' : 'text-muted-foreground'}`}
                  />
                  Saved Tasks
                  <TaskCounter
                    count={laterThisWeek.length}
                    pendingCount={pendingToBacklog}
                  />
                </button>

                {/* 3-DOTS MENU ADDED HERE */}
                <div className="w-[1px] h-6 bg-border/50 mx-1" />
                <button
                  ref={headerMenuBtnRef}
                  onClick={() => setIsHeaderMenuOpen(!isHeaderMenuOpen)}
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                >
                  <EllipsisVertical className="w-5 h-5" />
                </button>

                <AnimatePresence>
                  {isHeaderMenuOpen && (
                    <motion.div
                      ref={headerMenuRef}
                      initial={{ opacity: 0, scale: 0.95, y: -4, x: 0 }}
                      animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -4, x: 0 }}
                      transition={{ duration: 0.15, ease: 'easeOut' }}
                      className="absolute right-0 top-full mt-2 z-50 w-64 bg-popover rounded-xl border border-border shadow-lg shadow-black/5 ring-1 ring-black/5 p-1 flex flex-col gap-1 overflow-hidden"
                      style={{ transformOrigin: 'top right' }}
                    >
                      {/* Show Finished Toggle */}
                      <div className="flex items-center justify-between p-2 rounded-lg hover:bg-accent/50 transition-colors">
                        <span className="text-sm font-medium text-foreground">
                          Show Completed
                        </span>
                        <button
                          onClick={() => setShowCompleted(!showCompleted)}
                          className={`w-9 h-5 rounded-full relative transition-all duration-300 ease-in-out ${showCompleted ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-background shadow-sm transition-transform duration-300 ${showCompleted ? 'translate-x-4' : 'translate-x-0'}`}
                          />
                        </button>
                      </div>

                      {/* Tag Filter Section */}
                      {(() => {
                        // Filter logic: Only show tags used in TODAY's tasks (or all tags? Let's use all user tags for broader filtering capability, OR just relevant ones. TaskList used relevant ones. Let's start with ALL user tags for simplicity, or we can filter like TaskList did)
                        // TaskList did: const usedTagIds = new Set(tasks.flatMap(t => t.tags || []));
                        // Let's replicate that if we want strictly relevant tags.
                        const currentList =
                          activeTab === 'today' ? data : backlogTasks;
                        const usedTagIds = new Set(
                          currentList.flatMap((t) => t.tags || []),
                        );
                        const visibleFilterTags = (tags || []).filter((tag) =>
                          usedTagIds.has(tag.id),
                        );

                        if (visibleFilterTags.length === 0) return null;

                        return (
                          <div className="flex flex-col gap-2 pt-2 border-t border-border/50 px-1">
                            <div className="flex items-center justify-between px-2">
                              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                Filter by Tags
                              </span>
                              {selectedTags.length > 0 && (
                                <button
                                  onClick={() => setSelectedTags([])}
                                  className="text-[10px] font-bold text-primary hover:text-primary/80 transition-colors"
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1.5 px-1 pb-1">
                              {visibleFilterTags.map((tag) => {
                                const isSelected = selectedTags.includes(
                                  tag.id,
                                );
                                return (
                                  <button
                                    key={tag.id}
                                    onClick={() => {
                                      setSelectedTags((prev) =>
                                        prev.includes(tag.id)
                                          ? prev.filter((id) => id !== tag.id)
                                          : [...prev, tag.id],
                                      );
                                    }}
                                    className={`
                                                  relative inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all duration-200 border
                                                  ${
                                                    isSelected
                                                      ? 'ring-1 ring-offset-0 ring-primary border-transparent'
                                                      : 'bg-muted/40 border-transparent hover:bg-muted/70 text-muted-foreground'
                                                  }
                                               `}
                                    style={
                                      isSelected && tag.color
                                        ? {
                                            backgroundColor: `${tag.color}15`,
                                            color: tag.color,
                                            borderColor: tag.color, // Use border for selected state color
                                            boxShadow: 'none',
                                          }
                                        : isSelected
                                          ? {
                                              backgroundColor:
                                                'rgba(var(--primary), 0.1)',
                                              color: 'hsl(var(--primary))',
                                              borderColor:
                                                'hsl(var(--primary))',
                                            }
                                          : {}
                                    }
                                  >
                                    {isSelected && (
                                      <Check className="w-3 h-3" />
                                    )}
                                    {tag.name}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="min-h-[400px] pb-20" ref={taskListRef}>
              {activeTab === 'today' ? (
                <motion.div
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
                            <span className="text-primary font-bold">Gift</span>
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
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <BacklogPanel
                    later={laterThisWeek}
                    onRefreshToday={async () => {
                      if (user) await mutateToday();
                    }}
                    onRefreshBacklog={async () => {
                      if (user) await mutateBacklog();
                    }}
                    onMoveToToday={(item) => {
                      if (!user) {
                        router.push('/login');
                        return;
                      }
                      moveTaskToToday(item);
                    }}
                    pendingToBacklog={pendingToBacklog}
                    onAddRequested={() => {
                      if (!user) {
                        router.push('/login');
                        return;
                      }
                      setQuickText('');
                      setQuickAddMode('later');
                      setShowQuickAdd(true);
                    }}
                    onEditTask={(id, text) => {
                      if (!user) {
                        router.push('/login');
                        return;
                      }
                      editTask(id, text, true);
                    }}
                    isGuest={!user}
                    tags={tags}
                  />
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
                mutateBacklog(
                  (curr) => {
                    if (!curr) return newTasks;
                    return [...curr, ...newTasks];
                  },
                  { revalidate: false },
                );
              } else {
                mutateToday(
                  (curr) => {
                    if (!curr) return undefined;
                    return {
                      ...curr,
                      tasks: [...curr.tasks, ...newTasks],
                    };
                  },
                  { revalidate: false },
                );
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
        open={!!user && hungerStatus.stolenFlies > 0}
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
              if (!user) {
                router.push('/login');
                return;
              }
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
      <div className="fixed bottom-0 left-0 right-0 z-[56] flex justify-center pointer-events-none px-4 pb-40 md:pb-36">
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
