'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import {
  Bell,
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
import { RepeatView } from './RepeatView';
import { EndDateCalendarSheet } from './EndDateCalendarSheet';
import { CustomRepeatSheet } from './CustomRepeatSheet';
import {
  HOURS_24,
  MINUTES_60,
} from './constants';
import {
  allDisplayDays,
  monthlyRepeatLabel,
  pad,
  repeatModeFor,
  weekdayDisplayDays,
  weekendDisplayDays,
  ymdLocal,
  type RepeatMode,
  type RepeatRule,
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
  repeatEndDate: string | null;
  setRepeatEndDate: (v: string | null) => void;
  repeatRule: RepeatRule | null;
  setRepeatRule: (v: RepeatRule | null) => void;

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
    repeatEndDate,
    setRepeatEndDate,
    repeatRule,
    setRepeatRule,
    tagManager,
    selectedTagIds,
    setSelectedTagIds,
    onPremiumLimit,
    tagInputRef,
  } = props;

  const [showRepeatEndCalendar, setShowRepeatEndCalendar] = useState(false);
  const [showCustomSheet, setShowCustomSheet] = useState(false);

  const currentRepeatMode: RepeatMode =
    repeat === 'custom'
      ? 'custom'
      : repeat === 'monthly'
        ? 'monthly'
        : repeatModeFor(pickedDays, repeat, daysOrder);
  const setRepeatMode = (mode: RepeatMode) => {
    // Any preset choice clears a previously-built custom rule.
    setRepeatRule(null);
    if (mode === 'none') {
      setRepeat('this-week');
      setRepeatEndDate(null);
      return;
    }
    if (mode === 'monthly') {
      setRepeat('monthly');
      return;
    }
    setRepeat('weekly');
    if (mode === 'daily') {
      setPickedDays(allDisplayDays());
    } else if (mode === 'weekdays') {
      setPickedDays(weekdayDisplayDays(daysOrder));
    } else if (mode === 'weekend') {
      setPickedDays(weekendDisplayDays(daysOrder));
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
      <BaseSheet
        open={!!activePicker}
        onOpenChange={(v) => !v && setActivePicker(null)}
        zIndex={1500}
        className="bg-background ring-1 ring-border/70 sm:mx-4 sm:max-w-[560px] max-h-[90vh]"
      >
        {({ bindScroll }) => (
        <div
          ref={bindScroll}
          className="mx-auto w-full overflow-y-auto overscroll-none px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-1 sm:pb-8"
        >
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
              monthlyLabel={monthlyRepeatLabel(selectedDateKey || todayKey)}
              endDate={repeatEndDate}
              onPickEndDate={() => setShowRepeatEndCalendar(true)}
              onClearEndDate={() => setRepeatEndDate(null)}
              customRule={repeatRule}
              onOpenCustom={() => setShowCustomSheet(true)}
            />
          )}
        </div>
        )}
      </BaseSheet>

      <CalendarOverlay
        open={activePicker === 'date' && showCalendarPicker}
        calendarMonthLabel={calendarMonthLabel}
        calendarCells={calendarCells}
        shiftCalendarMonth={shiftCalendarMonth}
        todayKey={todayKey}
        selectedDateKey={selectedDateKey}
        selectCalendarDate={selectCalendarDate}
        onClose={() => setShowCalendarPicker(false)}
      />

      <ReminderOverlay
        open={showReminderPicker}
        reminderHour24={reminderHour24}
        reminderMinute={reminderMinute}
        setReminderTimeParts={setReminderTimeParts}
        saveReminderTime={saveReminderTime}
        onClose={cancelReminderPicker}
      />

      <EndDateCalendarSheet
        open={activePicker === 'repeat' && showRepeatEndCalendar}
        value={repeatEndDate}
        minDateKey={todayKey}
        onSelect={(dateKey) => {
          setRepeatEndDate(dateKey);
          setShowRepeatEndCalendar(false);
        }}
        onClose={() => setShowRepeatEndCalendar(false)}
        zIndex={1700}
      />

      <CustomRepeatSheet
        open={activePicker === 'repeat' && showCustomSheet}
        onClose={() => setShowCustomSheet(false)}
        initialRule={repeatRule}
        initialEndDate={repeatEndDate}
        anchorYmd={selectedDateKey || todayKey}
        onSave={(rule, end) => {
          setRepeatRule(rule);
          setRepeatEndDate(end);
          setRepeat('custom');
        }}
      />
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

/* ─── Calendar overlay ──────────────────────────────────────────────────── */

function CalendarOverlay({
  open,
  calendarMonthLabel,
  calendarCells,
  shiftCalendarMonth,
  todayKey,
  selectedDateKey,
  selectCalendarDate,
  onClose,
}: {
  open: boolean;
  calendarMonthLabel: string;
  calendarCells: Array<Date | null>;
  shiftCalendarMonth: (delta: number) => void;
  todayKey: string;
  selectedDateKey: string;
  selectCalendarDate: (date: Date) => void;
  onClose: () => void;
}) {
  return (
    <BaseSheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      zIndex={1502}
      className="bg-background ring-1 ring-border/70 sm:mx-4 sm:max-w-[520px]"
    >
      {() => (
        <div dir="ltr" className="mx-auto w-full px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-1 sm:pb-6">
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
      )}
    </BaseSheet>
  );
}

/* ─── Reminder time overlay ─────────────────────────────────────────────── */

function ReminderOverlay({
  open,
  reminderHour24,
  reminderMinute,
  setReminderTimeParts,
  saveReminderTime,
  onClose,
}: {
  open: boolean;
  reminderHour24: number;
  reminderMinute: number;
  setReminderTimeParts: (h: number, m: number) => void;
  saveReminderTime: () => void;
  onClose: () => void;
}) {
  return (
    <BaseSheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      zIndex={1504}
      className="bg-background ring-1 ring-border/70 sm:mx-4 sm:max-w-[440px]"
    >
      {() => (
        <div dir="ltr" className="mx-auto w-full px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-1 sm:pb-6">
          <div className="relative mb-5 flex h-8 items-center justify-center">
            <button
              type="button"
              onClick={onClose}
              className="absolute left-0 grid h-8 w-8 place-items-center rounded-full bg-muted/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Cancel"
            >
              <X className="h-4 w-4 stroke-[3]" />
            </button>
            <h3 className="text-[16px] font-extrabold text-foreground">Notify</h3>
          </div>

          {/* Reminder summary */}
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
            Save reminder
          </button>
        </div>
      )}
    </BaseSheet>
  );
}
