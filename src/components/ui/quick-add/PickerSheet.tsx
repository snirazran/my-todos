'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarCheck,
  Check,
  ChevronDown,
  Lock,
  Palette,
  Pencil,
  Plus,
  Tag,
  X,
} from 'lucide-react';
import {
  labelForDisplayDay,
  type ApiDay,
  type DisplayDay,
} from '@/components/board/helpers';
import { TimeSliderColumn } from './TimeSliderColumn';
import { TagsView } from './TagsView';
import {
  HOURS_24,
  MINUTES_60,
} from './constants';
import {
  allDisplayDays,
  pad,
  repeatModeFor,
  weekdayDisplayDays,
  ymdLocal,
  type RepeatMode,
} from './utils';
import type { ActivePicker, RepeatChoice } from './types';
import type { TagManager } from './useTagManager';

type Props = {
  activePicker: ActivePicker;
  setActivePicker: (v: ActivePicker) => void;

  daysOrder?: ReadonlyArray<Exclude<ApiDay, -1>>;

  // date
  selectedDay: DisplayDay;
  isLater: boolean;
  todayIndex: DisplayDay;
  tomorrowIndex: DisplayDay;
  todayKey: string;
  tomorrowKey: string;
  selectedDateKey: string;
  selectSingleDay: (day: DisplayDay) => void;
  selectCalendarDate: (date: Date) => void;

  showCalendarPicker: boolean;
  setShowCalendarPicker: (v: boolean) => void;
  calendarMonthLabel: string;
  calendarCells: Array<Date | null>;
  shiftCalendarMonth: (delta: number) => void;

  // reminder
  notifyEnabled: boolean;
  setNotifyEnabled: (v: boolean) => void;
  startTime: string;
  setStartTime: (v: string) => void;
  setReminder: (v: string) => void;
  showReminderPicker: boolean;
  setShowReminderPicker: (v: boolean) => void;

  // repeat
  repeat: RepeatChoice;
  setRepeat: (v: RepeatChoice) => void;
  repeatDay: DisplayDay;
  pickedDays: DisplayDay[];
  setPickedDays: React.Dispatch<React.SetStateAction<DisplayDay[]>>;

  // tags
  tagManager: TagManager;
  selectedTagIds: string[];
  setSelectedTagIds: React.Dispatch<React.SetStateAction<string[]>>;
  onPremiumLimit: () => void;

  tagInputRef: React.RefObject<HTMLInputElement | null>;
};

export function PickerSheet(props: Props) {
  const reminderSnapshotRef = useRef<{ notifyEnabled: boolean; startTime: string } | null>(null);
  const {
    activePicker,
    setActivePicker,
    daysOrder,
    selectedDay,
    isLater,
    todayIndex,
    tomorrowIndex,
    todayKey,
    tomorrowKey,
    selectedDateKey,
    selectSingleDay,
    selectCalendarDate,
    showCalendarPicker,
    setShowCalendarPicker,
    calendarMonthLabel,
    calendarCells,
    shiftCalendarMonth,
    notifyEnabled,
    setNotifyEnabled,
    startTime,
    setStartTime,
    setReminder,
    showReminderPicker,
    setShowReminderPicker,
    repeat,
    setRepeat,
    repeatDay,
    pickedDays,
    setPickedDays,
    tagManager,
    selectedTagIds,
    setSelectedTagIds,
    onPremiumLimit,
    tagInputRef,
  } = props;

  const currentRepeatMode = repeatModeFor(pickedDays, repeat, daysOrder);
  const setRepeatMode = (mode: RepeatMode) => {
    if (mode === 'none') {
      setRepeat('this-week');
      return;
    }
    setRepeat('weekly');
    if (mode === 'daily') {
      setPickedDays(allDisplayDays());
    } else if (mode === 'weekdays') {
      setPickedDays(weekdayDisplayDays(daysOrder));
    } else {
      setPickedDays([repeatDay]);
    }
  };

  const reminderTime = startTime || '09:00';
  const [reminderHour24, reminderMinute] = reminderTime.split(':').map(Number);

  const setReminderTimeParts = (hour24: number, minute: number) => {
    setStartTime(`${pad(hour24)}:${pad(minute)}`);
    setReminder('at_time');
  };
  const saveReminderTime = () => {
    setNotifyEnabled(true);
    if (!startTime) setStartTime('09:00');
    setReminder('at_time');
    reminderSnapshotRef.current = null;
    setShowReminderPicker(false);
  };

  // Snapshot the reminder state when the time picker opens (from any entry
  // point) so Cancel can revert; clear it when the picker closes.
  useEffect(() => {
    if (showReminderPicker) {
      if (!reminderSnapshotRef.current) {
        reminderSnapshotRef.current = { notifyEnabled, startTime };
      }
    } else {
      reminderSnapshotRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showReminderPicker]);

  const cancelReminderPicker = () => {
    const snap = reminderSnapshotRef.current;
    if (snap) {
      setNotifyEnabled(snap.notifyEnabled);
      setStartTime(snap.startTime);
      if (!snap.notifyEnabled) setReminder('at_time');
    }
    reminderSnapshotRef.current = null;
    setShowReminderPicker(false);
  };

  // Keep the last picker around so the slide-down exit animation can still
  // render the right content after activePicker is cleared.
  const lastActivePickerRef = useRef<ActivePicker>(activePicker);
  useEffect(() => {
    if (activePicker) lastActivePickerRef.current = activePicker;
  }, [activePicker]);
  const displayPicker = activePicker ?? lastActivePickerRef.current;

  return (
    <>
      <AnimatePresence>
        {activePicker && (
          <motion.div
            key="picker-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={() => setActivePicker(null)}
            className="fixed inset-0 z-[1500] bg-black/80"
          />
        )}
      </AnimatePresence>
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[1501] flex items-end justify-center sm:pb-6"
      >
      <AnimatePresence>
        {activePicker && displayPicker && (
          <motion.div
            key="picker-sheet"
            initial={{ y: '150vh' }}
            animate={{ y: 0 }}
            exit={{ y: '150vh' }}
            transition={{ type: 'tween', ease: [0.32, 0.72, 0, 1], duration: 0.32 }}
            className="pointer-events-auto w-full rounded-t-[28px] bg-background px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-6 shadow-[0_20px_45px_rgba(15,23,42,0.32)] ring-1 ring-border/70 sm:mx-4 sm:max-w-[560px] sm:rounded-[28px] sm:pb-8"
          >
        <div className="mx-auto w-full">
          <div className="relative mb-7 flex h-9 items-center justify-center">
            <button
              type="button"
              onClick={() => setActivePicker(null)}
              className="absolute left-0 grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Close picker"
            >
              <X className="h-5 w-5 stroke-[3]" />
            </button>
            <h2 className="text-[18px] font-extrabold text-muted-foreground">
              {displayPicker === 'tags'
                ? 'Tags'
                : displayPicker === 'date'
                  ? 'Date and time'
                  : 'Repeat'}
            </h2>
          </div>

          {displayPicker === 'tags' && (
            <TagsView
              tagManager={tagManager}
              selectedTagIds={selectedTagIds}
              setSelectedTagIds={setSelectedTagIds}
              onPremiumLimit={onPremiumLimit}
              onDone={() => setActivePicker(null)}
              tagInputRef={tagInputRef}
            />
          )}

          {displayPicker === 'date' && (
            <DateView
              isLater={isLater}
              selectedDay={selectedDay}
              todayIndex={todayIndex}
              tomorrowIndex={tomorrowIndex}
              todayKey={todayKey}
              tomorrowKey={tomorrowKey}
              selectedDateKey={selectedDateKey}
              selectSingleDay={selectSingleDay}
              openCalendar={() => setShowCalendarPicker(true)}
            />
          )}

          {displayPicker === 'repeat' && (
            <RepeatView
              currentMode={currentRepeatMode}
              setRepeatMode={setRepeatMode}
              repeatDayLabel={labelForDisplayDay(
                repeatDay as Exclude<DisplayDay, 7>,
                daysOrder,
              )}
              onClose={() => setActivePicker(null)}
            />
          )}
        </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>

      <AnimatePresence>
        {activePicker === 'date' && showCalendarPicker && (
          <CalendarOverlay
            calendarMonthLabel={calendarMonthLabel}
            calendarCells={calendarCells}
            shiftCalendarMonth={shiftCalendarMonth}
            todayKey={todayKey}
            selectedDateKey={selectedDateKey}
            selectCalendarDate={selectCalendarDate}
            onClose={() => setShowCalendarPicker(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showReminderPicker && (
          <ReminderOverlay
            reminderHour24={reminderHour24}
            reminderMinute={reminderMinute}
            setReminderTimeParts={setReminderTimeParts}
            saveReminderTime={saveReminderTime}
            onClose={cancelReminderPicker}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ─── Date view ─────────────────────────────────────────────────────────── */

function DateView({
  isLater,
  selectedDay,
  todayIndex,
  tomorrowIndex,
  todayKey,
  tomorrowKey,
  selectedDateKey,
  selectSingleDay,
  openCalendar,
}: {
  isLater: boolean;
  selectedDay: DisplayDay;
  todayIndex: DisplayDay;
  tomorrowIndex: DisplayDay;
  todayKey: string;
  tomorrowKey: string;
  selectedDateKey: string;
  selectSingleDay: (day: DisplayDay) => void;
  openCalendar: () => void;
}) {
  const isCustomDate =
    selectedDateKey !== todayKey && selectedDateKey !== tomorrowKey && !isLater;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2.5">
        {[
          { label: 'Today', day: todayIndex },
          { label: 'Tomorrow', day: tomorrowIndex },
        ].map(({ label, day }) => {
          const isSelected = !isLater && selectedDay === day;
          return (
            <button
              key={label}
              type="button"
              onClick={() => selectSingleDay(day)}
              className={`h-14 rounded-2xl border text-[14px] font-extrabold transition-all ${
                isSelected
                  ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/30'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary'
              }`}
            >
              {label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={openCalendar}
          className={`h-14 rounded-2xl border text-[14px] font-extrabold transition-all ${
            isCustomDate
              ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/30'
              : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary'
          }`}
        >
          On a date...
        </button>
      </div>
    </div>
  );
}

/* ─── Repeat view ───────────────────────────────────────────────────────── */

function RepeatView({
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

/* ─── Calendar overlay ──────────────────────────────────────────────────── */

function CalendarOverlay({
  calendarMonthLabel,
  calendarCells,
  shiftCalendarMonth,
  todayKey,
  selectedDateKey,
  selectCalendarDate,
  onClose,
}: {
  calendarMonthLabel: string;
  calendarCells: Array<Date | null>;
  shiftCalendarMonth: (delta: number) => void;
  todayKey: string;
  selectedDateKey: string;
  selectCalendarDate: (date: Date) => void;
  onClose: () => void;
}) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[1502] bg-black/70"
      />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[1503] flex items-end justify-center sm:pb-6">
      <motion.div
        dir="ltr"
        initial={{ y: '150vh' }}
        animate={{ y: 0 }}
        exit={{ y: '150vh' }}
        transition={{ type: 'tween', ease: [0.32, 0.72, 0, 1], duration: 0.28 }}
        className="pointer-events-auto w-full rounded-t-[28px] bg-background px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-5 shadow-[0_20px_45px_rgba(15,23,42,0.32)] ring-1 ring-border/70 sm:mx-4 sm:max-w-[520px] sm:rounded-[28px] sm:pb-6"
      >
        <div className="mx-auto w-full">
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
              const selected = dateKey === selectedDateKey;
              const isToday = dateKey === todayKey;
              const muted = dateKey < todayKey;

              const base =
                'mx-auto grid h-10 w-10 place-items-center rounded-full text-[14px] font-extrabold transition-all';
              const stateClass = selected
                ? 'bg-primary text-primary-foreground shadow-[0_4px_12px_rgba(22,163,74,0.35)] scale-105'
                : isToday
                  ? 'bg-primary/10 text-primary ring-1 ring-primary/40 hover:bg-primary/15'
                  : muted
                    ? 'text-muted-foreground/45 hover:bg-muted/40'
                    : 'text-foreground hover:bg-primary/10 hover:text-primary';

              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => selectCalendarDate(date)}
                  className={`${base} ${stateClass}`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      </motion.div>
      </div>
    </>
  );
}

/* ─── Reminder time overlay ─────────────────────────────────────────────── */

function ReminderOverlay({
  reminderHour24,
  reminderMinute,
  setReminderTimeParts,
  saveReminderTime,
  onClose,
}: {
  reminderHour24: number;
  reminderMinute: number;
  setReminderTimeParts: (h: number, m: number) => void;
  saveReminderTime: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[1504] bg-black/70"
      />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[1505] flex items-end justify-center sm:pb-6">
      <motion.div
        dir="ltr"
        initial={{ y: '150vh' }}
        animate={{ y: 0 }}
        exit={{ y: '150vh' }}
        transition={{ type: 'tween', ease: [0.32, 0.72, 0, 1], duration: 0.28 }}
        className="pointer-events-auto w-full rounded-t-[28px] bg-background px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-5 shadow-[0_20px_45px_rgba(15,23,42,0.32)] ring-1 ring-border/70 sm:mx-4 sm:max-w-[440px] sm:rounded-[28px] sm:pb-6"
      >
        <div className="mx-auto w-full">
          <div className="relative mb-5 flex h-8 items-center justify-center">
            <button
              type="button"
              onClick={onClose}
              className="absolute left-0 grid h-8 w-8 place-items-center rounded-full bg-muted/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Cancel"
            >
              <X className="h-4 w-4 stroke-[3]" />
            </button>
            <h3 className="text-[16px] font-extrabold text-foreground">Time</h3>
          </div>

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
                value={reminderHour24}
                onChange={(hour) => setReminderTimeParts(hour, reminderMinute)}
                formatLabel={pad}
              />
              <TimeSliderColumn
                items={MINUTES_60}
                value={reminderMinute}
                onChange={(minute) => setReminderTimeParts(reminderHour24, minute)}
                formatLabel={pad}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={saveReminderTime}
            className="h-11 w-full rounded-xl bg-primary text-[15px] font-extrabold text-primary-foreground transition-all hover:brightness-105 active:scale-[0.985]"
          >
            Save
          </button>
        </div>
      </motion.div>
      </div>
    </>
  );
}
