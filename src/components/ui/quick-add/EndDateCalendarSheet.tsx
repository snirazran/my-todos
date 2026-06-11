'use client';

import React from 'react';
import { ChevronDown } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
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
      className="bg-background ring-1 ring-border/70 sm:mx-4 sm:max-w-[520px]"
    >
      {() => (
        <div
          dir="ltr"
          className="mx-auto w-full px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-1 sm:pb-6"
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[17px] font-extrabold text-foreground">
              {calendarMonthLabel}
            </h3>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => shiftCalendarMonth(-1)}
                className="grid h-8 w-8 place-items-center rounded-full bg-muted/60 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                aria-label="Previous month"
              >
                <ChevronDown className="h-4 w-4 rotate-90 stroke-[3]" />
              </button>
              <button
                type="button"
                onClick={() => shiftCalendarMonth(1)}
                className="grid h-8 w-8 place-items-center rounded-full bg-muted/60 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                aria-label="Next month"
              >
                <ChevronDown className="h-4 w-4 -rotate-90 stroke-[3]" />
              </button>
            </div>
          </div>

          <div className="mb-2 grid grid-cols-7 text-center text-[11px] font-extrabold uppercase tracking-wider text-primary/70">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="py-1.5">
                {day.slice(0, 1)}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-1.5 text-center">
            {calendarCells.map((date, index) => {
              if (!date) return <div key={`empty-${index}`} className="h-10" />;

              const dateKey = ymdLocal(date);
              const selected = dateKey === value;
              const disabled = dateKey < minDateKey;

              const base =
                'mx-auto grid h-10 w-10 place-items-center rounded-full text-[14px] font-extrabold transition-all';
              const stateClass = disabled
                ? 'text-muted-foreground/30 cursor-not-allowed'
                : selected
                  ? 'bg-primary text-primary-foreground shadow-[0_4px_12px_rgba(22,163,74,0.35)] scale-105'
                  : 'text-foreground hover:bg-primary/10 hover:text-primary';

              return (
                <button
                  key={dateKey}
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(dateKey)}
                  className={`${base} ${stateClass}`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </BaseSheet>
  );
}
