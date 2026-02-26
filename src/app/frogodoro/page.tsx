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
  <div className="flex items-center w-full justify-between bg-white dark:bg-card border border-border/60 rounded-[20px] p-[5px] shadow-sm overflow-hidden">
    <button
      onClick={() => onChange(Math.max(min, value - step))}
      className="w-10 h-10 flex flex-shrink-0 items-center justify-center rounded-[16px] bg-muted/60 text-muted-foreground hover:bg-muted transition-all active:scale-95"
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
      className="w-10 h-10 flex flex-shrink-0 items-center justify-center rounded-[16px] bg-primary/10 text-primary hover:bg-primary/20 transition-all active:scale-95"
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
  const [showHelpModal, setShowHelpModal] = useState(false);
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
              className={`px-6 py-6 md:px-10 md:py-8 rounded-[32px] shadow-2xl transition-colors duration-500 ${getPhaseColor()} relative overflow-hidden backdrop-blur-sm group`}
            >
              {/* Help Button */}
              <button
                onClick={() => setShowHelpModal(true)}
                className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors opacity-80 hover:opacity-100 hidden sm:block z-50 cursor-pointer"
                title="How Frogodoro Works"
              >
                <HelpCircle className="w-6 h-6" />
              </button>

              {/* Top Phase Selector */}
              <div className="flex items-center justify-center gap-2 mb-10 md:mb-12 relative flex-wrap sm:flex-nowrap">
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
                    onClick={() => setShowTaskDropdown(true)}
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
                        {/* Always render the fly so the ref exists, but hide it if visually done */}
                        <div
                          className={`transition-opacity duration-300 w-8 h-8 flex items-center justify-center ${visuallyDone.has(selectedTask.id) || selectedTask.completed ? 'opacity-0' : 'opacity-100'}`}
                        >
                          <Fly
                            ref={(el) => {
                              flyRefs.current[selectedTask.id] = el;
                            }}
                            onClick={() => {}}
                            size={32}
                            y={0}
                            x={0}
                          />
                        </div>

                        {/* Show the checkmark when visually done */}
                        {(visuallyDone.has(selectedTask.id) ||
                          selectedTask.completed) && (
                          <CheckCircle2 className="absolute w-8 h-8 text-primary animate-in zoom-in spin-in-12 duration-300" />
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
                </div>
              ) : (
                <button
                  onClick={() => setShowTaskDropdown(true)}
                  className="inline-flex items-center justify-center gap-2 px-6 py-4 bg-card border shadow-sm rounded-2xl cursor-pointer hover:border-primary transition-colors w-full max-w-sm mx-auto font-bold text-foreground relative z-20"
                >
                  <ListTodo className="w-5 h-5 text-primary" />
                  <span>Select a task to focus on...</span>
                  <ChevronDown className="w-5 h-5 text-muted-foreground ml-auto" />
                </button>
              )}

              {/* Help Modal */}
              <AnimatePresence>
                {showHelpModal && (
                  <div
                    className="fixed inset-0 z-[100] flex flex-col justify-end sm:items-center sm:justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
                    onClick={() => setShowHelpModal(false)}
                  >
                    <motion.div
                      onClick={(e) => e.stopPropagation()}
                      initial={{ opacity: 0, scale: 0.95, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 20 }}
                      className="w-full sm:max-w-lg bg-card sm:border sm:rounded-[32px] rounded-t-[32px] p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-8 shadow-2xl text-left relative"
                    >
                      <button
                        onClick={() => setShowHelpModal(false)}
                        className="absolute top-6 right-6 p-2 text-muted-foreground hover:bg-muted hover:text-foreground rounded-full transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>

                      <h3 className="text-xl font-black mb-6 flex items-center gap-2.5 text-foreground pr-10">
                        <HelpCircle className="w-6 h-6 text-primary" />
                        How Frogodoro Works
                      </h3>

                      <div className="space-y-5 text-sm md:text-[15px] font-medium text-muted-foreground leading-relaxed">
                        <p>
                          <strong>Frogodoro</strong> is a variation of the
                          classic Pomodoro Technique designed to help you power
                          through tasks by breaking work into intervals,
                          separated by short breaks. We call these focus
                          sessions "eating the frog" 🐸.
                        </p>

                        <div className="bg-muted/30 p-4 rounded-[20px] space-y-4">
                          <div className="flex items-start gap-3">
                            <span className="text-lg">⏱️</span>
                            <div>
                              <h4 className="font-bold text-foreground mb-0.5">
                                1. Focus
                              </h4>
                              <p>
                                Pick a task and immerse yourself completely
                                until the timer rings.
                              </p>
                            </div>
                          </div>

                          <div className="flex items-start gap-3">
                            <span className="text-lg">☕</span>
                            <div>
                              <h4 className="font-bold text-foreground mb-0.5">
                                2. Short Break
                              </h4>
                              <p>
                                Take a quick breather. Stretch, drink water,
                                step away from the screen.
                              </p>
                            </div>
                          </div>

                          <div className="flex items-start gap-3">
                            <span className="text-lg">🛋️</span>
                            <div>
                              <h4 className="font-bold text-foreground mb-0.5">
                                3. Long Break
                              </h4>
                              <p>
                                After completing several cycles (your interval
                                setting), take a longer rest to fully recharge
                                your brain.
                              </p>
                            </div>
                          </div>
                        </div>

                        <p className="pt-2 text-[13px] text-center opacity-80">
                          Configure these durations and cycle counts via the ⚙️
                          settings.
                        </p>
                      </div>

                      <button
                        onClick={() => setShowHelpModal(false)}
                        className="mt-8 w-full flex items-center justify-center bg-primary hover:bg-primary/90 text-primary-foreground font-black text-lg px-4 py-4 rounded-[20px] transition-all shadow-md active:scale-[0.98]"
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
                  <div
                    className="fixed inset-0 z-[100] flex flex-col justify-end sm:items-center sm:justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
                    onClick={() => setShowSettingsModal(false)}
                  >
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
                      className="w-full sm:max-w-lg bg-card sm:border sm:rounded-[32px] rounded-t-[32px] p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6 shadow-2xl text-left max-h-[90vh] overflow-y-auto relative"
                    >
                      <button
                        onClick={() => setShowSettingsModal(false)}
                        className="absolute top-6 right-6 p-2 text-muted-foreground hover:bg-muted hover:text-foreground rounded-full transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                      <h3 className="text-xl font-black mb-8 flex items-center gap-2.5 text-foreground pr-10">
                        <Settings2 className="w-6 h-6 text-primary" />
                        Frogodoro Settings
                      </h3>

                      <div className="space-y-4">
                        {/* Target Cycles */}
                        <div className="bg-background border border-border/60 p-4 rounded-[24px]">
                          <label className="flex flex-col mb-4">
                            <span className="text-[16px] font-black text-foreground flex items-center gap-2">
                              🎯 Target Cycles
                            </span>
                            <span className="text-[13px] text-muted-foreground mt-1 leading-snug font-medium">
                              How many focus sessions you plan to complete for
                              this task.
                            </span>
                          </label>
                          <Stepper
                            value={localSettings.expectedCycles || 3}
                            onChange={(v) =>
                              setLocalSettings({
                                ...localSettings,
                                expectedCycles: v,
                              })
                            }
                            suffix="cycles"
                            min={1}
                            max={99}
                          />
                        </div>

                        {/* Focus & Short Break */}
                        <div className="grid grid-cols-2 gap-3 sm:gap-4">
                          <div className="bg-background border border-border/60 p-3.5 rounded-[24px] flex flex-col justify-between">
                            <label className="flex flex-col mb-4 items-center">
                              <span className="text-[14px] sm:text-[15px] font-black text-foreground flex items-center gap-1.5">
                                ⏱️ Focus
                              </span>
                              <span className="text-[11px] text-muted-foreground mt-0.5 font-medium">
                                Session length
                              </span>
                            </label>
                            <Stepper
                              value={localSettings.cycleDuration}
                              onChange={(v) =>
                                setLocalSettings({
                                  ...localSettings,
                                  cycleDuration: v,
                                })
                              }
                              suffix="min"
                              step={5}
                              min={5}
                              max={360}
                            />
                          </div>

                          <div className="bg-background border border-border/60 p-3.5 rounded-[24px] flex flex-col justify-between">
                            <label className="flex flex-col mb-4 items-center">
                              <span className="text-[14px] sm:text-[15px] font-black text-foreground flex items-center gap-1.5">
                                ☕ Rest
                              </span>
                              <span className="text-[11px] text-muted-foreground mt-0.5 font-medium">
                                Short break
                              </span>
                            </label>
                            <Stepper
                              value={localSettings.shortBreakDuration}
                              onChange={(v) =>
                                setLocalSettings({
                                  ...localSettings,
                                  shortBreakDuration: v,
                                })
                              }
                              suffix="min"
                              step={5}
                              min={5}
                              max={360}
                            />
                          </div>
                        </div>

                        {/* Long Break Settings */}
                        <div className="bg-background border border-border/60 p-4 rounded-[24px]">
                          <label className="flex flex-col mb-4">
                            <span className="text-[15px] sm:text-[16px] font-black text-foreground flex items-center gap-1.5">
                              🛋️ Long Break & Interval
                            </span>
                            <span className="text-[13px] text-muted-foreground mt-1 leading-snug font-medium">
                              After completing several cycles, take an extended
                              rest to recharge.
                            </span>
                          </label>
                          <div className="grid grid-cols-2 gap-3 sm:gap-4">
                            <div className="flex flex-col">
                              <span className="text-[10px] font-extrabold text-muted-foreground/80 uppercase tracking-widest mb-2 text-center">
                                Duration
                              </span>
                              <Stepper
                                value={localSettings.longBreakDuration}
                                onChange={(v) =>
                                  setLocalSettings({
                                    ...localSettings,
                                    longBreakDuration: v,
                                  })
                                }
                                suffix="min"
                                step={5}
                                min={5}
                                max={360}
                              />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[10px] font-extrabold text-muted-foreground/80 uppercase tracking-widest mb-2 text-center">
                                After
                              </span>
                              <Stepper
                                value={localSettings.longBreakInterval}
                                onChange={(v) =>
                                  setLocalSettings({
                                    ...localSettings,
                                    longBreakInterval: v,
                                  })
                                }
                                suffix="cycles"
                                min={1}
                                max={20}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={saveSettings}
                        className="mt-8 w-full flex items-center justify-center gap-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-black text-lg px-4 py-4 rounded-[20px] transition-all shadow-md active:scale-[0.98]"
                      >
                        <Save className="w-6 h-6" />
                        Save Configuration
                      </button>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>

              {/* Task Selector Bottom Sheet / Modal */}
              <AnimatePresence>
                {showTaskDropdown && (
                  <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center pointer-events-none sm:p-4">
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setShowTaskDropdown(false)}
                      className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
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
                      dragConstraints={{ top: 0, bottom: 0 }}
                      dragElastic={0.2}
                      onDragEnd={(e, { offset, velocity }) => {
                        if (offset.y > 100 || velocity.y > 500) {
                          setShowTaskDropdown(false);
                        }
                      }}
                      className="w-full sm:max-w-md bg-background border border-border/40 rounded-t-[32px] sm:rounded-[24px] shadow-2xl p-4 sm:p-6 pointer-events-auto relative z-10 max-h-[85vh] flex flex-col pt-3"
                    >
                      {/* Drag Handle */}
                      <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-muted rounded-full sm:hidden" />

                      <div className="flex items-center justify-between mb-4 mt-2 sm:mt-0 px-2">
                        <h3 className="text-xl font-black">Select Task</h3>
                        <button
                          onClick={() => setShowTaskDropdown(false)}
                          className="p-2 bg-muted/50 hover:bg-muted rounded-full transition-colors text-muted-foreground"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="flex-1 overflow-y-auto space-y-2 pb-4 scrollbar-hide px-2">
                        {availableTasks.map((t) => (
                          <div
                            key={t.id}
                            className={`p-4 hover:bg-accent border border-transparent cursor-pointer flex items-center gap-3 group rounded-2xl transition-colors ${t.id === selectedTaskId ? 'bg-primary/5 border-primary/20' : 'bg-card'}`}
                            onClick={() => handleTaskSelect(t.id)}
                          >
                            <div className="relative flex items-center justify-center p-2 -ml-2 flex-shrink-0 z-30 pointer-events-none">
                              {/* Always render the fly so the ref exists, but hide it if visually done */}
                              <div
                                className={`transition-opacity duration-300 ${visuallyDone.has(t.id) || t.completed ? 'opacity-0' : 'opacity-100'}`}
                              >
                                <Fly
                                  ref={null}
                                  onClick={() => {}}
                                  size={24}
                                  y={-2}
                                />
                              </div>

                              {/* Show the checkmark when visually done */}
                              {(visuallyDone.has(t.id) || t.completed) && (
                                <CheckCircle2 className="absolute w-6 h-6 text-primary animate-in zoom-in spin-in-12 duration-300" />
                              )}
                            </div>
                            <span className="font-medium flex-1 line-clamp-2">
                              {t.text}
                            </span>
                          </div>
                        ))}
                        {availableTasks.length === 0 && (
                          <button
                            onClick={() => {
                              setShowTaskDropdown(false);
                              setShowQuickAdd(true);
                            }}
                            className="w-full flex flex-col items-center justify-center p-6 mt-4 text-center border-2 border-dashed border-muted-foreground/20 bg-muted/30 hover:bg-muted/50 rounded-2xl transition-all cursor-pointer group"
                          >
                            <div className="flex items-center justify-center w-12 h-12 mb-3 transition-all border rounded-full bg-muted border-muted-foreground/10 grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100">
                              <Fly size={24} y={-2} />
                            </div>
                            <p className="text-sm font-bold text-muted-foreground group-hover:text-primary transition-colors">
                              {tasks.length > 0
                                ? 'All caught up! Add a new task'
                                : 'No tasks yet! Add a task'}
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
      {cinematic && <CinematicOverlay onSkip={speedUpTongue} />}

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
