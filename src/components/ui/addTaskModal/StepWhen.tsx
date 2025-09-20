'use client';

import React from 'react';
import type { WhenMode } from './types';
import Seg from './Seg';
import { RotateCcw, CalendarCheck, Sun, Info } from 'lucide-react';

type WhenState = WhenMode | 'unset';

type Props = Readonly<{
  when: WhenState;
  setWhen: (w: WhenState) => void;
  pickedDays: number[];
  toggleDay: (d: number) => void;
  onPickToday: () => void;
  onPickWeekNoDay: () => void;
}>;

const dayNames = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export default function StepWhen({
  when,
  setWhen,
  pickedDays,
  toggleDay,
  onPickToday,
  onPickWeekNoDay,
}: Props) {
  const active = (k: WhenMode) => when === k;

  return (
    <div>
      <div className="mb-3 text-sm font-semibold text-emerald-900 dark:text-emerald-100">
        When
      </div>

      {/* High-level choice */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Seg
          icon={<Sun className="w-4 h-4" />}
          active={active('today')}
          onClick={() => {
            const next = when === 'today' ? 'unset' : 'today';
            setWhen(next);
            if (next === 'today') onPickToday();
          }}
        >
          Today
        </Seg>

        <Seg
          icon={<RotateCcw className="w-4 h-4" />}
          active={active('pick-days')}
          onClick={() => setWhen(when === 'pick-days' ? 'unset' : 'pick-days')}
        >
          Pick days
        </Seg>

        <Seg
          icon={<CalendarCheck className="w-4 h-4" />}
          active={active('week-no-day')}
          onClick={() => {
            const next = when === 'week-no-day' ? 'unset' : 'week-no-day';
            setWhen(next);
            if (next === 'week-no-day') onPickWeekNoDay();
          }}
        >
          Later this week
        </Seg>
      </div>

      {/* Gentle hint when "Later this week" is selected */}
      {when === 'week-no-day' && (
        <div className="mt-2 flex items-start gap-2 rounded-xl bg-emerald-50/70 dark:bg-emerald-900/30 ring-1 ring-emerald-700/15 p-2.5 text-[13px] text-emerald-900/90 dark:text-emerald-100/90">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Saved to <span className="font-medium">Later this week</span> under
            your daily list. Add it onto a day whenever you’re ready.
          </span>
        </div>
      )}

      {/* Day picker */}
      <div
        className={[
          'grid grid-cols-7 gap-2 mt-3',
          when === 'pick-days'
            ? 'opacity-100'
            : 'opacity-50 pointer-events-none',
        ].join(' ')}
      >
        {dayNames.map((_, d) => {
          const on = pickedDays.includes(d);
          return (
            <button
              key={d}
              type="button"
              onClick={() => {
                toggleDay(d);
                if (when === 'unset') setWhen('pick-days');
              }}
              className={[
                'h-9 rounded-xl text-sm font-medium transition',
                on
                  ? 'bg-emerald-500/90 text-white ring-1 ring-emerald-700/30'
                  : 'bg-white/80 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-100 ring-1 ring-emerald-700/15',
              ].join(' ')}
              title={dayNames[d]}
            >
              {dayNames[d].slice(0, 2)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
