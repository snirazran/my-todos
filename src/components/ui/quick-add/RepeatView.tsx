'use client';

import React from 'react';
import { Check } from 'lucide-react';
import type { RepeatMode } from './utils';

/**
 * The repeat option list used by both QuickAddSheet's PickerSheet and the task
 * detail card, so the picker looks and behaves identically in both places.
 */
export function RepeatView({
  currentMode,
  setRepeatMode,
  repeatDayLabel,
  onClose,
}: {
  currentMode: RepeatMode;
  setRepeatMode: (mode: RepeatMode) => void;
  repeatDayLabel: string;
  onClose: () => void;
}) {
  const options: Array<{ label: string; mode: RepeatMode }> = [
    { label: 'Does not repeat', mode: 'none' },
    { label: 'Every day', mode: 'daily' },
    { label: 'Every weekday', mode: 'weekdays' },
    { label: `Every week on ${repeatDayLabel}`, mode: 'weekly' },
  ];

  return (
    <div className="space-y-3">
      {options.map((option) => {
        const active = option.mode === currentMode;
        return (
          <button
            key={option.mode}
            type="button"
            onClick={() => {
              setRepeatMode(option.mode);
              onClose();
            }}
            className={`flex h-[60px] w-full items-center justify-between rounded-2xl border px-4 text-left text-[15px] font-extrabold transition-all ${
              active
                ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/30'
                : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary'
            }`}
          >
            {option.label}
            {active && (
              <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground">
                <Check className="h-4 w-4 stroke-[3]" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
