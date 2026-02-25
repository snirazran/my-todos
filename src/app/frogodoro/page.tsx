'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import { useTaskData } from '@/hooks/useTaskData';
import {
  useFrogodoroStore,
  PomodoroPhase,
  DEFAULT_SETTINGS,
} from '@/lib/frogodoroStore';
import {
  Play,
  Pause,
  SkipForward,
  Settings2,
  ChevronDown,
  CheckCircle2,
  Save,
  ListTodo,
  X,
} from 'lucide-react';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/lib/uiStore';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { FrogDisplay } from '@/components/ui/FrogDisplay';
import { type FrogHandle } from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import { useFrogTongue, TONGUE_STROKE } from '@/hooks/useFrogTongue';

const FLY_PX = 24;
export default function FrogodoroPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const {
    tasks,
    isLoading: isTasksLoading,
    toggleTask,
    mutateToday,
    flyStatus,
    hungerStatus,
    dailyGiftCount,
  } = useTaskData();

  // Global Store hook
  const {
    settings,
    selectedTaskId,
    phase,
    timeLeft,
    isRunning,
    completedCycles,
    setSettings,
    setTask,
    startTimer,
    pauseTimer,
    switchPhase,
    completePhase,
  } = useFrogodoroStore();

  // Local UI State
  const [showTaskDropdown, setShowTaskDropdown] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [localSettings, setLocalSettings] = useState(settings); // For the modal forms

  // Sync local modal form to global settings
  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  // FrogDisplay state
  const { isWardrobeOpen, setWardrobeOpen } = useUIStore();
  const { indices } = useWardrobeIndices(!!user);
  const frogRef = useRef<FrogHandle>(null);
  const frogBoxRef = useRef<HTMLDivElement>(null);
  const flyRefs = useRef<Record<string, HTMLElement | null>>({});

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

  // Handle Authentication Tracking
  useEffect(() => {
    if (loading) return;
    if (!user) router.push('/login');
  }, [loading, user, router]);

  // Derived Task info
  const availableTasks = useMemo(() => {
    return tasks.filter((t) => !t.completed);
  }, [tasks]);

  const selectedTask = useMemo(() => {
    return tasks.find((t) => t.id === selectedTaskId);
  }, [tasks, selectedTaskId]);

  // Actions
  const toggleTimer = () => {
    if (isRunning) pauseTimer();
    else startTimer();
  };

  const handleManualSkip = () => {
    completePhase();
  };

  const handleTaskSelect = (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    setTask(taskId, task.frogodoroSettings);
    setShowTaskDropdown(false);
  };

  const completeTaskWithAnimation = async (taskId: string) => {
    if (cinematic || grab) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.completed) return;

    await triggerTongue({
      key: taskId,
      completed: true,
      onPersist: () => {
        toggleTask(taskId, true);
        // The 3-second disappearance is handled in the useEffect below
      },
    });
  };

  // Handle 3-second disappearance of completed selected task
  useEffect(() => {
    if (!selectedTask || !selectedTaskId) return;

    if (selectedTask.completed) {
      const timeout = setTimeout(() => {
        // Clear if it's STILL the selected task after 3 seconds
        if (useFrogodoroStore.getState().selectedTaskId === selectedTask.id) {
          setTask('', DEFAULT_SETTINGS);
        }
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [selectedTask, selectedTaskId, setTask]);

  // Auto-complete task when target cycles are reached
  useEffect(() => {
    if (!selectedTask || !selectedTaskId || isRunning) return;

    // Check if we just completed all target cycles
    if (
      completedCycles > 0 &&
      completedCycles >= settings.expectedCycles &&
      !selectedTask.completed &&
      !visuallyDone.has(selectedTaskId)
    ) {
      completeTaskWithAnimation(selectedTaskId);
    }
  }, [
    completedCycles,
    settings.expectedCycles,
    selectedTask,
    selectedTaskId,
    isRunning,
    visuallyDone,
    cinematic,
    grab,
  ]);

  const saveSettings = async () => {
    setSettings(localSettings);
    setShowSettingsModal(false);

    // Attempt persist settings purely to backend if selected
    if (selectedTaskId && selectedTask) {
      // Optimistically update the SWR cache so the re-selection shows the new defaults immediately
      mutateToday(
        (curr) => {
          if (!curr) return curr;
          return {
            ...curr,
            tasks: curr.tasks.map((t) =>
              t.id === selectedTaskId
                ? { ...t, frogodoroSettings: localSettings }
                : t,
            ),
          };
        },
        { revalidate: false },
      );

      try {
        await fetch(`/api/tasks/${selectedTaskId}/frogodoro`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ settings: localSettings }),
        });
      } catch (e) {
        console.error('Error saving settings remotely', e);
      }
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Theming colors
  const getPhaseColor = () => {
    if (phase === 'focus') return 'bg-primary text-primary-foreground';
    if (phase === 'shortBreak') return 'bg-blue-500 text-white';
    return 'bg-purple-600 text-white';
  };

  if (loading || isTasksLoading) {
    return <LoadingScreen message="Loading Frogodoro..." />;
  }

  return (
    <main className="min-h-[100dvh] flex flex-col pb-24 pt-6 md:pt-10 transition-colors duration-500">
      <div className="w-full max-w-7xl px-4 pb-8 mx-auto md:px-8">
        <div className="relative grid items-start grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-8">
          {/* LEFT: FROG DISPLAY */}
          <div className="z-10 flex flex-col lg:items-start items-center gap-4 lg:col-span-4 lg:sticky lg:top-8 lg:gap-6">
            <FrogDisplay
              frogRef={frogRef}
              frogBoxRef={frogBoxRef}
              mouthOpen={!!grab}
              mouthOffset={{ y: -4 }}
              indices={indices}
              openWardrobe={isWardrobeOpen}
              onOpenChange={setWardrobeOpen}
              flyBalance={user ? flyStatus.balance : 5}
              rate={
                tasks.length > 0
                  ? (tasks.filter((t) => t.completed).length / tasks.length) *
                    100
                  : 0
              }
              done={tasks.filter((t) => t.completed).length}
              total={tasks.length}
              giftsClaimed={dailyGiftCount}
              hunger={user ? hungerStatus.hunger : 1000}
              maxHunger={user ? hungerStatus.maxHunger : 10000}
              animateHunger={!!user}
              isGuest={!user}
              onAddTask={() => router.push('/')}
              onMutateToday={() => mutateToday()}
              onOpenDailyReward={() => {}}
            />
          </div>

          {/* RIGHT: TIMER & TASK SELECTOR */}
          <div className="flex flex-col gap-4 lg:col-span-8 lg:gap-6 w-full max-w-2xl mx-auto">
            {/* TIMER CARD */}
            <div
              className={`px-6 py-6 md:px-10 md:py-8 rounded-[32px] shadow-2xl transition-colors duration-500 ${getPhaseColor()} relative overflow-hidden backdrop-blur-sm`}
            >
              {/* Top Phase Selector */}
              <div className="flex items-center justify-center gap-2 mb-10 md:mb-12">
                {[
                  { id: 'focus', label: 'Frogodoro' },
                  { id: 'shortBreak', label: 'Short Break' },
                  { id: 'longBreak', label: 'Long Break' },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => switchPhase(p.id as PomodoroPhase)}
                    className={`px-4 py-2 text-sm font-bold rounded-full transition-all ${
                      phase === p.id
                        ? 'bg-black/25 text-white shadow-inner'
                        : 'bg-transparent text-white/70 hover:bg-black/10'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Time Display */}
              <div className="text-[120px] md:text-[160px] font-black tabular-nums tracking-tighter text-center leading-none mb-10 drop-shadow-lg">
                {formatTime(timeLeft)}
              </div>

              {/* Controls */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 w-full max-w-md mx-auto h-20">
                <div className="col-start-2 flex justify-center">
                  <button
                    onClick={toggleTimer}
                    className={`
                  relative flex items-center justify-center px-8 md:px-12 py-4 h-20 bg-white text-[24px] md:text-[28px] 
                  font-black uppercase tracking-widest rounded-3xl shadow-[0_8px_0_rgba(0,0,0,0.15)] 
                  active:shadow-[0_0_0_rgba(0,0,0,0.15)] active:translate-y-2 transition-all group z-10
                  ${phase === 'focus' ? 'text-primary' : phase === 'shortBreak' ? 'text-blue-500' : 'text-purple-600'}
                `}
                  >
                    {isRunning ? (
                      <Pause className="w-8 h-8 mr-2 fill-current" />
                    ) : (
                      <Play className="w-8 h-8 mr-2 fill-current" />
                    )}
                    {isRunning ? 'PAUSE' : 'START'}
                  </button>
                </div>

                <div className="col-start-3 flex justify-start">
                  {isRunning && (
                    <button
                      onClick={handleManualSkip}
                      className="p-4 bg-white/20 hover:bg-white/30 rounded-2xl transition-colors backdrop-blur active:scale-95 text-white z-0"
                    >
                      <SkipForward className="w-8 h-8 fill-current opacity-90 relative left-0.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* TASK SELECTOR */}
            <div className="mt-4 text-center animate-fadeInUp">
              <p className="text-sm font-bold tracking-widest text-muted-foreground uppercase mb-4">
                #{completedCycles}
              </p>

              {selectedTask ? (
                <div
                  className="relative inline-block text-left w-full max-w-sm mx-auto z-20"
                  style={{ pointerEvents: cinematic ? 'none' : 'auto' }}
                >
                  <div
                    className="flex items-center justify-between p-4 bg-card border shadow-sm rounded-2xl cursor-pointer hover:border-primary transition-colors group"
                    onClick={() => setShowTaskDropdown(!showTaskDropdown)}
                  >
                    <div className="flex items-center gap-3 w-full pr-4">
                      <div
                        className="flex items-center justify-center p-2 -ml-2 rounded-full flex-shrink-0 cursor-pointer transition-colors hover:bg-primary/10 hover:text-primary z-30 group-hover:border-primary/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!visuallyDone.has(selectedTask.id))
                            completeTaskWithAnimation(selectedTask.id);
                        }}
                      >
                        {visuallyDone.has(selectedTask.id) ||
                        selectedTask.completed ? (
                          <CheckCircle2 className="w-8 h-8 text-primary" />
                        ) : (
                          <Fly
                            ref={(el) => {
                              flyRefs.current[selectedTask.id] = el;
                            }}
                            onClick={() => {}}
                            size={32}
                            y={-4}
                            x={-2}
                          />
                        )}
                      </div>
                      <span
                        className={`font-bold text-lg leading-tight truncate transition-colors duration-500 ${selectedTask.completed ? 'line-through text-muted-foreground' : ''}`}
                      >
                        {selectedTask.text}
                      </span>
                    </div>

                    {/* Right Side Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0 relative z-30">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowSettingsModal(!showSettingsModal);
                        }}
                        className="p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground rounded-lg transition-colors"
                      >
                        <Settings2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {showTaskDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute mt-2 w-full bg-popover border shadow-xl rounded-2xl z-30 max-h-[300px] overflow-y-auto"
                      >
                        {availableTasks.map((t) => (
                          <div
                            key={t.id}
                            className={`p-4 hover:bg-accent border-b last:border-0 cursor-pointer flex items-center gap-3 group transition-colors ${t.id === selectedTaskId ? 'bg-primary/5' : ''}`}
                            onClick={() => handleTaskSelect(t.id)}
                          >
                            <div className="flex items-center justify-center p-2 -ml-2 flex-shrink-0 z-30 pointer-events-none">
                              {visuallyDone.has(t.id) || t.completed ? (
                                <CheckCircle2 className="w-6 h-6 text-primary" />
                              ) : (
                                <Fly
                                  ref={(el) => {
                                    flyRefs.current[t.id] = el;
                                  }}
                                  onClick={() => {}}
                                  size={24}
                                  y={-2}
                                />
                              )}
                            </div>
                            <span className="font-medium flex-1 line-clamp-2">
                              {t.text}
                            </span>
                          </div>
                        ))}
                        {availableTasks.length === 0 && (
                          <div className="p-4 text-center text-muted-foreground text-sm">
                            No uncompleted tasks here!
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <button
                  onClick={() => setShowTaskDropdown(!showTaskDropdown)}
                  className="inline-flex items-center justify-center gap-2 px-6 py-4 bg-card border shadow-sm rounded-2xl cursor-pointer hover:border-primary transition-colors w-full max-w-sm mx-auto font-bold text-foreground relative z-20"
                >
                  <ListTodo className="w-5 h-5 text-primary" />
                  <span>Select a task to focus on...</span>
                  <ChevronDown className="w-5 h-5 text-muted-foreground ml-auto" />

                  <AnimatePresence>
                    {showTaskDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute top-full mt-2 left-0 w-full bg-popover border shadow-xl rounded-2xl z-30 max-h-[300px] overflow-y-auto text-left font-normal"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {availableTasks.map((t) => (
                          <div
                            key={t.id}
                            className="p-4 hover:bg-accent border-b last:border-0 cursor-pointer flex items-center gap-3 group"
                            onClick={() => handleTaskSelect(t.id)}
                          >
                            <div className="flex items-center justify-center p-2 -ml-2 flex-shrink-0 z-30 pointer-events-none">
                              {visuallyDone.has(t.id) || t.completed ? (
                                <CheckCircle2 className="w-6 h-6 text-primary" />
                              ) : (
                                <Fly
                                  ref={(el) => {
                                    flyRefs.current[t.id] = el;
                                  }}
                                  onClick={() => {}}
                                  size={24}
                                  y={-2}
                                />
                              )}
                            </div>
                            <span className="font-medium line-clamp-2 flex-1">
                              {t.text}
                            </span>
                          </div>
                        ))}
                        {availableTasks.length === 0 && (
                          <div className="p-4 text-center text-muted-foreground text-sm">
                            Great job! All tasks completed.
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>
              )}

              {/* Settings Modal */}
              <AnimatePresence>
                {showSettingsModal && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 10 }}
                      className="w-full max-w-sm relative bg-card border p-6 rounded-[24px] shadow-2xl text-left"
                    >
                      <button
                        onClick={() => setShowSettingsModal(false)}
                        className="absolute top-6 right-6 p-1 text-muted-foreground hover:bg-accent hover:text-foreground rounded-lg transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                      <h3 className="text-lg font-black mb-6 flex items-center gap-2 pr-8">
                        <Settings2 className="w-5 h-5 text-primary" />
                        Frogodoro Settings
                      </h3>

                      <div className="space-y-4">
                        <div>
                          <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">
                            Target Cycles
                          </label>
                          <input
                            type="number"
                            value={localSettings.expectedCycles}
                            onChange={(e) =>
                              setLocalSettings({
                                ...localSettings,
                                expectedCycles: Number(e.target.value),
                              })
                            }
                            className="w-full bg-background border px-3 py-2.5 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary outline-none transition-shadow"
                            min="1"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">
                              Focus (min)
                            </label>
                            <input
                              type="number"
                              value={localSettings.cycleDuration}
                              onChange={(e) =>
                                setLocalSettings({
                                  ...localSettings,
                                  cycleDuration: Number(e.target.value),
                                })
                              }
                              className="w-full bg-background border px-3 py-2.5 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary outline-none transition-shadow"
                              min="1"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">
                              Short Bk (min)
                            </label>
                            <input
                              type="number"
                              value={localSettings.shortBreakDuration}
                              onChange={(e) =>
                                setLocalSettings({
                                  ...localSettings,
                                  shortBreakDuration: Number(e.target.value),
                                })
                              }
                              className="w-full bg-background border px-3 py-2.5 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary outline-none transition-shadow"
                              min="1"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">
                              Long Bk (min)
                            </label>
                            <input
                              type="number"
                              value={localSettings.longBreakDuration}
                              onChange={(e) =>
                                setLocalSettings({
                                  ...localSettings,
                                  longBreakDuration: Number(e.target.value),
                                })
                              }
                              className="w-full bg-background border px-3 py-2.5 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary outline-none transition-shadow"
                              min="1"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">
                              Long Bk Int.
                            </label>
                            <input
                              type="number"
                              value={localSettings.longBreakInterval}
                              onChange={(e) =>
                                setLocalSettings({
                                  ...localSettings,
                                  longBreakInterval: Number(e.target.value),
                                })
                              }
                              className="w-full bg-background border px-3 py-2.5 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary outline-none transition-shadow"
                              min="1"
                            />
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={saveSettings}
                        className="mt-6 w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-4 py-3 rounded-xl transition-colors shadow-sm"
                      >
                        <Save className="w-5 h-5" />
                        Save Configuration
                      </button>
                    </motion.div>
                  </div>
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
          className="fixed inset-0 z-[60] pointer-events-none"
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
      <button
        type="button"
        aria-label="Tap anywhere to fast-forward tongue animation"
        className="fixed inset-0 z-[65] cursor-default bg-transparent"
        onClick={handleSkip}
        onTouchStart={handleSkip}
      />
    </>
  );
}
