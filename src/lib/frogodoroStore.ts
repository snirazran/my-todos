import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { type TimerSound } from './timerSounds';
import type { ActiveFrogodoroTimer } from './types/UserDoc';

export type PomodoroPhase = 'focus' | 'break';

export interface FrogodoroSettings {
  focusDuration: number;
  breakDuration: number;
  autoStartBreaks: boolean;
  timerSound: TimerSound;
}

export const DEFAULT_SETTINGS: FrogodoroSettings = {
  focusDuration: 25,
  breakDuration: 5,
  autoStartBreaks: false,
  timerSound: 'bell',
};

export interface SessionStats {
  focusTime: number;
  breakTime: number;
}

export const DEFAULT_SESSION_STATS: SessionStats = {
  focusTime: 0,
  breakTime: 0,
};

interface FrogodoroState {
  settings: FrogodoroSettings;
  selectedTaskId: string;
  phase: PomodoroPhase;
  timerActive: boolean;
  isRunning: boolean;
  timeLeft: number; // in seconds
  endTime: number | null; // unix timestamp for background calc
  currentSessionSpend: number; // accumulated focus time to sync
  sessionStats: SessionStats;
  phaseElapsed: number; // seconds spent in the current phase
  // Per-phase countdown position + whether each phase has been started, so
  // switching tabs previews a phase without resetting the other one.
  remainingByPhase: Record<PomodoroPhase, number>;
  startedByPhase: Record<PomodoroPhase, boolean>;
  lastCompletionId: number;
  lastCompletedTaskId: string;
  lastCompletedPhase: PomodoroPhase | null;

  // Actions
  setSettings: (settings: FrogodoroSettings) => void;
  setTask: (taskId: string, settings?: FrogodoroSettings) => void;
  startTimer: () => void;
  pauseTimer: () => void;
  stopTimer: () => void;
  tickTimer: (newTimeLeft: number) => void;
  switchPhase: (phase: PomodoroPhase) => void;
  completePhase: (autoStart?: boolean, elapsedOverride?: number) => void;
  addSessionSpend: (time: number) => void;
  clearSessionSpend: () => void;
  updateSessionStats: (stats: SessionStats) => void;
  setPhaseElapsed: (elapsed: number) => void;
  resetSessionStats: () => void;
  hydrateActiveTimer: (timer: ActiveFrogodoroTimer) => void;
}

function getPhaseDuration(phase: PomodoroPhase, settings: FrogodoroSettings) {
  const minutes = phase === 'focus' ? settings.focusDuration : settings.breakDuration;
  return Math.max(1, Math.round(minutes * 60));
}

export const useFrogodoroStore = create<FrogodoroState>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      selectedTaskId: '',
      phase: 'focus',
      timerActive: false,
      isRunning: false,
      timeLeft: DEFAULT_SETTINGS.focusDuration * 60,
      endTime: null,
      currentSessionSpend: 0,
      sessionStats: DEFAULT_SESSION_STATS,
      phaseElapsed: 0,
      remainingByPhase: {
        focus: DEFAULT_SETTINGS.focusDuration * 60,
        break: DEFAULT_SETTINGS.breakDuration * 60,
      },
      startedByPhase: { focus: false, break: false },
      lastCompletionId: 0,
      lastCompletedTaskId: '',
      lastCompletedPhase: null,

      setSettings: (settings) =>
        set((state) => {
          // Adjusting a phase's duration resets that phase's countdown to the
          // new full length (only allowed while it's not running). Phases that
          // are mid-session keep their saved remaining time.
          const recompute = (p: PomodoroPhase) =>
            state.startedByPhase[p]
              ? state.remainingByPhase[p]
              : getPhaseDuration(p, settings);
          const remainingByPhase: Record<PomodoroPhase, number> = {
            focus: recompute('focus'),
            break: recompute('break'),
          };
          if (!state.isRunning) {
            return {
              settings,
              remainingByPhase,
              timeLeft: remainingByPhase[state.phase],
            };
          }
          return { settings, remainingByPhase };
        }),

      setTask: (taskId, taskSettings) => {
        const settings = taskSettings || DEFAULT_SETTINGS;
        set((state) => {
          const isSameTask = state.selectedTaskId === taskId;
          // A fresh task always starts on Focus; only keep the current phase
          // when re-selecting the task that is already active (so a task you
          // switched to Break stays on Break while it's the selected one).
          const phase = isSameTask ? state.phase : 'focus';
          const remainingByPhase: Record<PomodoroPhase, number> = isSameTask
            ? state.remainingByPhase
            : {
                focus: getPhaseDuration('focus', settings),
                break: getPhaseDuration('break', settings),
              };
          const startedByPhase: Record<PomodoroPhase, boolean> = isSameTask
            ? state.startedByPhase
            : { focus: false, break: false };
          return {
            selectedTaskId: taskId,
            settings,
            phase,
            remainingByPhase,
            startedByPhase,
            timeLeft: remainingByPhase[phase],
            timerActive: false,
            isRunning: false,
            endTime: null,
            currentSessionSpend: isSameTask ? state.currentSessionSpend : 0,
            sessionStats: isSameTask ? state.sessionStats : DEFAULT_SESSION_STATS,
            phaseElapsed: isSameTask ? state.phaseElapsed : 0,
          };
        });
      },

      startTimer: () => {
        set((state) => {
          // Starting a phase resets the other one to fresh: once you actually
          // begin a Break, the previous Focus countdown is cleared (and vice
          // versa). Tab-switching alone preserves both; only Start resets.
          const other: PomodoroPhase = state.phase === 'focus' ? 'break' : 'focus';
          return {
            timerActive: true,
            isRunning: true,
            endTime: Date.now() + state.timeLeft * 1000,
            startedByPhase: {
              ...state.startedByPhase,
              [state.phase]: true,
              [other]: false,
            },
            remainingByPhase: {
              ...state.remainingByPhase,
              [other]: getPhaseDuration(other, state.settings),
            },
          };
        });
      },

      pauseTimer: () => {
        set((state) => ({
          timerActive: true,
          isRunning: false,
          endTime: null,
          remainingByPhase: {
            ...state.remainingByPhase,
            [state.phase]: state.timeLeft,
          },
        }));
      },

      stopTimer: () => {
        set((state) => ({
          timerActive: false,
          isRunning: false,
          endTime: null,
          timeLeft: getPhaseDuration(state.phase, state.settings),
          phaseElapsed: 0,
          startedByPhase: { focus: false, break: false },
          remainingByPhase: {
            focus: getPhaseDuration('focus', state.settings),
            break: getPhaseDuration('break', state.settings),
          },
        }));
      },

      tickTimer: (newTimeLeft) =>
        set((state) => ({
          timeLeft: newTimeLeft,
          remainingByPhase: {
            ...state.remainingByPhase,
            [state.phase]: newTimeLeft,
          },
        })),

      switchPhase: (newPhase) => {
        set((state) => {
          // Save the phase we're leaving, restore the one we're entering so its
          // countdown resumes where it left off (full duration if never run).
          const remainingByPhase: Record<PomodoroPhase, number> = {
            ...state.remainingByPhase,
            [state.phase]: state.timeLeft,
          };
          const targetRemaining = remainingByPhase[newPhase];
          const phaseDuration = getPhaseDuration(newPhase, state.settings);
          return {
            phase: newPhase,
            isRunning: false,
            endTime: null,
            timeLeft: targetRemaining,
            remainingByPhase,
            phaseElapsed: phaseDuration - targetRemaining,
          };
        });
      },

      completePhase: (autoStart = false, elapsedOverride?: number) => {
        set((state) => {
          const completionFields = {
            lastCompletionId: state.lastCompletionId + 1,
            lastCompletedTaskId: state.selectedTaskId,
            lastCompletedPhase: state.phase,
          };

          const phaseDuration = getPhaseDuration(state.phase, state.settings);
          const elapsed = elapsedOverride !== undefined ? elapsedOverride : phaseDuration;

          const focusFull = getPhaseDuration('focus', state.settings);
          const breakFull = getPhaseDuration('break', state.settings);

          if (state.phase === 'focus') {
            const nextPhase: PomodoroPhase = 'break';
            const time = breakFull;
            return {
              phase: nextPhase,
              isRunning: autoStart,
              endTime: autoStart ? Date.now() + time * 1000 : null,
              timeLeft: time,
              phaseElapsed: 0,
              // Focus is done → reset it to fresh; break starts fresh (running
              // only if auto-start is on).
              remainingByPhase: { focus: focusFull, break: time },
              startedByPhase: { focus: false, break: autoStart },
              ...completionFields,
              sessionStats: {
                ...state.sessionStats,
                focusTime: state.sessionStats.focusTime + elapsed,
              },
            };
          }

          // Break finished → return to focus, never auto-start
          const time = focusFull;
          return {
            phase: 'focus',
            isRunning: false,
            endTime: null,
            timeLeft: time,
            phaseElapsed: 0,
            remainingByPhase: { focus: time, break: breakFull },
            startedByPhase: { focus: false, break: false },
            ...completionFields,
            sessionStats: {
              ...state.sessionStats,
              breakTime: state.sessionStats.breakTime + elapsed,
            },
          };
        });
      },

      addSessionSpend: (time) =>
        set((state) => ({
          currentSessionSpend: state.currentSessionSpend + time,
        })),
      clearSessionSpend: () => set({ currentSessionSpend: 0 }),
      updateSessionStats: (stats) => set({ sessionStats: stats }),
      setPhaseElapsed: (elapsed) => set({ phaseElapsed: elapsed }),
      resetSessionStats: () => set({ sessionStats: DEFAULT_SESSION_STATS, phaseElapsed: 0 }),
      hydrateActiveTimer: (timer) => {
        const endsAtMs = timer.endsAt ? new Date(timer.endsAt).getTime() : null;
        const runningTimeLeft =
          timer.status === 'running' && endsAtMs
            ? Math.max(0, Math.round((endsAtMs - Date.now()) / 1000))
            : timer.timeLeft;

        const focusFull = getPhaseDuration('focus', timer.settings);
        const breakFull = getPhaseDuration('break', timer.settings);

        set({
          selectedTaskId: timer.taskId,
          settings: timer.settings,
          phase: timer.phase,
          timerActive: true,
          isRunning: timer.status === 'running' && runningTimeLeft > 0,
          endTime:
            timer.status === 'running' && runningTimeLeft > 0
              ? Date.now() + runningTimeLeft * 1000
              : null,
          timeLeft: runningTimeLeft,
          remainingByPhase: {
            focus: timer.phase === 'focus' ? runningTimeLeft : focusFull,
            break: timer.phase === 'break' ? runningTimeLeft : breakFull,
          },
          startedByPhase: {
            focus: timer.phase === 'focus',
            break: timer.phase === 'break',
          },
          sessionStats: timer.sessionStats,
        });
      },
    }),
    {
      name: 'frogodoro-storage',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
