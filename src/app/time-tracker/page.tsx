'use client';

import React, { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';
import {
  Clock3,
  Plus,
  Timer as TimerIcon,
  Tag as TagIcon,
  X,
  Play,
  Pause,
  Check,
} from 'lucide-react';
import Frog, { FrogHandle } from '@/components/ui/frog';
import { byId } from '@/lib/skins/catalog';
import { WardrobePanel } from '@/components/ui/skins/WardrobePanel';

const ACTIVE_KEY = 'frog-time-tracker-active-v1';

const DEFAULT_TAGS = [
  'Work',
  'Creative',
  'Learning',
  'Health',
  'Admin',
  'Other',
];

type StoredSession = {
  id: string;
  task: string;
  category: string; // treated as "tag" in UI
  start: string;
  end: string;
  durationMs: number;
  plannedMinutes: number | null;
  dateKey: string;
};

type ActiveSession = {
  id: string;
  task: string;
  category: string;
  startedAt: string; // ISO
  accumulatedMs: number;
  plannedMinutes: number | null;
  isPaused: boolean;
  lastStartedAt: string | null;
};

// ───────── helpers ─────────
const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return '0s';
}

function formatTimer(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
    2,
    '0'
  )}`;
}

function computeElapsedMs(active: ActiveSession | null): number {
  if (!active) return 0;
  const base = active.accumulatedMs;
  if (active.isPaused || !active.lastStartedAt) return base;
  const startTs = new Date(active.lastStartedAt).getTime();
  return base + (Date.now() - startTs);
}

// ───────── Sheet component ─────────

type SheetMode = 'timer' | 'manual';

interface LogSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: SheetMode;
  setMode: (m: SheetMode) => void;

  // tags
  tags: string[];
  selectedTag: string;
  setSelectedTag: (tag: string) => void;
  onCreateTag: (name: string) => Promise<void> | void;

  // shared task name
  taskName: string;
  setTaskName: (v: string) => void;

  // timer state
  activeSession: ActiveSession | null;
  elapsedMs: number;
  plannedMinutes: number;
  setPlannedMinutes: (v: number) => void;
  onStartTimer: () => void;
  onPauseTimer: () => void;
  onFinishTimer: () => Promise<void>;
  onCancelTimer: () => void;

  // manual log
  manualMinutes: number;
  setManualMinutes: (v: number) => void;
  manualDateStr: string;
  setManualDateStr: (v: string) => void;
  todayStr: string;
  onSaveManual: () => Promise<void>;
}

function LogTimeSheet(props: LogSheetProps) {
  const {
    open,
    onOpenChange,
    mode,
    setMode,
    tags,
    selectedTag,
    setSelectedTag,
    onCreateTag,
    taskName,
    setTaskName,
    activeSession,
    elapsedMs,
    plannedMinutes,
    setPlannedMinutes,
    onStartTimer,
    onPauseTimer,
    onFinishTimer,
    onCancelTimer,
    manualMinutes,
    setManualMinutes,
    manualDateStr,
    setManualDateStr,
    todayStr,
    onSaveManual,
  } = props;

  const [showNewTagInput, setShowNewTagInput] = useState(false);
  const [newTagName, setNewTagName] = useState('');

  useEffect(() => {
    if (open) {
      setShowNewTagInput(false);
      setNewTagName('');
    }
  }, [open]);

  if (!open) return null;

  const hasActive = !!activeSession;
  const isRunning = !!activeSession && !activeSession.isPaused;

  const handleCreateTag = async () => {
    const trimmed = newTagName.trim();
    if (!trimmed) return;
    await onCreateTag(trimmed);
    setNewTagName('');
    setShowNewTagInput(false);
    setSelectedTag(trimmed);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-full max-w-xl px-4 pt-2 pb-4 sm:pb-6">
        <div className="mx-auto max-w-xl rounded-[28px] bg-white/90 dark:bg-slate-900/95 shadow-[0_18px_48px_rgba(15,23,42,.55)] ring-1 ring-slate-900/10 dark:ring-white/10 p-4 sm:p-5">
          {/* drag handle + close */}
          <div className="flex items-center justify-between mb-2">
            <div className="w-10 h-1 mx-auto rounded-full bg-slate-200 dark:bg-slate-700" />
            <button
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center justify-center ml-auto rounded-full h-7 w-7 bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* segmented control: Timer / Add time */}
          <div className="mb-4">
            <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-100/80 dark:bg-slate-800/80 ring-1 ring-slate-200 dark:ring-slate-700">
              <button
                type="button"
                onClick={() => setMode('timer')}
                data-active={mode === 'timer'}
                className={[
                  'h-9 rounded-xl text-sm font-medium inline-flex items-center justify-center gap-2 transition',
                  'data-[active=true]:bg-white data-[active=true]:shadow-sm data-[active=true]:ring-1 data-[active=true]:ring-slate-200',
                  'data-[active=false]:text-slate-600 dark:data-[active=false]:text-slate-300',
                ].join(' ')}
              >
                <TimerIcon className="w-4 h-4" />
                Timer
              </button>
              <button
                type="button"
                onClick={() => setMode('manual')}
                data-active={mode === 'manual'}
                className={[
                  'h-9 rounded-xl text-sm font-medium inline-flex items-center justify-center gap-2 transition',
                  'data-[active=true]:bg-white data-[active=true]:shadow-sm data-[active=true]:ring-1 data-[active=true]:ring-slate-200',
                  'data-[active=false]:text-slate-600 dark:data-[active=false]:text-slate-300',
                ].join(' ')}
              >
                <Clock3 className="w-4 h-4" />
                Add time
              </button>
            </div>
          </div>

          {/* shared: task name */}
          <div className="mb-4 space-y-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Task
            </label>
            <input
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="What are you working on?"
              className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-[0_1px_0_rgba(255,255,255,.6)_inset] focus:outline-none focus:ring-2 focus:ring-slate-900/70 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
            />
          </div>

          {/* tags row */}
          <div className="mb-4 space-y-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Tag
            </label>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTag(tag)}
                  data-active={selectedTag === tag}
                  className={[
                    'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition',
                    'border-slate-200 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100',
                    'data-[active=true]:border-slate-900 data-[active=true]:bg-slate-900 data-[active=true]:text-white',
                  ].join(' ')}
                >
                  <TagIcon className="w-3 h-3" />
                  {tag}
                </button>
              ))}

              {/* + icon for new tag */}
              {!showNewTagInput && (
                <button
                  type="button"
                  onClick={() => setShowNewTagInput(true)}
                  className="inline-flex items-center justify-center border border-dashed rounded-full h-7 w-7 border-slate-300 text-slate-500 hover:border-slate-500 hover:text-slate-700 dark:border-slate-600 dark:text-slate-300"
                  title="New tag"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}

              {showNewTagInput && (
                <div className="flex items-center gap-2">
                  <input
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="New tag"
                    className="h-8 px-2 text-xs bg-white border rounded-lg border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/70 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateTag();
                      }
                      if (e.key === 'Escape') {
                        setShowNewTagInput(false);
                        setNewTagName('');
                      }
                    }}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleCreateTag}
                    className="inline-flex items-center justify-center rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-50 dark:text-slate-900"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewTagInput(false);
                      setNewTagName('');
                    }}
                    className="inline-flex items-center justify-center px-2 py-1 text-xs border rounded-full border-slate-300 text-slate-500 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* TIMER MODE */}
          {mode === 'timer' && (
            <>
              {/* planned duration */}
              <div className="mb-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Planned duration (min)
                  </span>
                  <div className="flex gap-1 text-[11px] text-slate-500 dark:text-slate-300">
                    {[25, 50, 60].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setPlannedMinutes(v)}
                        className={[
                          'rounded-full border px-2 py-0.5',
                          plannedMinutes === v
                            ? 'border-slate-900 bg-slate-900 text-white dark:bg-slate-50 dark:border-slate-50 dark:text-slate-900'
                            : 'border-slate-200 bg-white hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800',
                        ].join(' ')}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    max={600}
                    value={plannedMinutes || ''}
                    onChange={(e) =>
                      setPlannedMinutes(
                        e.target.value ? Math.max(1, Number(e.target.value)) : 0
                      )
                    }
                    className="w-20 px-2 text-sm bg-white border rounded-lg h-9 border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/70 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50"
                  />
                  {plannedMinutes > 0 && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Target ~{plannedMinutes} minutes
                    </span>
                  )}
                </div>
              </div>

              {/* big timer */}
              <div className="flex flex-col items-center mb-4">
                <div className="flex items-center justify-center rounded-[20px] bg-slate-900 text-slate-50 px-8 py-4 font-mono text-4xl font-semibold tracking-tight shadow-[0_14px_40px_rgba(15,23,42,.7)] dark:bg-black">
                  {formatTimer(elapsedMs)}
                </div>
                {plannedMinutes > 0 && (
                  <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                    {(() => {
                      const remaining =
                        plannedMinutes * 60_000 - (elapsedMs || 0);
                      if (remaining > 0) {
                        const mins = Math.ceil(remaining / 60_000);
                        return `~${mins} min remaining`;
                      }
                      if (elapsedMs === 0) return `Ready to start`;
                      const overMs = Math.abs(remaining);
                      const mins = Math.ceil(overMs / 60_000);
                      return `Over plan by ~${mins} min`;
                    })()}
                  </p>
                )}
              </div>

              {/* controls */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (hasActive && isRunning) {
                      onPauseTimer();
                    } else {
                      onStartTimer();
                    }
                  }}
                  disabled={!taskName.trim()}
                  className={[
                    'col-span-2 inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(37,99,235,.55)]',
                    isRunning
                      ? 'bg-slate-800 hover:bg-slate-900'
                      : 'bg-slate-900 hover:bg-black',
                    'disabled:opacity-60',
                  ].join(' ')}
                >
                  {isRunning ? (
                    <>
                      <Pause className="w-4 h-4" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      {hasActive ? 'Resume' : 'Start'}
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={onFinishTimer}
                  disabled={!hasActive}
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold border rounded-full border-emerald-500/70 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-400/70 dark:bg-emerald-950/40 dark:text-emerald-100"
                >
                  <Check className="w-4 h-4" />
                  Save
                </button>
              </div>

              <button
                type="button"
                onClick={onCancelTimer}
                disabled={!hasActive}
                className="inline-flex items-center justify-center w-full gap-2 px-4 py-2 mt-2 text-xs font-medium bg-white border rounded-full border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Reset
              </button>
            </>
          )}

          {/* MANUAL MODE */}
          {mode === 'manual' && (
            <>
              <div className="mb-3 grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Date
                  </label>
                  <input
                    type="date"
                    value={manualDateStr}
                    max={todayStr}
                    onChange={(e) =>
                      e.target.value && setManualDateStr(e.target.value)
                    }
                    className="w-full px-2 text-sm bg-white border rounded-lg h-9 border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/70 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Duration (min)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={600}
                      value={manualMinutes || ''}
                      onChange={(e) =>
                        setManualMinutes(
                          e.target.value
                            ? Math.max(1, Number(e.target.value))
                            : 0
                        )
                      }
                      className="w-20 px-2 text-sm bg-white border rounded-lg h-9 border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/70 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50"
                    />
                    <div className="flex gap-1 text-[11px]">
                      {[15, 30, 60].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setManualMinutes(v)}
                          className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onSaveManual}
                disabled={!taskName.trim() || !manualMinutes}
                className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(15,23,42,.6)] hover:bg-black disabled:opacity-60 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200"
              >
                <Check className="w-4 h-4" />
                Save time
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ───────── main page ─────────

export default function TimeTrackerPage() {
  const { data: session } = useSession();

  if (!session) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950">
        <div className="p-6 text-center shadow-xl rounded-2xl bg-white/90 ring-1 ring-slate-200 dark:bg-slate-900/90 dark:ring-slate-700">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
            Time tracker
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Sign in to track your time and sync it across devices.
          </p>
          <a
            href="/login"
            className="mt-4 inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-black dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Go to login
          </a>
        </div>
      </main>
    );
  }

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const { data: dayData, mutate: mutateDay } = useSWR(
    `/api/time-tracker?date=${todayStr}`,
    fetcher
  );
  const { data: tagData, mutate: mutateTags } = useSWR(
    '/api/time-tracker/categories',
    fetcher
  );

  const sessionsForDay: StoredSession[] = dayData?.sessions ?? [];
  const totalMsForDay: number =
    typeof dayData?.totalMs === 'number'
      ? dayData.totalMs
      : sessionsForDay.reduce((sum, s) => sum + (s.durationMs || 0), 0);

  const userTags: string[] = tagData?.categories ?? [];
  const mergedTags = Array.from(new Set([...DEFAULT_TAGS, ...userTags]));

  // frog + wardrobe
  const frogRef = useRef<FrogHandle | null>(null);
  const [openWardrobe, setOpenWardrobe] = useState(false);
  const { data: wardrobeData } = useSWR(
    '/api/skins/inventory',
    (u) => fetch(u).then((r) => r.json()),
    { revalidateOnFocus: false }
  );

  const indices = (() => {
    const eq = wardrobeData?.wardrobe?.equipped ?? {};
    return {
      skin: eq?.skin ? byId[eq.skin].riveIndex : 0,
      hat: eq?.hat ? byId[eq.hat].riveIndex : 0,
      scarf: eq?.scarf ? byId[eq.scarf].riveIndex : 0,
      hand_item: eq?.hand_item ? byId[eq.hand_item].riveIndex : 0,
    };
  })();

  // timer state
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(
    null
  );
  const [elapsedMs, setElapsedMs] = useState(0);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<SheetMode>('timer');

  const [taskName, setTaskName] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>(
    mergedTags[0] ?? DEFAULT_TAGS[0]
  );
  const [plannedMinutes, setPlannedMinutes] = useState(60);
  const [manualMinutes, setManualMinutes] = useState(30);
  const [manualDateStr, setManualDateStr] = useState(todayStr);

  // keep tag selection valid when list changes
  useEffect(() => {
    const allTags = mergedTags.length ? mergedTags : DEFAULT_TAGS;
    if (!allTags.includes(selectedTag)) {
      setSelectedTag(allTags[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mergedTags.join(',')]);

  // hydrate active timer
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(ACTIVE_KEY);
      if (raw) {
        const parsed: ActiveSession = JSON.parse(raw);
        setActiveSession(parsed);
        setElapsedMs(computeElapsedMs(parsed));
        setTaskName(parsed.task || '');
        setSelectedTag(parsed.category || mergedTags[0] || DEFAULT_TAGS[0]);
        if (parsed.plannedMinutes != null) {
          setPlannedMinutes(parsed.plannedMinutes);
        }
      }
    } catch (e) {
      console.error('Failed to load active timer', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // persist active timer
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!activeSession) {
      window.localStorage.removeItem(ACTIVE_KEY);
      return;
    }
    window.localStorage.setItem(ACTIVE_KEY, JSON.stringify(activeSession));
  }, [activeSession]);

  // ticking
  useEffect(() => {
    if (!activeSession || activeSession.isPaused) {
      setElapsedMs(computeElapsedMs(activeSession));
      return;
    }
    setElapsedMs(computeElapsedMs(activeSession));
    const id = window.setInterval(() => {
      setElapsedMs(computeElapsedMs(activeSession));
    }, 1000);
    return () => window.clearInterval(id);
  }, [activeSession]);

  const handleStartTimer = () => {
    if (!taskName.trim()) return;
    const nowIso = new Date().toISOString();

    if (activeSession && activeSession.isPaused) {
      setActiveSession({
        ...activeSession,
        isPaused: false,
        lastStartedAt: nowIso,
        task: taskName.trim(),
        category: selectedTag,
        plannedMinutes,
      });
      return;
    }

    const newActive: ActiveSession = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      task: taskName.trim(),
      category: selectedTag,
      startedAt: nowIso,
      accumulatedMs: 0,
      plannedMinutes,
      isPaused: false,
      lastStartedAt: nowIso,
    };
    setActiveSession(newActive);
    setElapsedMs(0);
  };

  const handlePauseTimer = () => {
    if (!activeSession || activeSession.isPaused) return;
    const nowAccum = computeElapsedMs(activeSession);
    setActiveSession({
      ...activeSession,
      isPaused: true,
      accumulatedMs: nowAccum,
      lastStartedAt: null,
      task: taskName.trim(),
      category: selectedTag,
      plannedMinutes,
    });
    setElapsedMs(nowAccum);
  };

  const handleCancelTimer = () => {
    setActiveSession(null);
    setElapsedMs(0);
  };

  const handleFinishTimer = async () => {
    if (!activeSession) return;
    const finalMs = computeElapsedMs(activeSession);
    const end = new Date();
    const dateKey = format(end, 'yyyy-MM-dd');

    const payload = {
      mode: 'timer',
      task: (taskName || activeSession.task || 'Untitled').trim(),
      category: selectedTag || activeSession.category || 'Other',
      start: activeSession.startedAt,
      end: end.toISOString(),
      durationMs: finalMs,
      plannedMinutes: plannedMinutes || activeSession.plannedMinutes || null,
      dateKey,
    };

    await fetch('/api/time-tracker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    setActiveSession(null);
    setElapsedMs(0);
    mutateDay();
    setSheetOpen(false);
  };

  const handleCreateTag = async (name: string) => {
    await fetch('/api/time-tracker/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    await mutateTags();
  };

  const handleSaveManual = async () => {
    if (!taskName.trim() || !manualMinutes) return;

    await fetch('/api/time-tracker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'manual',
        task: taskName.trim(),
        category: selectedTag,
        durationMinutes: manualMinutes,
        dateKey: manualDateStr,
        plannedMinutes: plannedMinutes || null,
      }),
    });

    mutateDay();
    setSheetOpen(false);
    setTaskName('');
  };

  const allTags = mergedTags.length ? mergedTags : DEFAULT_TAGS;

  const hasActive = !!activeSession;
  const isRunning = !!activeSession && !activeSession.isPaused;

  return (
    <main className="min-h-screen px-4 py-6 bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 sm:px-6">
      <div className="flex flex-col items-center max-w-xl gap-6 mx-auto">
        {/* frog */}
        <div className="relative">
          <Frog
            ref={frogRef}
            mouthOpen={isRunning}
            mouthOffset={{ y: -4 }}
            indices={indices}
          />
          <button
            onClick={() => setOpenWardrobe(true)}
            className="absolute p-2 rounded-full shadow-sm right-1 top-1 bg-white/90 text-slate-500 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            title="Wardrobe"
          >
            <span className="text-xs">👕</span>
          </button>
        </div>
        <WardrobePanel open={openWardrobe} onOpenChange={setOpenWardrobe} />

        {/* summary card */}
        <div className="w-full rounded-3xl bg-white/90 p-5 shadow-[0_18px_48px_rgba(15,23,42,.15)] ring-1 ring-slate-200 dark:bg-slate-900/95 dark:ring-slate-700">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium tracking-wide uppercase text-slate-500 dark:text-slate-400">
                Focus time today
              </p>
              <p className="mt-1 text-3xl font-semibold text-slate-900 dark:text-white">
                {formatDuration(totalMsForDay || 0)}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {sessionsForDay.length} session
                {sessionsForDay.length === 1 ? '' : 's'}
              </p>
            </div>
            <Clock3 className="h-9 w-9 text-slate-900/60 dark:text-slate-100/70" />
          </div>

          {hasActive && (
            <div className="flex items-center justify-between px-3 py-2 mt-3 text-xs rounded-2xl bg-slate-900 text-slate-100 dark:bg-black">
              <div className="truncate">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">
                  Active
                </p>
                <p className="text-sm font-medium truncate">
                  {activeSession.task || 'Untitled'} · {formatTimer(elapsedMs)}
                </p>
              </div>
              <button
                onClick={() => {
                  setSheetMode('timer');
                  setSheetOpen(true);
                }}
                className="inline-flex items-center px-3 py-1 ml-3 text-xs font-medium rounded-full bg-slate-100/10 text-slate-100 hover:bg-slate-100/20"
              >
                Open timer
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(15,23,42,.5)] hover:bg-black dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            <Plus className="w-4 h-4" />
            Log time
          </button>
        </div>

        {/* log list */}
        <div className="w-full space-y-3">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Today&apos;s log
          </h2>

          {sessionsForDay.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No sessions logged yet. Start the timer or add a past session.
            </p>
          ) : (
            sessionsForDay
              .slice()
              .sort(
                (a, b) =>
                  new Date(a.start).getTime() - new Date(b.start).getTime()
              )
              .map((s) => {
                const start = new Date(s.start);
                const end = new Date(s.end);
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-white/90 px-3 py-2.5 text-sm text-slate-800 shadow-[0_10px_26px_rgba(15,23,42,.08)] ring-1 ring-slate-200/80 dark:bg-slate-900/95 dark:text-slate-50 dark:ring-slate-700/80"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {s.task || 'Untitled session'}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {format(start, 'HH:mm')} – {format(end, 'HH:mm')} ·{' '}
                        {formatDuration(s.durationMs)}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-100">
                      {s.category || 'Other'}
                    </span>
                  </div>
                );
              })
          )}
        </div>
      </div>

      {/* bottom sheet */}
      <LogTimeSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        mode={sheetMode}
        setMode={setSheetMode}
        tags={allTags}
        selectedTag={selectedTag}
        setSelectedTag={setSelectedTag}
        onCreateTag={handleCreateTag}
        taskName={taskName}
        setTaskName={setTaskName}
        activeSession={activeSession}
        elapsedMs={elapsedMs}
        plannedMinutes={plannedMinutes}
        setPlannedMinutes={setPlannedMinutes}
        onStartTimer={handleStartTimer}
        onPauseTimer={handlePauseTimer}
        onFinishTimer={handleFinishTimer}
        onCancelTimer={handleCancelTimer}
        manualMinutes={manualMinutes}
        setManualMinutes={setManualMinutes}
        manualDateStr={manualDateStr}
        setManualDateStr={setManualDateStr}
        todayStr={todayStr}
        onSaveManual={handleSaveManual}
      />
    </main>
  );
}
