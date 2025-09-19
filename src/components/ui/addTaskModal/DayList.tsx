'use client';

import { Check } from 'lucide-react';

const dayNames = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

type Props = Readonly<{
  pickedDays: number[];
  toggleDay: (d: number) => void;
  className?: string;
}>;

export default function DayList({
  pickedDays,
  toggleDay,
  className = '',
}: Props) {
  return (
    <div
      className={[
        'rounded-2xl border border-emerald-600/15 bg-emerald-50/60 dark:bg-emerald-900/30 dark:border-emerald-400/10',
        className,
      ].join(' ')}
    >
      {dayNames.map((label, idx) => {
        const selected = pickedDays.includes(idx);
        return (
          <button
            key={idx}
            onClick={() => toggleDay(idx)}
            className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-lime-50/70 dark:hover:bg-emerald-800/40 border-b border-emerald-600/10 last:border-b-0"
          >
            <span className="text-sm text-emerald-950 dark:text-emerald-50">
              {label}
            </span>
            <span
              className={[
                'inline-flex h-5 w-5 items-center justify-center rounded-full border transition',
                selected
                  ? 'bg-lime-500 text-emerald-900 border-lime-500 shadow'
                  : 'border-emerald-400/40 text-transparent',
              ].join(' ')}
            >
              <Check className="h-3.5 w-3.5" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
