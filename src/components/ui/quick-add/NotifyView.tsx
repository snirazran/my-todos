'use client';

import React from 'react';
import { Bell } from 'lucide-react';
import { Wheel } from './Wheel';
import { HOURS_24, MINUTES_60, REMINDER_OFFSET_OPTIONS } from './constants';
import { pad } from './utils';

export function NotifyView({
  reminderHour24,
  reminderMinute,
  setReminderTimeParts,
  reminder,
  setReminder,
  onSave,
  saveLabel = 'Save reminder',
  saveDisabled = false,
  canRemove = false,
  onRemove,
}: {
  reminderHour24: number;
  reminderMinute: number;
  setReminderTimeParts: (h: number, m: number) => void;
  reminder: string;
  setReminder: (v: string) => void;
  onSave: () => void;
  saveLabel?: string;
  saveDisabled?: boolean;
  canRemove?: boolean;
  onRemove?: () => void;
}) {
  const selectedOffset =
    REMINDER_OFFSET_OPTIONS.find((opt) => opt.value === reminder) ??
    REMINDER_OFFSET_OPTIONS[0];
  const notifyTotal =
    (((reminderHour24 * 60 + reminderMinute - selectedOffset.minutes) % 1440) +
      1440) %
    1440;
  const notifyHour = Math.floor(notifyTotal / 60);
  const notifyMinute = notifyTotal % 60;

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
            {pad(notifyHour)}:{pad(notifyMinute)}
          </span>
          {selectedOffset.minutes > 0 && (
            <span className="text-muted-foreground/80">
              {' '}
              · {selectedOffset.label} before start
            </span>
          )}
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

      <div className="mb-5">
        <div className="mb-2 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">
          Notify before
        </div>
        <div className="grid grid-cols-3 gap-2">
          {REMINDER_OFFSET_OPTIONS.map((opt) => {
            const selected = reminder === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setReminder(opt.value)}
                className={`h-10 rounded-xl border text-[13px] font-extrabold transition-all ${
                  selected
                    ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/30'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
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
