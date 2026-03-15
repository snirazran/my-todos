import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { type TimerSound } from './timerSounds';

export type PomodoroPhase = 'focus' | 'shortBreak' | 'longBreak';

export interface FrogodoroSettings {
  cycleDuration: number;
  shortBreakDuration: number;
  longBreakDuration: number;
  longBreakInterval: number;
  autoStartBreaks: boolean;
  timerSound: TimerSound;
}

export const DEFAULT_SETTINGS: FrogodoroSettings = {
  cycleDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 30,
  longBreakInterval: 3,
  autoStartBreaks: false,
  timerSound: 'bell',
};

export interface SessionStats {
  focusSessions: number;
  shortBreaks: number;
  longBreaks: number;
  focusTime: number;
  shortBreakTime: number;
  longBreakTime: number;
}

export const DEFAULT_SESSION_STATS: SessionStats = {
  focusSessions: 0,
  shortBreaks: 0,
  longBreaks: 0,
  focusTime: 0,
  shortBreakTime: 0,
  longBreakTime: 0,
};

interface FrogodoroState {
  settings: FrogodoroSettings;
  selectedTaskId: string;
  phase: PomodoroPhase;
  isRunning: boolean;
  timeLeft: number; // in seconds
  endTime: number | null; // unix timestamp for background calc
  completedCycles: number;
  currentSessionSpend: number; // accumulated focus time to sync
  sessionStats: SessionStats;
  phaseElapsed: number; // seconds spent in the current phase

  // Actions
  setSettings: (settings: FrogodoroSettings) => void;
  setTask: (taskId: string, settings?: FrogodoroSettings) => void;
  startTimer: () => void;
  pauseTimer: () => void;
  tickTimer: (newTimeLeft: number) => void;
  switchPhase: (phase: PomodoroPhase) => void;
  completePhase: (autoStart?: boolean) => void;
  addSessionSpend: (time: number) => void;
  clearSessionSpend: () => void;
  updateSessionStats: (stats: SessionStats) => void;
  setPhaseElapsed: (elapsed: number) => void;
  resetSessionStats: () => void;
}

export const useFrogodoroStore = create<FrogodoroState>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      selectedTaskId: '',
      phase: 'focus',
      isRunning: false,
      timeLeft: DEFAULT_SETTINGS.cycleDuration * 60,
      endTime: null,
      completedCycles: 0,
      currentSessionSpend: 0,
      sessionStats: DEFAULT_SESSION_STATS,
      phaseElapsed: 0,

      setSettings: (settings) =>
        set((state) => {
          if (!state.isRunning) {
            let time = settings.cycleDuration * 60;
            if (state.phase === 'shortBreak')
              time = settings.shortBreakDuration * 60;
            if (state.phase === 'longBreak')
              time = settings.longBreakDuration * 60;
            return { settings, timeLeft: time };
          }
          return { settings };
        }),

      setTask: (taskId, taskSettings) => {
        const settings = taskSettings || DEFAULT_SETTINGS;
        set((state) => {
          let initialTime = settings.cycleDuration * 60;
          if (state.phase === 'shortBreak')
            initialTime = settings.shortBreakDuration * 60;
          if (state.phase === 'longBreak')
            initialTime = settings.longBreakDuration * 60;
          return {
            selectedTaskId: taskId,
            settings,
            timeLeft: initialTime,
            isRunning: false,
            endTime: null,
            completedCycles: 0,
            currentSessionSpend: 0,
            sessionStats: DEFAULT_SESSION_STATS,
            phaseElapsed: 0,
          };
        });
      },

      startTimer: () => {
        set((state) => ({
          isRunning: true,
          endTime: Date.now() + state.timeLeft * 1000,
        }));
      },

      pauseTimer: () => {
        set({ isRunning: false, endTime: null });
      },

      tickTimer: (newTimeLeft) => set({ timeLeft: newTimeLeft }),

      switchPhase: (newPhase) => {
        set((state) => {
          let time = state.settings.cycleDuration * 60;
          if (newPhase === 'shortBreak')
            time = state.settings.shortBreakDuration * 60;
          if (newPhase === 'longBreak')
            time = state.settings.longBreakDuration * 60;
          return {
            phase: newPhase,
            isRunning: false,
            endTime: null,
            timeLeft: time,
          };
        });
      },

      completePhase: (autoStart = false) => {
        set((state) => {
          if (state.phase === 'focus') {
            const newCycles = state.completedCycles + 1;
            const nextPhase =
              newCycles % state.settings.longBreakInterval === 0
                ? 'longBreak'
                : 'shortBreak';
            let time = state.settings.shortBreakDuration * 60;
            if (nextPhase === 'longBreak')
              time = state.settings.longBreakDuration * 60;
            return {
              completedCycles: newCycles,
              phase: nextPhase,
              isRunning: autoStart,
              endTime: autoStart ? Date.now() + time * 1000 : null,
              timeLeft: time,
            };
          } else {
            const time = state.settings.cycleDuration * 60;
            return {
              phase: 'focus',
              isRunning: autoStart,
              endTime: autoStart ? Date.now() + time * 1000 : null,
              timeLeft: time,
            };
          }
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
    }),
    {
      name: 'frogodoro-storage',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
