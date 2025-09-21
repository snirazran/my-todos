'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  todayDisplayIndex,
  apiDayFromDisplay,
  labelForDisplayDay,
  type ApiDay,
  type DisplayDay,
} from '@/components/board/helpers';
import {
  CalendarDays,
  CalendarCheck,
  RotateCcw,
  Info,
  Plus,
  X,
} from 'lucide-react';

type RepeatChoice = 'this-week' | 'weekly';
type WhenChoice = 'pick' | 'later';

type Props = Readonly<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (data: {
    text: string;
    /** API days: 0..6 (Sun..Sat), -1 for “Later” */
    days: ApiDay[];
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
  const [when, setWhen] = useState<WhenChoice>('pick');

  // DISPLAY indices only (0..6). 7 (“Later”) is handled via `when === 'later'`.
  const [pickedDays, setPickedDays] = useState<Array<Exclude<DisplayDay, 7>>>(
    []
  );

  // Reset every time the sheet opens
  useEffect(() => {
    if (open) {
      setText(initialText);
      setWhen('pick');
      setPickedDays([todayDisplayIndex()]); // default to today (DISPLAY index)
      setRepeat(defaultRepeat);
    }
  }, [open, initialText, defaultRepeat]);

  // Safety: ensure at least one day is selected in "pick" mode
  useEffect(() => {
    if (open && when === 'pick' && pickedDays.length === 0) {
      setPickedDays([todayDisplayIndex()]);
    }
  }, [open, when, pickedDays.length]);

  // Labels that respect WEEK_START config via helpers
  const dayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, d) => {
        const full = labelForDisplayDay(d as Exclude<DisplayDay, 7>); // e.g., "Sunday"
        return { short: full.slice(0, 2), title: full };
      }),
    []
  );

  const toggleDay = (d: Exclude<DisplayDay, 7>) =>
    setPickedDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Convert DISPLAY → API days
    const apiDays: ApiDay[] =
      when === 'later'
        ? [-1]
        : pickedDays.slice().sort().map(apiDayFromDisplay);

    if (apiDays.length === 0) return;

    await onSubmit({ text: trimmed, days: apiDays, repeat });
    onOpenChange(false);
  };

  if (!open) return null;

  const repeatsOn = repeat === 'weekly';

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[70] px-4 py-6 sm:px-6 sm:py-5 pointer-events-none">
      <div className="pointer-events-auto mx-auto w-full max-w-[820px] pb-[env(safe-area-inset-bottom)]">
        <div className="rounded-[28px] bg-white/80 dark:bg-white/10 backdrop-blur-2xl ring-1 ring-black/10 dark:ring-white/10 shadow-[0_8px_32px_rgba(0,0,0,.18)] p-3">
          {/* Input */}
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="New task…"
            className="w-full h-11 px-3 mb-3 rounded-[14px] bg-white/90 dark:bg-white/10 text-slate-900 dark:text-emerald-50 ring-1 ring-black/10 dark:ring-white/10 shadow-[0_1px_0_rgba(255,255,255,.7)_inset] focus:outline-none focus:ring-2 focus:ring-emerald-300"
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

          {/* Segmented control */}
          <div className="mb-2">
            <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-100/70 dark:bg-white/10 ring-1 ring-black/10 dark:ring-white/10">
              <button
                type="button"
                aria-pressed={when === 'pick'}
                data-active={when === 'pick'}
                onClick={() => {
                  setWhen('pick');
                  setPickedDays((prev) =>
                    prev.length ? prev : [todayDisplayIndex()]
                  );
                }}
                className={[
                  'h-10 rounded-xl text-[14px] font-medium inline-flex items-center justify-center gap-2 transition',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300',
                  'data-[active=true]:bg-white data-[active=true]:shadow-sm data-[active=true]:ring-1 data-[active=true]:ring-black/10',
                  'data-[active=false]:text-slate-600 dark:data-[active=false]:text-emerald-100/85',
                ].join(' ')}
              >
                <CalendarDays className="w-4 h-4" />
                Pick day
              </button>

              <button
                type="button"
                aria-pressed={when === 'later'}
                data-active={when === 'later'}
                onClick={() => {
                  setWhen('later');
                  setPickedDays([]);
                }}
                className={[
                  'h-10 rounded-xl text-[14px] font-medium inline-flex items-center justify-center gap-2 transition',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300',
                  'data-[active=true]:bg-white data-[active=true]:shadow-sm data-[active=true]:ring-1 data-[active=true]:ring-black/10',
                  'data-[active=false]:text-slate-600 dark:data-[active=false]:text-emerald-100/85',
                ].join(' ')}
              >
                <CalendarCheck className="w-4 h-4" />
                Later
              </button>
            </div>
          </div>

          {/* PICK MODE */}
          {when === 'pick' && (
            <div className="flex flex-col gap-2 mt-1 sm:flex-row sm:items-center">
              <div className="flex-1 min-w-0 px-1 -mx-1 overflow-x-auto overflow-y-visible no-scrollbar">
                <div className="inline-flex w-max gap-2 pr-2 py-1.5">
                  {dayLabels.map(({ short, title }, idx) => {
                    const d = idx as Exclude<DisplayDay, 7>;
                    const on = pickedDays.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDay(d)}
                        aria-pressed={on}
                        data-active={on}
                        title={title}
                        className={[
                          'inline-flex items-center justify-center select-none',
                          'h-10 w-10 rounded-full text-sm font-semibold',
                          'border border-slate-300/80 dark:border-white/15',
                          'bg-white dark:bg-white/10 text-slate-800 dark:text-emerald-50',
                          'data-[active=true]:bg-emerald-50 data-[active=true]:border-emerald-300 data-[active=true]:text-emerald-900',
                          'transition-colors',
                        ].join(' ')}
                      >
                        {short}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="sm:shrink-0 sm:pl-1">
                <div className="inline-flex items-center gap-2 px-2 py-1 border rounded-full bg-white/90 dark:bg-white/10 border-slate-300/70 dark:border-white/10">
                  <RotateCcw className="w-4 h-4 text-emerald-800/80 dark:text-emerald-200" />
                  <span className="text-[13px] font-medium text-slate-700 dark:text-emerald-50">
                    Repeat every week
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={repeatsOn}
                    onClick={() =>
                      setRepeat((r) =>
                        r === 'weekly' ? 'this-week' : 'weekly'
                      )
                    }
                    data-on={repeatsOn}
                    className={[
                      'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                      'bg-slate-300/70 data-[on=true]:bg-emerald-400',
                    ].join(' ')}
                    title={repeatsOn ? 'Weekly' : 'One-time'}
                  >
                    <span
                      className={[
                        'inline-block h-4 w-4 transform rounded-full bg-white shadow ring-1 ring-black/10 transition-transform',
                        repeatsOn ? 'translate-x-4' : 'translate-x-1',
                      ].join(' ')}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}

          {when === 'later' && (
            <div className="mt-2 flex items-start gap-2 rounded-xl bg-emerald-50/75 dark:bg-emerald-900/30 ring-1 ring-emerald-700/15 p-2.5 text-[13px] text-emerald-900/90 dark:text-emerald-100/90">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Saved to <span className="font-medium">Later this week</span>.
                Drag it onto a specific day whenever you’re ready.
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!text.trim()}
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
                'bg-white/80 dark:bg-white/10 text-slate-800 dark:text-emerald-50',
                'ring-1 ring-black/10 dark:ring-white/10',
                'hover:bg-white active:scale-[0.995]',
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

      <style jsx>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
