'use client';

import React from 'react';
import {
  Ban,
  Briefcase,
  CalendarRange,
  Check,
  ChevronRight,
  Coffee,
  Flag,
  Repeat,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { hapticTick } from '@/lib/haptics';
import { Squircle, type Tint } from './kit';
import {
  customRepeatLabel,
  formatEndDateLabel,
  type RepeatMode,
  type RepeatRule,
} from './utils';

const SUNDAY_FIRST = [0, 1, 2, 3, 4, 5, 6];
const DAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DAY_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [0, 6];

const PRESETS: Array<{
  mode: RepeatMode;
  label: string;
  tint: Tint;
  Icon: typeof Repeat;
}> = [
  { mode: 'none', label: 'Never', tint: 'neutral', Icon: Ban },
  { mode: 'daily', label: 'Every day', tint: 'green', Icon: Repeat },
  { mode: 'weekdays', label: 'Weekdays', tint: 'sky', Icon: Briefcase },
  { mode: 'weekend', label: 'Weekends', tint: 'amber', Icon: Coffee },
];

const sameDays = (a: number[], b: number[]) =>
  a.length === b.length && b.every((d) => a.indexOf(d) >= 0);

const ROW =
  'flex h-14 w-full items-center gap-3 pl-2.5 pr-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50';

/**
 * The repeat picker body used by both QuickAddSheet's PickerSheet and the task
 * detail card, so it looks and behaves identically in both places.
 *
 * Selecting an option updates the mode live (it does NOT close the sheet) so the
 * user can also configure when the repeat ends before dismissing.
 */
export function RepeatView({
  currentMode,
  setRepeatMode,
  repeatDayLabel,
  monthlyLabel,
  endDate,
  onPickEndDate,
  onClearEndDate,
  customRule,
  onOpenCustom,
  onCustomRule,
  anchorDow,
  weekOrder = SUNDAY_FIRST,
}: {
  currentMode: RepeatMode;
  setRepeatMode: (mode: RepeatMode) => void;
  repeatDayLabel: string;
  /** Label for the monthly option, e.g. "Every month on the 11th". */
  monthlyLabel: string;
  /** Current repeat end date (YYYY-MM-DD) or null for "never". */
  endDate: string | null;
  /** Open the calendar to pick an end date. */
  onPickEndDate: () => void;
  /** Clear the end date (repeat never ends). */
  onClearEndDate: () => void;
  /** Active custom rule (when currentMode === 'custom'). */
  customRule?: RepeatRule | null;
  /** Open the custom recurrence builder. */
  onOpenCustom: () => void;
  /** Commit a rule built from the weekday bubbles. */
  onCustomRule: (rule: RepeatRule) => void;
  /** Weekday (0=Sun..6=Sat) the task sits on. */
  anchorDow: number;
  /** Weekdays in display order. */
  weekOrder?: ReadonlyArray<number>;
}) {
  const weeklyRule =
    currentMode === 'custom' &&
    customRule?.freq === 'weekly' &&
    customRule.interval === 1
      ? customRule
      : null;
  const activeDays: number[] =
    currentMode === 'daily'
      ? SUNDAY_FIRST
      : currentMode === 'weekdays'
        ? WEEKDAYS
        : currentMode === 'weekend'
          ? WEEKEND
          : currentMode === 'weekly'
            ? [anchorDow]
            : weeklyRule
              ? (weeklyRule.byWeekday ?? [])
              : [];

  const toggleDay = (day: number) => {
    hapticTick();
    const next =
      activeDays.indexOf(day) >= 0
        ? activeDays.filter((d) => d !== day)
        : activeDays.concat(day);
    if (next.length === 0) setRepeatMode('none');
    else if (next.length === 7) setRepeatMode('daily');
    else if (sameDays(next, WEEKDAYS)) setRepeatMode('weekdays');
    else if (sameDays(next, WEEKEND)) setRepeatMode('weekend');
    else if (next.length === 1 && next[0] === anchorDow) setRepeatMode('weekly');
    else {
      onCustomRule({
        freq: 'weekly',
        interval: 1,
        byWeekday: next.slice().sort((a, b) => a - b),
      });
    }
  };

  const repeating = currentMode !== 'none';
  const customActive = currentMode === 'custom' && !weeklyRule;
  const summary =
    currentMode === 'none'
      ? "Doesn't repeat"
      : currentMode === 'daily'
        ? 'Every day'
        : currentMode === 'weekdays'
          ? 'Every weekday'
          : currentMode === 'weekend'
            ? 'Every weekend'
            : currentMode === 'weekly'
              ? `Every ${repeatDayLabel}`
              : currentMode === 'monthly'
                ? monthlyLabel
                : customRule
                  ? weeklyRule && weeklyRule.byWeekday?.length === 1
                    ? `Every ${DAY_LONG[weeklyRule.byWeekday[0]]}`
                    : customRepeatLabel(customRule)
                  : 'Custom';

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Repeat"
        className="mb-3 grid grid-cols-4 gap-2"
      >
        {PRESETS.map((preset) => {
          const selected = preset.mode === currentMode;
          return (
            <button
              key={preset.mode}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                hapticTick();
                setRepeatMode(preset.mode);
              }}
              className={`flex h-[72px] flex-col items-center justify-center gap-1.5 rounded-2xl text-[12.5px] font-extrabold transition-[background-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.96] ${
                selected
                  ? 'bg-primary/10 text-primary ring-2 ring-inset ring-primary/40'
                  : 'bg-muted/50 text-foreground/70 [@media(hover:hover)]:hover:bg-muted'
              }`}
            >
              <Squircle tint={preset.tint} size="md">
                <preset.Icon className="h-[18px] w-[18px]" strokeWidth={2.5} />
              </Squircle>
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="mb-3 rounded-[24px] bg-muted/50 px-3 pb-4 pt-4">
        <p
          aria-live="polite"
          className="text-center text-[19px] font-black leading-tight tracking-tight text-foreground"
        >
          {summary}
        </p>
        <p className="mb-3.5 mt-0.5 h-[18px] text-center text-[13px] font-bold text-muted-foreground">
          {repeating && endDate ? `until ${formatEndDateLabel(endDate)}` : ''}
        </p>
        <div className="flex items-center justify-between gap-1.5">
          {weekOrder.map((day) => {
            const on = activeDays.indexOf(day) >= 0;
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                aria-label={DAY_LONG[day]}
                onClick={() => toggleDay(day)}
                className={`grid aspect-square max-w-[46px] flex-1 place-items-center rounded-full text-[13px] font-black transition-[background-color,color,box-shadow,transform] duration-150 ease-out active:translate-y-[2px] ${
                  on
                    ? 'bg-[#447d3f] text-white shadow-[0_2px_0_0_#2c511a] active:shadow-none'
                    : 'bg-[hsl(var(--card-raised))] text-foreground/60 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_2px_0_0_rgba(15,23,42,0.06)] active:shadow-[0_0_0_1px_rgba(15,23,42,0.06)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_2px_0_0_rgba(0,0,0,0.3)]'
                }`}
              >
                {DAY_SHORT[day]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-muted/50">
        <button
          type="button"
          aria-pressed={currentMode === 'monthly'}
          onClick={() => {
            hapticTick();
            setRepeatMode('monthly');
          }}
          className={ROW}
        >
          <Squircle tint="violet" size="lg">
            <CalendarRange className="h-[18px] w-[18px]" strokeWidth={2.5} />
          </Squircle>
          <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-foreground">
            {monthlyLabel}
          </span>
          {currentMode === 'monthly' && (
            <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground dark:bg-[#4a8a44] dark:text-white">
              <Check className="h-3.5 w-3.5" strokeWidth={3.5} />
            </span>
          )}
        </button>

        <div className="mx-3.5 border-t border-border/60" />
        <button type="button" onClick={onOpenCustom} className={ROW}>
          <Squircle tint="teal" size="lg">
            <SlidersHorizontal className="h-[18px] w-[18px]" strokeWidth={2.5} />
          </Squircle>
          <span className="shrink-0 text-[15px] font-extrabold text-foreground">
            Custom
          </span>
          <span className="min-w-0 flex-1 truncate text-right text-[14px] font-extrabold text-primary">
            {customActive && customRule ? customRepeatLabel(customRule) : ''}
          </span>
          <ChevronRight
            className="h-4 w-4 shrink-0 text-muted-foreground/60"
            strokeWidth={3}
          />
        </button>

        <div>
          <div>
            <div className="mx-3.5 border-t border-border/60" />
            <div
              className={`flex items-center transition-opacity duration-200 ease-out ${
                repeating ? 'opacity-100' : 'opacity-40'
              }`}
            >
              <button
                type="button"
                disabled={!repeating}
                onClick={onPickEndDate}
                className={ROW}
              >
                <Squircle tint="rose" size="lg">
                  <Flag className="h-[18px] w-[18px]" strokeWidth={2.5} />
                </Squircle>
                <span className="shrink-0 text-[15px] font-extrabold text-foreground">
                  Ends
                </span>
                <span
                  className={`min-w-0 flex-1 truncate text-right text-[14px] font-extrabold ${
                    endDate ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {repeating && endDate ? formatEndDateLabel(endDate) : 'Never'}
                </span>
                {!(repeating && endDate) && (
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-muted-foreground/60"
                    strokeWidth={3}
                  />
                )}
              </button>
              {repeating && endDate && (
                <button
                  type="button"
                  aria-label="Remove end date"
                  onClick={() => {
                    hapticTick();
                    onClearEndDate();
                  }}
                  className="relative mr-2.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-foreground/[0.07] text-muted-foreground transition-transform duration-150 ease-out before:absolute before:-inset-1.5 active:scale-90 dark:bg-white/10"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={3} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
