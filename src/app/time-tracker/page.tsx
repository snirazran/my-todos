'use client';

import React, { useEffect, useRef, useState } from 'react';
import { format, addDays } from 'date-fns';
import { Calendar, Clock3, Timer as TimerIcon, Shirt } from 'lucide-react';
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

  // active timer state
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

  // recompute elapsed
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

  if (!session) {
    return (
      <main className="min-h-screen p-4 bg-slate-50 md:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 md:text-5xl">
              Time tracker
            </h1>
            <p className="mt-2 text-lg text-slate-600">
              Please sign in to track your time and sync it across devices.
            </p>
          </div>
          <a
            href="/login"
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-slate-900 bg-white border border-slate-200 rounded-2xl shadow-sm hover:bg-slate-100"
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

  useEffect(() => {
    if (!categoriesToUse.includes(selectedCategory)) {
      setSelectedCategory(categoriesToUse[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriesToUse.join(',')]);

  return (
    <main className="min-h-screen p-4 bg-slate-50 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold text-slate-900">
              {format(new Date(), 'EEEE')}
            </h1>
            <p className="flex items-center gap-2 mt-1 text-sm text-slate-500">
              <Calendar className="w-4 h-4" />
              {format(new Date(), 'MMMM d, yyyy')}
            </p>
          </div>
          <a
            href="/"
            className="inline-flex items-center px-4 py-2 text-sm font-medium bg-white border rounded-full shadow-sm text-slate-900 border-slate-200 hover:bg-slate-100"
          >
            ← Back to tasks
          </a>
        </div>

        {/* Frog */}
        <div className="flex flex-col items-center">
          <div className="relative">
            <Frog
              ref={frogRef}
              mouthOpen={!!activeSession && !activeSession.isPaused}
              mouthOffset={{ y: -4 }}
              indices={indices}
            />
            <button
              onClick={() => setOpenWardrobe(true)}
              className="absolute p-1.5 rounded-full shadow-sm right-2 top-2 bg-white/90 hover:bg-slate-100"
              title="Wardrobe"
            >
              <Shirt className="w-4 h-4 text-slate-600" />
            </button>
          </div>
          <WardrobePanel open={openWardrobe} onOpenChange={setOpenWardrobe} />
        </div>

        {/* Summary */}
        <div className="mt-4 mb-6">
          <div className="flex items-center justify-between w-full px-5 py-4 bg-white border shadow-sm border-slate-200 rounded-2xl">
            <div>
              <p className="text-xs font-medium tracking-wide uppercase text-slate-500">
                Focus time today
              </p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                {formatDuration(totalMsForDay || 0)}
              </p>
              <p className="text-xs text-slate-500">
                {sessionsForDay.length} session
                {sessionsForDay.length === 1 ? '' : 's'}
              </p>
            </div>
            <Clock3 className="w-8 h-8 text-violet-500" />
          </div>
        </div>

        {/* Main layout */}
        <div className="grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          {/* Timer */}
          <section className="p-5 bg-white border shadow-sm border-slate-200 rounded-2xl">
            {/* Task */}
            <div className="mb-4">
              <input
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                placeholder="What are you working on?"
                className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              />
            </div>

            {/* Category + add */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-2 text-sm bg-white border rounded-full border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              >
                {categoriesToUse.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>New:</span>
                <div className="flex items-center gap-1">
                  <input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Category"
                    className="px-2 py-1 text-xs border rounded-full bg-slate-50 border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
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
                    disabled={!newCategoryName.trim()}
                    className="px-2 py-1 text-xs font-medium rounded-full text-slate-900 bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            {/* Planned duration */}
            <div className="mb-5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-700">
                  Planned minutes
                </span>
                <div className="flex gap-1 text-xs">
                  {[25, 50, 60].map((val) => (
                    <button
                      key={val}
                      type="button"
                      className="px-2 py-1 border rounded-full border-slate-200 text-slate-700 hover:bg-slate-100"
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
                  className="w-24 px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
                {plannedMinutes > 0 && (
                  <span className="text-xs text-slate-500">
                    Target ~{plannedMinutes} min
                  </span>
                )}
              </div>

              {plannedMinutes > 0 && (
                <div className="mt-2">
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-slate-900"
                      style={{ width: `${plannedProgress * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Timer display */}
            <div className="flex flex-col items-center mb-5">
              <div className="px-6 py-3 mb-1 font-mono text-4xl font-semibold tracking-tight text-slate-900 rounded-2xl bg-slate-900/5">
                {formatTimer(elapsedMs)}
              </div>
              {plannedMinutes > 0 && (
                <p className="text-xs text-slate-500">
                  {remainingMs > 0
                    ? `~${formatDuration(remainingMs)} remaining`
                    : `Over plan by ${formatDuration(Math.abs(remainingMs))}`}
                </p>
              )}
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center justify-center gap-3 mb-5">
              {!activeSession || activeSession.isPaused ? (
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={!taskName.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-full shadow-sm bg-slate-900 hover:bg-slate-800 disabled:opacity-50"
                >
                  <TimerIcon className="w-4 h-4" />
                  {activeSession ? 'Resume' : 'Start'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handlePause}
                  className="inline-flex items-center px-5 py-2.5 text-sm font-semibold text-slate-900 bg-slate-100 rounded-full hover:bg-slate-200"
                >
                  Pause
                </button>
              )}

              <button
                type="button"
                onClick={handleFinish}
                disabled={!activeSession}
                className="px-4 py-2.5 text-sm font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded-full hover:bg-slate-100 disabled:opacity-40"
              >
                Save
              </button>

              <button
                type="button"
                onClick={handleCancel}
                disabled={!activeSession}
                className="px-3 py-2.5 text-sm text-slate-500 rounded-full hover:bg-slate-100 disabled:opacity-40"
              >
                Cancel
              </button>
            </div>

            {/* Manual log (compact) */}
            <div className="pt-3 mt-3 border-t border-slate-100">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="font-medium text-slate-700">
                  Log without timer
                </span>

                <input
                  type="date"
                  value={manualDateStr}
                  max={todayStr}
                  onChange={(e) =>
                    e.target.value && setManualDateStr(e.target.value)
                  }
                  className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-full"
                />

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
                  className="w-24 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-full"
                  placeholder="Minutes"
                />

                <button
                  type="button"
                  onClick={handleManualLog}
                  disabled={!taskName.trim() || !manualMinutes}
                  className="px-3 py-1.5 text-xs font-semibold text-white rounded-full bg-slate-900 hover:bg-slate-800 disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            </div>
          </section>

          {/* Time log */}
          <section className="p-5 bg-white border shadow-sm border-slate-200 rounded-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Time log</h2>
            </div>

            {/* Date controls */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="inline-flex items-center overflow-hidden text-xs border rounded-full bg-slate-50 border-slate-200">
                <button
                  type="button"
                  onClick={goPrevDay}
                  className="px-3 py-1.5 hover:bg-slate-100"
                >
                  ←
                </button>
                <span className="px-4 py-1.5 text-slate-800 whitespace-nowrap">
                  {selectedDateStr === todayStr
                    ? 'Today'
                    : format(selectedDate, 'EEE, MMM d')}
                </span>
                <button
                  type="button"
                  onClick={goNextDay}
                  disabled={!canGoNext}
                  className="px-3 py-1.5 hover:bg-slate-100 disabled:opacity-30"
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
                className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-full text-slate-700"
              />
            </div>

            {/* List */}
            {sessionsForDay.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                No sessions logged for this day.
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
                        className="flex items-start justify-between gap-3 px-3 py-2 rounded-xl bg-slate-50"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {s.task || 'Untitled session'}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {format(start, 'HH:mm')} – {format(end, 'HH:mm')} ·{' '}
                            {formatDuration(s.durationMs)}
                          </p>
                        </div>
                        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-slate-900/5 text-slate-900">
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
