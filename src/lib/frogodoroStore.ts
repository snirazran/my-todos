import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type PomodoroPhase = 'focus' | 'shortBreak' | 'longBreak';

export interface FrogodoroSettings {
  cycleDuration: number;
  shortBreakDuration: number;
  longBreakDuration: number;
  longBreakInterval: number;
}

export const DEFAULT_SETTINGS: FrogodoroSettings = {
  cycleDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 30,
  longBreakInterval: 3,
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

  // Actions
  setSettings: (settings: FrogodoroSettings) => void;
  setTask: (taskId: string, settings?: FrogodoroSettings) => void;
  startTimer: () => void;
  pauseTimer: () => void;
  tickTimer: (newTimeLeft: number) => void;
  switchPhase: (phase: PomodoroPhase) => void;
  completePhase: () => void;
  addSessionSpend: (time: number) => void;
  clearSessionSpend: () => void;
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
          // Only reset timer text if NOT running
          if (!state.isRunning) {
            let initialTime = settings.cycleDuration * 60;
            if (state.phase === 'shortBreak')
              initialTime = settings.shortBreakDuration * 60;
            if (state.phase === 'longBreak')
              initialTime = settings.longBreakDuration * 60;
            return {
              selectedTaskId: taskId,
              settings,
              timeLeft: initialTime,
              completedCycles: 0,
              currentSessionSpend: 0,
            };
          }
          return { selectedTaskId: taskId, settings };
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

      completePhase: () => {
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
              isRunning: false,
              endTime: null,
              timeLeft: time,
            };
          } else {
            return {
              phase: 'focus',
              isRunning: false,
              endTime: null,
              timeLeft: state.settings.cycleDuration * 60,
            };
          }
        });
      },

      addSessionSpend: (time) =>
        set((state) => ({
          currentSessionSpend: state.currentSessionSpend + time,
        })),
      clearSessionSpend: () => set({ currentSessionSpend: 0 }),
    }),
    {
      name: 'frogodoro-storage',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
