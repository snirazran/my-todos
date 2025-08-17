// src/components/ui/dialog/AddTaskModal.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  X,
  CalendarDays,
  CalendarRange,
  CalendarClock,
  RotateCcw,
} from 'lucide-react';

const dayNames = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export type RepeatMode = 'weekly' | 'this-week';
type WhenMode = 'today' | 'pick-days' | 'week-no-day';

function todayIdx() {
  return new Date().getDay();
}

export default function AddTaskModal({
  initialText = '',
  onClose,
  onSave,
  allowMultipleDays = true,
  defaultRepeat = 'this-week',
  initialDays = [],
}: {
  initialText?: string;
  onClose: () => void;
  onSave: (data: {
    text: string;
    days: number[];
    repeat: RepeatMode;
  }) => Promise<void> | void;
  allowMultipleDays?: boolean;
  defaultRepeat?: RepeatMode;
  /** pass [todayIndex] to pre-select today; pass [7] for “no day” (weekly backlog) */
  initialDays?: number[];
}) {
  // Derive initial "when" from initialDays
  const initMode: WhenMode = useMemo(() => {
    if (initialDays.includes(7)) return 'week-no-day';
    if (initialDays.some((d) => d >= 0 && d <= 6)) {
      return initialDays.length === 1 && initialDays[0] === todayIdx()
        ? 'today'
        : 'pick-days';
    }
    return 'today';
  }, [initialDays]);

  const [text, setText] = useState(initialText);
  const [repeat, setRepeat] = useState<RepeatMode>(defaultRepeat);
  const [when, setWhen] = useState<WhenMode>(initMode);

  // Selected days (for pick-days mode). We keep it independent from “when”
  const [picked, setPicked] = useState<number[]>(
    initMode === 'pick-days'
      ? initialDays.filter((d) => d >= 0 && d <= 6)
      : [todayIdx()]
  );

  // Close on Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Toggle a day chip
  const toggleDay = (d: number) => {
    setPicked((prev) => {
      if (!allowMultipleDays) return prev.includes(d) ? [] : [d];
      return prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d];
    });
  };

  // Effective days for saving based on “when”
  const effectiveDays = (() => {
    if (when === 'today') return [todayIdx()];
    if (when === 'week-no-day') return [7];
    return picked.slice().sort((a, b) => a - b);
  })();

  const canSave =
    text.trim().length > 0 &&
    ((when === 'today' && effectiveDays.length === 1) ||
      (when === 'week-no-day' && effectiveDays[0] === 7) ||
      (when === 'pick-days' && effectiveDays.some((d) => d >= 0 && d <= 6)));

  const primaryLabel =
    when === 'today'
      ? 'Add to today'
      : when === 'week-no-day'
      ? 'Add to this week'
      : 'Add task';

  const quick = {
    weekdays: () => setPicked([1, 2, 3, 4, 5]),
    weekend: () => setPicked([0, 6]),
    all: () => setPicked([0, 1, 2, 3, 4, 5, 6]),
    clear: () => setPicked([]),
  };

  const saveNow = async () => {
    if (!canSave) return;
    await onSave({ text: text.trim(), days: effectiveDays, repeat });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      dir="ltr"
    >
      <div
        className="relative w-[520px] max-w-[calc(100vw-2rem)] rounded-2xl bg-white p-6 shadow-lg dark:bg-slate-800"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          aria-label="Close"
          onClick={onClose}
          className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full p-2 bg-white dark:bg-slate-700 shadow-lg ring-1 ring-slate-200/70 dark:ring-slate-600 hover:scale-[1.04] transition"
        >
          <X className="w-4 h-4" />
        </button>

        <h3 className="mb-4 text-xl font-bold text-center text-slate-900 dark:text-white">
          New task
        </h3>

        {/* Text */}
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Task name"
          className="w-full px-3 py-2 mb-4 text-base border rounded-lg border-slate-300 focus:ring-2 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          onKeyDown={(e) => e.key === 'Enter' && saveNow()}
        />

        {/* When */}
        <div className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-300">
          When:
        </div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          <Seg
            icon={<CalendarDays className="w-4 h-4" />}
            active={when === 'today'}
            onClick={() => setWhen('today')}
          >
            Today
          </Seg>
          <Seg
            icon={<CalendarRange className="w-4 h-4" />}
            active={when === 'pick-days'}
            onClick={() => setWhen('pick-days')}
          >
            Pick days
          </Seg>
          <Seg
            icon={<CalendarClock className="w-4 h-4" />}
            active={when === 'week-no-day'}
            onClick={() => setWhen('week-no-day')}
          >
            Sometime this week
          </Seg>
        </div>

        {/* Day chips (only for pick-days) */}
        {when === 'pick-days' && (
          <div className="mb-4">
            <div className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              Pick day(s)
            </div>
            <div className="grid grid-cols-4 gap-2 mb-2 text-sm">
              {dayNames.map((label, i) => (
                <button
                  key={i}
                  onClick={() => toggleDay(i)}
                  className={`rounded-lg px-2 py-1 font-medium ${
                    picked.includes(i)
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Quick onClick={quick.weekdays}>Weekdays</Quick>
              <Quick onClick={quick.weekend}>Weekend</Quick>
              <Quick onClick={quick.all}>All</Quick>
              <Quick onClick={quick.clear}>
                <RotateCcw className="inline w-3 h-3 mr-1" /> Clear
              </Quick>
            </div>
          </div>
        )}

        {/* Repeat */}
        <div className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          Repeat:
        </div>
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setRepeat('this-week')}
            className={`rounded-lg px-3 py-1 ${
              repeat === 'this-week'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-200'
            }`}
          >
            This week only
          </button>
          <button
            onClick={() => setRepeat('weekly')}
            className={`rounded-lg px-3 py-1 ${
              repeat === 'weekly'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-200'
            }`}
          >
            Every week
          </button>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-base rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-600 dark:text-slate-200 dark:hover:bg-slate-500"
          >
            Cancel
          </button>
          <button
            disabled={!canSave}
            onClick={saveNow}
            className="px-4 py-2 text-base font-medium text-white rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50"
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ————— Small presentational helpers ————— */
function Seg({
  icon,
  active,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm',
        active
          ? 'border-violet-600 bg-violet-600 text-white'
          : 'border-transparent bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-200',
      ].join(' ')}
    >
      {icon}
      {children}
    </button>
  );
}

function Quick({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-1 rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
    >
      {children}
    </button>
  );
}
