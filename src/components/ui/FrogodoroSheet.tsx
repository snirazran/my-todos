'use client';

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import {
  Play,
  Pause,
  SkipForward,
  X,
  Square,
  Check,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence, useDragControls, PresenceContext } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import {
  useFrogodoroStore,
  PomodoroPhase,
  DEFAULT_SETTINGS,
  FOCUS_PRESETS,
  announceSessionEnded,
  endedSessionDetail,
  isFocusWrapUp,
} from '@/lib/frogodoroStore';
import { DurationDial } from '@/components/ui/DurationDial';
import {
  isContainerTaskId,
  subjectHeadline,
  subjectKindOf,
  type FocusSubjectKind,
} from '@/lib/focusSubject';
import { useSheetOverscrollDrag } from '@/components/ui/useSheetOverscrollDrag';
import { useRegisterOpenSheet, useSheetStore } from '@/lib/sheetStore';
import { SheetEnteredContext, useEntrance } from '@/lib/sheetEntered';
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
import { hapticImpact, hapticTick } from '@/lib/haptics';
import { Bell, Volume2, VolumeX, Zap } from 'lucide-react';
import { useIntros } from '@/hooks/useIntros';
import { FocusScene } from '@/components/ui/FocusScene';
import { FocusSubjectPanel } from '@/components/ui/FocusSubjectPicker';
import {
  focusPhaseCatches,
  focusPhaseMarks,
  fliesCaughtFor,
  deepFocusPledgeLive,
  priorDayFocusSeconds,
  focusFliesEarnedForDay,
  FOCUS_FLY_RATE_SECONDS,
  FOCUS_FIRST_FLY_SECONDS,
  FOCUS_FLY_DAILY_CAP,
  DEEP_FOCUS_BONUS_FLIES,
  DEEP_FOCUS_MIN_SECONDS,
} from '@/lib/focusFlies';
import { PondBackdrop } from '@/components/ui/PondBackdrop';
import { FlyIcon, FlyPriceChip } from '@/components/ui/FlyAmount';
import { useInventory, mutateInventoryCaches } from '@/hooks/useInventory';
import { markFlyEarn } from '@/lib/flyEarn';
import type { FocusFlyDaily } from '@/lib/types/UserDoc';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { requestFrogStamp } from '@/lib/frogStampEngine';
import Fly from '@/components/ui/fly';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import useSWR from 'swr';


// Short enough to feel like a direct response to the tap, eased so it settles
// rather than stopping dead. Shared by both halves of the stage swap so they
// cross exactly.
const STAGE_TRANSITION = {
  duration: 0.24,
  ease: [0.32, 0.72, 0, 1] as const,
};

// Today's catches against the daily cap. A ring reads its remaining distance
// without a legend, which the old row of identical dots could not.
function CapRing({ caught, cap }: Readonly<{ caught: number; cap: number }>) {
  const size = 64;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = cap > 0 ? Math.min(1, caught / cap) : 0;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
          className="stroke-primary transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[15px] font-black tabular-nums text-foreground">
        {caught}/{cap}
      </span>
    </div>
  );
}

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
  subjectKind?: FocusSubjectKind;
}

function getTaskDisplayName(task: Pick<Task, 'id' | 'text'>) {
  return isContainerTaskId(task.id)
    ? task.text.replace(/^Focus:\s*/i, '')
    : task.text;
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

// A miss this close to the next real catch would hold the tongue when the
// catch fires — the grab falls back to a bare "+1" with no lunge. Covers the
// full tongue (offset + duration + the hook's cooldown) with room to spare.
const MISS_CLEARANCE_SECONDS = 8;

function phaseCatchesOf(s: TickState, focusFlyDaily?: FocusFlyDaily) {
  const sessionFocus = sessionFocusLiveSeconds(s);
  return focusPhaseCatches({
    sessionFocusSeconds: sessionFocus,
    phaseElapsedSeconds: liveElapsedSeconds(s),
    phaseFullSeconds: phaseDurationSeconds(s),
    priorFocusSeconds: priorDayFocusSeconds(focusFlyDaily, sessionFocus),
    onFocusPhase: s.phase === 'focus',
  });
}

// What the session is worth priced at the time ACTUALLY focused — 20 minutes
// is still one fly. Ending a session early re-prices it to this, so a fly the
// price covers but the phase's marks never reached gets caught on the way out
// instead of turning up in the wallet unseen.
function settledCatchesOf(s: TickState, focusFlyDaily?: FocusFlyDaily) {
  const sessionFocus = sessionFocusLiveSeconds(s);
  return fliesCaughtFor(
    sessionFocus,
    priorDayFocusSeconds(focusFlyDaily, sessionFocus),
  );
}

// Tongue offset + flight: long enough for the frog to land the grab before the
// session tears down. The "+1" arc finishes after, over the now-idle card.
const SETTLE_CATCH_MS = 1150;

const WRAP_UP_HANDOFF_MS = 600;

const FIRST_SESSION_MINUTES = 5;
const SCENE_FROG_WIDTH = 208;

const CTA_BASE =
  'relative flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl text-[17px] font-black transition-[transform,box-shadow,background-color,opacity] duration-100 disabled:opacity-60';
const CTA_FOCUS =
  'bg-primary text-primary-foreground shadow-[0_5px_0_0_#2c511a] active:translate-y-[5px] active:shadow-none';
const CTA_BREAK =
  'bg-sky-500 text-white shadow-[0_5px_0_0_#0369a1] active:translate-y-[5px] active:shadow-none dark:bg-sky-600 dark:shadow-[0_5px_0_0_#075985]';
const CTA_QUIET =
  'border-2 border-border bg-card text-foreground shadow-[0_3px_0_0_hsl(var(--border))] active:translate-y-[3px] active:shadow-none';
const SCENE_BUTTON =
  'bg-card/95 text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.16)] ring-1 ring-black/5 transition-[transform,background-color] duration-150 ease-out hover:bg-card active:scale-95';

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

function PhaseTrack({
  animate,
  focusFlyDaily,
}: {
  animate: boolean;
  focusFlyDaily?: FocusFlyDaily;
}) {
  const { percent, marks, reached, onBreak } = useFrogodoroStore(
    useShallow((s) => {
      const duration = phaseDurationSeconds(s);
      const elapsed = Math.min(duration, Math.max(0, duration - s.timeLeft));
      const onFocus = s.phase === 'focus';
      const sessionFocus = sessionFocusLiveSeconds(s);
      const input = {
        sessionFocusSeconds: sessionFocus,
        phaseElapsedSeconds: liveElapsedSeconds(s),
        phaseFullSeconds: duration,
        priorFocusSeconds: priorDayFocusSeconds(focusFlyDaily, sessionFocus),
      };
      const phaseMarks = onFocus ? focusPhaseMarks(input) : [];
      const catches = onFocus
        ? focusPhaseCatches({ ...input, onFocusPhase: true })
        : null;
      return {
        percent: elapsed / duration,
        marks: phaseMarks.join(','),
        reached: catches
          ? catches.caught - (catches.potential - phaseMarks.length)
          : 0,
        onBreak: !onFocus,
      };
    }),
  );
  const markList = marks ? marks.split(',').map(Number) : [];
  return (
    <div className="relative mx-auto h-7 w-full max-w-[300px]" aria-hidden>
      <div className="absolute inset-x-3.5 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full origin-left rounded-full ${
            onBreak ? 'bg-sky-500' : 'bg-primary'
          } ${animate ? 'transition-transform duration-1000 ease-linear' : ''}`}
          style={{ transform: `scaleX(${percent})` }}
        />
      </div>
      {markList.map((mark, index) => {
        const done = index < reached;
        return (
          <span
            key={`${index}-${mark}`}
            className="absolute top-1/2 grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-popover"
            style={{ left: `calc(14px + (100% - 28px) * ${mark})` }}
          >
            <span
              className={`grid h-6 w-6 place-items-center rounded-full ring-1 transition-colors duration-300 ${
                done
                  ? 'bg-primary text-primary-foreground ring-primary'
                  : 'bg-primary/[0.16] ring-primary/25'
              }`}
            >
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                  key={done ? 'done' : 'todo'}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ type: 'spring', duration: 0.35, bounce: 0.3 }}
                  className="grid place-items-center"
                >
                  {done ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={3.5} />
                  ) : (
                    <Fly size={22} y={-2} interactive={false} paused />
                  )}
                </motion.span>
              </AnimatePresence>
            </span>
          </span>
        );
      })}
    </div>
  );
}

function NextFlyLine({
  focusFlyDaily,
}: {
  focusFlyDaily?: FocusFlyDaily;
}) {
  const info = useFrogodoroStore(
    useShallow((s) => {
      if (!s.timerActive) return { show: false, next: null as number | null, done: false, onBreak: false };
      if (s.phase !== 'focus') return { show: true, next: null as number | null, done: false, onBreak: true };
      const c = phaseCatchesOf(s, focusFlyDaily);
      return {
        show: c.potential > 0,
        next: c.nextCatchIn,
        done: c.nextCatchIn === null && c.caught >= c.potential,
        onBreak: false,
      };
    }),
  );
  if (!info.show) return null;
  return (
    <p className="flex h-5 items-center justify-center text-[13px] font-bold tabular-nums text-muted-foreground">
      {info.onBreak ? (
        'Break — your frog is resting'
      ) : info.done ? (
        'All flies caught — keep going'
      ) : info.next !== null ? (
        <>
          <FlyIcon textPx={13} />
          Next fly in {formatTime(Math.max(0, info.next))}
        </>
      ) : null}
    </p>
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
    <div className="flex h-9 items-center justify-center gap-2">
      {(focusTime > 0 || (isRunning && phase === 'focus')) && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-primary/8 dark:bg-primary/15">
          <div className={`w-1.5 h-1.5 rounded-full bg-primary ${isRunning && phase === 'focus' ? 'animate-pulse' : ''}`} />
          <span className="text-[12px] font-bold text-primary/60">Focus</span>
          <span className="text-[11px] font-black text-primary tabular-nums">{formatDuration(focusTime)}</span>
        </div>
      )}
      {(breakTime > 0 || (isRunning && phase === 'break')) && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-sky-500/8 dark:bg-sky-500/15">
          <div className={`w-1.5 h-1.5 rounded-full bg-sky-500 ${isRunning && phase === 'break' ? 'animate-pulse' : ''}`} />
          <span className="text-[12px] font-bold text-sky-500/60">Break</span>
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
  presetMinutes?: number | null;
  onMutateToday?: () => void;
  onSubjectChange?: (task: Task) => void;
}>;

export default function FrogodoroSheet({
  open,
  onOpenChange,
  task,
  tags: userTags = [],
  autoStart = false,
  presetMinutes = null,
  onMutateToday,
  onSubjectChange,
}: Props) {
  const [openSeen, setOpenSeen] = useState(false);
  const [backdropHandoff, setBackdropHandoff] = useState(false);
  if (open !== openSeen) {
    setOpenSeen(open);
    if (open) setBackdropHandoff(useSheetStore.getState().count > 0);
  }
  useRegisterOpenSheet(open);
  const taskDisplayName = task ? getTaskDisplayName(task) : '';
  const subjectChipLabel = task
    ? subjectHeadline(task.subjectKind ?? subjectKindOf(task.id), taskDisplayName)
    : 'Pick a subject';
  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const { entered, markEntered } = useEntrance(open);
  // Boot the stamp engine while the sheet is still closed, so the very first
  // open doesn't show a blank frog spot while the engine cold-starts.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const c = document.createElement('canvas');
      c.width = 4;
      c.height = 4;
      requestFrogStamp(c, {});
    }, 1200);
    return () => window.clearTimeout(t);
  }, []);
  const [showSounds, setShowSounds] = useState(false);
  const [showPond, setShowPond] = useState(false);
  const [subjectsOpen, setSubjectsOpen] = useState(false);
  const subjectsDrag = useDragControls();
  useEffect(() => {
    if (!open) setSubjectsOpen(false);
  }, [open]);
  useEffect(() => {
    if (!subjectsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setSubjectsOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [subjectsOpen]);
  const [confirmStop, setConfirmStop] = useState(false);
  const [confirmPause, setConfirmPause] = useState(false);
  const [confirmTaskSwitch, setConfirmTaskSwitch] = useState(false);
  const catchChipRef = useRef<HTMLElement | null>(null);
  const [chipPulse, setChipPulse] = useState(0);
  const { seenIntros, markIntroSeen } = useIntros(open);
  const isFirstEverOpen = !!seenIntros && !seenIntros.frogodoro;

  // First open ever (per account): 5 minutes, not the classic 25. Short
  // enough to finish, and long enough to pass FOCUS_FIRST_FLY_SECONDS, so a
  // first-timer who just presses Start sees a catch and a completed session.
  useEffect(() => {
    if (!open || !isFirstEverOpen) return;
    markIntroSeen('frogodoro');
    const store = useFrogodoroStore.getState();
    if (!task?.frogodoroSettings && !store.timerActive) {
      store.setSettings({
        ...store.settings,
        focusDuration: FIRST_SESSION_MINUTES,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isFirstEverOpen]);
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
    setSubject,
    startTimer,
    pauseTimer,
    stopTimer,
    completePhase,
    updateSessionStats,
    awaitingDone,
    setAwaitingDone,
    setSelectedTaskName,
    selectedTaskName,
    lastCompletedPhase,
    lastFocusElapsed,
    lastBreakElapsed,
    deepFocus,
    setDeepFocus,
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
      setSubject: s.setSubject,
      startTimer: s.startTimer,
      pauseTimer: s.pauseTimer,
      stopTimer: s.stopTimer,
      completePhase: s.completePhase,
      updateSessionStats: s.updateSessionStats,
      awaitingDone: s.awaitingDone,
      setAwaitingDone: s.setAwaitingDone,
      setSelectedTaskName: s.setSelectedTaskName,
      selectedTaskName: s.selectedTaskName,
      lastCompletedPhase: s.lastCompletedPhase,
      lastFocusElapsed: s.lastFocusElapsed,
      lastBreakElapsed: s.lastBreakElapsed,
      deepFocus: s.deepFocus,
      setDeepFocus: s.setDeepFocus,
      pausedThisPhase: s.pausedThisPhase,
    })),
  );
  const { indices: frogIndices } = useWardrobeIndices(open);
  const { data: inventorySummary } = useInventory(open, true);
  const focusFlyDaily = inventorySummary?.wardrobe?.focusFlyDaily;

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
  const locked = timerActive || awaitingDone;

  const addOpenSheet = useFrogodoroUiStore((s) => s.addOpenSheet);
  const removeOpenSheet = useFrogodoroUiStore((s) => s.removeOpenSheet);
  const wrapUpOpen = useFrogodoroUiStore((s) => s.wrapUpOpen);
  const wrapUpHandoff = isFocusWrapUp({ awaitingDone, lastCompletedPhase });
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  useEffect(() => {
    if (!open || !wrapUpOpen) return;
    const t = window.setTimeout(
      () => onOpenChangeRef.current(false),
      WRAP_UP_HANDOFF_MS,
    );
    return () => window.clearTimeout(t);
  }, [open, wrapUpOpen]);

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
    setMounted(true);
    const check = () =>
      setIsDesktop(window.matchMedia('(min-width: 640px)').matches);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    overscroll.setContext(dragControls, open && !isDesktop && !locked);
  }, [overscroll, dragControls, open, isDesktop, locked]);

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
    setSubject({
      id: task.id,
      label: getTaskDisplayName(task),
      kind: task.subjectKind ?? subjectKindOf(task.id),
    });
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
    if (oldTaskId) {
      await saveSessionToDb(oldTaskId, live.phase, unsavedElapsed);
      if (unsavedElapsed > 0) onMutateToday?.();
    }
    const settled = await catchOwedBeforeEnding();
    stopTimer();
    setSettleCaught(null);
    if (settled) refreshWalletAfterSettle();
    bindTaskToStore();
  };

  useEffect(() => {
    if (!open || !presetMinutes || !task) return;
    const store = useFrogodoroStore.getState();
    if (store.timerActive || store.awaitingDone) return;
    if (store.selectedTaskId !== task.id) return;
    if (store.settings.focusDuration === presetMinutes) return;
    store.setSettings({ ...store.settings, focusDuration: presetMinutes });
  }, [open, presetMinutes, task, selectedTaskId]);

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
      setSelectedTaskName(getTaskDisplayName(task));
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
      setShowSounds(false);
      setShowPond(false);
      setConfirmStop(false);
      setConfirmPause(false);
      setConfirmTaskSwitch(false);
      stopTimerSound();
      setPreviewingId(null);
      // Dismissing the popup also acknowledges a finished session: silence the
      // alarm (GlobalTimer stops playback when this flips false) and end the
      // session so the next phase is left fresh rather than active.
      if (awaitingDone && !wrapUpHandoff) {
        setAwaitingDone(false);
        stopTimer();
      }
    }
  }, [open, awaitingDone, wrapUpHandoff, setAwaitingDone, stopTimer]);

  // Stop any sound preview when the picker closes
  useEffect(() => {
    if (!showSounds) {
      stopTimerSound();
      setPreviewingId(null);
    }
  }, [showSounds]);

  // Picking a sound applies it immediately (no Save) and previews it, or stops
  // the preview if it's the one already playing.
  const handleSoundSelect = (id: TimerSound) => {
    setSettings({ ...useFrogodoroStore.getState().settings, timerSound: id });
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
    // 0 is allowed and meaningful: a session ending between flushes still has
    // to tell the server to settle, or the fly its final price covers is never
    // credited. Sending no activePhaseFull is what marks this as the settle.
    if (elapsed < 0) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const session = {
      date: today,
      focusTime: currentPhase === 'focus' ? elapsed : 0,
      breakTime: currentPhase === 'break' ? elapsed : 0,
    };
    try {
      await fetch(`/api/tasks/${encodeURIComponent(taskId)}/frogodoro`, {
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
      hapticTick();
      pauseTimer();
    } else {
      hapticImpact();
      startTimer();
    }
  };

  const actionBusyRef = useRef(false);
  const [actionBusy, setActionBusy] = useState(false);
  const runGuarded = async (fn: () => void | Promise<void>) => {
    if (actionBusyRef.current) return;
    actionBusyRef.current = true;
    setActionBusy(true);
    try {
      await fn();
    } finally {
      actionBusyRef.current = false;
      setActionBusy(false);
    }
  };

  // Acknowledge a finished session: silence the alarm and end the session. A
  // session ends when its timer ends, so the next phase is left fresh and
  // inactive (not a continuation) — the user starts it anew when ready. Doesn't
  // save progress; the completed phase was already saved when it finished.
  const handleDone = () => {
    const ended = endedSessionDetail();
    setAwaitingDone(false);
    stopTimer();
    announceSessionEnded(ended);
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
    if (taskId) {
      await saveSessionToDb(taskId, currentPhase, unsavedElapsed);
      if (unsavedElapsed > 0) onMutateToday?.();
    }
    const settled = await catchOwedBeforeEnding();
    stopTimer();
    setSettleCaught(null);
    if (settled) refreshWalletAfterSettle();
    announceSessionEnded();
  };

  // Ending a focus session with meaningful time on the clock asks first — a
  // gentle nudge to keep going, never a punishment (the minutes still count).
  const handleStopTimer = () => {
    if (actionBusyRef.current) return;
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
    void runGuarded(performStop);
  };

  // Fast-forward means "I'm done now", not "skip to the break". It ends the
  // phase at the time actually focused and lands on the same wrap-up screen the
  // clock running out would — so the session is still reviewed, and the break
  // is offered there rather than started behind the user's back. Silent,
  // because they pressed the button.
  const handleManualSkip = async () => {
    const live = useFrogodoroStore.getState();
    const liveElapsed = liveElapsedSeconds(live);
    const unsavedElapsed = Math.max(0, liveElapsed - live.phaseElapsed);
    if (selectedTaskId && unsavedElapsed > 0) {
      await saveSessionToDb(selectedTaskId, phase, unsavedElapsed);
      onMutateToday?.();
    }
    hapticImpact();
    completePhase(false, liveElapsed, true, true);
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

  // The dial reports every detent it passes, so the write waits for the wheel
  // to settle rather than firing once per tick.
  const persistTimerRef = useRef(0);
  useEffect(() => () => window.clearTimeout(persistTimerRef.current), []);

  const changeFocusMinutes = (minutes: number) => {
    const nextSettings = { ...settings, focusDuration: minutes };
    setSettings(nextSettings);
    window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      void persistTaskSettings(nextSettings);
    }, 600);
  };

  // While awaiting Done the phase has already advanced to the next one, but the
  // popup should still wear the just-finished phase's identity (its colour and
  // the time that elapsed), so use the completed phase for display.
  const displayPhase =
    awaitingDone && lastCompletedPhase ? lastCompletedPhase : phase;

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

  const soundIsSilent = normalizeTimerSound(settings.timerSound) === 'none';
  const deepFocusFits = settings.focusDuration * 60 >= DEEP_FOCUS_MIN_SECONDS;

  // Focused seconds this session (same store-derived formula the home hero
  // uses, so every surface shows the same swarm/caught count). The phase pays
  // 1 fly per 15 focused minutes and spreads those catches evenly across its
  // own length — drives the live catch animation and the caught chip.
  // Number-returning selectors: the parent only re-renders when a count
  // actually changes, not on every tick.
  const fliesCaught = useFrogodoroStore(
    (s) => phaseCatchesOf(s, focusFlyDaily).caught,
  );
  // What this session can reach if it runs to the end — the visible goal.
  const fliesPotential = useFrogodoroStore(
    (s) => phaseCatchesOf(s, focusFlyDaily).potential,
  );
  // Set for the beat between "session is ending" and the teardown, so the
  // frog is seen catching the fly the final price covers. An override rather
  // than an addend: once the session ends `fliesCaught` settles to this exact
  // number, so clearing it can never read as a fresh catch.
  const [settleCaught, setSettleCaught] = useState<number | null>(null);
  const sceneCaught = settleCaught ?? fliesCaught;
  const startGain = Math.max(0, fliesPotential - fliesCaught);

  // Ending a session re-prices it at the time actually focused. Anything that
  // price covers but the phase's marks never reached is caught here, on the
  // way out, rather than appearing in the wallet with nothing to watch.
  const catchOwedBeforeEnding = async () => {
    const live = useFrogodoroStore.getState();
    const settled = settledCatchesOf(live, focusFlyDaily);
    if (settled <= phaseCatchesOf(live, focusFlyDaily).caught) return false;
    setSettleCaught(settled);
    await new Promise((resolve) =>
      window.setTimeout(resolve, SETTLE_CATCH_MS),
    );
    return true;
  };

  // GlobalTimer's optimistic wallet bump only fires while a timer is active,
  // and this catch lands as the session ends — so re-read the balance the
  // settle already wrote instead.
  const refreshWalletAfterSettle = () => {
    markFlyEarn(120_000);
    mutateInventoryCaches();
    window.setTimeout(mutateInventoryCaches, 20_000);
  };

  // Read on demand inside the scene's miss scheduler (never subscribed), so a
  // value that changes every second can't re-render the sheet.
  const catchImminent = useCallback(
    () =>
      (phaseCatchesOf(useFrogodoroStore.getState(), focusFlyDaily)
        .nextCatchIn ?? Infinity) <= MISS_CLEARANCE_SECONDS,
    [focusFlyDaily],
  );

  const focusFlyCapReached = useFrogodoroStore((s) => {
    const sessionFocus = sessionFocusLiveSeconds(s);
    const dayTotal =
      priorDayFocusSeconds(focusFlyDaily, sessionFocus) +
      sessionFocus +
      (s.phase === 'focus' ? Math.max(0, s.timeLeft) : 0);
    return focusFliesEarnedForDay(dayTotal) >= FOCUS_FLY_DAILY_CAP;
  });

  if (!mounted) return null;

  const sheetPortal = createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2, ease: 'easeOut' } }}
            onClick={() => {
              if (!locked) onOpenChange(false);
            }}
            style={{ zIndex: backdropHandoff ? 1060 : 999 }}
            className={`fixed inset-0 bg-black/80 ${
              backdropHandoff ? '' : 'sheet-backdrop-in'
            }`}
          />

          <div
            style={{ zIndex: backdropHandoff ? 1061 : 1000 }}
            className="fixed inset-0 flex justify-center pointer-events-none"
          >
            <motion.div
              variants={
                isDesktop
                  ? {
                      hidden: { opacity: 0, y: 12 },
                      visible: { opacity: 1, y: 0 },
                    }
                  : {
                      hidden: { y: '100%', opacity: 0 },
                      visible: { y: 0, opacity: 1 },
                    }
              }
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={
                isDesktop
                  ? { type: 'tween', ease: [0.25, 0.1, 0.25, 1], duration: 0.2 }
                  : { type: 'tween', ease: [0.32, 0.72, 0, 1], duration: 0.4 }
              }
              onAnimationComplete={(definition) => {
                if (definition === 'visible') markEntered();
              }}
              drag={!isDesktop && !locked ? 'y' : false}
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
              className="pointer-events-auto h-full w-full will-change-transform"
            >
              <div
                data-focus-card
                className="relative flex h-full flex-col overflow-hidden bg-popover"
              >
                {/* Drag handle – mobile only. Overlaid so the timer view's
                    scene reaches the rounded top edge (no white strip). */}
                {!isDesktop && !locked && (
                  <div
                    className="absolute inset-x-0 top-[env(safe-area-inset-top)] z-20 flex h-7 items-center justify-center touch-none cursor-grab active:cursor-grabbing"
                    onPointerDown={(e) => dragControls.start(e)}
                  >
                    <div
                      className={`h-1.5 w-12 rounded-full ${
                        showPond
                          ? 'bg-muted-foreground/30'
                          : 'bg-white/80 shadow-[0_1px_2px_rgba(15,23,42,0.25)]'
                      }`}
                    />
                  </div>
                )}

                {/* Help Sub-View */}
                <AnimatePresence mode="wait" initial={false}>
                  {showPond ? (
                    <motion.div
                      key="pond"
                      initial={{ opacity: 0, x: 40 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 40 }}
                      transition={{ duration: 0.2 }}
                      className="mx-auto min-h-0 w-full max-w-[500px] flex-1 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-[calc(env(safe-area-inset-top)+2rem)]"
                    >
                      <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-lg font-black text-foreground">
                          Fly catches
                        </h3>
                        <button
                          onClick={() => setShowPond(false)}
                          aria-label="Close"
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/60 text-muted-foreground transition-colors hover:bg-muted"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      {(() => {
                        const days = pondData?.days ?? [];
                        const fliesOf = (focusTime: number) =>
                          focusFliesEarnedForDay(focusTime);
                        const todayRow = days.find((d) => d.date === pondData?.today);
                        const todayFlies = todayRow ? fliesOf(todayRow.focusTime) : 0;
                        const todayMinutes = todayRow
                          ? Math.round(todayRow.focusTime / 60)
                          : 0;
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

                        if (days.length === 0) {
                          return (
                            <p className="py-10 text-center text-sm font-bold text-muted-foreground">
                              Loading your week…
                            </p>
                          );
                        }

                        return (
                          <>
                            {/* Today is the number that can still change, so it
                                leads — a ring reads its distance to the cap at
                                a glance, which a row of dots never did. */}
                            <div className="flex items-center gap-4 rounded-2xl border border-border/50 bg-primary/5 p-4">
                              <CapRing
                                caught={todayFlies}
                                cap={FOCUS_FLY_DAILY_CAP}
                              />
                              <div className="min-w-0">
                                <p className="text-[15px] font-black text-foreground">
                                  {todayFlies >= FOCUS_FLY_DAILY_CAP
                                    ? 'Frog is full for today'
                                    : `${FOCUS_FLY_DAILY_CAP - todayFlies} more to catch today`}
                                </p>
                                <p className="text-[12px] font-semibold text-muted-foreground">
                                  {todayMinutes} min focused today
                                </p>
                              </div>
                            </div>

                            {/* The week as a chain of days: bar height is the
                                catch count, so a good run is a shape you see
                                rather than a number you have to read. */}
                            <p className="mb-2 mt-4 text-[12px] font-black uppercase tracking-wide text-muted-foreground">
                              This week
                            </p>
                            <div className="flex items-end justify-between gap-1.5">
                              {days.map((d) => {
                                const flies = fliesOf(d.focusTime);
                                const isToday = d.date === pondData?.today;
                                const pct = Math.round(
                                  (flies / FOCUS_FLY_DAILY_CAP) * 100,
                                );
                                return (
                                  <div
                                    key={d.date}
                                    className="flex flex-1 flex-col items-center gap-1.5"
                                    title={`${Math.round(d.focusTime / 60)} min focused`}
                                  >
                                    <span className="h-4 text-[11px] font-black tabular-nums text-muted-foreground">
                                      {flies || ''}
                                    </span>
                                    <div className="flex h-16 w-full items-end overflow-hidden rounded-lg bg-muted/60">
                                      <div
                                        className={`w-full rounded-lg transition-[height] duration-500 ${
                                          isToday ? 'bg-primary' : 'bg-primary/45'
                                        }`}
                                        style={{
                                          height: flies > 0 ? `${Math.max(12, pct)}%` : '0%',
                                        }}
                                      />
                                    </div>
                                    <span
                                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                                        isToday
                                          ? 'bg-primary text-primary-foreground'
                                          : 'text-muted-foreground/70'
                                      }`}
                                    >
                                      {dayLetter(d.date)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>

                            <div className="mt-4 flex gap-2">
                              <div className="flex-1 rounded-2xl bg-primary/8 px-3 py-2.5 text-center dark:bg-primary/15">
                                <p className="text-lg font-black tabular-nums text-foreground">
                                  {weekFlies}
                                </p>
                                <p className="text-[12px] font-bold text-primary/70">
                                  Flies this week
                                </p>
                              </div>
                              <div className="flex-1 rounded-2xl bg-primary/8 px-3 py-2.5 text-center dark:bg-primary/15">
                                <p className="text-lg font-black tabular-nums text-foreground">
                                  {weekMinutes}m
                                </p>
                                <p className="text-[12px] font-bold text-primary/70">
                                  Focused
                                </p>
                              </div>
                            </div>

                            {/* The rules are reference, not the headline — they
                                never change, so they sit at the bottom. */}
                            <p className="mt-4 text-center text-[12px] leading-relaxed text-muted-foreground">
                              First fly after {FOCUS_FIRST_FLY_SECONDS / 60} focused
                              minutes, then 1 every {FOCUS_FLY_RATE_SECONDS / 60},
                              up to {FOCUS_FLY_DAILY_CAP} a day. Finish without
                              pausing for +{DEEP_FOCUS_BONUS_FLIES}.
                            </p>
                          </>
                        );
                      })()}

                      <button
                        onClick={() => setShowPond(false)}
                        className="mt-4 w-full rounded-2xl bg-primary py-3 text-sm font-black text-primary-foreground shadow-md shadow-primary/20 transition-[transform,box-shadow,background-color,color,opacity] active:scale-[0.98]"
                      >
                        Back to timer
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
                      className="flex min-h-0 flex-1 flex-col"
                    >
                      <PresenceContext.Provider value={null}>
                      {/* Timer Card */}
                      <div className="relative isolate flex min-h-0 flex-1 flex-col">
                        <PondBackdrop className="absolute inset-0 -z-10 hidden sm:block [&_img]:object-[50%_72%]" />
                        <AnimatePresence>
                          {subjectsOpen && !timerActive && !awaitingDone && (
                            <motion.div
                              key="subjects"
                              initial={{ y: '100%' }}
                              animate={{ y: 0 }}
                              exit={{ y: '100%' }}
                              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
                              drag="y"
                              dragControls={subjectsDrag}
                              dragListener={false}
                              dragConstraints={{ top: 0, bottom: 0 }}
                              dragElastic={{ top: 0, bottom: 0.5 }}
                              dragMomentum={false}
                              onDragEnd={(_event, { offset, velocity }) => {
                                if (offset.y > 70 || velocity.y > 600) {
                                  setSubjectsOpen(false);
                                }
                              }}
                              style={{ willChange: 'transform' }}
                              className="absolute inset-0 z-[60] overflow-hidden bg-popover"
                            >
                              <div className="mx-auto h-full w-full max-w-[500px]">
                              <FocusSubjectPanel
                                active={open}
                                currentSubjectId={task?.id}
                                onPick={(picked) => {
                                  setSubjectsOpen(false);
                                  onSubjectChange?.(picked);
                                }}
                                onClose={() => setSubjectsOpen(false)}
                                onHeaderPointerDown={(event) =>
                                  subjectsDrag.start(event)
                                }
                              />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <div className="relative min-h-[176px] flex-1">
                        <PondBackdrop
                          className="absolute inset-x-0 -bottom-9 top-0 -z-10 sm:hidden [&_img]:object-[50%_82%]"
                        />
                        {/* Session catch goal: caught / possible for this
                            session length, plus the live deep-focus bonus —
                            visible while the pledge holds, gone if it breaks.
                            Pulses when a snatched fly lands; +1 floats up. */}
                        {!awaitingDone && (
                            <div
                              className="absolute left-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-20"
                            >
                              <motion.button
                                type="button"
                                ref={catchChipRef as React.RefObject<HTMLButtonElement>}
                                key={chipPulse}
                                initial={chipPulse > 0 ? { scale: 1.35 } : false}
                                animate={{ scale: 1 }}
                                transition={{ type: 'spring', stiffness: 420, damping: 16 }}
                                onClick={() => {
                                  hapticTick();
                                  setShowPond(true);
                                }}
                                aria-label="Fly catches this week"
                                className={`flex h-9 items-center gap-1 rounded-full pl-1 pr-3 ${SCENE_BUTTON}`}
                              >
                                {/* Fixed box + leading-none on every sibling is
                                    what keeps the row on one optical centre line. */}
                                <span className="relative flex h-8 w-8 shrink-0 -translate-y-1 items-center justify-center">
                                  <Fly
                                    size={34}
                                    interactive={false}
                                    alwaysPlay
                                    paused
                                  />
                                </span>
                                {timerActive &&
                                phase === 'focus' &&
                                fliesPotential > 0 ? (
                                  <span className="flex items-center text-[13px] font-black leading-none tabular-nums text-foreground">
                                    {sceneCaught}/
                                    {Math.max(fliesPotential, sceneCaught)}
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-0.5 text-[12px] font-black leading-none text-foreground">
                                    This week
                                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  </span>
                                )}
                                <AnimatePresence>
                                  {pledgeLive && timerActive && (
                                    // Transform + opacity only. This animated
                                    // width:0→auto, which relayouts the chip on
                                    // every frame — while the timer ticks and
                                    // the Rive frog animates. The width now
                                    // changes once, and the motion rides the
                                    // compositor.
                                    <motion.span
                                      initial={{ opacity: 0, scale: 0.6, x: -4 }}
                                      animate={{ opacity: 1, scale: 1, x: 0 }}
                                      exit={{ opacity: 0, scale: 0.6, x: -4 }}
                                      transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
                                      style={{ willChange: 'transform, opacity' }}
                                      className="flex origin-left items-center gap-0.5 text-[12px] font-black leading-none text-amber-600 dark:text-amber-400"
                                    >
                                      <Zap className="h-3 w-3 fill-current" />
                                      +1
                                    </motion.span>
                                  )}
                                </AnimatePresence>
                              </motion.button>
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

                        <div
                          className="absolute right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-50 flex items-center gap-2"
                        >
                          <div className="relative">
                            <button
                              onClick={() => {
                                hapticTick();
                                setShowSounds((v) => !v);
                              }}
                              aria-label="Finish sound"
                              aria-expanded={showSounds}
                              className={`flex h-9 w-9 items-center justify-center rounded-full ${
                                showSounds
                                  ? 'bg-primary text-primary-foreground'
                                  : SCENE_BUTTON
                              }`}
                            >
                              {soundIsSilent ? (
                                <VolumeX className="h-4 w-4" />
                              ) : (
                                <Volume2 className="h-4 w-4" />
                              )}
                            </button>

                            {showSounds && (
                              <div
                                className="fixed inset-0 z-40"
                                onClick={() => setShowSounds(false)}
                              />
                            )}
                            <AnimatePresence>
                              {showSounds && (
                                  <motion.div
                                    key="sounds"
                                    initial={{ opacity: 0, y: -6, scale: 0.96 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -6, scale: 0.96 }}
                                    transition={{ duration: 0.16 }}
                                    className="absolute right-0 top-full z-50 mt-2 w-[212px] origin-top-right overflow-hidden rounded-2xl bg-popover shadow-xl ring-1 ring-black/10"
                                  >
                                    <div className="flex items-baseline justify-between px-3.5 pb-1.5 pt-3">
                                      <p className="text-[13px] font-bold tracking-wide text-muted-foreground">
                                        Finish sound
                                      </p>
                                      <p className="text-[10px] text-muted-foreground/70">
                                        Tap to hear
                                      </p>
                                    </div>
                                    <div className="pb-2">
                                      {TIMER_SOUNDS.map(({ id, label }) => {
                                        const isSelected =
                                          normalizeTimerSound(settings.timerSound) === id;
                                        const isPreviewing = previewingId === id;
                                        return (
                                          <button
                                            key={id}
                                            type="button"
                                            onClick={() => handleSoundSelect(id)}
                                            className={`flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left text-sm transition-colors ${
                                              isSelected
                                                ? 'font-bold text-primary'
                                                : 'font-medium text-foreground hover:bg-muted/50'
                                            }`}
                                          >
                                            <span className="truncate">{label}</span>
                                            {isPreviewing ? (
                                              <Volume2 className="h-4 w-4 shrink-0 animate-pulse text-primary" />
                                            ) : isSelected ? (
                                              <Check className="h-4 w-4 shrink-0" />
                                            ) : null}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                          {!locked && (
                            <button
                              onClick={() => onOpenChange(false)}
                              aria-label="Close"
                              className={`flex h-9 w-9 items-center justify-center rounded-full ${SCENE_BUTTON}`}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {/* The frog stands in the pond with its hands on the
                            card below, the way it holds the dock on Home; when
                            a focus session starts the flies slide in from the
                            sides, the frog lunges and misses, and truly catches
                            on the phase's own marks. */}
                        <div
                          className="absolute inset-x-0 bottom-0 z-20"
                        >
                          <SheetEnteredContext.Provider value={entered}>
                          <FocusScene
                            frogWidth={SCENE_FROG_WIDTH}
                            arrive="rise"
                            indices={frogIndices}
                            running={isRunning}
                            showFlies={
                              timerActive && phase === 'focus' && !awaitingDone
                            }
                            caught={sceneCaught}
                            fliesPotential={Math.max(
                              fliesPotential,
                              sceneCaught,
                            )}
                            catchImminent={catchImminent}
                            counterRef={catchChipRef}
                            onGainLand={() => setChipPulse((p) => p + 1)}
                            suspended={
                              confirmStop ||
                              confirmPause ||
                              confirmTaskSwitch ||
                              subjectsOpen
                            }
                          />
                          </SheetEnteredContext.Provider>
                        </div>
                        </div>

                        <div
                          className="relative z-10 rounded-t-[26px] bg-popover px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:mx-auto sm:mb-[max(2rem,7vh)] sm:w-full sm:max-w-[500px] sm:rounded-[28px] sm:pb-5 sm:shadow-[0_0_0_1px_hsl(var(--border)/0.8),0_3px_0_0_rgba(0,0,0,0.14),0_22px_44px_-18px_rgba(15,23,42,0.4)]"
                        >
                        <div className="mx-auto w-full max-w-[468px]">
                        {/* Subject. While the timer runs it is a plain label;
                            idle it IS the control that changes what you're
                            focusing on, so the name isn't printed twice. */}
                        {task && (
                          <div className="mb-1 px-6 text-center">
                            {timerActive || awaitingDone ? (
                              <p className="truncate py-1 text-[17px] font-black leading-tight text-foreground">
                                {taskDisplayName}
                              </p>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  hapticTick();
                                  if (onSubjectChange) {
                                    setSubjectsOpen(true);
                                    return;
                                  }
                                  onOpenChange(false);
                                  window.setTimeout(
                                    () =>
                                      useFrogodoroUiStore
                                        .getState()
                                        .openFocusLauncher(),
                                    180,
                                  );
                                }}
                                className="mx-auto flex max-w-full items-center gap-1 rounded-xl px-2 py-1 transition-colors hover:bg-muted/60"
                              >
                                <span className="truncate text-[17px] font-black leading-tight text-foreground">
                                  {subjectChipLabel}
                                </span>
                                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                              </button>
                            )}
                          </div>
                        )}

                        {/* Time Display — split focus/break summary with
                            auto-start breaks, otherwise the single phase
                            time/countdown. */}
                        {splitDone ? (
                          <div className="mb-3 flex h-[188px] items-center">
                            <div className="flex-1 text-center">
                              <p className="text-[13px] font-black text-primary">Focus</p>
                              <p className="text-[clamp(32px,11vw,44px)] font-black leading-none tracking-tighter text-foreground tabular-nums">{formatTime(focusSeconds)}</p>
                            </div>
                            <div className="flex-1 text-center">
                              <p className="text-[13px] font-black text-sky-600 dark:text-sky-400">Break</p>
                              <p className="text-[clamp(32px,11vw,44px)] font-black leading-none tracking-tighter text-foreground tabular-nums">{formatTime(breakSeconds)}</p>
                            </div>
                          </div>
                        ) : (
                        /* Setup and countdown share one fixed-height stage.
                           Animating height between them was layout work on
                           every frame — and it ran while the Rive frog was
                           animating, which is what made Start/Pause stutter.
                           Stacked absolutely and cross-faded, the whole
                           transition is transform + opacity, so it stays on
                           the compositor and the card never reflows. */
                        <div className="relative mb-3 h-[188px]">
                          <AnimatePresence initial={false} mode="popLayout">
                            {!timerActive && !awaitingDone ? (
                              <motion.div
                                key="setup"
                                initial={{ opacity: 0, scale: 0.97, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.97, y: -10 }}
                                transition={STAGE_TRANSITION}
                                style={{ willChange: 'transform, opacity' }}
                                className="absolute inset-0 flex flex-col items-center justify-center gap-2.5"
                              >
                                <DurationDial
                                  minutes={settings.focusDuration}
                                  onChange={changeFocusMinutes}
                                  presets={FOCUS_PRESETS}
                                  label="Focus length in minutes"
                                  compact
                                />

                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={deepFocus && deepFocusFits}
                                  aria-label="Deep focus: no pausing, plus one bonus fly"
                                  disabled={!deepFocusFits}
                                  onClick={() => {
                                    hapticTick();
                                    setDeepFocus(!deepFocus);
                                  }}
                                  className={`flex min-h-9 items-center gap-2 rounded-full pl-3 pr-1.5 text-[12px] font-black transition-colors ${
                                    !deepFocusFits
                                      ? 'bg-muted/50 text-muted-foreground/70'
                                      : deepFocus
                                        ? 'bg-amber-400 text-amber-950'
                                        : 'bg-muted/70 text-muted-foreground hover:bg-muted'
                                  }`}
                                >
                                  <Zap
                                    className={`h-3.5 w-3.5 shrink-0 ${
                                      deepFocus && deepFocusFits ? 'fill-current' : ''
                                    }`}
                                  />
                                  {deepFocusFits
                                    ? `Deep focus · +${DEEP_FOCUS_BONUS_FLIES} fly`
                                    : `Deep focus from ${DEEP_FOCUS_MIN_SECONDS / 60} min`}
                                  {deepFocusFits ? (
                                    <span
                                      aria-hidden
                                      className={`relative ml-0.5 h-5 w-8 shrink-0 rounded-full transition-colors ${
                                        deepFocus ? 'bg-amber-950/25' : 'bg-foreground/15'
                                      }`}
                                    >
                                      <span
                                        className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
                                          deepFocus ? 'translate-x-3' : 'translate-x-0'
                                        }`}
                                      />
                                    </span>
                                  ) : (
                                    <span aria-hidden className="w-1.5" />
                                  )}
                                </button>
                              </motion.div>
                            ) : (
                              <motion.div
                                key="running"
                                initial={{ opacity: 0, scale: 0.94 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.94 }}
                                transition={STAGE_TRANSITION}
                                style={{ willChange: 'transform, opacity' }}
                                className="absolute inset-0 flex flex-col items-center justify-center gap-3"
                              >
                                <div className="min-w-0 text-center text-[clamp(44px,16vw,68px)] font-black leading-none tracking-tighter text-foreground tabular-nums min-[420px]:min-w-[210px]">
                                  <CountdownText
                                    frozen={awaitingDone ? completedDuration : null}
                                  />
                                </div>
                                {!awaitingDone && (
                                  <>
                                    <PhaseTrack
                                      animate={isRunning}
                                      focusFlyDaily={focusFlyDaily}
                                    />
                                    <NextFlyLine focusFlyDaily={focusFlyDaily} />
                                  </>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                        )}

                        {/* Controls — a finished focus hands off to the wrap-up;
                            any other completion just needs Done, which silences
                            the alarm and ends the session. */}
                        <div className="flex min-h-[105px] flex-col items-center gap-2.5">
                        {awaitingDone ? (
                          <button
                            onClick={() => void runGuarded(handleDone)}
                            disabled={actionBusy || wrapUpHandoff}
                            className={`${CTA_BASE} ${
                              displayPhase === 'focus' ? CTA_FOCUS : CTA_BREAK
                            }`}
                          >
                            <Check className="h-5 w-5" strokeWidth={3} />
                            Done
                          </button>
                        ) : (
                        <>
                          <button
                            onClick={() => void runGuarded(toggleTimer)}
                            disabled={actionBusy}
                            data-hint={timerActive ? undefined : 'focus-start'}
                            className={`${CTA_BASE} ${
                              isRunning
                                ? CTA_QUIET
                                : phase === 'focus'
                                  ? CTA_FOCUS
                                  : CTA_BREAK
                            }`}
                          >
                            {isRunning ? (
                              <Pause className="h-5 w-5 fill-current" />
                            ) : (
                              <Play className="h-5 w-5 fill-current" />
                            )}
                            {isRunning ? 'Pause' : timerActive ? 'Resume' : 'Start'}
                            {!timerActive && startGain > 0 && (
                              <FlyPriceChip
                                amount={`+${startGain}`}
                                className="ml-1"
                              />
                            )}
                          </button>

                          {!timerActive &&
                            (startGain === 0 && focusFlyCapReached ? (
                              <p className="flex h-9 items-center text-center text-[12px] font-bold text-muted-foreground">
                                Daily max caught — minutes still count
                              </p>
                            ) : hasStats ? (
                              <SessionStatsRow dbSession={task?.frogodoroSession} />
                            ) : null)}

                          {timerActive && (
                            <div className="flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => void runGuarded(handleManualSkip)}
                                disabled={actionBusy}
                                className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-black transition-[transform,background-color] active:scale-95 ${
                                  phase === 'focus'
                                    ? 'bg-primary/[0.14] text-primary hover:bg-primary/20'
                                    : 'bg-sky-500/15 text-sky-700 hover:bg-sky-500/20 dark:text-sky-300'
                                }`}
                              >
                                {phase === 'focus' ? (
                                  <>
                                    <Check className="h-4 w-4" strokeWidth={3} />
                                    Finish now
                                  </>
                                ) : (
                                  <>
                                    <SkipForward className="h-4 w-4 fill-current" />
                                    Skip break
                                  </>
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={handleStopTimer}
                                disabled={actionBusy}
                                className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold text-muted-foreground transition-colors hover:text-foreground active:scale-95"
                              >
                                <Square className="h-3.5 w-3.5 fill-current" />
                                End session
                              </button>
                            </div>
                          )}
                        </>
                        )}
                        </div>

                        {/* Enable-notifications hint — so timer-complete alerts can land */}
                        {canEnableNotifs && (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleEnableNotifs()}
                              className="mx-auto mt-3 flex items-center gap-1.5 rounded-full bg-muted/70 px-3 py-1.5 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-muted active:scale-95"
                            >
                              <Bell className="h-3.5 w-3.5" />
                              Enable notifications to get timer alerts
                            </button>
                            {notifHint && (
                              <p className="mx-auto mt-2 max-w-[300px] text-center text-[11px] font-bold text-muted-foreground">
                                {notifHint}
                              </p>
                            )}
                          </>
                        )}
                        </div>
                        </div>
                      </div>
                      </PresenceContext.Provider>

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
                      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/65 p-6"
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
                          className="mt-4 w-full rounded-2xl bg-primary py-3 text-sm font-black text-primary-foreground shadow-md shadow-primary/20 transition-[transform,box-shadow,background-color,color,opacity] active:scale-[0.98]"
                        >
                          Keep going
                        </button>
                        <button
                          onClick={() => void runGuarded(performStop)}
                          disabled={actionBusy}
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
                      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/65 p-6"
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
                          className="mt-4 w-full rounded-2xl bg-primary py-3 text-sm font-black text-primary-foreground shadow-md shadow-primary/20 transition-[transform,box-shadow,background-color,color,opacity] active:scale-[0.98]"
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
                      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/65 p-6"
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
                          className="mt-4 w-full rounded-2xl bg-primary py-3 text-sm font-black text-primary-foreground shadow-md shadow-primary/20 transition-[transform,box-shadow,background-color,color,opacity] active:scale-[0.98]"
                        >
                          Keep current timer
                        </button>
                        <button
                          onClick={() => void runGuarded(performTaskSwitch)}
                          disabled={actionBusy}
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

  return sheetPortal;
}
