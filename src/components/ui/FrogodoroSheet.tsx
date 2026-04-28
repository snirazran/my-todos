'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import {
  Play,
  Pause,
  SkipForward,
  Settings2,
  HelpCircle,
  X,
  Plus,
  Minus,
  CheckCircle2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useFrogodoroStore,
  PomodoroPhase,
  DEFAULT_SETTINGS,
  DEFAULT_SESSION_STATS,
} from '@/lib/frogodoroStore';
import { playTimerSound, unlockAudio, type TimerSound } from '@/lib/timerSounds';
import { mutate } from 'swr';

interface Task {
  id: string;
  text: string;
  completed: boolean;
  tags?: string[];
  frogodoroSession?: {
    date: string;
    completedCycles: number;
    timeSpent: number;
    shortBreaks?: number;
    shortBreakTime?: number;
    longBreaks?: number;
    longBreakTime?: number;
  } | null;
  frogodoroSettings?: Record<string, unknown>;
}

type Props = Readonly<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task: Task | null;
  tags?: { id: string; name: string; color: string }[];
  onMutateToday?: () => void;
}>;

export default function FrogodoroSheet({
  open,
  onOpenChange,
  task,
  tags: userTags = [],
  onMutateToday,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

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
    updateSessionStats,
  } = useFrogodoroStore();

  const [localSettings, setLocalSettings] = useState(settings);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Unlock AudioContext on first interaction
  useEffect(() => {
    const handler = () => unlockAudio();
    document.addEventListener('touchstart', handler, { once: true });
    document.addEventListener('click', handler, { once: true });
    return () => {
      document.removeEventListener('touchstart', handler);
      document.removeEventListener('click', handler);
    };
  }, []);

  // Sync local settings form
  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  // When opened with a task, select it in the store
  useEffect(() => {
    if (open && task && task.id !== selectedTaskId) {
      setTask(
        task.id,
        task.frogodoroSettings
          ? { ...DEFAULT_SETTINGS, ...(task.frogodoroSettings as Record<string, unknown>) } as typeof DEFAULT_SETTINGS
          : undefined,
      );
      if (task.frogodoroSession) {
        const db = task.frogodoroSession;
        updateSessionStats({
          focusSessions: db.completedCycles ?? 0,
          focusTime: db.timeSpent ?? 0,
          shortBreaks: db.shortBreaks ?? 0,
          shortBreakTime: db.shortBreakTime ?? 0,
          longBreaks: db.longBreaks ?? 0,
          longBreakTime: db.longBreakTime ?? 0,
        });
      }
    }
  }, [open, task]);

  // Reset sub-views when sheet closes
  useEffect(() => {
    if (!open) {
      setShowSettings(false);
      setShowHelp(false);
    }
  }, [open]);

  // Derived
  const phaseDuration =
    phase === 'focus'
      ? settings.cycleDuration * 60
      : phase === 'shortBreak'
        ? settings.shortBreakDuration * 60
        : settings.longBreakDuration * 60;
  const liveElapsed = phaseDuration - timeLeft;

  const hasStats =
    sessionStats.focusSessions > 0 ||
    sessionStats.shortBreaks > 0 ||
    sessionStats.longBreaks > 0 ||
    isRunning ||
    liveElapsed > 0 ||
    (task?.frogodoroSession?.timeSpent ?? 0) > 0 ||
    (task?.frogodoroSession?.shortBreaks ?? 0) > 0 ||
    (task?.frogodoroSession?.longBreaks ?? 0) > 0;

  // Phase time ref for stats
  const phaseTimeRef = useRef(storeElapsed);
  const runStartTimeRef = useRef<number | null>(null);
  const runStartElapsedRef = useRef(0);

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
    }, 1000);
    return () => {
      clearInterval(interval);
      runStartTimeRef.current = null;
    };
  }, [isRunning]);

  const prevPhaseRef = useRef(phase);
  const prevCyclesRef = useRef(completedCycles);
  useEffect(() => {
    prevPhaseRef.current = phase;
    prevCyclesRef.current = completedCycles;
    phaseTimeRef.current = 0;
    setPhaseElapsed(0);
  }, [phase, completedCycles]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  };

  const saveSessionToDb = async (
    taskId: string,
    currentPhase: typeof phase,
    elapsed: number,
  ) => {
    if (elapsed <= 0) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    let session: Record<string, unknown> = {
      date: today,
      completedCycles: 0,
      timeSpent: 0,
    };
    if (currentPhase === 'focus') {
      session = { date: today, completedCycles: 1, timeSpent: elapsed };
    } else if (currentPhase === 'shortBreak') {
      session = {
        date: today,
        completedCycles: 0,
        timeSpent: 0,
        shortBreaks: 1,
        shortBreakTime: elapsed,
      };
    } else if (currentPhase === 'longBreak') {
      session = {
        date: today,
        completedCycles: 0,
        timeSpent: 0,
        longBreaks: 1,
        longBreakTime: elapsed,
      };
    } else {
      return;
    }
    try {
      await fetch(`/api/tasks/${taskId}/frogodoro`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session, timezone }),
      });
    } catch {
      // silent fail
    }
  };

  const toggleTimer = () => {
    if (isRunning) pauseTimer();
    else startTimer();
  };

  const handleManualSkip = async () => {
    if (selectedTaskId && liveElapsed > 0) {
      await saveSessionToDb(selectedTaskId, phase, liveElapsed);
      onMutateToday?.();
    }
    completePhase(false, liveElapsed);
  };

  const handleTabSwitch = (newPhase: PomodoroPhase) => {
    if (newPhase === phase || isRunning) return;
    if (selectedTaskId && liveElapsed > 0) {
      const updated = { ...sessionStats };
      if (phase === 'focus') {
        updated.focusSessions = sessionStats.focusSessions + 1;
        updated.focusTime = sessionStats.focusTime + liveElapsed;
        const today = format(new Date(), 'yyyy-MM-dd');
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        fetch(`/api/tasks/${selectedTaskId}/frogodoro`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session: { date: today, completedCycles: 1, timeSpent: 0 },
            timezone,
          }),
        })
          .then(() => onMutateToday?.())
          .catch(() => {});
      } else if (phase === 'shortBreak') {
        updated.shortBreaks = sessionStats.shortBreaks + 1;
        updated.shortBreakTime = sessionStats.shortBreakTime + liveElapsed;
      } else if (phase === 'longBreak') {
        updated.longBreaks = sessionStats.longBreaks + 1;
        updated.longBreakTime = sessionStats.longBreakTime + liveElapsed;
      }
      updateSessionStats(updated);
    }
    switchPhase(newPhase);
  };

  const persistTaskSettings = async (settingsToSave: typeof DEFAULT_SETTINGS) => {
    if (selectedTaskId) {
      onMutateToday?.();
      try {
        const {
          cycleDuration,
          shortBreakDuration,
          longBreakDuration,
          longBreakInterval,
        } = settingsToSave;
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
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
            timezone,
          }),
        });
      } catch {
        // silent
      }
    }
  };

  const saveSettings = async () => {
    setSettings(localSettings);
    setShowSettings(false);
    await persistTaskSettings(localSettings);
  };

  const getDurationControl = () => {
    if (phase === 'focus') {
      return { key: 'cycleDuration' as const, min: 1, max: 120, step: 5 };
    }
    if (phase === 'shortBreak') {
      return { key: 'shortBreakDuration' as const, min: 1, max: 30, step: 1 };
    }
    return { key: 'longBreakDuration' as const, min: 5, max: 60, step: 5 };
  };

  const adjustCurrentDuration = (direction: -1 | 1) => {
    if (isRunning) return;

    const control = getDurationControl();
    const currentValue = settings[control.key];
    const rawNextValue = currentValue + control.step * direction;
    const nextValue =
      phase === 'focus' && direction === -1 && currentValue === 5
        ? 1
        : phase === 'focus' && direction === 1 && currentValue === 1
          ? 5
          : Math.min(control.max, Math.max(control.min, rawNextValue));

    if (nextValue === currentValue) return;

    const nextSettings = { ...settings, [control.key]: nextValue };
    setLocalSettings(nextSettings);
    setSettings(nextSettings);
    void persistTaskSettings(nextSettings);
  };

  const getPhaseColor = () => {
    if (phase === 'focus') return 'bg-primary text-primary-foreground';
    if (phase === 'shortBreak') return 'bg-sky-500 dark:bg-sky-600 text-white';
    return 'bg-indigo-500 dark:bg-indigo-600 text-white';
  };

  const getPhaseAccent = () => {
    if (phase === 'focus') return 'text-primary';
    if (phase === 'shortBreak') return 'text-sky-500';
    return 'text-indigo-500';
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
            className="fixed inset-0 z-[999] bg-background/80 backdrop-blur-[2px]"
          />

          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{
              type: 'tween',
              ease: [0.32, 0.72, 0, 1],
              duration: 0.4,
            }}
            className="fixed left-0 right-0 z-[1000] px-4 py-6 sm:px-6 sm:py-5 pointer-events-none bottom-0 will-change-transform"
          >
            <div className="pointer-events-auto mx-auto w-full max-w-[500px] pb-[env(safe-area-inset-bottom)]">
              <div className="rounded-[28px] bg-popover/95 backdrop-blur-2xl ring-1 ring-border/80 shadow-[0_24px_48px_rgba(15,23,42,0.25)] overflow-hidden">

                {/* Help Sub-View */}
                <AnimatePresence mode="wait">
                  {showHelp ? (
                    <motion.div
                      key="help"
                      initial={{ opacity: 0, x: 40 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 40 }}
                      transition={{ duration: 0.2 }}
                      className="p-5"
                    >
                      <div className="flex items-center justify-between mb-5">
                        <h3 className="text-lg font-black text-foreground">How it works</h3>
                        <button
                          onClick={() => setShowHelp(false)}
                          className="flex items-center justify-center w-8 h-8 rounded-full bg-muted/60 text-muted-foreground hover:bg-muted transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="space-y-3">
                        <div className="overflow-hidden border rounded-2xl border-border/50 bg-muted/10">
                          <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 border-b border-border/30">
                            <div className="w-2.5 h-2.5 rounded-full bg-primary shrink-0" />
                            <p className="flex-1 text-sm font-semibold text-foreground">Focus</p>
                            <span className="text-xs font-black text-primary tabular-nums">{settings.cycleDuration}m</span>
                          </div>
                          <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border/30">
                            <div className="w-2.5 flex justify-center shrink-0"><div className="w-px h-3 bg-border/50" /></div>
                            <p className="text-[11px] text-muted-foreground/40 italic">then</p>
                          </div>
                          <div className="flex items-center gap-3 px-4 py-2.5 bg-sky-500/5 border-b border-border/30">
                            <div className="w-2.5 h-2.5 rounded-full bg-sky-400 shrink-0" />
                            <p className="flex-1 text-sm font-semibold text-foreground">Short Break</p>
                            <span className="text-xs font-black text-sky-500 tabular-nums">{settings.shortBreakDuration}m</span>
                          </div>
                          <div className="flex items-center gap-3 px-4 py-2 border-b border-border/30 bg-muted/20">
                            <div className="w-2.5 flex justify-center shrink-0">
                              <svg className="w-3 h-3 text-muted-foreground/35" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            </div>
                            <p className="text-[11px] text-muted-foreground/55 font-medium">Repeat {settings.longBreakInterval}x before the long break</p>
                          </div>
                          <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border/30">
                            <div className="w-2.5 flex justify-center shrink-0"><div className="w-px h-3 bg-border/50" /></div>
                            <p className="text-[11px] text-muted-foreground/40 italic">then</p>
                          </div>
                          <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-500/5">
                            <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0" />
                            <p className="flex-1 text-sm font-semibold text-foreground">Long Break</p>
                            <span className="text-xs font-black text-indigo-500 tabular-nums">{settings.longBreakDuration}m</span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => setShowHelp(false)}
                        className="mt-4 w-full py-3 rounded-2xl font-black text-sm bg-primary text-primary-foreground shadow-md shadow-primary/20 active:scale-[0.98] transition-all"
                      >
                        Got it!
                      </button>
                    </motion.div>

                  ) : showSettings ? (
                    <motion.div
                      key="settings"
                      initial={{ opacity: 0, x: 40 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 40 }}
                      transition={{ duration: 0.2 }}
                      className="p-5 max-h-[70vh] overflow-y-auto no-scrollbar"
                    >
                      <div className="mb-5 flex items-center justify-between">
                        <h3 className="text-lg font-black text-foreground">Timer Settings</h3>
                        <button
                          onClick={() => setShowSettings(false)}
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary/15"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="space-y-4">
                        {/* Cycle Behavior */}
                        <div className="space-y-2">
                          <p className="px-1 text-[11px] font-black uppercase tracking-widest text-primary/60">Cycle Behavior</p>
                          <div className="overflow-hidden rounded-2xl border border-primary/10 bg-primary/5 p-2.5">
                            {/* Focus */}
                            <div className="hidden">
                              <div className="w-3 h-3 rounded-full bg-primary shrink-0" />
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-foreground">Focus</p>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button type="button" onClick={() => setLocalSettings({ ...localSettings, cycleDuration: Math.max(5, localSettings.cycleDuration - 5) })} className="flex items-center justify-center w-6 h-6 text-sm transition-all border rounded-full bg-background border-border/70 text-muted-foreground active:scale-90">−</button>
                                <span className="w-12 text-sm font-black text-center text-primary tabular-nums">{localSettings.cycleDuration}m</span>
                                <button type="button" onClick={() => setLocalSettings({ ...localSettings, cycleDuration: Math.min(120, localSettings.cycleDuration + 5) })} className="flex items-center justify-center w-6 h-6 text-sm transition-all rounded-full bg-primary/10 text-primary active:scale-90">+</button>
                              </div>
                            </div>
                            {/* Short Break */}
                            <div className="hidden">
                              <div className="w-3 h-3 rounded-full bg-sky-400 shrink-0" />
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-foreground">Short Break</p>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button type="button" onClick={() => setLocalSettings({ ...localSettings, shortBreakDuration: Math.max(1, localSettings.shortBreakDuration - 1) })} className="flex items-center justify-center w-6 h-6 text-sm transition-all border rounded-full bg-background border-border/70 text-muted-foreground active:scale-90">−</button>
                                <span className="w-12 text-sm font-black text-center text-sky-500 tabular-nums">{localSettings.shortBreakDuration}m</span>
                                <button type="button" onClick={() => setLocalSettings({ ...localSettings, shortBreakDuration: Math.min(30, localSettings.shortBreakDuration + 1) })} className="flex items-center justify-center w-6 h-6 text-sm transition-all rounded-full bg-sky-500/10 text-sky-500 active:scale-90">+</button>
                              </div>
                            </div>
                            {/* Rounds */}
                            <div className="flex items-center gap-3 rounded-xl bg-background px-3 py-3 shadow-sm">
                              <svg className="w-4 h-4 text-primary/70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              <div className="flex-1">
                                <p className="text-sm font-black text-foreground">Rounds before long break</p>
                                <p className="text-[11px] font-semibold text-muted-foreground">Long break after {localSettings.longBreakInterval} focus rounds</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button type="button" onClick={() => setLocalSettings({ ...localSettings, longBreakInterval: Math.max(1, localSettings.longBreakInterval - 1) })} className="flex items-center justify-center w-6 h-6 text-sm transition-all border rounded-full bg-background border-border/70 text-muted-foreground active:scale-90">−</button>
                                <span className="w-8 text-center text-base font-black tabular-nums text-foreground">{localSettings.longBreakInterval}</span>
                                <button type="button" onClick={() => setLocalSettings({ ...localSettings, longBreakInterval: Math.min(10, localSettings.longBreakInterval + 1) })} className="flex items-center justify-center w-6 h-6 text-sm transition-all rounded-full bg-primary/10 text-primary active:scale-90">+</button>
                              </div>
                            </div>
                            {/* Long Break */}
                            <div className="hidden">
                              <div className="w-3 h-3 bg-indigo-500 rounded-full shrink-0" />
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-foreground">Long Break</p>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button type="button" onClick={() => setLocalSettings({ ...localSettings, longBreakDuration: Math.max(5, localSettings.longBreakDuration - 5) })} className="flex items-center justify-center w-6 h-6 text-sm transition-all border rounded-full bg-background border-border/70 text-muted-foreground active:scale-90">−</button>
                                <span className="w-12 text-sm font-black text-center text-indigo-500 tabular-nums">{localSettings.longBreakDuration}m</span>
                                <button type="button" onClick={() => setLocalSettings({ ...localSettings, longBreakDuration: Math.min(60, localSettings.longBreakDuration + 5) })} className="flex items-center justify-center w-6 h-6 text-sm text-indigo-500 transition-all rounded-full bg-indigo-500/10 active:scale-90">+</button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Auto-start */}
                        <button
                          type="button"
                          onClick={() => setLocalSettings({ ...localSettings, autoStartBreaks: !localSettings.autoStartBreaks })}
                          className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 transition-all active:scale-[0.98] ${
                            localSettings.autoStartBreaks
                              ? 'bg-primary/10 text-primary'
                              : 'bg-muted/15 text-muted-foreground'
                          }`}
                        >
                          <div className="text-left">
                            <p className="text-sm font-black">Auto-start breaks</p>
                            <p className={`text-[11px] font-semibold ${localSettings.autoStartBreaks ? 'text-primary/60' : 'text-muted-foreground/50'}`}>
                              Breaks begin automatically
                            </p>
                          </div>
                          <span className={`relative h-7 w-12 rounded-full transition-colors ${localSettings.autoStartBreaks ? 'bg-primary' : 'bg-muted-foreground/25'}`}>
                            <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${localSettings.autoStartBreaks ? 'translate-x-5' : 'translate-x-0'}`} />
                          </span>
                        </button>

                        {/* Sound */}
                        <div className="space-y-2">
                          <p className="px-1 text-[11px] font-black uppercase tracking-widest text-primary/60">Finish Sound</p>
                          <div className="grid grid-cols-2 gap-2">
                            {([
                              { id: 'bell', label: 'Bell' },
                              { id: 'chime', label: 'Chime' },
                              { id: 'digital', label: 'Digital' },
                              { id: 'none', label: 'Silent' },
                            ] as { id: TimerSound; label: string }[]).map(({ id, label }) => (
                              <button
                                key={id}
                                type="button"
                                onClick={() => {
                                  setLocalSettings({ ...localSettings, timerSound: id });
                                  playTimerSound(id);
                                }}
                                className={`h-11 rounded-xl text-sm font-black transition-all active:scale-95 ${
                                  localSettings.timerSound === id
                                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                                    : 'border border-border/70 bg-background text-muted-foreground hover:bg-muted/40'
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={saveSettings}
                        className="mt-6 w-full rounded-2xl bg-primary py-3.5 text-base font-black text-primary-foreground shadow-sm shadow-primary/20 transition-all hover:bg-primary/90 active:scale-[0.98]"
                      >
                        Save
                      </button>
                    </motion.div>

                  ) : (
                    /* Main Timer View */
                    <motion.div
                      key="timer"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      {/* Timer Card */}
                      <div className={`px-4 pt-5 pb-4 ${getPhaseColor()} relative overflow-hidden`}>
                        {/* Close button */}
                        <button
                          onClick={() => onOpenChange(false)}
                          className="absolute top-3 right-3 z-10 flex items-center justify-center w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 transition-colors text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>

                        {/* Task name */}
                        {task && (
                          <div className="mb-3 pr-10">
                            {task.tags && task.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-1">
                                {task.tags.map((tagId) => {
                                  const tag = userTags.find((ut) => ut.id === tagId || ut.name === tagId);
                                  if (!tag) return null;
                                  return (
                                    <span
                                      key={tagId}
                                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-white/20 text-white border border-white/20"
                                    >
                                      {tag.name}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                            <p className="text-sm font-bold text-white/90 truncate">{task.text}</p>
                          </div>
                        )}

                        {/* Phase Tabs */}
                        <div className="flex items-center justify-center gap-1 mb-4">
                          {[
                            { id: 'focus', label: 'Focus Time' },
                            { id: 'shortBreak', label: 'Short Break' },
                            { id: 'longBreak', label: 'Long Break' },
                          ].map((p) => (
                            <button
                              key={p.id}
                              onClick={() => handleTabSwitch(p.id as PomodoroPhase)}
                              className={`px-3 py-1.5 text-xs font-bold rounded-full transition-all ${
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
                        <div className="mb-4 flex items-center justify-center gap-3">
                          {(() => {
                            const control = getDurationControl();
                            const duration = settings[control.key];
                            return (
                              <>
                                {!isRunning && (
                                  <button
                                    type="button"
                                    onClick={() => adjustCurrentDuration(-1)}
                                    disabled={duration <= control.min}
                                    aria-label="Decrease duration"
                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-white transition-all hover:bg-white/30 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                                  >
                                    <Minus className="h-5 w-5" />
                                  </button>
                                )}

                                <div className="min-w-[210px] text-center text-[72px] font-black leading-none tracking-tighter text-white drop-shadow-lg tabular-nums">
                                  {formatTime(timeLeft)}
                                </div>

                                {!isRunning && (
                                  <button
                                    type="button"
                                    onClick={() => adjustCurrentDuration(1)}
                                    disabled={duration >= control.max}
                                    aria-label="Increase duration"
                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-white transition-all hover:bg-white/30 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                                  >
                                    <Plus className="h-5 w-5" />
                                  </button>
                                )}
                              </>
                            );
                          })()}
                        </div>

                        {/* Controls */}
                        <div className="flex items-center justify-center gap-3">
                          <button
                            onClick={() => setShowHelp(true)}
                            className="p-2.5 bg-white/20 hover:bg-white/30 rounded-xl active:scale-95 text-white transition-all"
                          >
                            <HelpCircle className="w-5 h-5 text-white/90" />
                          </button>

                          <button
                            onClick={toggleTimer}
                            className={`relative flex items-center justify-center px-8 py-3 bg-white dark:bg-slate-50 text-[16px]
                              font-black uppercase tracking-widest rounded-2xl shadow-[0_6px_0_rgba(0,0,0,0.15)]
                              active:shadow-[0_0_0_rgba(0,0,0,0.15)] active:translate-y-1.5 transition-all ${getPhaseAccent()}`}
                          >
                            {isRunning ? (
                              <Pause className="w-5 h-5 mr-1.5 fill-current" />
                            ) : (
                              <Play className="w-5 h-5 mr-1.5 fill-current" />
                            )}
                            {isRunning ? 'PAUSE' : 'START'}
                          </button>

                          {isRunning ? (
                            <button
                              onClick={handleManualSkip}
                              className="p-2.5 bg-white/20 hover:bg-white/30 rounded-xl active:scale-95 text-white transition-all"
                            >
                              <SkipForward className="w-5 h-5 fill-current opacity-90" />
                            </button>
                          ) : (
                            <button
                              onClick={() => setShowSettings(true)}
                              className="p-2.5 bg-white/20 hover:bg-white/30 rounded-xl active:scale-95 text-white transition-all"
                            >
                              <Settings2 className="w-5 h-5 text-white/90" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Stats Row */}
                      {hasStats && (
                        <div className="flex items-center gap-2 px-4 py-3 flex-wrap border-t border-border/30">
                          {(() => {
                            const storeHasData = sessionStats.focusSessions > 0 || sessionStats.shortBreaks > 0 || sessionStats.longBreaks > 0 || isRunning || liveElapsed > 0;
                            const db = task?.frogodoroSession;
                            const inProgressFocus = storeHasData && phase === 'focus' && (isRunning || liveElapsed > 0) ? 1 : 0;
                            const focusCycles = storeHasData ? sessionStats.focusSessions + inProgressFocus : (db?.completedCycles ?? 0);
                            const focusTime = storeHasData ? sessionStats.focusTime + (phase === 'focus' ? liveElapsed : 0) : (db?.timeSpent ?? 0);
                            const inProgressShort = storeHasData && phase === 'shortBreak' && (isRunning || liveElapsed > 0) ? 1 : 0;
                            const shortBreaks = storeHasData ? sessionStats.shortBreaks + inProgressShort : (db?.shortBreaks ?? 0);
                            const shortBreakTime = storeHasData ? sessionStats.shortBreakTime + (phase === 'shortBreak' ? liveElapsed : 0) : (db?.shortBreakTime ?? 0);
                            const inProgressLong = storeHasData && phase === 'longBreak' && (isRunning || liveElapsed > 0) ? 1 : 0;
                            const longBreaks = storeHasData ? sessionStats.longBreaks + inProgressLong : (db?.longBreaks ?? 0);
                            const longBreakTime = storeHasData ? sessionStats.longBreakTime + (phase === 'longBreak' ? liveElapsed : 0) : (db?.longBreakTime ?? 0);
                            return (
                              <>
                                {(focusTime > 0 || (storeHasData && phase === 'focus')) && (
                                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-primary/8 dark:bg-primary/15">
                                    <div className={`w-1.5 h-1.5 rounded-full bg-primary ${isRunning && phase === 'focus' ? 'animate-pulse' : ''}`} />
                                    <span className="text-[11px] font-black text-primary tabular-nums">{focusCycles}</span>
                                    <span className="text-[10px] font-bold text-primary/60 tabular-nums">{formatDuration(focusTime)}</span>
                                  </div>
                                )}
                                {(shortBreaks > 0 || shortBreakTime > 0 || (storeHasData && phase === 'shortBreak')) && (
                                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-sky-500/8 dark:bg-sky-500/15">
                                    <div className={`w-1.5 h-1.5 rounded-full bg-sky-500 ${isRunning && phase === 'shortBreak' ? 'animate-pulse' : ''}`} />
                                    <span className="text-[11px] font-black text-sky-500 tabular-nums">{shortBreaks}</span>
                                    <span className="text-[10px] font-bold text-sky-500/60 tabular-nums">{formatDuration(shortBreakTime)}</span>
                                  </div>
                                )}
                                {(longBreaks > 0 || longBreakTime > 0 || (storeHasData && phase === 'longBreak')) && (
                                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-500/8 dark:bg-indigo-500/15">
                                    <div className={`w-1.5 h-1.5 rounded-full bg-indigo-500 ${isRunning && phase === 'longBreak' ? 'animate-pulse' : ''}`} />
                                    <span className="text-[11px] font-black text-indigo-500 tabular-nums">{longBreaks}</span>
                                    <span className="text-[10px] font-bold text-indigo-500/60 tabular-nums">{formatDuration(longBreakTime)}</span>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
