'use client';

import React from 'react';
import { Bell } from 'lucide-react';
import { Wheel } from './Wheel';
import { HOURS_24, MINUTES_60 } from './constants';
import { pad } from './utils';

export function NotifyView({
  reminderHour24,
  reminderMinute,
  setReminderTimeParts,
  onSave,
  saveLabel = 'Save reminder',
  saveDisabled = false,
  canRemove = false,
  onRemove,
}: {
  reminderHour24: number;
  reminderMinute: number;
  setReminderTimeParts: (h: number, m: number) => void;
  onSave: () => void;
  saveLabel?: string;
  saveDisabled?: boolean;
  canRemove?: boolean;
  onRemove?: () => void;
}) {
  return (
    <>
      <div className="relative mb-5 flex h-8 items-center justify-center">
        <h3 className="text-[17px] font-black text-foreground">Notify</h3>
      </div>

      <div className="mb-4 flex items-center justify-center gap-2 text-[13px] font-bold text-muted-foreground">
        <Bell className="h-4 w-4 text-primary" />
        <span>
          Notifies you at{' '}
          <span className="text-primary">
            {pad(reminderHour24)}:{pad(reminderMinute)}
          </span>
        </span>
      </div>

      <div className="mb-5">
        <div className="mx-auto mb-2 grid max-w-[220px] grid-cols-2 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">
          <span>Hour</span>
          <span>Minute</span>
        </div>
        <div className="relative mx-auto max-w-[220px]">
          <span className="pointer-events-none absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-[60%] text-[26px] font-black leading-none text-primary">
            :
          </span>

          <Wheel
            columns={[
              {
                items: HOURS_24,
                value: reminderHour24,
                onChange: (h) => setReminderTimeParts(h, reminderMinute),
                formatLabel: pad,
              },
              {
                items: MINUTES_60,
                value: reminderMinute,
                onChange: (m) => setReminderTimeParts(reminderHour24, m),
                formatLabel: pad,
              },
            ]}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onSave}
        disabled={saveDisabled}
        className="h-11 w-full rounded-xl bg-primary text-[15px] font-extrabold text-primary-foreground transition-all hover:brightness-105 active:scale-[0.985] disabled:opacity-50"
      >
        {saveLabel}
      </button>

      {canRemove && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="mt-2 h-10 w-full rounded-xl text-[13px] font-bold text-rose-500 transition-colors hover:bg-rose-500/10 disabled:opacity-50"
        >
          Remove reminder
        </button>
      )}
    </>
  );
}
