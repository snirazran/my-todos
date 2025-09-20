'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  apiDayFromDisplay,
  todayDisplayIndex,
} from '@/components/board/helpers';
import {
  RotateCcw,
  CalendarCheck,
  CalendarDays,
  Sun,
  Plus,
  X,
  Info,
} from 'lucide-react';

type RepeatChoice = 'this-week' | 'weekly';
type WhenChoice = 'today' | 'pick' | 'later';

type Props = Readonly<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (data: {
    text: string;
    days: number[];
    repeat: RepeatChoice;
  }) => Promise<void> | void;
  initialText?: string;
  defaultRepeat?: RepeatChoice;
}>;

export default function QuickAddSheet({
  open,
  onOpenChange,
  onSubmit,
  initialText = '',
  defaultRepeat = 'this-week',
}: Props) {
  const [text, setText] = useState(initialText);
  const [repeat, setRepeat] = useState<RepeatChoice>(defaultRepeat);
  const [when, setWhen] = useState<WhenChoice>('today');
  const [pickedDays, setPickedDays] = useState<number[]>([]); // display indices 0..6

  useEffect(() => {
    if (open) {
      setText(initialText);
      setRepeat(defaultRepeat);
      setWhen('today');
      setPickedDays([]);
    }
  }, [open, initialText, defaultRepeat]);

  const disabled = !text.trim();
  const dayLabels = useMemo(
    () => ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    []
  );

  const toggleDay = (d: number) =>
    setPickedDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );

  const handleSubmit = async () => {
    if (disabled) return;

    const displayDays =
      when === 'today'
        ? [todayDisplayIndex()]
        : when === 'later'
        ? [7] // “Later this week” bucket
        : pickedDays.slice().sort((a, b) => a - b);

    if (displayDays.length === 0) return;

    const apiDays = displayDays.map(apiDayFromDisplay);
    await onSubmit({ text: text.trim(), days: apiDays, repeat });
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[70] px-4 py-6 sm:px-6 sm:py-5 pointer-events-none">
      <div className="pointer-events-auto mx-auto w-full max-w-[820px] pb-[env(safe-area-inset-bottom)]">
        <div className="rounded-[28px] bg-white/75 dark:bg-white/8 backdrop-blur-2xl ring-1 ring-black/10 dark:ring-white/10 shadow-[0_8px_32px_rgba(0,0,0,.18)] p-3">
          {/* Input */}
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="New task…"
            className="w-full h-11 px-3 mb-3 rounded-[14px] bg-white/90 dark:bg-white/10 text-emerald-900 dark:text-emerald-50 ring-1 ring-black/10 dark:ring-white/10 shadow-[0_1px_0_rgba(255,255,255,.7)_inset] focus:outline-none focus:ring-2 focus:ring-lime-300"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
              if (e.key === 'Escape') onOpenChange(false);
            }}
            inputMode="text"
            autoFocus
          />

          {/* When chooser — grid on mobile, flex on sm+ */}
          <div className="grid items-center grid-cols-3 gap-2 sm:flex sm:flex-wrap">
            <button
              type="button"
              onClick={() => setWhen('today')}
              aria-pressed={when === 'today'}
              className={[
                'h-9 px-3 rounded-full text-[13px] font-medium inline-flex items-center gap-1.5 ring-1 transition',
                'w-full sm:w-auto',
                when === 'today'
                  ? 'bg-white shadow-sm ring-black/10 dark:bg-white/10 dark:ring-white/10'
                  : 'bg-transparent ring-black/10 dark:ring-white/10 text-emerald-900/85 dark:text-emerald-100/85',
              ].join(' ')}
              title="Add to today"
            >
              <Sun className="w-4 h-4" />
              Today
            </button>

            <button
              type="button"
              onClick={() => setWhen('pick')}
              aria-pressed={when === 'pick'}
              className={[
                'h-9 px-3 rounded-full text-[13px] font-medium inline-flex items-center gap-1.5 ring-1 transition',
                'w-full sm:w-auto',
                when === 'pick'
                  ? 'bg-white shadow-sm ring-black/10 dark:bg-white/10 dark:ring-white/10'
                  : 'bg-transparent ring-black/10 dark:ring-white/10 text-emerald-900/85 dark:text-emerald-100/85',
              ].join(' ')}
              title="Pick specific day(s)"
            >
              <CalendarDays className="w-4 h-4" />
              Pick day
            </button>

            <button
              type="button"
              onClick={() => {
                setWhen('later');
                setPickedDays([]);
              }}
              aria-pressed={when === 'later'}
              className={[
                'h-9 px-3 rounded-full text-[13px] font-medium inline-flex items-center gap-1.5 ring-1 transition',
                'w-full sm:w-auto',
                when === 'later'
                  ? 'bg-white shadow-sm ring-black/10 dark:bg-white/10 dark:ring-white/10'
                  : 'bg-transparent ring-black/10 dark:ring-white/10 text-emerald-900/85 dark:text-emerald-100/85',
              ].join(' ')}
              title="Save to Later this week"
            >
              <CalendarCheck className="w-4 h-4" />
              Later this week
            </button>

            {/* Repeat toggle — full width under chips on mobile; right-aligned on sm+ */}
            <button
              type="button"
              onClick={() =>
                setRepeat((r) => (r === 'weekly' ? 'this-week' : 'weekly'))
              }
              aria-pressed={repeat === 'weekly'}
              className={[
                'h-9 px-3 rounded-full text-[13px] font-medium inline-flex items-center gap-1.5 ring-1 transition justify-center',
                'col-span-3 w-full sm:col-auto sm:w-auto sm:ml-auto',
                repeat === 'weekly'
                  ? 'bg-white shadow-sm ring-black/10 dark:bg-white/10 dark:ring-white/10'
                  : 'bg-transparent ring-black/10 dark:ring-white/10 text-emerald-900/85 dark:text-emerald-100/85',
              ].join(' ')}
              title="Toggle weekly repeat"
            >
              <RotateCcw className="w-4 h-4" />
              {repeat === 'weekly' ? 'Repeats' : 'One-time'}
            </button>
          </div>

          {/* Pick-day chips */}
          {when === 'pick' && (
            <div className="grid grid-cols-7 gap-1 mt-2">
              {dayLabels.map((label, d) => {
                const on = pickedDays.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    title={label}
                    className={[
                      'h-8 rounded-md text-sm font-medium ring-1 transition-colors',
                      on
                        ? 'bg-emerald-500 text-white ring-emerald-600/40'
                        : 'bg-white/70 dark:bg-white/10 text-emerald-900 dark:text-emerald-50 ring-black/10 dark:ring-white/10',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Later hint */}
          {when === 'later' && (
            <div className="mt-2 flex items-start gap-2 rounded-xl bg-emerald-50/70 dark:bg-emerald-900/30 ring-1 ring-emerald-700/15 p-2.5 text-[13px] text-emerald-900/90 dark:text-emerald-100/90">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Saved to <span className="font-medium">Later this week</span>{' '}
                under your daily list. Add it to a day whenever you’re ready.
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button
              type="button"
              disabled={disabled}
              onClick={handleSubmit}
              className={[
                'h-11 rounded-full text-[15px] font-semibold',
                'bg-gradient-to-b from-emerald-500 to-emerald-600 text-white',
                'shadow-[0_10px_24px_rgba(16,185,129,.35)] ring-1 ring-emerald-700/30',
                'hover:brightness-105 active:scale-[0.995]',
                'disabled:opacity-60',
              ].join(' ')}
            >
              <span className="inline-flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" />
                Add
              </span>
            </button>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className={[
                'h-11 rounded-full text-[15px] font-medium',
                'bg-white/70 dark:bg-white/10 text-emerald-900 dark:text-emerald-50',
                'ring-1 ring-black/10 dark:ring-white/10',
                'hover:bg-white/85 dark:hover:bg-white/15 active:scale-[0.995]',
              ].join(' ')}
            >
              <span className="inline-flex items-center justify-center gap-2">
                <X className="w-4 h-4" />
                Cancel
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
