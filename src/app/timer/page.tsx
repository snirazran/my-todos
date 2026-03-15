'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import { useTaskData } from '@/hooks/useTaskData';
import {
  useFrogodoroStore,
  PomodoroPhase,
  DEFAULT_SETTINGS,
  DEFAULT_SESSION_STATS,
} from '@/lib/frogodoroStore';
import { playTimerSound, type TimerSound } from '@/lib/timerSounds';
import {
  Play,
  Pause,
  SkipForward,
  Settings2,
  ChevronDown,
  CheckCircle2,
  ListTodo,
  X,
  Plus,
  Minus,
  HelpCircle,
  Save,
} from 'lucide-react';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/lib/uiStore';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { FrogDisplay } from '@/components/ui/FrogDisplay';
import { type FrogHandle } from '@/components/ui/frog';
import QuickAddSheet from '@/components/ui/QuickAddSheet';
import Fly from '@/components/ui/fly';
import { useFrogTongue, TONGUE_STROKE } from '@/hooks/useFrogTongue';

const FLY_PX = 24;

const Stepper = ({
  value,
  onChange,
  min = 1,
  max = 999,
  step = 1,
  suffix = '',
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) => (
  <div className="flex items-center w-full justify-between bg-muted/30 dark:bg-background/50 border border-border/60 rounded-[20px] p-[5px] shadow-sm overflow-hidden">
    <button
      onClick={() => onChange(Math.max(min, value - step))}
      className="w-10 h-10 flex flex-shrink-0 items-center justify-center rounded-[16px] bg-background dark:bg-muted/50 text-muted-foreground hover:bg-muted transition-all active:scale-95 shadow-sm"
      type="button"
    >
      <Minus className="w-4 h-4 stroke-[2.5]" />
    </button>
    <div className="flex items-baseline justify-center gap-1 font-black text-xl text-foreground px-1 flex-1 min-w-[3.5rem]">
      {value}
      {suffix && (
        <span className="text-[9px] text-muted-foreground font-extrabold uppercase tracking-widest translate-y-[-1px]">
          {suffix}
        </span>
      )}
    </div>
    <button
      onClick={() => onChange(Math.min(max, value + step))}
      className="w-10 h-10 flex flex-shrink-0 items-center justify-center rounded-[16px] bg-primary/10 text-primary hover:bg-primary/20 transition-all active:scale-95 shadow-sm"
      type="button"
    >
      <Plus className="w-4 h-4 stroke-[2.5]" />
    </button>
  </div>
);

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
    sessionStats,
    phaseElapsed: storeElapsed,
    setSettings,
    setTask,
    startTimer,
    pauseTimer,
    switchPhase,
    completePhase,
    setPhaseElapsed,
    resetSessionStats,
  } = useFrogodoroStore();

  // Derive elapsed from timeLeft so both timers update on the same render
  const phaseDuration =
    phase === 'focus'
      ? settings.cycleDuration * 60
      : phase === 'shortBreak'
        ? settings.shortBreakDuration * 60
        : settings.longBreakDuration * 60;
  const liveElapsed = phaseDuration - timeLeft;

  // Local UI State
  const [showTaskDropdown, setShowTaskDropdown] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [localSettings, setLocalSettings] = useState(settings); // For the modal forms

  // Lock body scroll when any modal is open
  useEffect(() => {
    const anyOpen = showSettingsModal || showHelpModal || showTaskDropdown;
    document.body.style.overflow = anyOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [showSettingsModal, showHelpModal, showTaskDropdown]);

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

  // phaseTimeRef tracks elapsed for stats purposes (used on phase transitions)
  const phaseTimeRef = useRef(storeElapsed);
  const runStartTimeRef = useRef<number | null>(null);
  const runStartElapsedRef = useRef(0);

  // Keep ref in sync when store resets (task change, phase complete, etc.)
  useEffect(() => {
    if (!isRunning) {
      phaseTimeRef.current = storeElapsed;
    }
  }, [storeElapsed, isRunning]);

  useEffect(() => {
    if (!isRunning) return;
    runStartTimeRef.current = Date.now();
    runStartElapsedRef.current = phaseTimeRef.current;

    const interval = setInterval(() => {
      if (runStartTimeRef.current === null) return;
      const segmentElapsed = Math.floor(
        (Date.now() - runStartTimeRef.current) / 1000,
      );
      phaseTimeRef.current = runStartElapsedRef.current + segmentElapsed;
      // No setPhaseElapsed here — display is derived from timeLeft instead
    }, 1000);
    return () => {
      clearInterval(interval);
      runStartTimeRef.current = null;
    };
  }, [isRunning]);

  // Reset phaseTimeRef on phase transitions (stats are now updated atomically in the store)
  const prevPhaseRef = useRef(phase);
  const prevCyclesRef = useRef(completedCycles);
  useEffect(() => {
    prevPhaseRef.current = phase;
    prevCyclesRef.current = completedCycles;
    phaseTimeRef.current = 0;
    setPhaseElapsed(0);
  }, [phase, completedCycles]);

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  };

  // Show stats when there are completed phases OR when the timer has been used at all
  const hasStats =
    sessionStats.focusSessions > 0 ||
    sessionStats.shortBreaks > 0 ||
    sessionStats.longBreaks > 0 ||
    isRunning ||
    liveElapsed > 0;

  // Mobile check for drawer animation
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const checkDesktop = () =>
      setIsDesktop(window.matchMedia('(min-width: 640px)').matches);
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);

  // Quick Add State
  const [showQuickAdd, setShowQuickAdd] = useState(false);

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
    completePhase(false, liveElapsed);
  };

  const handleTaskSelect = (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    setTask(
      taskId,
      task.frogodoroSettings
        ? { ...DEFAULT_SETTINGS, ...task.frogodoroSettings }
        : undefined,
    );
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
        // Only persist timer durations to backend — sound/autoStart are local prefs
        const {
          cycleDuration,
          shortBreakDuration,
          longBreakDuration,
          longBreakInterval,
        } = localSettings;
        await fetch(`/api/tasks/${selectedTaskId}/frogodoro`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            settings: {
              cycleDuration,
              shortBreakDuration,
              longBreakDuration,
              longBreakInterval,
            },
          }),
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
    if (phase === 'shortBreak') return 'bg-sky-500 dark:bg-sky-600 text-white';
    return 'bg-indigo-500 dark:bg-indigo-600 text-white';
  };

  if (loading || isTasksLoading) {
    return <LoadingScreen message="Loading Frogodoro..." />;
  }

  return (
    <main className="flex flex-col pt-6 transition-colors duration-500 md:pt-10">
      <div className="w-full px-4 pb-8 mx-auto max-w-7xl md:px-8">
        <div className="relative grid items-start grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-8">
          {/* LEFT: FROG DISPLAY */}
          <div className="z-10 flex flex-col gap-4 lg:col-span-4 lg:sticky lg:top-8 lg:gap-6">
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
          <div className="flex flex-col w-full max-w-2xl gap-4 mx-auto lg:col-span-8 lg:gap-6">
            {/* TIMER CARD */}
            <div
              className={`px-4 py-4 md:px-6 md:py-5 lg:px-10 lg:py-8 rounded-[28px] md:rounded-[32px] shadow-2xl transition-colors duration-500 ${getPhaseColor()} relative overflow-hidden backdrop-blur-sm group`}
            >
              {/* Top Phase Selector */}
              <div className="relative flex flex-wrap items-center justify-center gap-1 mb-5 md:gap-2 md:mb-6 lg:mb-12 sm:flex-nowrap">
                {[
                  { id: 'focus', label: 'Session' },
                  { id: 'shortBreak', label: 'Short Break' },
                  { id: 'longBreak', label: 'Long Break' },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      if (!isRunning) switchPhase(p.id as PomodoroPhase);
                    }}
                    className={`px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm font-bold rounded-full transition-all ${
                      phase === p.id
                        ? 'bg-black/25 text-white shadow-inner'
                        : isRunning
                          ? 'bg-transparent text-white/30 cursor-not-allowed'
                          : 'bg-transparent text-white/70 hover:bg-black/10'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Time Display */}
              <div className="text-[80px] md:text-[100px] lg:text-[160px] font-black tabular-nums tracking-tighter text-center leading-none mb-5 md:mb-6 lg:mb-10 drop-shadow-lg text-white">
                {formatTime(timeLeft)}
              </div>

              {/* Controls */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 md:gap-4 w-full max-w-md mx-auto h-14 md:h-16 lg:h-20">
                <div className="flex justify-end col-start-1">
                  <button
                    onClick={() => setShowHelpModal(true)}
                    className="p-3 md:p-3.5 lg:p-4 bg-white/20 md:hover:bg-white/30 rounded-xl md:rounded-2xl active:scale-95 text-white z-10 will-change-transform"
                    title="How Frogodoro Works"
                  >
                    <HelpCircle className="w-6 h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 text-white/90" />
                  </button>
                </div>

                <div className="flex justify-center col-start-2">
                  <button
                    onClick={toggleTimer}
                    className={`
                  relative flex items-center justify-center px-6 md:px-8 lg:px-12 py-3 md:py-3.5 lg:py-4 h-14 md:h-16 lg:h-20 bg-white dark:bg-slate-50 text-[18px] md:text-[22px] lg:text-[28px]
                  font-black uppercase tracking-widest rounded-2xl md:rounded-3xl shadow-[0_6px_0_rgba(0,0,0,0.15)] md:shadow-[0_8px_0_rgba(0,0,0,0.15)]
                  active:shadow-[0_0_0_rgba(0,0,0,0.15)] active:translate-y-1.5 md:active:translate-y-2 transition-all group z-10
                  ${phase === 'focus' ? 'text-primary' : phase === 'shortBreak' ? 'text-sky-500' : 'text-indigo-500'}
                `}
                  >
                    {isRunning ? (
                      <Pause className="w-5 h-5 md:w-6 md:h-6 lg:w-8 lg:h-8 mr-1.5 md:mr-2 fill-current" />
                    ) : (
                      <Play className="w-5 h-5 md:w-6 md:h-6 lg:w-8 lg:h-8 mr-1.5 md:mr-2 fill-current" />
                    )}
                    {isRunning ? 'PAUSE' : 'START'}
                  </button>
                </div>

                <div className="flex justify-start col-start-3">
                  {isRunning && (
                    <button
                      onClick={handleManualSkip}
                      className="p-3 md:p-3.5 lg:p-4 bg-white/20 hover:bg-white/30 rounded-xl md:rounded-2xl transition-colors backdrop-blur active:scale-95 text-white z-0"
                    >
                      <SkipForward className="w-6 h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 fill-current opacity-90 relative left-0.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* TASK SELECTOR */}
            <div className="mt-4 text-center animate-fadeInUp">
              {selectedTask ? (
                <div
                  className="relative z-20 w-full max-w-sm mx-auto"
                  style={{ pointerEvents: cinematic ? 'none' : 'auto' }}
                >
                  <div className="bg-card border border-border/60 shadow-lg rounded-[28px] overflow-hidden">
                    {/* Task Header */}
                    <div
                      className="flex items-center gap-3 p-4 pb-3 cursor-pointer group"
                      onClick={() => setShowTaskDropdown(true)}
                    >
                      <div className="relative flex items-center justify-center flex-shrink-0 pointer-events-none w-7 h-7">
                        <AnimatePresence initial={false}>
                          {!(
                            visuallyDone.has(selectedTask.id) ||
                            selectedTask.completed
                          ) ? (
                            <motion.div
                              key="fly"
                              initial={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.6 }}
                              transition={{
                                type: 'spring',
                                stiffness: 400,
                                damping: 25,
                              }}
                              className="absolute inset-0 flex items-center justify-center"
                            >
                              <Fly
                                ref={(el) => {
                                  flyRefs.current[selectedTask.id] = el;
                                }}
                                onClick={() => {}}
                                size={30}
                                y={-4}
                              />
                            </motion.div>
                          ) : (
                            <motion.div
                              key="check"
                              initial={{ opacity: 0, scale: 0.6 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{
                                type: 'spring',
                                stiffness: 400,
                                damping: 25,
                              }}
                              className="absolute inset-0 flex items-center justify-center"
                            >
                              <CheckCircle2 className="w-7 h-7 text-primary" />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                      <span
                        className={`flex-1 font-bold text-base leading-tight truncate text-left transition-colors duration-500 ${selectedTask.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}
                      >
                        {selectedTask.text}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowSettingsModal(!showSettingsModal);
                        }}
                        className="relative z-30 flex-shrink-0 p-2 transition-colors text-muted-foreground/50 hover:bg-accent hover:text-foreground rounded-xl"
                      >
                        <Settings2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Stats Row — inside the card */}
                    <AnimatePresence>
                      {hasStats && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="flex items-center gap-2.5 px-4 pb-3 flex-wrap">
                            {/* Focus — show if completed sessions exist OR currently in focus phase */}
                            {(sessionStats.focusSessions > 0 ||
                              phase === 'focus') && (
                              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/8 dark:bg-primary/15">
                                <div
                                  className={`w-2 h-2 rounded-full bg-primary ${isRunning && phase === 'focus' ? 'animate-pulse' : ''}`}
                                />
                                <span className="text-xs font-black text-primary tabular-nums">
                                  {sessionStats.focusSessions +
                                    (phase === 'focus' && liveElapsed > 0
                                      ? 1
                                      : 0)}
                                </span>
                                <span className="text-[11px] font-bold text-primary/60 tabular-nums">
                                  {formatDuration(
                                    sessionStats.focusTime +
                                      (phase === 'focus' ? liveElapsed : 0),
                                  )}
                                </span>
                              </div>
                            )}
                            {/* Short break */}
                            {(sessionStats.shortBreaks > 0 ||
                              phase === 'shortBreak') && (
                              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/8 dark:bg-sky-500/15">
                                <div
                                  className={`w-2 h-2 rounded-full bg-sky-500 ${isRunning && phase === 'shortBreak' ? 'animate-pulse' : ''}`}
                                />
                                <span className="text-xs font-black text-sky-500 tabular-nums">
                                  {sessionStats.shortBreaks +
                                    (phase === 'shortBreak' && liveElapsed > 0
                                      ? 1
                                      : 0)}
                                </span>
                                <span className="text-[11px] font-bold text-sky-500/60 tabular-nums">
                                  {formatDuration(
                                    sessionStats.shortBreakTime +
                                      (phase === 'shortBreak'
                                        ? liveElapsed
                                        : 0),
                                  )}
                                </span>
                              </div>
                            )}
                            {/* Long break */}
                            {(sessionStats.longBreaks > 0 ||
                              phase === 'longBreak') && (
                              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/8 dark:bg-indigo-500/15">
                                <div
                                  className={`w-2 h-2 rounded-full bg-indigo-500 ${isRunning && phase === 'longBreak' ? 'animate-pulse' : ''}`}
                                />
                                <span className="text-xs font-black text-indigo-500 tabular-nums">
                                  {sessionStats.longBreaks +
                                    (phase === 'longBreak' && liveElapsed > 0
                                      ? 1
                                      : 0)}
                                </span>
                                <span className="text-[11px] font-bold text-indigo-500/60 tabular-nums">
                                  {formatDuration(
                                    sessionStats.longBreakTime +
                                      (phase === 'longBreak' ? liveElapsed : 0),
                                  )}
                                </span>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Finish Task — integrated footer */}
                    {!selectedTask.completed &&
                      !visuallyDone.has(selectedTask.id) && (
                        <div className="px-3 pb-3">
                          <button
                            onClick={() =>
                              completeTaskWithAnimation(selectedTask.id)
                            }
                            className="w-full py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider bg-emerald-500 text-white shadow-md shadow-emerald-500/20 hover:bg-emerald-600 transition-all active:scale-[0.97]"
                          >
                            <span className="flex items-center justify-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Finish Task
                            </span>
                          </button>
                        </div>
                      )}
                  </div>
                </div>
              ) : (
                <div className="relative z-20 w-full max-w-sm mx-auto">
                  <button
                    onClick={() => setShowTaskDropdown(true)}
                    className="w-full bg-card border border-border/60 shadow-lg rounded-[28px] p-4 flex items-center gap-3 cursor-pointer hover:border-primary/40 transition-all active:scale-[0.98] group"
                  >
                    <div className="flex items-center justify-center flex-shrink-0 w-10 h-10 transition-colors rounded-full bg-primary/10 group-hover:bg-primary/15">
                      <Fly size={24} y={-2} />
                    </div>
                    <span className="flex-1 text-sm font-bold text-left text-muted-foreground/60">
                      Pick a fly to focus on...
                    </span>
                    <ChevronDown className="flex-shrink-0 w-4 h-4 text-muted-foreground/40" />
                  </button>
                </div>
              )}

              {/* Help Modal */}
              <AnimatePresence>
                {showHelpModal && (
                  <div className="fixed inset-0 z-[100] flex flex-col justify-end sm:items-center sm:justify-center p-0 sm:p-4">
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                      onClick={() => setShowHelpModal(false)}
                    />
                    <motion.div
                      onClick={(e) => e.stopPropagation()}
                      initial={{ opacity: 0, scale: 0.95, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 20 }}
                      className="w-full sm:max-w-lg bg-card sm:border sm:rounded-[32px] rounded-t-[32px] p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6 shadow-2xl text-left relative z-10"
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h3 className="text-xl font-black text-foreground">
                            How it works
                          </h3>
                          <p className="text-sm text-muted-foreground/70 font-medium mt-0.5">
                            Focus in sessions. Rest between them.
                          </p>
                        </div>
                        <button
                          onClick={() => setShowHelpModal(false)}
                          className="flex items-center justify-center w-8 h-8 transition-colors rounded-full bg-muted/60 text-muted-foreground hover:bg-muted"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="space-y-4">
                        {/* Step 1 */}
                        <div className="flex items-center gap-3 px-4 py-3 border rounded-2xl bg-muted/30 border-border/40">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted/60 shrink-0">
                            <Fly size={18} y={-2} onClick={() => {}} />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-foreground">
                              Pick a fly
                            </p>
                            <p className="text-xs font-medium text-muted-foreground/60">
                              Choose a task to work on below the timer.
                            </p>
                          </div>
                        </div>

                        {/* The Cycle */}
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50 px-1">
                            Your Work Cycle
                          </p>
                          <div className="overflow-hidden border rounded-2xl border-border/50 bg-muted/10">
                            <div className="flex items-center gap-3 px-4 py-3 border-b bg-primary/5 border-border/30">
                              <div className="w-2.5 h-2.5 rounded-full bg-primary shrink-0" />
                              <p className="flex-1 text-sm font-semibold text-foreground">
                                Focus
                              </p>
                              <span className="text-xs font-black text-primary tabular-nums">
                                {settings.cycleDuration}m
                              </span>
                            </div>

                            <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border/30">
                              <div className="w-2.5 flex justify-center shrink-0">
                                <div className="w-px h-3 bg-border/50" />
                              </div>
                              <p className="text-[11px] text-muted-foreground/40 italic">
                                then
                              </p>
                            </div>

                            <div className="flex items-center gap-3 px-4 py-3 border-b bg-sky-500/5 border-border/30">
                              <div className="w-2.5 h-2.5 rounded-full bg-sky-400 shrink-0" />
                              <p className="flex-1 text-sm font-semibold text-foreground">
                                Short Break
                              </p>
                              <span className="text-xs font-black text-sky-500 tabular-nums">
                                {settings.shortBreakDuration}m
                              </span>
                            </div>

                            <div className="flex items-center gap-3 px-4 py-2 border-b border-border/30 bg-muted/20">
                              <div className="w-2.5 flex justify-center shrink-0">
                                <svg
                                  className="w-3 h-3 text-muted-foreground/35"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                  />
                                </svg>
                              </div>
                              <p className="text-[11px] text-muted-foreground/55 font-medium">
                                Repeat {settings.longBreakInterval}× before the
                                long break
                              </p>
                            </div>

                            <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border/30">
                              <div className="w-2.5 flex justify-center shrink-0">
                                <div className="w-px h-3 bg-border/50" />
                              </div>
                              <p className="text-[11px] text-muted-foreground/40 italic">
                                then
                              </p>
                            </div>

                            <div className="flex items-center gap-3 px-4 py-3 bg-indigo-500/5">
                              <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0" />
                              <p className="flex-1 text-sm font-semibold text-foreground">
                                Long Break
                              </p>
                              <span className="text-xs font-black text-indigo-500 tabular-nums">
                                {settings.longBreakDuration}m
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Finish tip */}
                        <div className="flex items-center gap-3 px-4 py-3 border rounded-2xl bg-emerald-500/5 border-emerald-500/15">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          <p className="text-xs font-medium leading-snug text-muted-foreground/80">
                            Tap{' '}
                            <span className="font-bold text-foreground">
                              Finish Task
                            </span>{' '}
                            when you're done.
                          </p>
                        </div>

                        {/* Settings hint */}
                        <p className="text-[11px] text-muted-foreground/40 text-center font-medium flex items-center justify-center gap-1">
                          Customize durations in{' '}
                          <Settings2 className="inline w-3 h-3" /> Settings
                        </p>
                      </div>

                      <button
                        onClick={() => setShowHelpModal(false)}
                        className="mt-5 w-full py-3.5 rounded-2xl font-black text-sm bg-primary text-primary-foreground shadow-md shadow-primary/20 active:scale-[0.98] transition-all"
                      >
                        Got it!
                      </button>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>

              {/* Settings Modal */}
              <AnimatePresence>
                {showSettingsModal && (
                  <div className="fixed inset-0 z-[100] flex flex-col justify-end sm:items-center sm:justify-center p-0 sm:p-4">
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                      onClick={() => setShowSettingsModal(false)}
                    />
                    <motion.div
                      onClick={(e) => e.stopPropagation()}
                      initial={{ opacity: 0, y: '100%' }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: '100%' }}
                      transition={{
                        type: 'spring',
                        damping: 25,
                        stiffness: 300,
                      }}
                      className="w-full sm:max-w-lg bg-card sm:border sm:rounded-[32px] rounded-t-[32px] p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6 shadow-2xl text-left max-h-[90vh] overflow-y-auto overscroll-y-contain relative z-10 scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between mb-7">
                        <h3 className="text-xl font-black text-foreground">
                          Timer Settings
                        </h3>
                        <button
                          onClick={() => setShowSettingsModal(false)}
                          className="flex items-center justify-center w-8 h-8 transition-colors rounded-full bg-muted/60 text-muted-foreground hover:bg-muted"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="space-y-6">
                        {/* ── Work Cycle Builder ── */}
                        <div className="space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50 px-1">
                            Work Cycle
                          </p>

                          <div className="overflow-hidden border rounded-2xl border-border/50 bg-muted/10">
                            {/* Step 1: Focus */}
                            <div className="flex items-center gap-3 px-4 py-3.5 bg-primary/5 border-b border-border/40">
                              <div className="flex items-center justify-center flex-shrink-0 w-8 h-8 rounded-full bg-primary/15">
                                <div className="w-3 h-3 rounded-full bg-primary" />
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-foreground">
                                  Focus
                                </p>
                                <p className="text-xs text-muted-foreground/60">
                                  Deep work, no distractions
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setLocalSettings({
                                      ...localSettings,
                                      cycleDuration: Math.max(
                                        5,
                                        localSettings.cycleDuration - 5,
                                      ),
                                    })
                                  }
                                  className="flex items-center justify-center w-6 h-6 text-sm transition-all border rounded-full select-none bg-background border-border/70 text-muted-foreground hover:border-border active:scale-90"
                                >
                                  −
                                </button>
                                <span className="w-12 text-sm font-black text-center text-primary tabular-nums">
                                  {localSettings.cycleDuration}m
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setLocalSettings({
                                      ...localSettings,
                                      cycleDuration: Math.min(
                                        120,
                                        localSettings.cycleDuration + 5,
                                      ),
                                    })
                                  }
                                  className="flex items-center justify-center w-6 h-6 text-sm transition-all rounded-full select-none bg-primary/10 text-primary hover:bg-primary/20 active:scale-90"
                                >
                                  +
                                </button>
                              </div>
                            </div>

                            {/* Connector + "then short break" */}
                            <div className="flex items-center gap-3 px-4 py-2 border-b border-border/40">
                              <div className="flex justify-center flex-shrink-0 w-8">
                                <div className="w-px h-4 bg-border/60" />
                              </div>
                              <p className="text-xs italic text-muted-foreground/50">
                                then
                              </p>
                            </div>

                            {/* Step 2: Short Break */}
                            <div className="flex items-center gap-3 px-4 py-3.5 bg-sky-500/5 border-b border-border/40">
                              <div className="flex items-center justify-center flex-shrink-0 w-8 h-8 rounded-full bg-sky-500/10">
                                <div className="w-3 h-3 rounded-full bg-sky-400" />
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-foreground">
                                  Short Break
                                </p>
                                <p className="text-xs text-muted-foreground/60">
                                  Step away, breathe
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setLocalSettings({
                                      ...localSettings,
                                      shortBreakDuration: Math.max(
                                        1,
                                        localSettings.shortBreakDuration - 1,
                                      ),
                                    })
                                  }
                                  className="flex items-center justify-center w-6 h-6 text-sm transition-all border rounded-full select-none bg-background border-border/70 text-muted-foreground hover:border-border active:scale-90"
                                >
                                  −
                                </button>
                                <span className="w-12 text-sm font-black text-center text-sky-500 tabular-nums">
                                  {localSettings.shortBreakDuration}m
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setLocalSettings({
                                      ...localSettings,
                                      shortBreakDuration: Math.min(
                                        30,
                                        localSettings.shortBreakDuration + 1,
                                      ),
                                    })
                                  }
                                  className="flex items-center justify-center w-6 h-6 text-sm transition-all rounded-full select-none bg-sky-500/10 text-sky-500 hover:bg-sky-500/20 active:scale-90"
                                >
                                  +
                                </button>
                              </div>
                            </div>

                            {/* Repeat control */}
                            <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/20 border-border/40">
                              <div className="flex justify-center flex-shrink-0 w-8">
                                <svg
                                  className="w-4 h-4 text-muted-foreground/40"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                  />
                                </svg>
                              </div>
                              <div className="flex-1">
                                <p className="text-xs font-medium text-muted-foreground/70">
                                  Rounds before long break
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setLocalSettings({
                                      ...localSettings,
                                      longBreakInterval: Math.max(
                                        1,
                                        localSettings.longBreakInterval - 1,
                                      ),
                                    })
                                  }
                                  className="flex items-center justify-center w-6 h-6 text-sm transition-all border rounded-full select-none bg-background border-border/70 text-muted-foreground hover:border-border active:scale-90"
                                >
                                  −
                                </button>
                                <span className="w-5 text-sm font-black text-center tabular-nums text-foreground">
                                  {localSettings.longBreakInterval}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setLocalSettings({
                                      ...localSettings,
                                      longBreakInterval: Math.min(
                                        10,
                                        localSettings.longBreakInterval + 1,
                                      ),
                                    })
                                  }
                                  className="flex items-center justify-center w-6 h-6 text-sm transition-all rounded-full select-none bg-primary/10 text-primary hover:bg-primary/20 active:scale-90"
                                >
                                  +
                                </button>
                                <span className="text-xs text-muted-foreground/50 ml-0.5">
                                  {localSettings.longBreakInterval === 1
                                    ? 'time'
                                    : 'times'}
                                </span>
                              </div>
                            </div>

                            {/* Connector */}
                            <div className="flex items-center gap-3 px-4 py-2 border-b border-border/40">
                              <div className="flex justify-center flex-shrink-0 w-8">
                                <div className="w-px h-4 bg-border/60" />
                              </div>
                              <p className="text-xs italic text-muted-foreground/50">
                                then
                              </p>
                            </div>

                            {/* Step 3: Long Break */}
                            <div className="flex items-center gap-3 px-4 py-3.5 bg-indigo-500/5">
                              <div className="flex items-center justify-center flex-shrink-0 w-8 h-8 rounded-full bg-indigo-500/10">
                                <div className="w-3 h-3 bg-indigo-500 rounded-full" />
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-foreground">
                                  Long Break
                                </p>
                                <p className="text-xs text-muted-foreground/60">
                                  After {localSettings.longBreakInterval} focus{' '}
                                  {localSettings.longBreakInterval === 1
                                    ? 'session'
                                    : 'sessions'}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setLocalSettings({
                                      ...localSettings,
                                      longBreakDuration: Math.max(
                                        5,
                                        localSettings.longBreakDuration - 5,
                                      ),
                                    })
                                  }
                                  className="flex items-center justify-center w-6 h-6 text-sm transition-all border rounded-full select-none bg-background border-border/70 text-muted-foreground hover:border-border active:scale-90"
                                >
                                  −
                                </button>
                                <span className="w-12 text-sm font-black text-center text-indigo-500 tabular-nums">
                                  {localSettings.longBreakDuration}m
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setLocalSettings({
                                      ...localSettings,
                                      longBreakDuration: Math.min(
                                        60,
                                        localSettings.longBreakDuration + 5,
                                      ),
                                    })
                                  }
                                  className="flex items-center justify-center w-6 h-6 text-sm text-indigo-500 transition-all rounded-full select-none bg-indigo-500/10 hover:bg-indigo-500/20 active:scale-90"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* ── Auto-start breaks ── */}
                        <button
                          type="button"
                          onClick={() =>
                            setLocalSettings({
                              ...localSettings,
                              autoStartBreaks: !localSettings.autoStartBreaks,
                            })
                          }
                          className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border transition-all active:scale-[0.98] ${
                            localSettings.autoStartBreaks
                              ? 'bg-primary/8 border-primary/25 text-primary'
                              : 'bg-muted/20 border-border/50 text-muted-foreground'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <svg
                              className="flex-shrink-0 w-4 h-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                              />
                            </svg>
                            <div className="text-left">
                              <p className="text-sm font-semibold">
                                Auto-start breaks
                              </p>
                              <p
                                className={`text-[11px] font-medium ${localSettings.autoStartBreaks ? 'text-primary/60' : 'text-muted-foreground/50'}`}
                              >
                                Breaks begin automatically when focus ends
                              </p>
                            </div>
                          </div>
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded-full ${localSettings.autoStartBreaks ? 'bg-primary/15' : 'bg-muted-foreground/10'}`}
                          >
                            {localSettings.autoStartBreaks ? 'On' : 'Off'}
                          </span>
                        </button>

                        {/* ── Finish Sound ── */}
                        <div className="space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50 px-1">
                            Finish Sound
                          </p>
                          <div className="flex gap-2">
                            {(
                              [
                                { id: 'bell', label: 'Bell' },
                                { id: 'chime', label: 'Chime' },
                                { id: 'digital', label: 'Digital' },
                                { id: 'none', label: 'Silent' },
                              ] as { id: TimerSound; label: string }[]
                            ).map(({ id, label }) => (
                              <button
                                key={id}
                                type="button"
                                onClick={() => {
                                  setLocalSettings({
                                    ...localSettings,
                                    timerSound: id,
                                  });
                                  playTimerSound(id);
                                }}
                                className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-95 ${
                                  localSettings.timerSound === id
                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                    : 'bg-muted/40 text-muted-foreground hover:bg-muted/70 border border-border/50'
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                          <p className="text-[11px] text-muted-foreground/40 px-1">
                            Tap to preview
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={saveSettings}
                        className="mt-8 w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-base py-3.5 rounded-2xl transition-all active:scale-[0.98]"
                      >
                        Save
                      </button>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>

              {/* Task Selector Bottom Sheet / Modal */}
              <AnimatePresence>
                {showTaskDropdown && (
                  <div className="fixed inset-0 z-[100] flex items-end sm:items-center sm:justify-center pointer-events-none sm:p-4">
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setShowTaskDropdown(false)}
                      className="absolute inset-0 pointer-events-auto bg-black/60 backdrop-blur-sm"
                    />
                    <motion.div
                      variants={
                        isDesktop
                          ? {
                              initial: { opacity: 0, scale: 0.95, y: 0 },
                              animate: { opacity: 1, scale: 1, y: 0 },
                              exit: { opacity: 0, scale: 0.95, y: 0 },
                            }
                          : {
                              initial: { y: '100%' },
                              animate: { y: 0 },
                              exit: { y: '100%' },
                            }
                      }
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      transition={{
                        type: 'spring',
                        damping: 28,
                        stiffness: 300,
                      }}
                      drag={!isDesktop ? 'y' : false}
                      dragConstraints={{ top: 0, bottom: 300 }}
                      dragElastic={0}
                      dragMomentum={false}
                      onDragEnd={(e, { offset, velocity }) => {
                        if (offset.y > 100 || velocity.y > 500) {
                          setShowTaskDropdown(false);
                        }
                      }}
                      className="w-full sm:max-w-md bg-card border border-border/60 rounded-t-[32px] sm:rounded-[28px] shadow-2xl pointer-events-auto relative z-10 max-h-[85vh] flex flex-col overflow-hidden"
                    >
                      {/* Drag Handle */}
                      <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-muted-foreground/20 rounded-full sm:hidden z-10" />

                      {/* Header */}
                      <div className="flex items-center justify-between px-6 pt-8 pb-4 sm:pt-6">
                        <div className="text-left">
                          <h3 className="text-lg font-black text-foreground">
                            Pick a Fly
                          </h3>
                          <p className="text-[11px] font-bold text-muted-foreground/50 uppercase tracking-widest mt-0.5">
                            {availableTasks.length}{' '}
                            {availableTasks.length === 1 ? 'task' : 'tasks'}{' '}
                            available
                          </p>
                        </div>
                        <button
                          onClick={() => setShowTaskDropdown(false)}
                          className="flex items-center justify-center transition-colors w-9 h-9 rounded-xl bg-muted/50 hover:bg-muted text-muted-foreground"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Task List */}
                      <div className="flex-1 px-3 pb-6 overflow-y-auto scrollbar-hide">
                        <div className="space-y-1.5">
                          {availableTasks.map((t) => (
                            <button
                              key={t.id}
                              className={`w-full text-left p-3.5 flex items-center gap-3 rounded-2xl transition-all active:scale-[0.98] border ${
                                t.id === selectedTaskId
                                  ? 'bg-primary/8 dark:bg-primary/15 border-primary/30'
                                  : 'border-transparent md:hover:bg-muted/50'
                              }`}
                              onClick={() => handleTaskSelect(t.id)}
                            >
                              <div className="relative flex items-center justify-center flex-shrink-0 rounded-full w-9 h-9 bg-muted/50">
                                <div
                                  className={`transition-opacity duration-300 ${visuallyDone.has(t.id) || t.completed ? 'opacity-0' : 'opacity-100'}`}
                                >
                                  <Fly
                                    ref={null}
                                    onClick={() => {}}
                                    size={22}
                                    y={-2}
                                  />
                                </div>
                                {(visuallyDone.has(t.id) || t.completed) && (
                                  <CheckCircle2 className="absolute w-5 h-5 duration-300 text-primary animate-in zoom-in spin-in-12" />
                                )}
                              </div>
                              <span className="flex-1 text-sm font-bold line-clamp-2 text-foreground">
                                {t.text}
                              </span>
                              {t.id === selectedTaskId && (
                                <div className="flex-shrink-0 w-2 h-2 rounded-full bg-primary" />
                              )}
                            </button>
                          ))}
                        </div>
                        {availableTasks.length === 0 && (
                          <button
                            onClick={() => {
                              setShowTaskDropdown(false);
                              setShowQuickAdd(true);
                            }}
                            className="flex flex-col items-center justify-center w-full p-8 mt-2 text-center transition-all border-2 border-dashed cursor-pointer border-muted-foreground/15 bg-muted/20 hover:bg-muted/40 rounded-2xl group"
                          >
                            <div className="flex items-center justify-center mb-3 transition-all border rounded-full opacity-100 w-14 h-14 bg-muted/50 border-muted-foreground/10 md:grayscale md:opacity-70 grayscale-0 group-hover:grayscale-0 group-hover:opacity-100">
                              <Fly size={28} y={-2} />
                            </div>
                            <p className="text-sm font-black transition-colors text-muted-foreground group-hover:text-primary">
                              {tasks.length > 0
                                ? 'All caught up!'
                                : 'No tasks yet'}
                            </p>
                            <p className="text-[11px] font-bold text-muted-foreground/50 mt-1">
                              Tap to add a new task
                            </p>
                          </button>
                        )}
                      </div>
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
      {/* Block interactions during tongue animation (no speed-up UI on this page) */}
      {cinematic && (
        <button
          type="button"
          aria-label="Animation in progress"
          className="fixed inset-0 z-[65] cursor-default bg-transparent"
          onClick={speedUpTongue}
          onTouchStart={speedUpTongue}
        />
      )}

      <QuickAddSheet
        open={showQuickAdd}
        onOpenChange={setShowQuickAdd}
        initialText=""
        defaultRepeat="this-week"
        defaultMode="pick"
        hideDayPicker={true}
        hideRepeatPicker={true}
        onSubmit={async ({ text, days, repeat, tags }) => {
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          const res = await fetch('/api/tasks?view=board', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, days, repeat, tags, timezone: tz }),
          });

          if (res.ok) {
            const data = await res.json();
            if (data.ok && data.tasks && data.tasks.length > 0) {
              setTask(data.tasks[0].id, DEFAULT_SETTINGS);
            }
          }

          setShowQuickAdd(false);
          // Refetch tasks using the hook's mutate function
          mutateToday();
        }}
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
        className="fixed inset-0 z-[65] cursor-default bg-transparent"
        onClick={handleSkip}
        onTouchStart={handleSkip}
      />

      {/* Visual skip hint (non-interactive): aligned with bottom notification zone */}
      <div className="fixed bottom-0 left-0 right-0 z-[66] flex justify-center pointer-events-none px-4 pb-[calc(env(safe-area-inset-bottom)+176px)]">
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
            className="flex items-center justify-center w-6 h-6 transition-colors duration-200 rounded-full bg-primary/15 text-primary"
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
