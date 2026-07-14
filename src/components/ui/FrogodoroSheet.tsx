'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import {
  Play,
  Pause,
  SkipForward,
  Settings2,
  X,
  Plus,
  Minus,
  Square,
  Check,
  Lock,
  Scroll,
} from 'lucide-react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import {
  useFrogodoroStore,
  PomodoroPhase,
  DEFAULT_SETTINGS,
} from '@/lib/frogodoroStore';
import { useSheetOverscrollDrag } from '@/components/ui/useSheetOverscrollDrag';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import { useFrogodoroUiStore } from '@/lib/frogodoroUiStore';
import {
  playTimerSound,
  stopTimerSound,
  unlockAudio,
  normalizeTimerSound,
  TIMER_SOUNDS,
  type TimerSound,
} from '@/lib/timerSounds';
import { useNotificationStatus } from '@/hooks/useNotificationStatus';
import { Bell, Volume2, Zap } from 'lucide-react';
import { useIntros } from '@/hooks/useIntros';
import { FrogodoroIntroSheet } from '@/components/ui/FirstTimeIntros';
import { FocusCelebration, questHomeKey } from '@/components/ui/FocusCelebration';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';
import type { Trackable } from '@/lib/questClaims';
import { FocusScene } from '@/components/ui/FocusScene';
import { fliesCaughtFor, deepFocusPledgeLive } from '@/lib/focusFlies';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import Frog from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import useSWR from 'swr';

interface Task {
  id: string;
  text: string;
  completed: boolean;
  tags?: string[];
  frogodoroSession?: {
    date: string;
    focusTime: number;
    breakTime: number;
  } | null;
  frogodoroSettings?: Record<string, unknown>;
}

// The store's timeLeft ticks every second; only the leaf components below
// subscribe to it, so the tick never re-renders the whole sheet. These helpers
// derive the per-second values from a state snapshot (render subscriptions and
// event-time getState() reads share the same formulas).
type TickState = {
  phase: PomodoroPhase;
  timeLeft: number;
  phaseElapsed: number;
  sessionStats: { focusTime: number; breakTime: number };
  settings: { focusDuration: number; breakDuration: number };
};

function phaseDurationSeconds(s: TickState) {
  return Math.max(
    1,
    Math.round(
      (s.phase === 'focus' ? s.settings.focusDuration : s.settings.breakDuration) * 60,
    ),
  );
}

function liveElapsedSeconds(s: TickState) {
  return phaseDurationSeconds(s) - s.timeLeft;
}

function sessionFocusLiveSeconds(s: TickState) {
  return (
    s.sessionStats.focusTime +
    (s.phase === 'focus'
      ? Math.max(0, liveElapsedSeconds(s) - s.phaseElapsed)
      : 0)
  );
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function CountdownText({ frozen }: { frozen: number | null }) {
  const timeLeft = useFrogodoroStore((s) => s.timeLeft);
  return <>{formatTime(frozen ?? timeLeft)}</>;
}

function PhaseProgressFill({ animate }: { animate: boolean }) {
  const percent = useFrogodoroStore((s) => {
    const duration = phaseDurationSeconds(s);
    return Math.min(100, Math.max(0, ((duration - s.timeLeft) / duration) * 100));
  });
  return (
    <div
      aria-hidden
      className={`absolute inset-x-0 bottom-0 z-0 bg-black/20 ${
        animate ? 'transition-[height] duration-1000 ease-linear' : ''
      }`}
      style={{ height: `${percent}%` }}
    />
  );
}

function SessionStatsRow({
  dbSession,
}: {
  dbSession: Task['frogodoroSession'];
}) {
  const { focusTime, breakTime, isRunning, phase } = useFrogodoroStore(
    useShallow((s) => {
      const unsaved = Math.max(0, liveElapsedSeconds(s) - s.phaseElapsed);
      const focusBase = Math.max(s.sessionStats.focusTime, dbSession?.focusTime ?? 0);
      const breakBase = Math.max(s.sessionStats.breakTime, dbSession?.breakTime ?? 0);
      return {
        focusTime: focusBase + (s.phase === 'focus' ? unsaved : 0),
        breakTime: breakBase + (s.phase === 'break' ? unsaved : 0),
        isRunning: s.isRunning,
        phase: s.phase,
      };
    }),
  );
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-3 flex-wrap border-t border-border/30">
      {(focusTime > 0 || (isRunning && phase === 'focus')) && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-primary/8 dark:bg-primary/15">
          <div className={`w-1.5 h-1.5 rounded-full bg-primary ${isRunning && phase === 'focus' ? 'animate-pulse' : ''}`} />
          <span className="text-[10px] font-bold text-primary/60 uppercase tracking-wider">Focus</span>
          <span className="text-[11px] font-black text-primary tabular-nums">{formatDuration(focusTime)}</span>
        </div>
      )}
      {(breakTime > 0 || (isRunning && phase === 'break')) && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-sky-500/8 dark:bg-sky-500/15">
          <div className={`w-1.5 h-1.5 rounded-full bg-sky-500 ${isRunning && phase === 'break' ? 'animate-pulse' : ''}`} />
          <span className="text-[10px] font-bold text-sky-500/60 uppercase tracking-wider">Break</span>
          <span className="text-[11px] font-black text-sky-500 tabular-nums">{formatDuration(breakTime)}</span>
        </div>
      )}
    </div>
  );
}

type Props = Readonly<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task: Task | null;
  tags?: { id: string; name: string; color: string }[];
  // Start the timer immediately on open (swipe-to-focus / join flows) instead
  // of waiting for the START tap. Ignored while a session is already active.
  autoStart?: boolean;
  onMutateToday?: () => void;
}>;

export default function FrogodoroSheet({
  open,
  onOpenChange,
  task,
  tags: userTags = [],
  autoStart = false,
  onMutateToday,
}: Props) {
  useRegisterOpenSheet(open);
  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  // Heavy Rive content (the live frog scene) mounts only after the sheet's
  // entrance animation settles — a static frog stamp holds its place — so the
  // slide-in/out never competes with Rive canvas setup (same pattern as
  // BaseSheet's `entered`).
  const [sheetEntered, setSheetEntered] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showPond, setShowPond] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [confirmPause, setConfirmPause] = useState(false);
  const [confirmTaskSwitch, setConfirmTaskSwitch] = useState(false);
  const catchChipRef = useRef<HTMLDivElement | null>(null);
  const [chipPulse, setChipPulse] = useState(0);
  const { seenIntros, markIntroSeen } = useIntros(open);
  const [introOpen, setIntroOpen] = useState(false);

  // First open ever (per account): explain the timer once — sprints, sync,
  // and that it survives closing the app. First-timers also get a shorter
  // 15-minute default focus: an easier first win than the classic 25.
  useEffect(() => {
    if (!open || !seenIntros || seenIntros.frogodoro) return;
    markIntroSeen('frogodoro');
    const store = useFrogodoroStore.getState();
    if (!task?.frogodoroSettings && !store.timerActive) {
      store.setSettings({ ...store.settings, focusDuration: 15 });
    }
    setIntroOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seenIntros?.frogodoro]);
  const dragControls = useDragControls();
  const overscroll = useSheetOverscrollDrag();

  // Deliberately excludes timeLeft: the per-second tick only re-renders the
  // small leaf components above (CountdownText, PhaseProgressFill,
  // SessionStatsRow), not this whole sheet. Handlers read timeLeft at event
  // time via useFrogodoroStore.getState().
  const {
    settings,
    selectedTaskId,
    phase,
    isRunning,
    timerActive,
    sessionStats,
    phaseElapsed: storeElapsed,
    setSettings,
    setTask,
    startTimer,
    pauseTimer,
    stopTimer,
    switchPhase,
    completePhase,
    updateSessionStats,
    awaitingDone,
    setAwaitingDone,
    setSelectedTaskName,
    selectedTaskName,
    lastCompletedPhase,
    lastFocusElapsed,
    lastBreakElapsed,
    lastPhasePaused,
    deepFocus,
    setDeepFocus,
    extendFocus,
    pausedThisPhase,
  } = useFrogodoroStore(
    useShallow((s) => ({
      settings: s.settings,
      selectedTaskId: s.selectedTaskId,
      phase: s.phase,
      isRunning: s.isRunning,
      timerActive: s.timerActive,
      sessionStats: s.sessionStats,
      phaseElapsed: s.phaseElapsed,
      setSettings: s.setSettings,
      setTask: s.setTask,
      startTimer: s.startTimer,
      pauseTimer: s.pauseTimer,
      stopTimer: s.stopTimer,
      switchPhase: s.switchPhase,
      completePhase: s.completePhase,
      updateSessionStats: s.updateSessionStats,
      awaitingDone: s.awaitingDone,
      setAwaitingDone: s.setAwaitingDone,
      setSelectedTaskName: s.setSelectedTaskName,
      selectedTaskName: s.selectedTaskName,
      lastCompletedPhase: s.lastCompletedPhase,
      lastFocusElapsed: s.lastFocusElapsed,
      lastBreakElapsed: s.lastBreakElapsed,
      lastPhasePaused: s.lastPhasePaused,
      deepFocus: s.deepFocus,
      setDeepFocus: s.setDeepFocus,
      extendFocus: s.extendFocus,
      pausedThisPhase: s.pausedThisPhase,
    })),
  );
  const { indices: frogIndices } = useWardrobeIndices(open);

  const { data: pondData } = useSWR<{
    today: string;
    days: Array<{ date: string; focusTime: number; breakTime: number; tasks: number }>;
  }>(
    open && showPond
      ? `/api/frogodoro/history?days=7&tz=${encodeURIComponent(
          Intl.DateTimeFormat().resolvedOptions().timeZone,
        )}`
      : null,
    (url: string) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: false },
  );
  const addOpenSheet = useFrogodoroUiStore((s) => s.addOpenSheet);
  const removeOpenSheet = useFrogodoroUiStore((s) => s.removeOpenSheet);

  const { data: questHomeData } = useSWR<{ trackables?: Trackable[] }>(
    open && task ? questHomeKey() : null,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );
  // Which area quests this session's focus minutes will fill, matched by the
  // task's tags against each active area quest's focus tags.
  const sessionAreas = useMemo(() => {
    const areaFocus = (questHomeData?.trackables ?? []).filter(
      (t) =>
        t.placement === 'category' &&
        t.objectiveType === 'focus_minutes' &&
        !t.needsFocusTags &&
        (t.tags?.length ?? 0) > 0,
    );
    if (areaFocus.length === 0) return null;
    const taskTagIds = new Set(task?.tags ?? []);
    const matchedNames: string[] = [];
    for (const t of areaFocus) {
      const name = t.categoryName;
      if (!name || matchedNames.includes(name)) continue;
      if (t.tags!.some((tag) => taskTagIds.has(tag.id))) {
        matchedNames.push(name);
      }
    }
    return { matchedNames };
  }, [questHomeData?.trackables, task?.tags]);

  const [localSettings, setLocalSettings] = useState(settings);
  const [previewingId, setPreviewingId] = useState<TimerSound | null>(null);
  const {
    canEnable: canEnableNotifs,
    enableOrConfigure,
    isNative: notifIsNative,
  } = useNotificationStatus();
  const [notifHint, setNotifHint] = useState<string | null>(null);
  const notifHintTimerRef = useRef(0);
  useEffect(() => () => window.clearTimeout(notifHintTimerRef.current), []);
  const handleEnableNotifs = async () => {
    const next = await enableOrConfigure();
    window.clearTimeout(notifHintTimerRef.current);
    if (next === 'granted') {
      setNotifHint(null);
      return;
    }
    setNotifHint(
      next === 'denied'
        ? notifIsNative
          ? 'Turn on notifications for Frogress in the settings screen'
          : 'Notifications are blocked — allow them for this site in your browser settings'
        : 'Notifications stay off until the permission prompt is accepted',
    );
    notifHintTimerRef.current = window.setTimeout(
      () => setNotifHint(null),
      5000,
    );
  };

  useEffect(() => {
    if (!open) setSheetEntered(false);
  }, [open]);

  useEffect(() => {
    setMounted(true);
    const check = () =>
      setIsDesktop(window.matchMedia('(min-width: 640px)').matches);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    overscroll.setContext(dragControls, open && !isDesktop);
  }, [overscroll, dragControls, open, isDesktop]);

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

  // When opened with a task, select it in the store. Binding a different task
  // resets the store's session, so while another task's timer is mid-session
  // the bind waits behind a confirm instead of silently killing that session.
  const bindTaskToStore = () => {
    if (!task) return;
    setTask(
      task.id,
      task.frogodoroSettings
        ? { ...DEFAULT_SETTINGS, ...(task.frogodoroSettings as Record<string, unknown>) } as typeof DEFAULT_SETTINGS
        : undefined,
    );
    if (task.frogodoroSession) {
      const db = task.frogodoroSession;
      updateSessionStats({
        focusTime: db.focusTime ?? 0,
        breakTime: db.breakTime ?? 0,
      });
    }
  };
  useEffect(() => {
    if (!(open && task && task.id !== selectedTaskId)) return;
    const store = useFrogodoroStore.getState();
    if (store.timerActive && store.selectedTaskId) {
      setConfirmTaskSwitch(true);
      return;
    }
    bindTaskToStore();
  }, [open, task]);

  // Confirmed: flush the old task's unsaved minutes, end its session, then
  // bind this task as usual.
  const performTaskSwitch = async () => {
    const live = useFrogodoroStore.getState();
    const oldTaskId = live.selectedTaskId;
    const unsavedElapsed = Math.max(
      0,
      liveElapsedSeconds(live) - live.phaseElapsed,
    );
    setConfirmTaskSwitch(false);
    if (oldTaskId && unsavedElapsed > 0) {
      await saveSessionToDb(oldTaskId, live.phase, unsavedElapsed);
      onMutateToday?.();
    }
    stopTimer();
    bindTaskToStore();
  };

  // One-tap start: begin the session as soon as the sheet opens with a task
  // selected, once per open, only from a clean idle state.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      autoStartedRef.current = false;
      return;
    }
    if (!autoStart || autoStartedRef.current || !task) return;
    const store = useFrogodoroStore.getState();
    if (store.timerActive || store.awaitingDone) return;
    if (store.selectedTaskId !== task.id) return;
    autoStartedRef.current = true;
    startTimer();
  }, [open, autoStart, task, selectedTaskId, startTimer]);

  // Keep the store's task name in sync so the global completion popup can show
  // it (it has no access to task data on its own). Only once this task is the
  // bound one — while the switch confirm is pending, the name must keep
  // describing the task whose session is still running.
  useEffect(() => {
    if (open && task?.text && task.id === selectedTaskId) {
      setSelectedTaskName(task.text);
    }
  }, [open, task, selectedTaskId, setSelectedTaskName]);

  // While this sheet is open, suppress the global completion popup — this sheet
  // shows its own Done.
  useEffect(() => {
    if (!open) return;
    addOpenSheet();
    return () => removeOpenSheet();
  }, [open, addOpenSheet, removeOpenSheet]);

  // Reset sub-views on a real open→closed transition (a user dismissal). This
  // must NOT fire merely because a completion sets awaitingDone while the popup
  // is still minimized — otherwise it would silence the alarm and drop the Done
  // state before the popup auto-opens.
  const prevOpenRef = useRef(open);
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (wasOpen && !open) {
      setShowSettings(false);
      setShowHelp(false);
      setShowPond(false);
      setConfirmStop(false);
      setConfirmPause(false);
      setConfirmTaskSwitch(false);
      stopTimerSound();
      setPreviewingId(null);
      // Dismissing the popup also acknowledges a finished session: silence the
      // alarm (GlobalTimer stops playback when this flips false) and end the
      // session so the next phase is left fresh rather than active.
      if (awaitingDone) {
        setAwaitingDone(false);
        stopTimer();
      }
    }
  }, [open, awaitingDone, setAwaitingDone, stopTimer]);

  // Stop any sound preview when leaving the settings view
  useEffect(() => {
    if (!showSettings) {
      stopTimerSound();
      setPreviewingId(null);
    }
  }, [showSettings]);

  // Toggle a sound preview: select it and play it, or stop it if it's the
  // one already previewing.
  const handleSoundSelect = (id: TimerSound) => {
    setLocalSettings((prev) => ({ ...prev, timerSound: id }));
    if (previewingId === id) {
      stopTimerSound();
      setPreviewingId(null);
      return;
    }
    if (id === 'none') {
      stopTimerSound();
      setPreviewingId(null);
      return;
    }
    setPreviewingId(id);
    playTimerSound(id, () => setPreviewingId(null));
  };

  // Derived
  const phaseDuration =
    Math.max(1, Math.round((phase === 'focus' ? settings.focusDuration : settings.breakDuration) * 60));
  const phaseHasElapsed = useFrogodoroStore((s) => liveElapsedSeconds(s) > 0);
  const focusedMinutes = useFrogodoroStore((s) =>
    Math.max(1, Math.floor(liveElapsedSeconds(s) / 60)),
  );

  const hasStats =
    sessionStats.focusTime > 0 ||
    sessionStats.breakTime > 0 ||
    isRunning ||
    phaseHasElapsed ||
    (task?.frogodoroSession?.focusTime ?? 0) > 0 ||
    (task?.frogodoroSession?.breakTime ?? 0) > 0;

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
  useEffect(() => {
    // Don't force phaseElapsed to 0 here — the store sets it correctly when a
    // phase is resumed (so its countdown picks up where it left off). The sync
    // effect above mirrors storeElapsed into phaseTimeRef while paused.
    prevPhaseRef.current = phase;
  }, [phase]);

  const saveSessionToDb = async (
    taskId: string,
    currentPhase: typeof phase,
    elapsed: number,
  ) => {
    if (elapsed <= 0) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const session = {
      date: today,
      focusTime: currentPhase === 'focus' ? elapsed : 0,
      breakTime: currentPhase === 'break' ? elapsed : 0,
    };
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

  const pledgeLive = deepFocusPledgeLive({
    deepFocus,
    pausedThisPhase,
    phase,
    focusDurationMinutes: settings.focusDuration,
  });

  const toggleTimer = () => {
    if (isRunning) {
      // Pausing breaks the deep-focus pledge — warn before losing the bonus.
      if (pledgeLive && timerActive) {
        setConfirmPause(true);
        return;
      }
      pauseTimer();
    } else {
      startTimer();
    }
  };

  // Acknowledge a finished session: silence the alarm and end the session. A
  // session ends when its timer ends, so the next phase is left fresh and
  // inactive (not a continuation) — the user starts it anew when ready. Doesn't
  // save progress; the completed phase was already saved when it finished.
  const handleDone = () => {
    setAwaitingDone(false);
    stopTimer();
  };

  // Stop ends the current session and stays on the popup (now idle), so you can
  // pick a mode and start a new session if you like.
  const performStop = async () => {
    const live = useFrogodoroStore.getState();
    const taskId = selectedTaskId;
    const unsavedElapsed = Math.max(
      0,
      liveElapsedSeconds(live) - live.phaseElapsed,
    );
    const currentPhase = phase;

    setConfirmStop(false);
    if (taskId && unsavedElapsed > 0) {
      await saveSessionToDb(taskId, currentPhase, unsavedElapsed);
      onMutateToday?.();
    }
    stopTimer();
  };

  // Ending a focus session with meaningful time on the clock asks first — a
  // gentle nudge to keep going, never a punishment (the minutes still count).
  const handleStopTimer = () => {
    const live = useFrogodoroStore.getState();
    if (
      phase === 'focus' &&
      timerActive &&
      liveElapsedSeconds(live) >= 60 &&
      live.timeLeft > 60
    ) {
      setConfirmStop(true);
      return;
    }
    void performStop();
  };

  const handleKeepGoing = () => {
    setAwaitingDone(false);
    extendFocus(5 * 60);
  };

  // Fast-forward: end the current phase now and switch to the other tab. No
  // Done/alarm — it's a deliberate skip. The next phase only auto-starts if the
  // matching auto-start setting is on (focus → break uses auto-start breaks).
  const handleManualSkip = async () => {
    const live = useFrogodoroStore.getState();
    const liveElapsed = liveElapsedSeconds(live);
    const unsavedElapsed = Math.max(0, liveElapsed - live.phaseElapsed);
    if (selectedTaskId && unsavedElapsed > 0) {
      await saveSessionToDb(selectedTaskId, phase, unsavedElapsed);
      onMutateToday?.();
    }
    const autoStart = phase === 'focus' ? settings.autoStartBreaks : false;
    completePhase(autoStart, liveElapsed, false);
  };

  const handleTabSwitch = async (newPhase: PomodoroPhase) => {
    if (newPhase === phase || isRunning) return;
    // Only fold in the time not already counted for this phase. The phase's
    // countdown is preserved across tab switches, so adding the full
    // liveElapsed each time would inflate the stats on repeated switches.
    const live = useFrogodoroStore.getState();
    const unsavedElapsed = Math.max(
      0,
      liveElapsedSeconds(live) - live.phaseElapsed,
    );
    if (selectedTaskId && unsavedElapsed > 0) {
      const updated = { ...sessionStats };
      if (phase === 'focus') {
        updated.focusTime = sessionStats.focusTime + unsavedElapsed;
      } else {
        updated.breakTime = sessionStats.breakTime + unsavedElapsed;
      }
      updateSessionStats(updated);
      // Persist the leaving phase's not-yet-saved time so switching tabs (e.g.
      // after pausing partway) keeps the progress instead of dropping it.
      await saveSessionToDb(selectedTaskId, phase, unsavedElapsed);
      onMutateToday?.();
    }
    switchPhase(newPhase);
  };

  const persistTaskSettings = async (settingsToSave: typeof DEFAULT_SETTINGS) => {
    if (selectedTaskId) {
      onMutateToday?.();
      try {
        const { focusDuration, breakDuration } = settingsToSave;
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        await fetch(`/api/tasks/${selectedTaskId}/frogodoro`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            settings: { focusDuration, breakDuration },
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

  const formatDurationSetting = (minutes: number) => {
    if (minutes < 1) return `${Math.round(minutes * 60)}s`;
    return `${minutes}m`;
  };

  // Duration ladder (minutes): 10s → 1m → 5m → 10m … → 120m. 10 seconds is the
  // lowest rung (handy for quick tests, but available for normal use too).
  const TEN_SECONDS = 10 / 60;
  const DURATION_MAX = 120;
  const decreaseDuration = (v: number) => {
    if (v <= 1) return TEN_SECONDS; // 1m (or below) → 10s
    if (v === 5) return 1; // 5m → 1m
    return Math.max(1, v - 5);
  };
  const increaseDuration = (v: number) => {
    if (v < 1) return 1; // 10s → 1m
    if (v === 1) return 5; // 1m → 5m
    return Math.min(DURATION_MAX, v + 5);
  };

  const getDurationControl = () => {
    if (phase === 'focus') {
      return { key: 'focusDuration' as const, min: TEN_SECONDS, max: DURATION_MAX };
    }
    return { key: 'breakDuration' as const, min: TEN_SECONDS, max: DURATION_MAX };
  };

  const adjustCurrentDuration = (direction: -1 | 1) => {
    if (isRunning) return;

    const control = getDurationControl();
    const currentValue = settings[control.key];
    const nextValue =
      direction === -1 ? decreaseDuration(currentValue) : increaseDuration(currentValue);

    if (nextValue === currentValue) return;

    const nextSettings = { ...settings, [control.key]: nextValue };
    setLocalSettings(nextSettings);
    setSettings(nextSettings);
    void persistTaskSettings(nextSettings);
  };

  // While awaiting Done the phase has already advanced to the next one, but the
  // popup should still wear the just-finished phase's identity (its colour and
  // the time that elapsed), so use the completed phase for display.
  const displayPhase =
    awaitingDone && lastCompletedPhase ? lastCompletedPhase : phase;

  const getPhaseColor = () =>
    displayPhase === 'focus'
      ? 'bg-primary text-primary-foreground dark:bg-green-700 dark:text-white'
      : 'bg-sky-500 text-white dark:bg-sky-700';

  const getPhaseAccent = () =>
    displayPhase === 'focus'
      ? 'text-primary dark:text-green-700'
      : 'text-sky-500 dark:text-sky-700';

  // The actual time spent in whichever phase just finished — shown frozen in
  // the Done state (so a fast-forwarded phase shows real elapsed, not the set
  // duration), instead of the next phase's countdown.
  const completedDuration =
    displayPhase === 'focus' ? lastFocusElapsed : lastBreakElapsed;

  // With auto-start breaks, focus → break ran as one continuous session, so the
  // Done screen summarises both halves: split green (focus) / blue (break),
  // each with its actual elapsed time.
  const splitDone = awaitingDone && settings.autoStartBreaks;
  const focusSeconds = lastFocusElapsed;
  const breakSeconds = lastBreakElapsed;

  const celebrateFocus = awaitingDone && displayPhase === 'focus' && !splitDone;
  const deepFocusBonusEarned =
    celebrateFocus && deepFocus && !lastPhasePaused && lastFocusElapsed >= 15 * 60;

  // Focused seconds this session (same store-derived formula the home hero
  // uses, so every surface shows the same swarm/caught count). 1 fly per 5
  // focused minutes — drives the live catch animation and the caught chip.
  // Number-returning selectors: the parent only re-renders when a count
  // actually changes (every 5 focused minutes), not on every tick.
  const fliesCaught = useFrogodoroStore((s) =>
    fliesCaughtFor(sessionFocusLiveSeconds(s)),
  );
  // What this session can reach if it runs to the end — the visible goal.
  const fliesPotential = useFrogodoroStore((s) =>
    fliesCaughtFor(
      sessionFocusLiveSeconds(s) +
        (s.phase === 'focus' ? Math.max(0, s.timeLeft) : 0),
    ),
  );

  if (!mounted) return null;

  const sheetPortal = createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
            className="fixed inset-0 z-[999] bg-black/85 backdrop-blur-sm"
          />

          <div className="fixed inset-0 z-[1000] flex items-end justify-center pointer-events-none px-3 pb-4 sm:items-center sm:p-6">
            <motion.div
              initial={isDesktop ? { opacity: 0, scale: 0.98 } : { y: '100%', opacity: 0 }}
              animate={isDesktop ? { opacity: 1, scale: 1 } : { y: 0, opacity: 1 }}
              exit={isDesktop ? { opacity: 0, scale: 0.98 } : { y: '100%', opacity: 0 }}
              transition={
                isDesktop
                  ? { type: 'tween', ease: [0.25, 0.1, 0.25, 1], duration: 0.2 }
                  : { type: 'tween', ease: [0.32, 0.72, 0, 1], duration: 0.4 }
              }
              onAnimationComplete={() => {
                if (open) setSheetEntered(true);
              }}
              drag={!isDesktop ? 'y' : false}
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              dragMomentum={false}
              onDragEnd={(_e, { offset, velocity }) => {
                if (offset.y + velocity.y * 0.15 > 130 || velocity.y > 800) {
                  onOpenChange(false);
                }
              }}
              className="pointer-events-auto w-full max-w-[500px] pb-[env(safe-area-inset-bottom)] will-change-transform"
            >
              <div className="relative rounded-[28px] bg-popover/95 backdrop-blur-2xl shadow-[0_24px_48px_rgba(15,23,42,0.25)] overflow-hidden">
                {/* Drag handle – mobile only. Overlaid so the timer view's
                    colour reaches the rounded top edge (no white strip). */}
                {!isDesktop && (
                  <div
                    className="absolute inset-x-0 top-0 z-20 flex h-7 items-center justify-center touch-none cursor-grab active:cursor-grabbing"
                    onPointerDown={(e) => dragControls.start(e)}
                  >
                    <div className="h-1.5 w-12 rounded-full bg-white/60" />
                  </div>
                )}

                {/* Help Sub-View */}
                <AnimatePresence mode="wait">
                  {showPond ? (
                    <motion.div
                      key="pond"
                      initial={{ opacity: 0, x: 40 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 40 }}
                      transition={{ duration: 0.2 }}
                      className="p-5"
                    >
                      <div className="mb-5 flex items-center justify-between">
                        <h3 className="text-lg font-black text-foreground">Fly catches</h3>
                        <button
                          onClick={() => setShowPond(false)}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/60 text-muted-foreground transition-colors hover:bg-muted"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      {(() => {
                        const days = pondData?.days ?? [];
                        const fliesOf = (focusTime: number) =>
                          Math.min(12, Math.floor(focusTime / 300));
                        const weekFlies = days.reduce(
                          (sum, d) => sum + fliesOf(d.focusTime),
                          0,
                        );
                        const weekMinutes = Math.round(
                          days.reduce((sum, d) => sum + d.focusTime, 0) / 60,
                        );
                        const dayLetter = (date: string) =>
                          ['S', 'M', 'T', 'W', 'T', 'F', 'S'][
                            new Date(`${date}T00:00:00`).getDay()
                          ];
                        return (
                          <>
                            <p className="mb-3 text-sm text-muted-foreground">
                              Your frog catches a fly for every{' '}
                              <span className="font-bold text-foreground">5 focused minutes</span>.
                            </p>
                            <div className="rounded-2xl border border-border/50 bg-primary/5 px-3 pb-3 pt-4">
                              <div className="flex items-end justify-between gap-1">
                                {days.map((d) => {
                                  const flies = fliesOf(d.focusTime);
                                  const mins = Math.round(d.focusTime / 60);
                                  const isToday = d.date === pondData?.today;
                                  return (
                                    <div
                                      key={d.date}
                                      className="flex flex-1 flex-col items-center gap-1.5"
                                      title={`${mins} min focused`}
                                    >
                                      <div className="flex h-12 flex-col items-center justify-end gap-0.5">
                                        {flies > 0 ? (
                                          <>
                                            <Fly size={22} interactive={false} alwaysPlay paused />
                                            <span className="text-[11px] font-black tabular-nums text-primary">
                                              ×{flies}
                                            </span>
                                          </>
                                        ) : (
                                          <span className="mb-1 h-2.5 w-2.5 rounded-full bg-muted-foreground/15" />
                                        )}
                                      </div>
                                      <span
                                        className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                                          isToday
                                            ? 'bg-primary text-white'
                                            : 'text-muted-foreground/70'
                                        }`}
                                      >
                                        {dayLetter(d.date)}
                                      </span>
                                    </div>
                                  );
                                })}
                                {days.length === 0 && (
                                  <p className="w-full py-4 text-center text-sm text-muted-foreground">
                                    Loading your week…
                                  </p>
                                )}
                              </div>
                            </div>

                            {weekFlies > 0 ? (
                              <div className="mt-3 flex gap-2">
                                <div className="flex-1 rounded-2xl bg-primary/8 px-3 py-2.5 text-center dark:bg-primary/15">
                                  <p className="flex items-center justify-center gap-1.5 text-lg font-black tabular-nums text-foreground">
                                    <Fly size={22} interactive={false} alwaysPlay paused />
                                    {weekFlies}
                                  </p>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-primary/70">
                                    Flies this week
                                  </p>
                                </div>
                                <div className="flex-1 rounded-2xl bg-primary/8 px-3 py-2.5 text-center dark:bg-primary/15">
                                  <p className="text-lg font-black tabular-nums text-foreground">
                                    {weekMinutes}m
                                  </p>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-primary/70">
                                    Focused
                                  </p>
                                </div>
                              </div>
                            ) : (
                              days.length > 0 && (
                                <p className="mt-3 text-center text-sm text-muted-foreground">
                                  No catches yet this week — start a focus and let
                                  your frog hunt.
                                </p>
                              )
                            )}
                          </>
                        );
                      })()}

                      <button
                        onClick={() => setShowPond(false)}
                        className="mt-4 w-full rounded-2xl bg-primary py-3 text-sm font-black text-primary-foreground shadow-md shadow-primary/20 transition-all active:scale-[0.98]"
                      >
                        Back to timer
                      </button>
                    </motion.div>
                  ) : showHelp ? (
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
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          Switch between <span className="font-bold text-primary">Focus</span> and <span className="font-bold text-sky-500">Break</span> as you go. We just count the total seconds you spend in each — no session limits, no rules.
                        </p>
                        <div className="overflow-hidden border rounded-2xl border-border/50 bg-muted/10">
                          <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 border-b border-border/30">
                            <div className="w-2.5 h-2.5 rounded-full bg-primary shrink-0" />
                            <p className="flex-1 text-sm font-semibold text-foreground">Focus</p>
                            <span className="text-xs font-black text-primary tabular-nums">{formatDurationSetting(settings.focusDuration)}</span>
                          </div>
                          <div className="flex items-center gap-3 px-4 py-2.5 bg-sky-500/5">
                            <div className="w-2.5 h-2.5 rounded-full bg-sky-400 shrink-0" />
                            <p className="flex-1 text-sm font-semibold text-foreground">Break</p>
                            <span className="text-xs font-black text-sky-500 tabular-nums">{formatDurationSetting(settings.breakDuration)}</span>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          Every focused minute also counts toward your{' '}
                          <span className="font-bold text-foreground">quests</span>.
                        </p>
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
                      className="flex max-h-[calc(100dvh-2rem-env(safe-area-inset-bottom))] flex-col overflow-hidden"
                    >
                      <div className="flex shrink-0 items-center justify-between px-5 pb-4 pt-5">
                        <h3 className="text-lg font-bold text-foreground">Settings</h3>
                        <button
                          onClick={() => setShowSettings(false)}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div
                        ref={overscroll.bind}
                        className="no-scrollbar min-h-0 flex-1 space-y-7 overflow-y-auto overscroll-none px-5 pb-5"
                      >
                        {/* Durations — locked while a session is active, since
                            you can't change a running/paused timer's length. */}
                        <section className="space-y-2.5">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Durations</p>
                            {timerActive && (
                              <span className="flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                                <Lock className="h-3 w-3" />
                                Durations locked during a session
                              </span>
                            )}
                          </div>
                          <div className={`divide-y divide-border/60 rounded-2xl border border-border/60 ${timerActive ? 'opacity-50' : ''}`}>
                            {/* Focus */}
                            <div className="flex items-center justify-between px-4 py-3.5">
                              <div className="flex items-center gap-2.5">
                                <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                                <span className="text-sm font-medium text-foreground">Focus</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  aria-label="Decrease focus"
                                  disabled={timerActive}
                                  onClick={() => setLocalSettings({ ...localSettings, focusDuration: decreaseDuration(localSettings.focusDuration) })}
                                  className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/70 active:scale-90 disabled:cursor-not-allowed disabled:hover:bg-muted disabled:active:scale-100"
                                >
                                  −
                                </button>
                                <span className="w-12 text-center text-sm font-semibold text-foreground tabular-nums">{formatDurationSetting(localSettings.focusDuration)}</span>
                                <button
                                  type="button"
                                  aria-label="Increase focus"
                                  disabled={timerActive}
                                  onClick={() => setLocalSettings({ ...localSettings, focusDuration: increaseDuration(localSettings.focusDuration) })}
                                  className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary/15 active:scale-90 disabled:cursor-not-allowed disabled:hover:bg-primary/10 disabled:active:scale-100"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                            {/* Break */}
                            <div className="flex items-center justify-between px-4 py-3.5">
                              <div className="flex items-center gap-2.5">
                                <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
                                <span className="text-sm font-medium text-foreground">Break</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  aria-label="Decrease break"
                                  disabled={timerActive}
                                  onClick={() => setLocalSettings({ ...localSettings, breakDuration: decreaseDuration(localSettings.breakDuration) })}
                                  className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/70 active:scale-90 disabled:cursor-not-allowed disabled:hover:bg-muted disabled:active:scale-100"
                                >
                                  −
                                </button>
                                <span className="w-12 text-center text-sm font-semibold text-foreground tabular-nums">{formatDurationSetting(localSettings.breakDuration)}</span>
                                <button
                                  type="button"
                                  aria-label="Increase break"
                                  disabled={timerActive}
                                  onClick={() => setLocalSettings({ ...localSettings, breakDuration: increaseDuration(localSettings.breakDuration) })}
                                  className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-500/10 text-sky-500 transition-colors hover:bg-sky-500/15 active:scale-90 disabled:cursor-not-allowed disabled:hover:bg-sky-500/10 disabled:active:scale-100"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>
                        </section>

                        {/* Behavior */}
                        <section className="space-y-2.5">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Behavior</p>
                          <div className="divide-y divide-border/60 rounded-2xl border border-border/60">
                            <button
                              type="button"
                              onClick={() => setLocalSettings({ ...localSettings, autoStartBreaks: !localSettings.autoStartBreaks })}
                              className="flex w-full items-center justify-between px-4 py-3.5 text-left transition-colors hover:bg-muted/30"
                            >
                              <div>
                                <p className="text-sm font-medium text-foreground">Auto-start breaks</p>
                                <p className="text-xs text-muted-foreground">Breaks begin automatically</p>
                              </div>
                              <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${localSettings.autoStartBreaks ? 'bg-primary' : 'bg-muted-foreground/25'}`}>
                                <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${localSettings.autoStartBreaks ? 'translate-x-5' : 'translate-x-0'}`} />
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeepFocus(!deepFocus)}
                              className="flex w-full items-center justify-between px-4 py-3.5 text-left transition-colors hover:bg-muted/30"
                            >
                              <div>
                                <p className="flex items-center gap-1 text-sm font-medium text-foreground">
                                  <Zap className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                                  Deep focus
                                </p>
                                <p className="text-xs text-muted-foreground">Finish a 15m+ focus without pausing → +1 fly</p>
                              </div>
                              <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${deepFocus ? 'bg-primary' : 'bg-muted-foreground/25'}`}>
                                <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${deepFocus ? 'translate-x-5' : 'translate-x-0'}`} />
                              </span>
                            </button>
                          </div>
                        </section>

                        {/* Sound */}
                        <section className="space-y-2.5">
                          <div className="flex items-baseline justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Finish sound</p>
                            <p className="text-xs text-muted-foreground/70">Tap to preview</p>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {TIMER_SOUNDS.map(({ id, label }) => {
                              const isSelected = normalizeTimerSound(localSettings.timerSound) === id;
                              const isPreviewing = previewingId === id;
                              return (
                                <button
                                  key={id}
                                  type="button"
                                  onClick={() => handleSoundSelect(id)}
                                  className={`relative flex h-11 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors ${
                                    isSelected
                                      ? 'border-primary bg-primary/10 text-primary'
                                      : 'border-border/60 text-muted-foreground hover:bg-muted/30'
                                  }`}
                                >
                                  {isPreviewing && (
                                    <Volume2 className="h-3.5 w-3.5 shrink-0 animate-pulse" />
                                  )}
                                  <span className="truncate">{label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </section>
                      </div>

                      <div className="shrink-0 border-t border-border/60 bg-popover/95 p-5 backdrop-blur-2xl">
                        <button
                          onClick={saveSettings}
                          className="w-full rounded-2xl bg-primary py-3.5 text-base font-bold text-primary-foreground transition-colors hover:bg-primary/90 active:scale-[0.99]"
                        >
                          Save
                        </button>
                      </div>
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
                      <div className={`relative overflow-hidden ${splitDone ? 'bg-sky-500 text-white dark:bg-sky-700' : getPhaseColor()}`}>
                        {splitDone ? (
                          /* Split background: green (focus) | blue (break) */
                          <div aria-hidden className="absolute inset-y-0 left-0 z-0 w-1/2 bg-primary dark:bg-green-700" />
                        ) : (
                          /* Elapsed fill — grows bottom→top as the phase passes */
                          <PhaseProgressFill animate={isRunning} />
                        )}

                        <div className="relative z-10 px-4 pt-11 pb-4">
                        {/* Help + Settings + Close — top-right, with gaps. The
                            settings gear lives here so it's always reachable,
                            even mid-session. */}
                        {/* Session catch goal: caught / possible for this
                            session length, plus the live deep-focus bonus —
                            visible while the pledge holds, gone if it breaks.
                            Pulses when a snatched fly lands; +1 floats up. */}
                        {timerActive &&
                          !awaitingDone &&
                          phase === 'focus' &&
                          fliesPotential > 0 && (
                            <div className="absolute top-3 left-3 z-10">
                              <motion.div
                                ref={catchChipRef}
                                key={chipPulse}
                                initial={chipPulse > 0 ? { scale: 1.35 } : false}
                                animate={{ scale: 1 }}
                                transition={{ type: 'spring', stiffness: 420, damping: 16 }}
                                className="flex items-center gap-1 rounded-full bg-black/25 py-1 pl-1.5 pr-2.5 shadow-inner"
                              >
                                <Fly size={24} interactive={false} alwaysPlay paused />
                                <span className="text-[13px] font-black tabular-nums text-white">
                                  {fliesCaught}/{fliesPotential}
                                </span>
                                <AnimatePresence>
                                  {pledgeLive && (
                                    <motion.span
                                      initial={{ opacity: 0, width: 0 }}
                                      animate={{ opacity: 1, width: 'auto' }}
                                      exit={{ opacity: 0, width: 0 }}
                                      className="flex items-center gap-0.5 overflow-hidden text-[12px] font-black text-amber-300"
                                    >
                                      <Zap className="h-3 w-3 fill-current" />
                                      +1
                                    </motion.span>
                                  )}
                                </AnimatePresence>
                              </motion.div>
                              {/* +1 slips out from under the chip — same
                                  gesture as the home currency pill's gain. */}
                              <AnimatePresence>
                                {chipPulse > 0 && (
                                  <motion.span
                                    key={`gain-${chipPulse}`}
                                    initial={{ opacity: 0, y: -14 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -6 }}
                                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                                    onAnimationComplete={() => {
                                      window.setTimeout(
                                        () => setChipPulse((p) => (p > 0 ? 0 : p)),
                                        1400,
                                      );
                                    }}
                                    className="pointer-events-none absolute left-1/2 top-full z-[-1] mt-1.5 flex -translate-x-1/2 items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-xs font-black text-primary shadow"
                                  >
                                    <Fly size={16} interactive={false} paused />
                                    +1
                                  </motion.span>
                                )}
                              </AnimatePresence>
                            </div>
                          )}

                        <div className="absolute top-3 right-3 z-10 flex items-center gap-2.5">
                          <button
                            onClick={() => setShowPond(true)}
                            aria-label="Fly catches this week"
                            className="flex items-center justify-center w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 transition-colors text-white"
                          >
                            <Fly size={26} interactive={false} alwaysPlay paused />
                          </button>
                          <button
                            onClick={() => setShowHelp(true)}
                            aria-label="How it works"
                            className="flex items-center justify-center w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 transition-colors text-white text-sm font-black leading-none"
                          >
                            ?
                          </button>
                          {!awaitingDone && (
                            <button
                              onClick={() => setShowSettings(true)}
                              aria-label="Settings"
                              className="flex items-center justify-center w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 transition-colors text-white"
                            >
                              <Settings2 className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => onOpenChange(false)}
                            aria-label="Close"
                            className="flex items-center justify-center w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 transition-colors text-white"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Task name (centered) */}
                        {task && (
                          <div className="mb-3 px-10 text-center">
                            <p className="break-words text-lg font-black leading-tight text-white">
                              {task.text}
                            </p>
                          </div>
                        )}

                        {/* Session intent — which area quests this focus session
                            advances (task tags vs area focus tags), shown before
                            START so picking an area is a conscious choice. */}
                        {task &&
                          sessionAreas &&
                          !timerActive &&
                          !awaitingDone &&
                          phase === 'focus' && (
                            <div className="-mt-1 mb-3 flex justify-center px-6">
                              {sessionAreas.matchedNames.length > 0 ? (
                                <span className="flex max-w-full items-center gap-1.5 rounded-full bg-black/25 px-3 py-1 text-[11px] font-bold text-white shadow-inner">
                                  <Scroll className="h-3.5 w-3.5 shrink-0 opacity-90" />
                                  <span className="truncate">
                                    Counts toward{' '}
                                    {sessionAreas.matchedNames.join(' · ')}
                                  </span>
                                </span>
                              ) : (
                                <span className="flex max-w-full items-center gap-1.5 rounded-full bg-black/15 px-3 py-1 text-[11px] font-bold text-white/70">
                                  <Scroll className="h-3.5 w-3.5 shrink-0 opacity-70" />
                                  <span className="truncate">
                                    Not linked to an area quest — tag this task to
                                    link one
                                  </span>
                                </span>
                              )}
                            </div>
                          )}

                        {/* Mode row. Idle: switchable Focus/Break tabs (pick what
                            to start). Mid-session: locked label of the current
                            mode. Finished: "time's up". */}
                        {awaitingDone ? (
                          <div className="mb-4 text-center">
                            <p className="text-sm font-black uppercase tracking-widest text-white/90">Time&apos;s up!</p>
                          </div>
                        ) : timerActive ? (
                          <div className="mb-4 flex items-center justify-center">
                            <span className="rounded-full bg-black/25 px-3 py-1.5 text-xs font-bold text-white shadow-inner">
                              {phase === 'focus' ? 'Focus' : 'Break'}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1 mb-4">
                            {[
                              { id: 'focus', label: 'Focus' },
                              { id: 'break', label: 'Break' },
                            ].map((p) => (
                              <button
                                key={p.id}
                                onClick={() => handleTabSwitch(p.id as PomodoroPhase)}
                                className={`px-3 py-1.5 text-xs font-bold rounded-full transition-all ${
                                  phase === p.id
                                    ? 'bg-black/25 text-white shadow-inner'
                                    : 'bg-transparent text-white/70 hover:bg-black/10'
                                }`}
                              >
                                {p.label}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Time Display — celebration payoff for a finished focus
                            session, split focus/break summary with auto-start
                            breaks, otherwise the single phase time/countdown. */}
                        {celebrateFocus ? (
                          <div className="mb-4">
                            <FocusCelebration
                              seconds={lastFocusElapsed}
                              bonusFly={deepFocusBonusEarned}
                              fliesCaught={Math.floor(lastFocusElapsed / 300)}
                              showFrog={false}
                            />
                          </div>
                        ) : splitDone ? (
                          <div className="mb-4 flex items-stretch">
                            <div className="flex-1 text-center">
                              <p className="text-[11px] font-black uppercase tracking-widest text-white/80">Focus</p>
                              <p className="text-[44px] font-black leading-none tracking-tighter text-white drop-shadow-lg tabular-nums">{formatTime(focusSeconds)}</p>
                            </div>
                            <div className="flex-1 text-center">
                              <p className="text-[11px] font-black uppercase tracking-widest text-white/80">Break</p>
                              <p className="text-[44px] font-black leading-none tracking-tighter text-white drop-shadow-lg tabular-nums">{formatTime(breakSeconds)}</p>
                            </div>
                          </div>
                        ) : (
                        <div className="mb-4 flex items-center justify-center gap-3">
                          {(() => {
                            const control = getDurationControl();
                            const duration = settings[control.key];
                            const canAdjust = !timerActive && !awaitingDone;
                            return (
                              <>
                                {canAdjust && (
                                  <button
                                    type="button"
                                    onClick={() => adjustCurrentDuration(-1)}
                                    disabled={duration <= control.min}
                                    aria-label="Decrease duration"
                                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20 text-white transition-all hover:bg-white/30 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                                  >
                                    <Minus className="h-4 w-4" />
                                  </button>
                                )}

                                <div className="min-w-[210px] text-center text-[72px] font-black leading-none tracking-tighter text-white drop-shadow-lg tabular-nums">
                                  <CountdownText
                                    frozen={awaitingDone ? completedDuration : null}
                                  />
                                </div>

                                {canAdjust && (
                                  <button
                                    type="button"
                                    onClick={() => adjustCurrentDuration(1)}
                                    disabled={duration >= control.max}
                                    aria-label="Increase duration"
                                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20 text-white transition-all hover:bg-white/30 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                                  >
                                    <Plus className="h-4 w-4" />
                                  </button>
                                )}
                              </>
                            );
                          })()}
                        </div>
                        )}

                        {/* The frog perches on the START/PAUSE button from the
                            moment the sheet opens; when a focus session starts
                            the flies slide in from the sides, the frog lunges
                            and misses, and truly catches one per 5 focused
                            minutes. */}
                        {!awaitingDone && (
                          <div className="relative z-30">
                            {sheetEntered ? (
                              <FocusScene
                                indices={frogIndices}
                                running={isRunning}
                                showFlies={timerActive && phase === 'focus'}
                                caught={fliesCaught}
                                focusSeconds={phaseDuration}
                                counterRef={catchChipRef}
                                onGainLand={() => setChipPulse((p) => p + 1)}
                                suspended={
                                  confirmStop || confirmPause || confirmTaskSwitch
                                }
                              />
                            ) : (
                              <div className="relative flex flex-col items-center">
                                <div
                                  className="pointer-events-none relative z-30"
                                  style={{
                                    marginTop: -Math.round(144 * 0.42),
                                    marginBottom: -6,
                                  }}
                                >
                                  <FrogSnapshot
                                    indices={frogIndices}
                                    width={144}
                                    height={162}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Controls — when the session is over, the only action
                            is Done (which silences the alarm and closes). */}
                        {awaitingDone ? (
                          <div className="mt-20 flex items-end justify-center gap-2.5">
                            {celebrateFocus && (
                              <button
                                onClick={handleKeepGoing}
                                className="relative flex items-center justify-center rounded-2xl bg-white/20 px-4 py-3 text-[13px] font-black uppercase tracking-widest text-white shadow-[0_6px_0_rgba(0,0,0,0.15)] transition-all hover:bg-white/30 active:translate-y-1.5 active:shadow-[0_0_0_rgba(0,0,0,0.15)]"
                              >
                                <Zap className="mr-1 h-4 w-4 fill-current" />
                                +5 MORE
                              </button>
                            )}
                            <div className="relative">
                              {/* Same perch as the START screen: the frog sits on
                                  the DONE button instead of floating mid-card. */}
                              <div
                                className="pointer-events-none absolute left-1/2 z-30 -translate-x-1/2"
                                style={{ bottom: 'calc(100% - 8px)' }}
                              >
                                {sheetEntered ? (
                                  <Frog
                                    width={144}
                                    height={162}
                                    indices={frogIndices}
                                  />
                                ) : (
                                  <FrogSnapshot
                                    indices={frogIndices}
                                    width={144}
                                    height={162}
                                  />
                                )}
                              </div>
                              <button
                                onClick={handleDone}
                                className={`relative flex items-center justify-center px-10 py-3 bg-white dark:bg-slate-50 text-[16px]
                                  font-black uppercase tracking-widest rounded-2xl shadow-[0_6px_0_rgba(0,0,0,0.15)]
                                  active:shadow-[0_0_0_rgba(0,0,0,0.15)] active:translate-y-1.5 transition-all ${getPhaseAccent()}`}
                              >
                                <Check className="w-5 h-5 mr-1.5" />
                                DONE
                              </button>
                            </div>
                          </div>
                        ) : (
                        <div className="relative z-10 flex items-center justify-center gap-3">
                          {/* Left: Stop ends the active session. Idle → spacer so
                              START stays centred. */}
                          {timerActive ? (
                            <button
                              onClick={handleStopTimer}
                              aria-label="Stop session"
                              className="p-2.5 bg-white/20 hover:bg-white/30 rounded-xl active:scale-95 text-white transition-all"
                            >
                              <Square className="w-5 h-5 fill-current opacity-90" />
                            </button>
                          ) : (
                            <div className="w-10 shrink-0" aria-hidden />
                          )}

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
                            {isRunning ? 'PAUSE' : timerActive ? 'RESUME' : 'START'}
                          </button>

                          {/* Right: Skip (fast-forward) only while running. */}
                          {isRunning ? (
                            <button
                              onClick={handleManualSkip}
                              aria-label="Skip"
                              className="p-2.5 bg-white/20 hover:bg-white/30 rounded-xl active:scale-95 text-white transition-all"
                            >
                              <SkipForward className="w-5 h-5 fill-current opacity-90" />
                            </button>
                          ) : (
                            <div className="w-10 shrink-0" aria-hidden />
                          )}
                        </div>
                        )}

                        {/* Deep-focus pledge — finish without pausing → bonus
                            fly. Collapses smoothly on start instead of
                            snapping the layout. */}
                        <AnimatePresence initial={false}>
                          {!awaitingDone && !timerActive && phase === 'focus' && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
                              className="overflow-hidden"
                            >
                              <button
                                type="button"
                                onClick={() => setDeepFocus(!deepFocus)}
                                className={`mx-auto mt-3 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors active:scale-95 ${
                                  deepFocus
                                    ? 'bg-white text-primary shadow'
                                    : 'bg-white/15 text-white/90 hover:bg-white/25'
                                }`}
                              >
                                <Zap className={`h-3.5 w-3.5 ${deepFocus ? 'fill-current' : ''}`} />
                                Deep focus · finish without pausing for +1 fly
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* Enable-notifications hint — so timer-complete alerts can land */}
                        {canEnableNotifs && (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleEnableNotifs()}
                              className="mx-auto mt-3 flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold text-white/90 transition-colors hover:bg-white/25 active:scale-95"
                            >
                              <Bell className="h-3.5 w-3.5" />
                              Enable notifications to get timer alerts
                            </button>
                            {notifHint && (
                              <p className="mx-auto mt-2 max-w-[300px] text-center text-[11px] font-bold text-white/80">
                                {notifHint}
                              </p>
                            )}
                          </>
                        )}
                        </div>
                      </div>

                      {/* Stats Row */}
                      {hasStats && (
                        <SessionStatsRow dbSession={task?.frogodoroSession} />
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Gentle early-stop confirm — the frog would rather you keep
                    going, but ending still keeps every earned minute. */}
                {createPortal(
                <AnimatePresence>
                  {confirmStop && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
                    >
                      <motion.div
                        initial={{ scale: 0.94, y: 8 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.94, y: 8 }}
                        className="relative w-full max-w-[300px] rounded-3xl bg-popover p-5 text-center shadow-2xl"
                      >
                        <div className="mx-auto -mt-1 flex justify-center">
                          <FrogSnapshot
                            indices={{ ...frogIndices, mood: 1 }}
                            width={72}
                            height={76}
                            visualOffsetY={4}
                          />
                        </div>
                        <p className="mt-1 text-base font-black text-foreground">
                          End focus early?
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {`Your ${focusedMinutes} focused ${
                            focusedMinutes === 1 ? 'minute' : 'minutes'
                          } still count — but you're on a roll.`}
                          {pledgeLive && (
                            <span className="mt-1 flex items-center justify-center gap-1 font-bold text-amber-600 dark:text-amber-400">
                              <Zap className="h-3.5 w-3.5 fill-current" />
                              Deep focus +1 fly will be lost
                            </span>
                          )}
                        </p>
                        <button
                          onClick={() => setConfirmStop(false)}
                          className="mt-4 w-full rounded-2xl bg-primary py-3 text-sm font-black uppercase tracking-widest text-primary-foreground shadow-md shadow-primary/20 transition-all active:scale-[0.98]"
                        >
                          Keep going
                        </button>
                        <button
                          onClick={() => void performStop()}
                          className="mt-2 w-full rounded-2xl py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted/40"
                        >
                          End session
                        </button>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>,
                  document.body,
                )}

                {/* Deep-focus pause warning — pausing forfeits the +1 fly */}
                {createPortal(
                <AnimatePresence>
                  {confirmPause && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
                    >
                      <motion.div
                        initial={{ scale: 0.94, y: 8 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.94, y: 8 }}
                        className="relative w-full max-w-[300px] rounded-3xl bg-popover p-5 text-center shadow-2xl"
                      >
                        <div className="mx-auto -mt-1 flex justify-center">
                          <FrogSnapshot
                            indices={{ ...frogIndices, mood: 1 }}
                            width={72}
                            height={76}
                            visualOffsetY={4}
                          />
                        </div>
                        <p className="mt-1 text-base font-black text-foreground">
                          Break deep focus?
                        </p>
                        <p className="mt-1 flex items-center justify-center gap-1 text-sm font-bold text-amber-600 dark:text-amber-400">
                          <Zap className="h-3.5 w-3.5 fill-current" />
                          Pausing loses the +1 bonus fly
                        </p>
                        <button
                          onClick={() => setConfirmPause(false)}
                          className="mt-4 w-full rounded-2xl bg-primary py-3 text-sm font-black uppercase tracking-widest text-primary-foreground shadow-md shadow-primary/20 transition-all active:scale-[0.98]"
                        >
                          Keep going
                        </button>
                        <button
                          onClick={() => {
                            setConfirmPause(false);
                            pauseTimer();
                          }}
                          className="mt-2 w-full rounded-2xl py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted/40"
                        >
                          Pause anyway
                        </button>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>,
                  document.body,
                )}

                {/* Another task's timer is mid-session — starting here would
                    end it, so confirm before switching. */}
                {createPortal(
                <AnimatePresence>
                  {confirmTaskSwitch && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
                    >
                      <motion.div
                        initial={{ scale: 0.94, y: 8 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.94, y: 8 }}
                        className="relative w-full max-w-[300px] rounded-3xl bg-popover p-5 text-center shadow-2xl"
                      >
                        <div className="mx-auto -mt-1 flex justify-center">
                          <FrogSnapshot
                            indices={{ ...frogIndices, mood: 1 }}
                            width={72}
                            height={76}
                            visualOffsetY={4}
                          />
                        </div>
                        <p className="mt-1 text-base font-black text-foreground">
                          Timer already running
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {selectedTaskName
                            ? `Your frog is mid-session on "${selectedTaskName}".`
                            : 'Your frog is mid-session on another task.'}{' '}
                          Switching starts fresh here — the focused minutes so
                          far stay saved.
                        </p>
                        <button
                          onClick={() => {
                            setConfirmTaskSwitch(false);
                            onOpenChange(false);
                          }}
                          className="mt-4 w-full rounded-2xl bg-primary py-3 text-sm font-black uppercase tracking-widest text-primary-foreground shadow-md shadow-primary/20 transition-all active:scale-[0.98]"
                        >
                          Keep current timer
                        </button>
                        <button
                          onClick={() => void performTaskSwitch()}
                          className="mt-2 w-full rounded-2xl py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted/40"
                        >
                          Switch to this task
                        </button>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>,
                  document.body,
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );

  return (
    <>
      {sheetPortal}
      <FrogodoroIntroSheet
        open={introOpen}
        onClose={() => setIntroOpen(false)}
        focusMinutes={settings.focusDuration}
        breakMinutes={settings.breakDuration}
      />
    </>
  );
}
