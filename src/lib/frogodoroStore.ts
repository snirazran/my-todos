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
  return phase === 'focus' ? settings.focusDuration * 60 : settings.breakDuration * 60;
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
      lastCompletionId: 0,
      lastCompletedTaskId: '',
      lastCompletedPhase: null,

      setSettings: (settings) =>
        set((state) => {
          if (!state.isRunning) {
            return { settings, timeLeft: getPhaseDuration(state.phase, settings) };
          }
          return { settings };
        }),

      setTask: (taskId, taskSettings) => {
        const settings = taskSettings || DEFAULT_SETTINGS;
        set((state) => {
          const isSameTask = state.selectedTaskId === taskId;
          return {
            selectedTaskId: taskId,
            settings,
            timeLeft: getPhaseDuration(state.phase, settings),
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
        set((state) => ({
          timerActive: true,
          isRunning: true,
          endTime: Date.now() + state.timeLeft * 1000,
        }));
      },

      pauseTimer: () => {
        set({ timerActive: true, isRunning: false, endTime: null });
      },

      stopTimer: () => {
        set((state) => ({
          timerActive: false,
          isRunning: false,
          endTime: null,
          timeLeft: getPhaseDuration(state.phase, state.settings),
          phaseElapsed: 0,
        }));
      },

      tickTimer: (newTimeLeft) => set({ timeLeft: newTimeLeft }),

      switchPhase: (newPhase) => {
        set((state) => ({
          phase: newPhase,
          isRunning: false,
          endTime: null,
          timeLeft: getPhaseDuration(newPhase, state.settings),
          phaseElapsed: 0,
        }));
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

          if (state.phase === 'focus') {
            const nextPhase: PomodoroPhase = 'break';
            const time = getPhaseDuration(nextPhase, state.settings);
            return {
              phase: nextPhase,
              isRunning: autoStart,
              endTime: autoStart ? Date.now() + time * 1000 : null,
              timeLeft: time,
              phaseElapsed: 0,
              ...completionFields,
              sessionStats: {
                ...state.sessionStats,
                focusTime: state.sessionStats.focusTime + elapsed,
              },
            };
          }

          // Break finished → return to focus, never auto-start
          const time = getPhaseDuration('focus', state.settings);
          return {
            phase: 'focus',
            isRunning: false,
            endTime: null,
            timeLeft: time,
            phaseElapsed: 0,
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
