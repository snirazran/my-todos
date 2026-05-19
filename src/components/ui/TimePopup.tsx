'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, X } from 'lucide-react';
import { TimeSliderColumn } from './quick-add/TimeSliderColumn';
import {
  HOURS_12,
  MINUTES_60,
  PERIODS,
} from './quick-add/constants';
import {
  formatTimeDisplay,
  pad,
} from './quick-add/utils';

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
  const [notifyEnabled, setNotifyEnabled] = useState(!!initialReminder);

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
    setNotifyEnabled(!!initialReminder);
  }, [open, initialStartTime, initialReminder]);

  if (!mounted) return null;

  const [hour24, minute] = startTime.split(':').map(Number);
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;

  const setTimeParts = (
    h: number,
    m: number,
    p: 'AM' | 'PM',
  ) => {
    const normalized =
      p === 'PM' ? (h === 12 ? 12 : h + 12) : h === 12 ? 0 : h;
    setStartTime(`${pad(normalized)}:${pad(m)}`);
  };

  const handleSave = async () => {
    await onSave({
      startTime,
      endTime: '',
      reminder: notifyEnabled ? 'at_time' : '',
    });
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="time-popup-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={onClose}
            className="fixed inset-0 z-[1500] bg-black/35"
          />
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[1501] flex justify-center sm:bottom-6">
            <motion.div
              key="time-popup-sheet"
              initial={{ y: '120%' }}
              animate={{ y: 0 }}
              exit={{ y: '120%' }}
              transition={{
                type: 'tween',
                ease: [0.32, 0.72, 0, 1],
                duration: 0.32,
              }}
              className="pointer-events-auto w-full rounded-t-[28px] bg-background px-5 pb-[calc(env(safe-area-inset-bottom)+22px)] pt-5 shadow-[0_-18px_42px_rgba(15,23,42,0.18)] ring-1 ring-border/70 sm:max-w-[440px] sm:rounded-[28px] sm:pb-6 sm:shadow-2xl"
            >
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
                    Time
                  </h3>
                </div>

                {displayTaskName && (
                  <p className="mb-4 truncate text-center text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
                    {displayTaskName}
                  </p>
                )}

                {/* Wheel */}
                <div className="relative mx-auto mb-5 grid max-w-[300px] grid-cols-3 items-center text-center">
                  <div className="pointer-events-none absolute -inset-x-1 top-1/2 z-0 h-11 -translate-y-1/2 rounded-2xl bg-primary/10 ring-1 ring-primary/25" />
                  <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-12 bg-gradient-to-b from-background to-transparent" />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-12 bg-gradient-to-t from-background to-transparent" />

                  <TimeSliderColumn
                    items={HOURS_12}
                    value={hour12}
                    onChange={(h) => setTimeParts(h, minute, period)}
                  />
                  <TimeSliderColumn
                    items={MINUTES_60}
                    value={minute}
                    onChange={(m) => setTimeParts(hour12, m, period)}
                    formatLabel={pad}
                  />
                  <TimeSliderColumn
                    items={[...PERIODS]}
                    value={period}
                    onChange={(p) => setTimeParts(hour12, minute, p)}
                  />
                </div>

                {/* Presets */}
                <div className="mb-4 grid grid-cols-3 gap-2">
                  {[
                    { label: 'Morning', time: '09:00' },
                    { label: 'Afternoon', time: '13:00' },
                    { label: 'Evening', time: '20:00' },
                  ].map((preset) => {
                    const active = startTime === preset.time;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setStartTime(preset.time)}
                        className={`rounded-xl border px-2 py-2.5 text-center transition-all ${
                          active
                            ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/30'
                            : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary'
                        }`}
                      >
                        <div className="text-[13px] font-extrabold">
                          {preset.label}
                        </div>
                        <div className="mt-0.5 text-[11px] font-bold opacity-70">
                          {formatTimeDisplay(preset.time)
                            .replace(' ', '')
                            .toLowerCase()}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Notify toggle */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setNotifyEnabled((v) => !v)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setNotifyEnabled((v) => !v);
                    }
                  }}
                  aria-pressed={notifyEnabled}
                  className={`mb-4 flex h-14 w-full cursor-pointer items-center gap-3 rounded-2xl border px-4 text-left transition-all ${
                    notifyEnabled
                      ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                      : 'border-border bg-background hover:border-primary/40 hover:bg-primary/5'
                  }`}
                >
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors ${
                      notifyEnabled
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-amber-100 text-amber-500'
                    }`}
                  >
                    <Bell
                      className={`h-4 w-4 stroke-[3] ${
                        notifyEnabled ? '' : 'fill-current'
                      }`}
                    />
                  </span>
                  <span
                    className={`text-[14px] font-extrabold ${
                      notifyEnabled ? 'text-primary' : 'text-foreground'
                    }`}
                  >
                    Remind me
                  </span>
                </div>

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
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
