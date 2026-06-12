'use client';

import React, { useState } from 'react';
import { Check, ChevronRight, ChevronUp } from 'lucide-react';
import {
  customRepeatLabel,
  formatEndDateLabel,
  type RepeatMode,
  type RepeatRule,
} from './utils';

/**
 * The repeat option list used by both QuickAddSheet's PickerSheet and the task
 * detail card, so the picker looks and behaves identically in both places.
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
}) {
  const [endsExpanded, setEndsExpanded] = useState(false);

  const frequencies: Array<{ label: string; mode: RepeatMode }> = [
    { label: 'Every day', mode: 'daily' },
    { label: 'Every weekday', mode: 'weekdays' },
    { label: 'Every weekend', mode: 'weekend' },
    { label: `Every week on ${repeatDayLabel}`, mode: 'weekly' },
    { label: monthlyLabel, mode: 'monthly' },
  ];

  const rowBase =
    'flex h-[60px] w-full items-center justify-between px-4 text-left text-[15px] font-extrabold transition-colors';

  return (
    <div className="space-y-4">
      {/* Does not repeat */}
      <button
        type="button"
        onClick={() => setRepeatMode('none')}
        className={`${rowBase} rounded-2xl border ${
          currentMode === 'none'
            ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/30'
            : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary'
        }`}
      >
        Does not repeat
        {currentMode === 'none' && (
          <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground">
            <Check className="h-4 w-4 stroke-[3]" />
          </span>
        )}
      </button>

      {/* Ends — only relevant for the preset repeating modes (custom carries
          its own end date inside the custom builder) */}
      {currentMode !== 'none' && currentMode !== 'custom' && (
        <div className="overflow-hidden rounded-2xl border border-border bg-background">
          <button
            type="button"
            onClick={() => setEndsExpanded((v) => !v)}
            className={`${rowBase} text-foreground`}
          >
            Ends
            <span className="flex items-center gap-1.5 text-[15px] font-extrabold text-primary">
              {endDate ? formatEndDateLabel(endDate) : 'Never'}
              <ChevronUp
                className={`h-4 w-4 stroke-[3] transition-transform ${
                  endsExpanded ? '' : 'rotate-180'
                }`}
              />
            </span>
          </button>

          {endsExpanded && (
            <>
              <div className="border-t border-border" />
              <button
                type="button"
                onClick={onClearEndDate}
                className={`${rowBase} text-foreground hover:bg-primary/5`}
              >
                Never
                {!endDate && (
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-4 w-4 stroke-[3]" />
                  </span>
                )}
              </button>
              <div className="border-t border-border" />
              <button
                type="button"
                onClick={onPickEndDate}
                className={`${rowBase} text-foreground hover:bg-primary/5`}
              >
                On a date
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  {endDate && (
                    <span className="text-[15px] font-extrabold text-primary">
                      {formatEndDateLabel(endDate)}
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 stroke-[3]" />
                </span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Frequency options */}
      <div className="overflow-hidden rounded-2xl border border-border bg-background">
        {frequencies.map((option, i) => {
          const active = option.mode === currentMode;
          return (
            <React.Fragment key={option.mode}>
              {i > 0 && <div className="border-t border-border" />}
              <button
                type="button"
                onClick={() => setRepeatMode(option.mode)}
                className={`${rowBase} ${
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground hover:bg-primary/5 hover:text-primary'
                }`}
              >
                {option.label}
                {active && (
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-4 w-4 stroke-[3]" />
                  </span>
                )}
              </button>
            </React.Fragment>
          );
        })}

        <div className="border-t border-border" />
        <button
          type="button"
          onClick={onOpenCustom}
          className={`${rowBase} ${
            currentMode === 'custom'
              ? 'bg-primary/10 text-primary'
              : 'text-foreground hover:bg-primary/5 hover:text-primary'
          }`}
        >
          {currentMode === 'custom' && customRule
            ? endDate
              ? `${customRepeatLabel(customRule)} · until ${formatEndDateLabel(endDate)}`
              : customRepeatLabel(customRule)
            : 'Custom…'}
          {currentMode === 'custom' && (
            <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground">
              <Check className="h-4 w-4 stroke-[3]" />
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
