'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { TimeSliderColumn } from './quick-add/TimeSliderColumn';
import {
  HOURS_24,
  MINUTES_60,
} from './quick-add/constants';
import { pad } from './quick-add/utils';

interface Props {
  open: boolean;
  taskName: string;
  initialStartTime?: string;
  initialReminder?: string;
  busy?: boolean;
  onClose: () => void;
  onSave: (data: {
    startTime: string;
    endTime: string;
    reminder: string;
  }) => void | Promise<void>;
}

const DEFAULT_TIME = '09:00';

export function TimePopup({
  open,
  taskName,
  initialStartTime = '',
  initialReminder = '',
  busy,
  onClose,
  onSave,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [startTime, setStartTime] = useState(initialStartTime || DEFAULT_TIME);
  const [notifyEnabled, setNotifyEnabled] = useState(true);

  // Cache the last good task name so the slide-down exit animation still
  // shows the right label after the parent clears its state.
  const lastTaskNameRef = useRef(taskName);
  useEffect(() => {
    if (open && taskName) lastTaskNameRef.current = taskName;
  }, [open, taskName]);
  const displayTaskName = open ? taskName : lastTaskNameRef.current;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    setStartTime(initialStartTime || DEFAULT_TIME);
    setNotifyEnabled(true);
  }, [open, initialStartTime, initialReminder]);

  if (!mounted) return null;

  const [hour24, minute] = startTime.split(':').map(Number);

  const setTimeParts = (h: number, m: number) => {
    setStartTime(`${pad(h)}:${pad(m)}`);
  };

  const handleSave = async () => {
    await onSave({
      startTime,
      endTime: '',
      reminder: notifyEnabled ? 'at_time' : '',
    });
  };

  return (
    <BaseSheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      zIndex={1500}
      className="bg-background ring-1 ring-border/70 sm:max-w-[440px]"
    >
      {() => (
        <div className="w-full px-5 pb-[calc(env(safe-area-inset-bottom)+22px)] pt-1 sm:pb-6">
              <div className="mx-auto w-full">
                {/* Header */}
                <div className="relative mb-5 flex h-8 items-center justify-center">
                  <button
                    type="button"
                    onClick={onClose}
                    className="absolute left-0 grid h-8 w-8 place-items-center rounded-full bg-muted/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Cancel"
                  >
                    <X className="h-4 w-4 stroke-[3]" />
                  </button>
                  <h3 className="text-[16px] font-extrabold text-foreground">
                    Notify
                  </h3>
                </div>

                {displayTaskName && (
                  <p className="mb-4 truncate text-center text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
                    {displayTaskName}
                  </p>
                )}

                {/* Time wheel */}
                <div className="mb-5">
                  <div className="mx-auto mb-2 grid max-w-[220px] grid-cols-2 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">
                    <span>Hour</span>
                    <span>Minute</span>
                  </div>
                  <div className="relative mx-auto grid max-w-[220px] grid-cols-2 items-center text-center">
                    <div className="pointer-events-none absolute -inset-x-1 top-1/2 z-0 h-12 -translate-y-1/2 rounded-2xl bg-primary/10 ring-1 ring-primary/25" />
                    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-12 bg-gradient-to-b from-background to-transparent" />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-12 bg-gradient-to-t from-background to-transparent" />
                    {/* Colon separator so it reads as a real time */}
                    <span className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-[60%] text-[26px] font-black leading-none text-primary">
                      :
                    </span>

                    <TimeSliderColumn
                      items={HOURS_24}
                      value={hour24}
                      onChange={(h) => setTimeParts(h, minute)}
                      formatLabel={pad}
                    />
                    <TimeSliderColumn
                      items={MINUTES_60}
                      value={minute}
                      onChange={(m) => setTimeParts(hour24, m)}
                      formatLabel={pad}
                    />
                  </div>
                </div>

                {/* Notify toggle — clean switch row */}
                <button
                  type="button"
                  onClick={() => setNotifyEnabled((v) => !v)}
                  aria-pressed={notifyEnabled}
                  className="mb-3 flex w-full items-center gap-3 rounded-2xl bg-muted/50 px-4 py-3 text-left transition-colors hover:bg-muted/70"
                >
                  <span
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors ${
                      notifyEnabled
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <Bell className="h-[18px] w-[18px] stroke-[2.5]" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-extrabold text-foreground">
                      Remind me
                    </span>
                    <span className="block truncate text-[12px] font-medium text-muted-foreground">
                      {notifyEnabled
                        ? `Notifies you at ${pad(hour24)}:${pad(minute)}`
                        : 'Reminder off'}
                    </span>
                  </span>
                  <span
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                      notifyEnabled ? 'bg-primary' : 'bg-muted-foreground/30'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                        notifyEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                      }`}
                    />
                  </span>
                </button>

                {/* Save */}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={busy || !startTime}
                  className="h-11 w-full rounded-xl bg-primary text-[15px] font-extrabold text-primary-foreground transition-all hover:brightness-105 active:scale-[0.985] disabled:opacity-50"
                >
                  {busy ? 'Saving...' : 'Save'}
                </button>
              </div>
        </div>
      )}
    </BaseSheet>
  );
}
