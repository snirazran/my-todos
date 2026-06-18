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
  timerSound: 'dreamscape',
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
  selectedTaskName: string;
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
  // True after a phase ends into a non-running (paused) state — the timer
  // alarm keeps sounding until the user acknowledges it by clicking Done.
  awaitingDone: boolean;
  // Actual seconds spent in each phase of the current/just-finished session
  // (resets when a fresh session starts). Drives the Done screen so a
  // fast-forwarded phase shows the real elapsed time, not the duration set.
  lastFocusElapsed: number;
  lastBreakElapsed: number;

  // Actions
  setSettings: (settings: FrogodoroSettings) => void;
  setTask: (taskId: string, settings?: FrogodoroSettings) => void;
  startTimer: () => void;
  pauseTimer: () => void;
  stopTimer: () => void;
  tickTimer: (newTimeLeft: number) => void;
  switchPhase: (phase: PomodoroPhase) => void;
  completePhase: (
    autoStart?: boolean,
    elapsedOverride?: number,
    awaitDone?: boolean,
  ) => void;
  // Records a server-driven phase completion (the advance path doesn't go
  // through completePhase) so the UI can react: bump the completion signal that
  // opens the popup, and set whether the alarm is awaiting acknowledgement.
  registerCompletion: (completedPhase: PomodoroPhase, awaitDone: boolean) => void;
  setAwaitingDone: (value: boolean) => void;
  setSelectedTaskName: (name: string) => void;
  // Records the actual elapsed time of a completed phase for the Done screen.
  setPhaseElapsedResult: (phase: PomodoroPhase, seconds: number) => void;
  addSessionSpend: (time: number) => void;
  clearSessionSpend: () => void;
  updateSessionStats: (stats: SessionStats) => void;
  setPhaseElapsed: (elapsed: number) => void;
  resetSessionStats: () => void;
  hydrateActiveTimer: (timer: ActiveFrogodoroTimer, serverNow?: number) => void;
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
      selectedTaskName: '',
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
      awaitingDone: false,
      lastFocusElapsed: 0,
      lastBreakElapsed: 0,

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
            lastFocusElapsed: isSameTask ? state.lastFocusElapsed : 0,
            lastBreakElapsed: isSameTask ? state.lastBreakElapsed : 0,
          };
        });
      },

      startTimer: () => {
        set((state) => {
          // Starting a phase resets the other one to fresh: once you actually
          // begin a Break, the previous Focus countdown is cleared (and vice
          // versa). Tab-switching alone preserves both; only Start resets.
          const other: PomodoroPhase = state.phase === 'focus' ? 'break' : 'focus';
          // A fresh start (not a resume from pause) begins a new session, so
          // clear the previous session's elapsed totals.
          const freshSession = !state.timerActive;
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
            lastFocusElapsed: freshSession ? 0 : state.lastFocusElapsed,
            lastBreakElapsed: freshSession ? 0 : state.lastBreakElapsed,
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

      completePhase: (autoStart = false, elapsedOverride?: number, awaitDone?: boolean) => {
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
            // No auto-start → the break is queued but paused; the alarm waits
            // for the user to acknowledge it with Done. A manual skip passes
            // awaitDone=false so it just switches modes with no Done/alarm.
            const resolvedAwait = awaitDone ?? !autoStart;
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
              // Active only while running or awaiting Done; a silent skip lands
              // idle on the next mode so it shows tabs + Start, not Resume.
              timerActive: autoStart || resolvedAwait,
              ...completionFields,
              awaitingDone: resolvedAwait,
              lastFocusElapsed: elapsed,
              sessionStats: {
                ...state.sessionStats,
                focusTime: state.sessionStats.focusTime + elapsed,
              },
            };
          }

          // Break finished → return to focus, never auto-start
          const time = focusFull;
          // Break finished → never auto-starts; await Done unless a manual
          // skip explicitly opts out (awaitDone=false).
          const resolvedAwait = awaitDone ?? true;
          return {
            phase: 'focus',
            isRunning: false,
            endTime: null,
            timeLeft: time,
            phaseElapsed: 0,
            remainingByPhase: { focus: time, break: breakFull },
            startedByPhase: { focus: false, break: false },
            timerActive: resolvedAwait,
            ...completionFields,
            awaitingDone: resolvedAwait,
            lastBreakElapsed: elapsed,
            sessionStats: {
              ...state.sessionStats,
              breakTime: state.sessionStats.breakTime + elapsed,
            },
          };
        });
      },

      registerCompletion: (completedPhase, awaitDone) =>
        set((state) => ({
          lastCompletionId: state.lastCompletionId + 1,
          lastCompletedTaskId: state.selectedTaskId,
          lastCompletedPhase: completedPhase,
          awaitingDone: awaitDone,
        })),

      setAwaitingDone: (value) => set({ awaitingDone: value }),

      setSelectedTaskName: (name) => set({ selectedTaskName: name }),

      setPhaseElapsedResult: (phase, seconds) =>
        set(phase === 'focus'
          ? { lastFocusElapsed: seconds }
          : { lastBreakElapsed: seconds }),

      addSessionSpend: (time) =>
        set((state) => ({
          currentSessionSpend: state.currentSessionSpend + time,
        })),
      clearSessionSpend: () => set({ currentSessionSpend: 0 }),
      updateSessionStats: (stats) => set({ sessionStats: stats }),
      setPhaseElapsed: (elapsed) => set({ phaseElapsed: elapsed }),
      resetSessionStats: () => set({ sessionStats: DEFAULT_SESSION_STATS, phaseElapsed: 0 }),
      hydrateActiveTimer: (timer, serverNow) => {
        const skew = (serverNow ?? Date.now()) - Date.now();
        const serverFrameNow = serverNow ?? Date.now();
        const endsAtMs = timer.endsAt ? new Date(timer.endsAt).getTime() : null;

        const prev = get();

        // The wall-clock endTime, corrected for client/server clock skew. Each
        // round-trip the skew jitters by up to a second, which would make a
        // running timer's endTime (and thus the Live Activity signature) drift
        // every echo — causing an end/recreate storm. So if we already have a
        // running timer for the same phase whose endTime is within ~2s of the
        // freshly computed one, keep our existing endTime: same timer, no drift.
        const computedEndTime =
          timer.status === 'running' && endsAtMs ? endsAtMs - skew : null;
        const stableEndTime =
          computedEndTime !== null &&
          prev.isRunning &&
          prev.phase === timer.phase &&
          prev.endTime !== null &&
          Math.abs(prev.endTime - computedEndTime) < 2000
            ? prev.endTime
            : computedEndTime;

        const runningTimeLeft =
          timer.status === 'running' && stableEndTime
            ? Math.max(0, Math.round((stableEndTime - Date.now()) / 1000))
            : timer.status === 'running' && endsAtMs
              ? Math.max(0, Math.round((endsAtMs - serverFrameNow) / 1000))
              : timer.timeLeft;

        const focusFull = getPhaseDuration('focus', timer.settings);
        const breakFull = getPhaseDuration('break', timer.settings);
        const phaseFull = timer.phase === 'focus' ? focusFull : breakFull;

        // A phase counts as "started" only if it's running or was paused
        // mid-way (partial time left). A phase that was just auto-advanced into
        // but never run (full time left, paused) is NOT started, so the Live
        // Activity is dismissed rather than left showing a frozen/paused timer.
        const started =
          (timer.status === 'running' && runningTimeLeft > 0) ||
          runningTimeLeft < phaseFull;

        // The server timer only tracks the ACTIVE phase. For the other phase,
        // keep whatever this client already has (e.g. a focus paused mid-way
        // while you peek at the Break tab) instead of clobbering it back to
        // full — but only if it's a genuine partial (between 0 and full); a
        // fresh or just-finished phase resets to full / not-started.
        const keepRemaining = (p: PomodoroPhase) => {
          const cur = prev.remainingByPhase[p];
          const full = p === 'focus' ? focusFull : breakFull;
          return cur > 0 && cur < full ? cur : full;
        };
        const keepStarted = (p: PomodoroPhase) => {
          const cur = prev.remainingByPhase[p];
          const full = p === 'focus' ? focusFull : breakFull;
          return cur > 0 && cur < full;
        };

        set({
          selectedTaskId: timer.taskId,
          settings: timer.settings,
          phase: timer.phase,
          timerActive: true,
          isRunning: timer.status === 'running' && runningTimeLeft > 0,
          endTime:
            timer.status === 'running' && runningTimeLeft > 0 ? stableEndTime : null,
          timeLeft: runningTimeLeft,
          remainingByPhase: {
            focus: timer.phase === 'focus' ? runningTimeLeft : keepRemaining('focus'),
            break: timer.phase === 'break' ? runningTimeLeft : keepRemaining('break'),
          },
          startedByPhase: {
            focus: timer.phase === 'focus' ? started : keepStarted('focus'),
            break: timer.phase === 'break' ? started : keepStarted('break'),
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
