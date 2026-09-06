import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuid } from 'uuid';
import { type TimerSound } from './timerSounds';
import { subjectKindOf, type FocusSubjectKind } from './focusSubject';
import type { ActiveFrogodoroTimer } from './types/UserDoc';

export type PomodoroPhase = 'focus' | 'break';

export interface FrogodoroSettings {
  focusDuration: number;
  breakDuration: number;
  autoStartBreaks: boolean;
  timerSound: TimerSound;
}

export const SESSION_ENDED_EVENT = 'frogodoro-session-ended';

/** Tells the review gate a sitting just ended, so it can ask what got done. */
export function announceSessionEnded(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SESSION_ENDED_EVENT));
}

export const TEN_SECOND_MINUTES = 10 / 60;
export const MAX_DURATION_MINUTES = 180;

export const FOCUS_PRESETS = [15, 25, 45, 60];
export const BREAK_PRESETS = [5, 10, 15];

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
  // What this sitting is about. `selectedTaskId` is the container that owns the
  // minutes — a real task, or the hidden container for an area / tag / open
  // session — and `selectedTaskName` is its display label.
  subjectKind: FocusSubjectKind;
  // Identifies the focus-session log row the running sitting writes into. A
  // fresh Start mints one; resuming, extending and taking a break keep it.
  sessionId: string;
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
  // The completion was the user's own doing (fast-forward), not the clock
  // running out. Same wrap-up screen, but nothing rings: they are already
  // looking at it, and an alarm for an event you caused reads as a fault.
  doneSilent: boolean;
  activeTimerRev: number | null;
  // Actual seconds spent in each phase of the current/just-finished session
  // (resets when a fresh session starts). Drives the Done screen so a
  // fast-forwarded phase shows the real elapsed time, not the duration set.
  lastFocusElapsed: number;
  lastBreakElapsed: number;
  // Bumped ONLY by explicit user-intent actions (start/pause/resume/stop/
  // switch/complete). The publisher watches this and nothing else, so server→
  // client hydration and display ticks never trigger a publish — which is what
  // makes the server the single source of truth with no echo loop.
  pendingSync: number;
  // Deep-focus pledge: finish the focus phase without pausing → bonus fly.
  // Sticky user preference; the server is the authority for the actual award.
  deepFocus: boolean;
  // Whether the current phase has been paused at least once (breaks the
  // deep-focus pledge), and the same flag frozen at the last completion so the
  // Done screen can show/hide the bonus.
  pausedThisPhase: boolean;
  lastPhasePaused: boolean;
  // The focus duration to restore after an overtime ("+5 keep going") session
  // temporarily shrinks settings.focusDuration. Null when not in overtime.
  overtimePrevFocusDuration: number | null;

  // Actions
  setSettings: (settings: FrogodoroSettings) => void;
  setTask: (taskId: string, settings?: FrogodoroSettings) => void;
  /** Points the timer at a subject without disturbing a running clock. */
  setSubject: (subject: {
    id: string;
    label: string;
    kind?: FocusSubjectKind;
  }) => void;
  setFocusMinutes: (minutes: number) => void;
  setBreakMinutes: (minutes: number) => void;
  /** Starts a break of `seconds` inside the current session. */
  startBreak: (seconds: number) => void;
  /** Mints a new session id, ending the log row the clock was writing into. */
  rotateSession: () => string;
  startTimer: () => void;
  pauseTimer: () => void;
  stopTimer: () => void;
  /** Clears this device's timer UI without publishing a server-side stop. */
  resetLocalTimer: () => void;
  tickTimer: (newTimeLeft: number) => void;
  switchPhase: (phase: PomodoroPhase) => void;
  completePhase: (
    autoStart?: boolean,
    elapsedOverride?: number,
    awaitDone?: boolean,
    silent?: boolean,
  ) => void;
  // Records a server-driven phase completion (the advance path doesn't go
  // through completePhase) so the UI can react: bump the completion signal that
  // opens the popup, and set whether the alarm is awaiting acknowledgement.
  registerCompletion: (completedPhase: PomodoroPhase, awaitDone: boolean) => void;
  setAwaitingDone: (value: boolean) => void;
  setDeepFocus: (value: boolean) => void;
  // Overtime: immediately start a short extra focus run on the same task
  // (used by "+5 keep going" on the Done screen).
  extendFocus: (seconds: number) => void;
  setSelectedTaskName: (name: string) => void;
  // Records the actual elapsed time of a completed phase for the Done screen.
  setPhaseElapsedResult: (phase: PomodoroPhase, seconds: number) => void;
  addSessionSpend: (time: number) => void;
  clearSessionSpend: () => void;
  updateSessionStats: (stats: SessionStats) => void;
  setPhaseElapsed: (elapsed: number) => void;
  resetSessionStats: () => void;
  hydrateActiveTimer: (timer: ActiveFrogodoroTimer, serverNow?: number) => void;
  hydrateLiveActivitySnapshot: (snapshot: {
    phase?: PomodoroPhase;
    isRunning: boolean;
    endTime: number | null;
    timeLeft: number;
    totalSeconds: number;
    finished?: boolean;
  }) => void;
  setActiveTimerRev: (rev: number | null) => void;
}

// Stored per-task settings are whatever Mongo last held, which for a
// freshly-upserted container can be partial or empty. A missing duration used
// to fall through to Math.max(1, NaN||0) = a ONE SECOND phase, which starts and
// finishes in the same breath and reads as "the timer won't start".
function sanitizeMinutes(value: unknown, fallback: number): number {
  const minutes = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return fallback;
  return Math.min(MAX_DURATION_MINUTES, minutes);
}

export function sanitizeSettings(
  settings: Partial<FrogodoroSettings> | null | undefined,
): FrogodoroSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...(settings ?? {}),
    focusDuration: sanitizeMinutes(
      settings?.focusDuration,
      DEFAULT_SETTINGS.focusDuration,
    ),
    breakDuration: sanitizeMinutes(
      settings?.breakDuration,
      DEFAULT_SETTINGS.breakDuration,
    ),
  };
}

// A phase whose stored remaining has run down to nothing is spent, not paused:
// re-selecting the same subject must hand back a full phase rather than a
// zero-length one that starts and ends in the same tick.
function livePhaseRemaining(
  state: { remainingByPhase: Record<PomodoroPhase, number> },
  phase: PomodoroPhase,
  settings: FrogodoroSettings,
): number {
  const full = getPhaseDuration(phase, settings);
  const remaining = state.remainingByPhase?.[phase];
  if (typeof remaining !== 'number' || !Number.isFinite(remaining)) return full;
  if (remaining <= 0) return full;
  return Math.min(remaining, full);
}

function getPhaseDuration(phase: PomodoroPhase, settings: FrogodoroSettings) {
  const minutes = phase === 'focus' ? settings.focusDuration : settings.breakDuration;
  const safe = sanitizeMinutes(
    minutes,
    phase === 'focus'
      ? DEFAULT_SETTINGS.focusDuration
      : DEFAULT_SETTINGS.breakDuration,
  );
  return Math.max(1, Math.round(safe * 60));
}

// A persisted "running" timer whose endTime has already passed is a corpse: the
// tab/app was closed through the phase and the session was finished (or dropped)
// on some other surface. Restoring it as live makes the first server reconcile
// adopt it and re-publish a long-dead phase, which the server then processes as
// a completion and rings. Restore it as a clean idle timer instead; if the
// server really does still have a live timer, hydration puts it back.
function restoreTimerState(state: FrogodoroState): FrogodoroState {
  // Storage can hold values no current code path would write — a phase left at
  // zero by an earlier build, a duration that never round-tripped. Repair them
  // on the way in, or an idle timer restores itself unstartable.
  const restored: FrogodoroState = {
    ...state,
    settings: sanitizeSettings(state.settings),
  };
  if (!restored.isRunning) {
    const safe = restored.settings;
    return {
      ...restored,
      timeLeft:
        Number.isFinite(restored.timeLeft) && restored.timeLeft > 0
          ? restored.timeLeft
          : getPhaseDuration(restored.phase, safe),
      remainingByPhase: {
        focus: livePhaseRemaining(restored, 'focus', safe),
        break: livePhaseRemaining(restored, 'break', safe),
      },
    };
  }
  if (restored.endTime && restored.endTime > Date.now()) return restored;

  state = restored;
  const settings =
    state.overtimePrevFocusDuration != null
      ? sanitizeSettings({
          ...state.settings,
          focusDuration: state.overtimePrevFocusDuration,
        })
      : state.settings;

  return {
    ...state,
    settings,
    overtimePrevFocusDuration: null,
    timerActive: false,
    isRunning: false,
    endTime: null,
    timeLeft: getPhaseDuration(state.phase, settings),
    phaseElapsed: 0,
    awaitingDone: false,
    pausedThisPhase: false,
    activeTimerRev: null,
    startedByPhase: { focus: false, break: false },
    remainingByPhase: {
      focus: getPhaseDuration('focus', settings),
      break: getPhaseDuration('break', settings),
    },
  };
}

export const useFrogodoroStore = create<FrogodoroState>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      selectedTaskId: '',
      selectedTaskName: '',
      subjectKind: 'task',
      sessionId: '',
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
      doneSilent: false,
      activeTimerRev: null,
      lastFocusElapsed: 0,
      lastBreakElapsed: 0,
      pendingSync: 0,
      // Armed by default: it is the better session and costs nothing to leave
      // on — pausing only forfeits the bonus, never the minutes.
      deepFocus: true,
      pausedThisPhase: false,
      lastPhasePaused: false,
      overtimePrevFocusDuration: null,

      setSettings: (raw) =>
        set((state) => {
          const settings = sanitizeSettings(raw);
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
        const settings = sanitizeSettings(taskSettings);
        set((state) => {
          const isSameTask = state.selectedTaskId === taskId;
          // A fresh task always starts on Focus; only keep the current phase
          // when re-selecting the task that is already active (so a task you
          // switched to Break stays on Break while it's the selected one).
          const phase = isSameTask ? state.phase : 'focus';
          const remainingByPhase: Record<PomodoroPhase, number> = isSameTask
            ? {
                focus: livePhaseRemaining(state, 'focus', settings),
                break: livePhaseRemaining(state, 'break', settings),
              }
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
            activeTimerRev: isSameTask ? state.activeTimerRev : null,
            // Selecting an idle target is local setup, not a timer action.
            // Bumping pendingSync here makes GlobalTimer send DELETE /active;
            // that request can race the subsequent Start PUT and stop a newly
            // opened Settings focus-area timer immediately.
            pendingSync: state.pendingSync,
          };
        });
      },

      setSubject: ({ id, label, kind }) =>
        set({
          selectedTaskId: id,
          selectedTaskName: label,
          subjectKind: kind ?? subjectKindOf(id),
        }),

      setFocusMinutes: (minutes) => {
        const value = Math.max(TEN_SECOND_MINUTES, Math.min(MAX_DURATION_MINUTES, minutes));
        get().setSettings({ ...get().settings, focusDuration: value });
      },

      setBreakMinutes: (minutes) => {
        const value = Math.max(TEN_SECOND_MINUTES, Math.min(MAX_DURATION_MINUTES, minutes));
        get().setSettings({ ...get().settings, breakDuration: value });
      },

      rotateSession: () => {
        const id = uuid();
        set({ sessionId: id });
        return id;
      },

      startBreak: (seconds) =>
        set((state) => {
          const length = Math.max(10, Math.round(seconds));
          return {
            phase: 'break',
            timerActive: true,
            isRunning: true,
            endTime: Date.now() + length * 1000,
            timeLeft: length,
            phaseElapsed: 0,
            awaitingDone: false,
            pausedThisPhase: false,
            settings: { ...state.settings, breakDuration: length / 60 },
            remainingByPhase: {
              focus: getPhaseDuration('focus', state.settings),
              break: length,
            },
            startedByPhase: { focus: false, break: true },
            pendingSync: state.pendingSync + 1,
          };
        }),

      startTimer: () => {
        set((state) => {
          // Starting a phase resets the other one to fresh: once you actually
          // begin a Break, the previous Focus countdown is cleared (and vice
          // versa). Tab-switching alone preserves both; only Start resets.
          const other: PomodoroPhase = state.phase === 'focus' ? 'break' : 'focus';
          // A fresh start (not a resume from pause) begins a new session, so
          // clear the previous session's elapsed totals.
          const freshSession = !state.timerActive;
          // Never start a spent phase. A zero (or junk) countdown ends the
          // instant it begins, which on screen is indistinguishable from the
          // Start button doing nothing at all.
          const timeLeft =
            Number.isFinite(state.timeLeft) && state.timeLeft > 0
              ? state.timeLeft
              : getPhaseDuration(state.phase, state.settings);
          return {
            timerActive: true,
            isRunning: true,
            timeLeft,
            endTime: Date.now() + timeLeft * 1000,
            startedByPhase: {
              ...state.startedByPhase,
              [state.phase]: true,
              [other]: false,
            },
            remainingByPhase: {
              ...state.remainingByPhase,
              [state.phase]: timeLeft,
              [other]: getPhaseDuration(other, state.settings),
            },
            lastFocusElapsed: freshSession ? 0 : state.lastFocusElapsed,
            lastBreakElapsed: freshSession ? 0 : state.lastBreakElapsed,
            pausedThisPhase: freshSession ? false : state.pausedThisPhase,
            sessionId: freshSession || !state.sessionId ? uuid() : state.sessionId,
            pendingSync: state.pendingSync + 1,
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
          pausedThisPhase: state.isRunning ? true : state.pausedThisPhase,
          pendingSync: state.pendingSync + 1,
        }));
      },

      stopTimer: () => {
        set((state) => {
          const settings =
            state.overtimePrevFocusDuration != null
              ? { ...state.settings, focusDuration: state.overtimePrevFocusDuration }
              : state.settings;
          return {
            settings,
            overtimePrevFocusDuration: null,
            timerActive: false,
            isRunning: false,
            endTime: null,
            // A stopped session is over, and a break is never something you
            // pick at setup any more — it is offered when a focus ends. Ending
            // on the break phase used to persist it, so reopening the same
            // subject came up as a break instead of a fresh focus.
            phase: 'focus' as PomodoroPhase,
            timeLeft: getPhaseDuration('focus', settings),
            phaseElapsed: 0,
            pausedThisPhase: false,
            startedByPhase: { focus: false, break: false },
            remainingByPhase: {
              focus: getPhaseDuration('focus', settings),
              break: getPhaseDuration('break', settings),
            },
            activeTimerRev: null,
            pendingSync: state.pendingSync + 1,
          };
        });
      },

      resetLocalTimer: () => {
        set((state) => {
          const settings =
            state.overtimePrevFocusDuration != null
              ? {
                  ...state.settings,
                  focusDuration: state.overtimePrevFocusDuration,
                }
              : state.settings;
          return {
            settings,
            selectedTaskId: '',
            selectedTaskName: '',
            subjectKind: 'task' as FocusSubjectKind,
            sessionId: '',
            phase: 'focus',
            timerActive: false,
            isRunning: false,
            timeLeft: getPhaseDuration('focus', settings),
            endTime: null,
            currentSessionSpend: 0,
            sessionStats: DEFAULT_SESSION_STATS,
            phaseElapsed: 0,
            remainingByPhase: {
              focus: getPhaseDuration('focus', settings),
              break: getPhaseDuration('break', settings),
            },
            startedByPhase: { focus: false, break: false },
            lastCompletedTaskId: '',
            lastCompletedPhase: null,
            awaitingDone: false,
            activeTimerRev: null,
            lastFocusElapsed: 0,
            lastBreakElapsed: 0,
            // Deliberately preserve pendingSync. Incrementing it would make the
            // publisher interpret logout as a user-requested server stop.
            pendingSync: state.pendingSync,
            pausedThisPhase: false,
            lastPhasePaused: false,
            overtimePrevFocusDuration: null,
          };
        });
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
            pendingSync: state.pendingSync + 1,
          };
        });
      },

      completePhase: (
        autoStart = false,
        elapsedOverride?: number,
        awaitDone?: boolean,
        silent = false,
      ) => {
        set((state) => {
          const completionFields = {
            lastCompletionId: state.lastCompletionId + 1,
            lastCompletedTaskId: state.selectedTaskId,
            lastCompletedPhase: state.phase,
            lastPhasePaused: state.pausedThisPhase,
            pausedThisPhase: false,
            doneSilent: silent,
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
              pendingSync: state.pendingSync + 1,
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
            pendingSync: state.pendingSync + 1,
          };
        });
      },

      registerCompletion: (completedPhase, awaitDone) =>
        set((state) => ({
          lastCompletionId: state.lastCompletionId + 1,
          lastCompletedTaskId: state.selectedTaskId,
          lastCompletedPhase: completedPhase,
          lastPhasePaused: state.pausedThisPhase,
          pausedThisPhase: false,
          awaitingDone: awaitDone,
          // A server-driven completion is the clock running out, so it rings.
          doneSilent: false,
        })),

      setAwaitingDone: (value) =>
        set(value ? { awaitingDone: true } : { awaitingDone: false, doneSilent: false }),

      setDeepFocus: (value) => set({ deepFocus: value }),

      extendFocus: (seconds) =>
        set((state) => {
          const breakFull = getPhaseDuration('break', state.settings);
          return {
            phase: 'focus',
            timerActive: true,
            isRunning: true,
            endTime: Date.now() + seconds * 1000,
            timeLeft: seconds,
            phaseElapsed: 0,
            awaitingDone: false,
            pausedThisPhase: false,
            settings: { ...state.settings, focusDuration: seconds / 60 },
            overtimePrevFocusDuration:
              state.overtimePrevFocusDuration ?? state.settings.focusDuration,
            remainingByPhase: { focus: seconds, break: breakFull },
            startedByPhase: { focus: true, break: false },
            pendingSync: state.pendingSync + 1,
          };
        }),

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
      hydrateLiveActivitySnapshot: (snapshot) =>
        set((state) => {
          if (!state.timerActive && !state.awaitingDone) return {};
          const phase = snapshot.phase ?? state.phase;
          const focusFull = getPhaseDuration('focus', state.settings);
          const breakFull = getPhaseDuration('break', state.settings);
          const full = Math.max(1, Math.round(snapshot.totalSeconds));
          const timeLeft =
            snapshot.isRunning && snapshot.endTime
              ? Math.max(0, Math.round((snapshot.endTime - Date.now()) / 1000))
              : Math.max(0, Math.round(snapshot.timeLeft));
          const started =
            snapshot.isRunning ||
            timeLeft < (phase === 'focus' ? focusFull : breakFull) ||
            timeLeft < full;

          return {
            phase,
            timerActive: true,
            isRunning: snapshot.isRunning && timeLeft > 0,
            endTime: snapshot.isRunning && timeLeft > 0 ? snapshot.endTime : null,
            timeLeft,
            // A ringing island describes a phase that already ran out, and the
            // server credited it in full when it completed. Marking the whole
            // phase as persisted keeps every "unsaved = elapsed - phaseElapsed"
            // flush (pause, Stop, task complete) from saving it a second time —
            // this snapshot lands with timeLeft 0, which otherwise reads as a
            // full phase nobody has saved yet.
            phaseElapsed:
              snapshot.finished === true ? full : state.phaseElapsed,
            awaitingDone: snapshot.finished === true ? true : state.awaitingDone,
            remainingByPhase: {
              ...state.remainingByPhase,
              [phase]: timeLeft,
            },
            startedByPhase: {
              ...state.startedByPhase,
              [phase]: started,
            },
          };
        }),
      hydrateActiveTimer: (rawTimer, serverNow) => {
        const timer = { ...rawTimer, settings: sanitizeSettings(rawTimer.settings) };
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

        // savedElapsed is the server's record of how much of THIS phase the
        // task's session rows already hold — the same thing phaseElapsed means
        // locally. Adopting it is what stops a second surface (a phone that
        // never ran the flushes, a device woken mid-phase) from re-saving time
        // another device already persisted; a local flush that hasn't reached
        // the server yet still wins, hence the max.
        const samePhase =
          prev.selectedTaskId === timer.taskId && prev.phase === timer.phase;
        const serverSaved = Math.max(0, Math.floor(timer.savedElapsed ?? 0));
        const phaseElapsed = samePhase
          ? Math.max(prev.phaseElapsed, serverSaved)
          : serverSaved;

        set({
          selectedTaskId: timer.taskId,
          selectedTaskName: timer.subjectLabel || prev.selectedTaskName,
          subjectKind: timer.subjectKind ?? subjectKindOf(timer.taskId),
          sessionId: timer.sessionId || prev.sessionId,
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
          phaseElapsed,
          activeTimerRev: timer.rev ?? null,
          pausedThisPhase:
            timer.deepFocusBroken === true ? true : prev.pausedThisPhase,
        });
      },
      setActiveTimerRev: (rev) => set({ activeTimerRev: rev }),
    }),
    {
      name: 'frogodoro-storage',
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) =>
        restoreTimerState({
          ...current,
          ...((persisted as Partial<FrogodoroState>) ?? {}),
        }),
    },
  ),
);
