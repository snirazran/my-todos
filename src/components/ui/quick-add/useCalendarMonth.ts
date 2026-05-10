'use client';

import { useMemo, useState } from 'react';

export function useCalendarMonth(initial: Date) {
  const [calendarMonth, setCalendarMonth] = useState(
    () => new Date(initial.getFullYear(), initial.getMonth(), 1),
  );

  const calendarMonthLabel = calendarMonth.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const calendarCells = useMemo(() => {
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const startOffset = first.getDay();
    const daysInMonth = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth() + 1,
      0,
    ).getDate();
    return Array.from({ length: 42 }, (_, index) => {
      const dayNumber = index - startOffset + 1;
      if (dayNumber < 1 || dayNumber > daysInMonth) return null;
      return new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), dayNumber);
    });
  }, [calendarMonth]);

  const shiftCalendarMonth = (delta: number) => {
    setCalendarMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + delta, 1),
    );
  };

  const setCalendarMonthFromDate = (date: Date) => {
    setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  };

  return {
    calendarMonth,
    calendarMonthLabel,
    calendarCells,
    shiftCalendarMonth,
    setCalendarMonthFromDate,
  };
}
