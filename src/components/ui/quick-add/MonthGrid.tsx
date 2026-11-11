'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { hapticTick } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { ymdLocal } from './utils';

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const NAV_BUTTON =
  'grid h-9 w-9 place-items-center rounded-full bg-[hsl(var(--card-raised))] text-foreground/70 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_2px_0_0_rgba(15,23,42,0.06)] transition-transform duration-150 ease-out active:translate-y-[2px] active:shadow-[0_0_0_1px_rgba(15,23,42,0.06)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_2px_0_0_rgba(0,0,0,0.3)]';

export function MonthGrid({
  monthLabel,
  cells,
  onShift,
  selectedKey,
  todayKey,
  minKey,
  onPick,
  className,
}: {
  monthLabel: string;
  cells: Array<Date | null>;
  onShift: (delta: number) => void;
  selectedKey?: string | null;
  todayKey: string;
  /** Dates before this key cannot be picked. */
  minKey?: string;
  onPick: (date: Date) => void;
  className?: string;
}) {
  let last = cells.length - 1;
  while (last >= 0 && !cells[last]) last -= 1;
  const shown = cells.slice(0, Math.ceil((last + 1) / 7) * 7);

  return (
    <div
      dir="ltr"
      className={cn('rounded-[24px] bg-muted/50 px-3 pb-3 pt-3', className)}
    >
      <div className="mb-2 flex items-center justify-between pl-2">
        <h3 className="text-[16px] font-black tracking-tight text-foreground">
          {monthLabel}
        </h3>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onShift(-1)}
            className={NAV_BUTTON}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={3} />
          </button>
          <button
            type="button"
            onClick={() => onShift(1)}
            className={NAV_BUTTON}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={3} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 text-center text-[12px] font-extrabold text-muted-foreground">
        {WEEKDAY_INITIALS.map((day, index) => (
          <div key={index} className="py-1.5">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {shown.map((date, index) => {
          if (!date) return <div key={`empty-${index}`} className="h-10" />;

          const dateKey = ymdLocal(date);
          const selected = dateKey === selectedKey;
          const isToday = dateKey === todayKey;
          const disabled = !!minKey && dateKey < minKey;
          const past = dateKey < todayKey;

          return (
            <button
              key={dateKey}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              aria-current={isToday ? 'date' : undefined}
              onClick={() => {
                hapticTick();
                onPick(date);
              }}
              className={cn(
                'mx-auto grid h-10 w-10 place-items-center rounded-full text-[14.5px] font-extrabold tabular-nums transition-[background-color,color,transform] duration-150 ease-out enabled:active:scale-90',
                selected
                  ? 'bg-[#447d3f] text-white shadow-[0_2px_0_0_#2c511a]'
                  : disabled
                    ? 'cursor-not-allowed text-muted-foreground/30'
                    : isToday
                      ? 'text-primary ring-2 ring-inset ring-primary/45 [@media(hover:hover)]:hover:bg-primary/10'
                      : past
                        ? 'text-muted-foreground/50 [@media(hover:hover)]:hover:bg-foreground/[0.05]'
                        : 'text-foreground [@media(hover:hover)]:hover:bg-foreground/[0.06]',
              )}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
