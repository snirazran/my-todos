'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import { useTaskData, Task } from '@/hooks/useTaskData';
import { format } from 'date-fns';
import {
  Play,
  Pause,
  SkipForward,
  Settings2,
  ChevronDown,
  CheckCircle2,
  Save,
  ListTodo,
} from 'lucide-react';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { motion, AnimatePresence } from 'framer-motion';

type Phase = 'focus' | 'shortBreak' | 'longBreak';

const DEFAULT_SETTINGS = {
  expectedCycles: 4,
  cycleDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  longBreakInterval: 4,
};

export default function FrogodoroPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { tasks, isLoading, toggleTask } = useTaskData();

  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [showTaskDropdown, setShowTaskDropdown] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Settings
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  // Timer State
  const [phase, setPhase] = useState<Phase>('focus');
  const [timeLeft, setTimeLeft] = useState(DEFAULT_SETTINGS.cycleDuration * 60);
  const [isRunning, setIsRunning] = useState(false);

  // Daily Progress
  const [completedCycles, setCompletedCycles] = useState(0);
  const [currentSessionSpend, setCurrentSessionSpend] = useState(0); // in seconds

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Filter Tasks to only uncompleted tasks
  const availableTasks = useMemo(() => {
    return tasks.filter((t) => !t.completed);
  }, [tasks]);

  const selectedTask = useMemo(() => {
    return tasks.find((t) => t.id === selectedTaskId);
  }, [tasks, selectedTaskId]);

  // Handle Authentication Tracking
  useEffect(() => {
    if (loading) return;
    if (!user) router.push('/login');
  }, [loading, user, router]);

  // 1. Sync Settings when task changes
  useEffect(() => {
    if (selectedTask) {
      const taskSettings = selectedTask.frogodoroSettings || DEFAULT_SETTINGS;
      setSettings(taskSettings);

      // Only reset timer if NOT running and we switch tasks
      if (!isRunning) {
        if (phase === 'focus') setTimeLeft(taskSettings.cycleDuration * 60);
        else if (phase === 'shortBreak')
          setTimeLeft(taskSettings.shortBreakDuration * 60);
        else setTimeLeft(taskSettings.longBreakDuration * 60);
      }
    }
  }, [selectedTaskId, selectedTask]); // omitted phase, isRunning

  // 2. Timer Loop
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            handlePhaseComplete();
            return 0;
          }
          return prev - 1;
        });

        // Track strictly focus time spent
        if (phase === 'focus') {
          setCurrentSessionSpend((prev) => prev + 1);
        }
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      // If we paused in focus mode, flush accumulated time to backend!
      if (phase === 'focus' && currentSessionSpend > 0 && selectedTaskId) {
        saveProgress(selectedTaskId, 0, currentSessionSpend);
        setCurrentSessionSpend(0);
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, phase, settings, selectedTaskId, currentSessionSpend]); // intentionally comprehensive

  // Handlers
  const toggleTimer = () => setIsRunning(!isRunning);

  const switchPhase = async (newPhase: Phase) => {
    // Before switching, dump time
    if (
      isRunning &&
      phase === 'focus' &&
      currentSessionSpend > 0 &&
      selectedTaskId
    ) {
      await saveProgress(selectedTaskId, 0, currentSessionSpend);
      setCurrentSessionSpend(0);
    }

    setIsRunning(false);
    setPhase(newPhase);

    if (newPhase === 'focus') setTimeLeft(settings.cycleDuration * 60);
    else if (newPhase === 'shortBreak')
      setTimeLeft(settings.shortBreakDuration * 60);
    else setTimeLeft(settings.longBreakDuration * 60);
  };

  const handlePhaseComplete = async () => {
    // Timer reached 0
    // Try to play sound
    try {
      const audio = new Audio('/notification.mp3');
      audio.play().catch(() => {});
    } catch (e) {}

    setIsRunning(false);

    if (phase === 'focus') {
      const newCycles = completedCycles + 1;
      setCompletedCycles(newCycles);

      // Save full cycle progress & remaining time
      if (selectedTaskId) {
        await saveProgress(selectedTaskId, 1, currentSessionSpend + 1); // adding the final second
        setCurrentSessionSpend(0);
      }

      if (newCycles % settings.longBreakInterval === 0) {
        await switchPhase('longBreak');
      } else {
        await switchPhase('shortBreak');
      }
    } else {
      // Break over, go back to work
      await switchPhase('focus');
    }
  };

  const saveProgress = async (
    taskId: string,
    cycles: number,
    spend: number,
  ) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    try {
      await fetch(`/api/tasks/${taskId}/frogodoro`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: {
            date: today,
            completedCycles: cycles,
            targetCycles: settings.expectedCycles,
            timeSpent: spend,
          },
        }),
      });
    } catch (e) {
      console.error('Failed saving Frogodoro progress', e);
    }
  };

  const saveSettings = async () => {
    if (!selectedTaskId) {
      setShowSettings(false);
      return;
    }
    try {
      await fetch(`/api/tasks/${selectedTaskId}/frogodoro`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: settings,
        }),
      });
      setShowSettings(false);

      // Reset timer config immediately if NOT running
      if (!isRunning) {
        if (phase === 'focus') setTimeLeft(settings.cycleDuration * 60);
        else if (phase === 'shortBreak')
          setTimeLeft(settings.shortBreakDuration * 60);
        else setTimeLeft(settings.longBreakDuration * 60);
      }
    } catch (e) {
      console.error('Error saving settings', e);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Theming colors for phases
  const getPhaseColor = () => {
    if (phase === 'focus') return 'bg-primary text-primary-foreground';
    if (phase === 'shortBreak') return 'bg-blue-500 text-white';
    return 'bg-purple-600 text-white';
  };

  const getPhaseBgColor = () => {
    if (phase === 'focus') return 'bg-primary/10';
    if (phase === 'shortBreak') return 'bg-blue-500/10';
    return 'bg-purple-600/10';
  };

  if (loading || isLoading) {
    return <LoadingScreen message="Loading Frogodoro..." />;
  }

  return (
    <main
      className={`min-h-screen flex flex-col pb-24 pt-6 md:pt-10 transition-colors duration-500 ${getPhaseBgColor()}`}
    >
      <div className="w-full max-w-2xl px-4 pb-8 mx-auto md:px-8">
        {/* TIMER CARD */}
        <div
          className={`p-6 md:p-10 rounded-[32px] shadow-2xl transition-colors duration-500 ${getPhaseColor()} relative overflow-hidden backdrop-blur-sm`}
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
                onClick={() => switchPhase(p.id as Phase)}
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
          <div className="flex items-center justify-center gap-6">
            <button
              onClick={toggleTimer}
              className={`
                relative flex items-center justify-center px-12 py-4 h-20 bg-white text-[24px] md:text-[28px] 
                font-black uppercase tracking-widest rounded-3xl shadow-[0_8px_0_rgba(0,0,0,0.15)] 
                active:shadow-[0_0_0_rgba(0,0,0,0.15)] active:translate-y-2 transition-all group
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

            <button
              onClick={() => handlePhaseComplete()}
              className="p-4 bg-white/20 hover:bg-white/30 rounded-2xl transition-colors backdrop-blur active:scale-95 text-white"
            >
              <SkipForward className="w-8 h-8 fill-current opacity-90 relative left-0.5" />
            </button>
          </div>
        </div>

        {/* TASK SELECTOR */}
        <div className="mt-8 text-center animate-fadeInUp">
          <p className="text-sm font-bold tracking-widest text-muted-foreground uppercase mb-4">
            #{completedCycles}
          </p>

          {selectedTask ? (
            <div className="relative inline-block text-left w-full max-w-sm mx-auto z-20">
              <div
                className="flex items-center justify-between p-4 bg-card border shadow-sm rounded-2xl cursor-pointer hover:border-primary transition-colors"
                onClick={() => setShowTaskDropdown(!showTaskDropdown)}
              >
                <div className="flex items-center gap-3 w-full pr-4">
                  <CheckCircle2
                    className="flex-shrink-0 w-6 h-6 text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleTask(selectedTask.id);
                      setSelectedTaskId(''); // Clear selection when completing
                    }}
                  />
                  <span className="font-bold text-lg leading-tight truncate">
                    {selectedTask.text}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowSettings(!showSettings);
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
                        className={`p-4 hover:bg-accent border-b last:border-0 cursor-pointer flex items-center gap-3 transition-colors ${t.id === selectedTaskId ? 'bg-primary/5' : ''}`}
                        onClick={() => {
                          setSelectedTaskId(t.id);
                          setShowTaskDropdown(false);
                          setIsRunning(false);
                        }}
                      >
                        <span
                          className={`w-3 h-3 rounded-full ${t.id === selectedTaskId ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                        />
                        <span className="font-medium">{t.text}</span>
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
                        className="p-4 hover:bg-accent border-b last:border-0 cursor-pointer flex items-center gap-3"
                        onClick={() => {
                          setSelectedTaskId(t.id);
                          setShowTaskDropdown(false);
                        }}
                      >
                        <span className="font-medium line-clamp-2">
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

          {/* Settings Modal relative to task */}
          <AnimatePresence>
            {showSettings && selectedTaskId && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="w-full max-w-sm mx-auto mt-4 overflow-hidden"
              >
                <div className="bg-card border p-6 rounded-[24px] shadow-lg text-left">
                  <h3 className="text-lg font-black mb-4 flex items-center gap-2">
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
                        value={settings.expectedCycles}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
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
                          value={settings.cycleDuration}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
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
                          value={settings.shortBreakDuration}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
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
                          value={settings.longBreakDuration}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
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
                          value={settings.longBreakInterval}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
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
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}
