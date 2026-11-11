'use client';

import React from 'react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { MonthGrid } from './MonthGrid';
import { useCalendarMonth } from './useCalendarMonth';
import { parseYmdLocal, ymdLocal } from './utils';

/**
 * A standalone month calendar sheet for picking a repeat *end* date. Shared by
 * the QuickAdd PickerSheet and the board TaskRepeatPopup so the calendar looks
 * and behaves identically in both. Dates before `minDateKey` are disabled.
 */
export function EndDateCalendarSheet({
  open,
  value,
  minDateKey,
  onSelect,
  onClose,
  zIndex = 1700,
}: {
  open: boolean;
  /** Currently selected end date (YYYY-MM-DD) or null. */
  value: string | null;
  /** Earliest selectable date (YYYY-MM-DD). */
  minDateKey: string;
  onSelect: (dateKey: string) => void;
  onClose: () => void;
  zIndex?: number;
}) {
  const initial = value ? parseYmdLocal(value) : new Date();
  const { calendarMonthLabel, calendarCells, shiftCalendarMonth } =
    useCalendarMonth(initial);

  return (
    <BaseSheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      zIndex={zIndex}
      className="bg-background ring-1 ring-border/70 sm:mx-4 sm:max-w-[440px]"
    >
      {() => (
        <div className="mx-auto w-full px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-1 sm:pb-6">
          <div className="relative mb-4 flex h-8 items-center justify-center">
            <h3 className="text-[17px] font-black tracking-tight text-foreground">
              Ends on
            </h3>
          </div>
          <MonthGrid
            monthLabel={calendarMonthLabel}
            cells={calendarCells}
            onShift={shiftCalendarMonth}
            selectedKey={value}
            todayKey={ymdLocal(new Date())}
            minKey={minDateKey}
            onPick={(date) => onSelect(ymdLocal(date))}
          />
        </div>
      )}
    </BaseSheet>
  );
}
