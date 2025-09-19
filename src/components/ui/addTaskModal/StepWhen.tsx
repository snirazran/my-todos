'use client';

import { CalendarDays, CalendarRange, CalendarClock } from 'lucide-react';
import Seg from './Seg';
import DayList from './DayList';
import type { WhenMode } from './types';

type Props = Readonly<{
  when: WhenMode;
  setWhen: (w: WhenMode) => void;
  pickedDays: number[];
  toggleDay: (d: number) => void;
}>;

export default function StepWhen({
  when,
  setWhen,
  pickedDays,
  toggleDay,
}: Props) {
  return (
    <div>
      <div className="mb-3 text-sm font-semibold text-emerald-900 dark:text-emerald-100">
        When
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
          Choose days
        </Seg>
        <Seg
          icon={<CalendarClock className="w-4 h-4" />}
          active={when === 'week-no-day'}
          onClick={() => setWhen('week-no-day')}
        >
          Sometime this week
        </Seg>
      </div>

      {when === 'pick-days' && (
        <div className="mt-4">
          <DayList pickedDays={pickedDays} toggleDay={toggleDay} />
        </div>
      )}
    </div>
  );
}
