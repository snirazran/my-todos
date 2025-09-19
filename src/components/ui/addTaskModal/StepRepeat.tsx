'use client';

import { RepeatMode, WhenMode } from './types';
import Seg from './Seg';
import { RotateCcw, CalendarCheck } from 'lucide-react'; // ← add

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
  when: WhenMode;
  repeat: RepeatMode;
  setRepeat: (r: RepeatMode) => void;
  pickedDays: number[];
}>;

export default function StepRepeat({
  when,
  repeat,
  setRepeat,
  pickedDays,
}: Props) {
  const summary =
    when === 'today'
      ? dayNames[new Date().getDay()]
      : pickedDays
          .slice()
          .sort((a, b) => a - b)
          .map((d) => dayNames[d])
          .join(', ');

  return (
    <div>
      <div className="mb-3 text-sm font-semibold text-emerald-900 dark:text-emerald-100">
        Repeat
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Seg
          icon={<RotateCcw className="w-4 h-4" />} // ← provide icon
          active={repeat === 'weekly'}
          onClick={() => setRepeat('weekly')}
        >
          Repeat every selected day
        </Seg>
        <Seg
          icon={<CalendarCheck className="w-4 h-4" />} // ← provide icon
          active={repeat === 'this-week'}
          onClick={() => setRepeat('this-week')}
        >
          This week only
        </Seg>
      </div>

      <div className="px-4 py-3 mt-4 text-sm border rounded-2xl border-emerald-600/15 bg-emerald-50/60 text-emerald-950 dark:bg-emerald-900/30 dark:text-emerald-50 dark:border-emerald-400/10">
        <span className="font-medium">
          {pickedDays.length < 2 ? 'Day: ' : `Days: `}
        </span>
        <span>{summary}</span>
      </div>
    </div>
  );
}
