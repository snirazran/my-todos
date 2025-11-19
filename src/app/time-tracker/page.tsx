// src/app/time-tracker/page.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { format, addDays } from 'date-fns';
import {
  Calendar,
  Clock3,
  Timer as TimerIcon,
  FolderPlus,
  Shirt,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';
import { byId } from '@/lib/skins/catalog';
import Frog, { FrogHandle } from '@/components/ui/frog';
import { WardrobePanel } from '@/components/ui/skins/WardrobePanel';

const ACTIVE_KEY = 'frog-time-tracker-active-v1';

const DEFAULT_CATEGORIES = [
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
  category: string;
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

// duration formatting
function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
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

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function TimeTrackerPage() {
  const { data: session } = useSession();

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const { data: dayData, mutate: mutateDay } = useSWR(
    session ? `/api/time-tracker?date=${selectedDateStr}` : null,
    fetcher
  );
  const { data: categoryData, mutate: mutateCategories } = useSWR(
    session ? '/api/time-tracker/categories' : null,
    fetcher
  );

  const userCategories: string[] = categoryData?.categories ?? [];
  const mergedCategories = Array.from(
    new Set([...DEFAULT_CATEGORIES, ...userCategories])
  );

  const sessionsForDay: StoredSession[] = dayData?.sessions ?? [];
  const totalMsForDay: number =
    typeof dayData?.totalMs === 'number'
      ? dayData.totalMs
      : sessionsForDay.reduce((sum, s) => sum + (s.durationMs || 0), 0);

  // active timer state (local only)
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(
    null
  );
  const [elapsedMs, setElapsedMs] = useState<number>(0);

  // inputs
  const [taskName, setTaskName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(
    mergedCategories[0]
  );
  const [plannedMinutes, setPlannedMinutes] = useState<number>(60);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [manualMinutes, setManualMinutes] = useState<number>(30);
  const [manualDateStr, setManualDateStr] = useState<string>(selectedDateStr);

  // keep manual date in sync with selected date
  useEffect(() => {
    setManualDateStr(selectedDateStr);
  }, [selectedDateStr]);

  // Frog & wardrobe
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

  // hydrate active session from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(ACTIVE_KEY);
      if (raw) {
        const parsed: ActiveSession = JSON.parse(raw);
        setActiveSession(parsed);
        setElapsedMs(computeElapsedMs(parsed));
        setTaskName(parsed.task || '');
        setSelectedCategory(parsed.category || mergedCategories[0]);
        if (parsed.plannedMinutes != null) {
          setPlannedMinutes(parsed.plannedMinutes);
        }
      }
    } catch (e) {
      console.error('Failed to load active timer', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // persist activeSession to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!activeSession) {
      window.localStorage.removeItem(ACTIVE_KEY);
      return;
    }
    window.localStorage.setItem(ACTIVE_KEY, JSON.stringify(activeSession));
  }, [activeSession]);

  // recompute elapsed when activeSession changes / ticks
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

  const remainingMs =
    plannedMinutes > 0 ? plannedMinutes * 60_000 - elapsedMs : 0;
  const plannedProgress =
    plannedMinutes > 0
      ? Math.min(1, Math.max(0, elapsedMs / (plannedMinutes * 60_000)))
      : 0;

  const canGoNext = selectedDateStr < todayStr;

  // ───────────── actions ─────────────

  const handleStart = () => {
    if (!taskName.trim()) return;
    const nowIso = new Date().toISOString();

    if (activeSession && activeSession.isPaused) {
      setActiveSession({
        ...activeSession,
        isPaused: false,
        lastStartedAt: nowIso,
        task: taskName.trim(),
        category: selectedCategory,
        plannedMinutes,
      });
      return;
    }

    const newActive: ActiveSession = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      task: taskName.trim(),
      category: selectedCategory,
      startedAt: nowIso,
      accumulatedMs: 0,
      plannedMinutes,
      isPaused: false,
      lastStartedAt: nowIso,
    };
    setActiveSession(newActive);
    setElapsedMs(0);
  };

  const handlePause = () => {
    if (!activeSession || activeSession.isPaused) return;
    const nowAccum = computeElapsedMs(activeSession);
    setActiveSession({
      ...activeSession,
      isPaused: true,
      accumulatedMs: nowAccum,
      lastStartedAt: null,
      task: taskName.trim(),
      category: selectedCategory,
      plannedMinutes,
    });
    setElapsedMs(nowAccum);
  };

  const handleCancel = () => {
    setActiveSession(null);
    setElapsedMs(0);
  };

  const handleFinish = async () => {
    if (!activeSession || !session) return;
    const finalMs = computeElapsedMs(activeSession);
    const end = new Date();
    const dateKey = format(end, 'yyyy-MM-dd');

    const payload = {
      mode: 'timer',
      task: (taskName || activeSession.task || 'Untitled').trim(),
      category: selectedCategory || activeSession.category || 'Other',
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
  };

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name || !session) return;

    await fetch('/api/time-tracker/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    setNewCategoryName('');
    mutateCategories();
  };

  const handleManualLog = async () => {
    if (!session) return;
    if (!taskName.trim()) return;
    if (!manualMinutes || manualMinutes <= 0) return;

    await fetch('/api/time-tracker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'manual',
        task: taskName.trim(),
        category: selectedCategory,
        durationMinutes: manualMinutes,
        dateKey: manualDateStr,
        plannedMinutes: plannedMinutes || null,
      }),
    });

    mutateDay();
  };

  const goPrevDay = () => {
    setSelectedDate((d) => addDays(d, -1));
  };

  const goNextDay = () => {
    setSelectedDate((d) => {
      const next = addDays(d, 1);
      const nextStr = format(next, 'yyyy-MM-dd');
      if (nextStr > todayStr) return d;
      return next;
    });
  };

  // Unauthorized / not logged in: show friendly gate
  if (!session) {
    return (
      <main className="min-h-screen p-4 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 md:p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 dark:text-white md:text-5xl">
              Time tracker
            </h1>
            <p className="mt-2 text-lg text-slate-600 dark:text-slate-400">
              Please sign in to track your time and sync it across devices.
            </p>
          </div>
          <a
            href="/login"
            className="inline-flex items-center gap-2 px-6 py-3 font-medium transition bg-white shadow-md rounded-xl text-slate-700 hover:shadow-lg dark:bg-slate-800 dark:text-slate-200"
          >
            Go to login
          </a>
        </div>
      </main>
    );
  }

  const categoriesToUse = mergedCategories.length
    ? mergedCategories
    : DEFAULT_CATEGORIES;

  // make sure selectedCategory is always valid
  useEffect(() => {
    if (!categoriesToUse.includes(selectedCategory)) {
      setSelectedCategory(categoriesToUse[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriesToUse.join(',')]);

  return (
    <main className="min-h-screen p-4 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col gap-4 mb-8 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 dark:text-white md:text-5xl">
              Time tracker
            </h1>
            <p className="flex items-center gap-2 text-lg text-slate-600 dark:text-slate-400">
              <Calendar className="w-5 h-5" />
              {format(new Date(), 'EEEE, MMMM d, yyyy')}
            </p>
          </div>

          <div className="flex self-start gap-2 md:self-auto">
            <a
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 font-medium transition bg-white shadow-md rounded-xl text-slate-700 hover:shadow-lg dark:bg-slate-800 dark:text-slate-200"
            >
              ← Back to tasks
            </a>
          </div>
        </div>

        {/* Frog + wardrobe */}
        <div className="flex flex-col items-center w-full">
          <div className="relative z-10">
            <Frog
              ref={frogRef}
              mouthOpen={!!activeSession && !activeSession.isPaused}
              mouthOffset={{ y: -4 }}
              indices={indices}
            />
            <button
              onClick={() => setOpenWardrobe(true)}
              className="absolute p-2 rounded-full shadow right-2 top-2 bg-white/80 hover:shadow-md dark:bg-slate-800"
              title="Wardrobe"
            >
              <Shirt className="w-5 h-5" />
            </button>
          </div>
          <WardrobePanel open={openWardrobe} onOpenChange={setOpenWardrobe} />
        </div>

        {/* Summary card */}
        <div className="mt-4 mb-6">
          <div className="relative z-0 w-full">
            <div className="flex items-center justify-between gap-4 p-5 bg-white shadow-lg rounded-2xl dark:bg-slate-800">
              <div>
                <p className="text-sm tracking-wide uppercase text-slate-500 dark:text-slate-400">
                  Focus time today
                </p>
                <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
                  {formatDuration(totalMsForDay || 0)}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {sessionsForDay.length} session
                  {sessionsForDay.length === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Clock3 className="w-9 h-9 text-violet-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Main: timer + log */}
        <div className="grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          {/* Timer card */}
          <section className="p-6 bg-white shadow-lg rounded-2xl dark:bg-slate-800">
            <div className="flex items-center gap-2 mb-4">
              <TimerIcon className="w-5 h-5 text-violet-500" />
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                Current session
              </h2>
            </div>

            {/* Task name */}
            <div className="mb-4 space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                What are you working on?
              </label>
              <input
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                placeholder="e.g. Deep work, writing, sketching…"
                className="w-full px-3 py-2 text-base bg-white border rounded-lg border-slate-200 dark:border-slate-600 dark:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-violet-500/60"
              />
            </div>

            {/* Category + add category */}
            <div className="grid items-end gap-3 mb-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Category
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-white border rounded-lg border-slate-200 dark:border-slate-600 dark:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-violet-500/60"
                >
                  {categoriesToUse.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="flex items-center gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                  Add category
                  <FolderPlus className="w-4 h-4 text-slate-500" />
                </label>
                <div className="flex gap-2">
                  <input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="e.g. Studio, Standup, Coding"
                    className="flex-1 px-3 py-2 bg-white border rounded-lg border-slate-200 dark:border-slate-600 dark:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-violet-500/60"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCategory();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddCategory}
                    className="px-3 py-2 text-sm font-medium text-white rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50"
                    disabled={!newCategoryName.trim()}
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            {/* Planned duration */}
            <div className="mb-5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Planned duration (minutes)
                </label>
                <div className="flex gap-1 text-xs text-slate-500 dark:text-slate-400">
                  {[25, 50, 60].map((val) => (
                    <button
                      key={val}
                      type="button"
                      className="px-2 py-1 border rounded-full border-slate-300 text-slate-700 dark:text-slate-200 dark:border-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                      onClick={() => setPlannedMinutes(val)}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={600}
                  value={plannedMinutes}
                  onChange={(e) =>
                    setPlannedMinutes(
                      e.target.value ? Math.max(1, Number(e.target.value)) : 0
                    )
                  }
                  className="px-3 py-2 bg-white border rounded-lg w-28 border-slate-200 dark:border-slate-600 dark:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-violet-500/60"
                />
                {plannedMinutes > 0 && (
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    Target ~{plannedMinutes} minutes
                  </span>
                )}
              </div>

              {plannedMinutes > 0 && (
                <div className="mt-2">
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-500"
                      style={{ width: `${plannedProgress * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1 text-xs text-slate-500 dark:text-slate-400">
                    <span>0</span>
                    <span>{plannedMinutes} min</span>
                  </div>
                </div>
              )}
            </div>

            {/* Big timer */}
            <div className="flex flex-col items-center mb-4">
              <div className="px-6 py-4 mb-2 font-mono text-4xl font-semibold tracking-tight rounded-2xl bg-slate-900 text-slate-50 dark:bg-slate-950">
                {formatTimer(elapsedMs)}
              </div>
              {plannedMinutes > 0 && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {remainingMs > 0
                    ? `~${formatDuration(remainingMs)} remaining`
                    : `Over plan by ${formatDuration(Math.abs(remainingMs))}`}
                </p>
              )}
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
              {!activeSession || activeSession.isPaused ? (
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={!taskName.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-xl shadow-sm bg-violet-600 hover:bg-violet-700 disabled:opacity-60"
                >
                  <TimerIcon className="w-4 h-4" />
                  {activeSession ? 'Resume' : 'Start session'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handlePause}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl shadow-sm bg-slate-200 text-slate-900 hover:bg-slate-300 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
                >
                  Pause
                </button>
              )}

              <button
                type="button"
                onClick={handleFinish}
                disabled={!activeSession}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl shadow-sm bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-60"
              >
                Save session
              </button>

              <button
                type="button"
                onClick={handleCancel}
                disabled={!activeSession}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl border border-rose-300 text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/40 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>

            {/* Manual / quick log */}
            <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-700">
              <h3 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                Log time without timer
              </h3>
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                For sessions you already did, enter duration and date and save
                directly.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-200">
                    Date
                  </label>
                  <input
                    type="date"
                    value={manualDateStr}
                    max={todayStr}
                    onChange={(e) =>
                      e.target.value && setManualDateStr(e.target.value)
                    }
                    className="px-3 py-1.5 text-sm bg-white border rounded-full border-slate-200 dark:border-slate-700 dark:bg-slate-900/60 text-slate-700 dark:text-slate-100"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-200">
                    Duration (minutes)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={600}
                    value={manualMinutes}
                    onChange={(e) =>
                      setManualMinutes(
                        e.target.value ? Math.max(1, Number(e.target.value)) : 0
                      )
                    }
                    className="w-28 px-3 py-1.5 bg-white border rounded-full border-slate-200 dark:border-slate-700 dark:bg-slate-900/60 text-sm"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleManualLog}
                  disabled={!taskName.trim() || !manualMinutes}
                  className="px-4 py-2 text-sm font-semibold text-white rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200 disabled:opacity-60"
                >
                  Save manual log
                </button>
              </div>
            </div>
          </section>

          {/* Logs card */}
          <section className="p-6 bg-white shadow-lg rounded-2xl dark:bg-slate-800">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                  Time log
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Default: today. Navigate to previous days as needed.
                </p>
              </div>
            </div>

            {/* Date controls */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="inline-flex overflow-hidden text-sm border rounded-full bg-slate-100/70 border-slate-200 dark:bg-slate-900/40 dark:border-slate-700">
                <button
                  type="button"
                  onClick={goPrevDay}
                  className="px-3 py-1.5 hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  ←
                </button>
                <span className="px-4 py-1.5 text-slate-800 dark:text-slate-100 whitespace-nowrap">
                  {selectedDateStr === todayStr
                    ? 'Today'
                    : format(selectedDate, 'EEEE, MMM d')}
                </span>
                <button
                  type="button"
                  onClick={goNextDay}
                  disabled={!canGoNext}
                  className="px-3 py-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40"
                >
                  →
                </button>
              </div>

              <input
                type="date"
                value={selectedDateStr}
                max={todayStr}
                onChange={(e) =>
                  e.target.value && setSelectedDate(new Date(e.target.value))
                }
                className="px-3 py-1.5 text-sm bg-white border rounded-full border-slate-200 dark:border-slate-700 dark:bg-slate-900/60 text-slate-700 dark:text-slate-100"
              />
            </div>

            {/* List of sessions */}
            {sessionsForDay.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                No sessions logged for this day yet.
              </p>
            ) : (
              <div className="space-y-3">
                {sessionsForDay
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
                        className="flex items-start justify-between gap-3 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900/50"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-50">
                            {s.task || 'Untitled session'}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {format(start, 'HH:mm')} – {format(end, 'HH:mm')} ·{' '}
                            {formatDuration(s.durationMs)}
                          </p>
                        </div>
                        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-200">
                          {s.category || 'Other'}
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
