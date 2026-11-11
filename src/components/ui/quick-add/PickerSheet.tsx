'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import {
  Bell,
  CalendarCheck,
  Check,
  ChevronDown,
  ChevronRight,
  Lock,
  Repeat as RepeatIcon,
  Palette,
  Pencil,
  Plus,
  Tag,
  X,
} from 'lucide-react';
import {
  apiDayFromDisplay,
  labelForDisplayDay,
  type ApiDay,
  type DisplayDay,
} from '@/components/board/helpers';
import { TagsView } from './TagsView';
import { RepeatView } from './RepeatView';
import { NotifyView } from './NotifyView';
import { EndDateCalendarSheet } from './EndDateCalendarSheet';
import { CustomRepeatSheet } from './CustomRepeatSheet';
import {
  allDisplayDays,
  monthlyRepeatLabel,
  repeatModeFor,
  weekdayDisplayDays,
  weekendDisplayDays,
  ymdLocal,
  type RepeatMode,
  type RepeatRule,
} from './utils';
import type { ActivePicker, RepeatChoice } from './types';
import type { TagManager } from './useTagManager';
import { PRIMARY_BUTTON, Squircle, type Tint } from './kit';
import { MonthGrid } from './MonthGrid';
import { hapticTick } from '@/lib/haptics';

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
  reminder: string;
  setReminder: (v: string) => void;
  showReminderPicker: boolean;
  setShowReminderPicker: (v: boolean) => void;

  // repeat
  repeatsOn: boolean;
  repeatShortLabel: string;
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

function WhenRow({
  icon,
  tint,
  label,
  value,
  set,
  onClick,
}: {
  icon: React.ReactNode;
  tint: Tint;
  label: string;
  value: string;
  set: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-14 w-full items-center gap-3 pl-2.5 pr-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50"
    >
      <Squircle tint={tint} size="lg">
        {icon}
      </Squircle>
      <span className="flex-1 text-[15px] font-extrabold text-foreground">
        {label}
      </span>
      <span
        className={`text-[14px] font-extrabold ${
          set ? 'text-primary' : 'text-muted-foreground'
        }`}
      >
        {value}
      </span>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-muted-foreground/60"
        strokeWidth={3}
      />
    </button>
  );
}

export function PickerSheet(props: Props) {
  const reminderSnapshotRef = useRef<{
    notifyEnabled: boolean;
    startTime: string;
    reminder: string;
  } | null>(null);
  const {
    repeatsOn,
    repeatShortLabel,
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
    reminder,
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

  const saveReminderTime = (time: string, offset: string) => {
    setNotifyEnabled(true);
    setStartTime(time);
    setReminder(offset);
    reminderSnapshotRef.current = null;
    setShowReminderPicker(false);
  };

  // Snapshot the reminder state when the time picker opens (from any entry
  // point) so Cancel can revert; clear it when the picker closes.
  useEffect(() => {
    if (showReminderPicker) {
      if (!reminderSnapshotRef.current) {
        reminderSnapshotRef.current = { notifyEnabled, startTime, reminder };
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
      setReminder(snap.reminder);
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
          className="mx-auto min-h-0 w-full flex-1 overflow-y-auto overscroll-none px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-1 sm:pb-8"
        >
          <div className="relative mb-4 flex h-8 items-center justify-center">
            <h2 className="text-[17px] font-black tracking-tight text-foreground">
              {displayPicker === 'tags'
                ? 'Tags'
                : displayPicker === 'date'
                  ? 'When'
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
            <>
              <DateView
                isLater={isLater}
                selectedDay={selectedDay}
                todayIndex={todayIndex}
                tomorrowIndex={tomorrowIndex}
                todayKey={todayKey}
                tomorrowKey={tomorrowKey}
                selectedDateKey={selectedDateKey}
                selectSingleDay={selectSingleDay}
                selectCalendarDate={selectCalendarDate}
                weekStart={daysOrder ? daysOrder[0] : 0}
                calendarMonthLabel={calendarMonthLabel}
                calendarCells={calendarCells}
                shiftCalendarMonth={shiftCalendarMonth}
              />
              {/* Repeat and reminder are both answers to "when", so they live
                  here rather than as their own chips — the toolbar could not
                  hold five labelled controls on one row. */}
              <div className="mt-3 overflow-hidden rounded-2xl bg-muted/50">
                <WhenRow
                  tint="green"
                  icon={<RepeatIcon className="h-[18px] w-[18px]" strokeWidth={2.5} />}
                  label="Repeat"
                  value={repeatsOn ? repeatShortLabel : 'Never'}
                  set={repeatsOn}
                  onClick={() => setActivePicker('repeat')}
                />
                <div className="mx-3.5 border-t border-border/60" />
                <WhenRow
                  tint="amber"
                  icon={<Bell className="h-[18px] w-[18px]" strokeWidth={2.5} />}
                  label="Reminder"
                  value={notifyEnabled && startTime ? startTime : 'None'}
                  set={notifyEnabled}
                  onClick={() =>
                    requestAnimationFrame(() => setShowReminderPicker(true))
                  }
                />
              </div>
            </>
          )}

          {displayPicker === 'repeat' && (
            <>
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
                onCustomRule={(rule) => {
                  setRepeatRule(rule);
                  setRepeat('custom');
                }}
                anchorDow={apiDayFromDisplay(repeatDay, daysOrder)}
                weekOrder={daysOrder}
              />
              {/* Sticky: the frequency list is long enough to push Save off
                  screen, and a save you have to scroll for reads as missing. */}
              <div className="sticky bottom-0 -mx-5 mt-1 bg-background px-5 pb-1 pt-3">
                <button
                  type="button"
                  onClick={() => setActivePicker(null)}
                  className={PRIMARY_BUTTON}
                >
                  Done
                </button>
              </div>
            </>
          )}
        </div>
        )}
      </BaseSheet>

      <ReminderOverlay
        open={showReminderPicker}
        time={startTime}
        reminder={reminder}
        saveReminderTime={saveReminderTime}
        onClose={cancelReminderPicker}
        canRemove={notifyEnabled}
        onRemove={() => {
          setNotifyEnabled(false);
          setShowReminderPicker(false);
        }}
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

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function DateView({
  isLater,
  selectedDay,
  todayIndex,
  tomorrowIndex,
  todayKey,
  tomorrowKey,
  selectedDateKey,
  selectSingleDay,
  selectCalendarDate,
  weekStart,
  calendarMonthLabel,
  calendarCells,
  shiftCalendarMonth,
}: {
  isLater: boolean;
  selectedDay: DisplayDay;
  todayIndex: DisplayDay;
  tomorrowIndex: DisplayDay;
  todayKey: string;
  tomorrowKey: string;
  selectedDateKey: string;
  selectSingleDay: (day: DisplayDay) => void;
  selectCalendarDate: (date: Date) => void;
  weekStart: number;
  calendarMonthLabel: string;
  calendarCells: Array<Date | null>;
  shiftCalendarMonth: (delta: number) => void;
}) {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 2);
  while (nextWeek.getDay() !== weekStart) {
    nextWeek.setDate(nextWeek.getDate() + 1);
  }
  const nextWeekKey = ymdLocal(nextWeek);

  const quick: Array<{
    label: string;
    date: Date;
    tint: Tint;
    selected: boolean;
    pick: () => void;
  }> = [
    {
      label: 'Today',
      date: today,
      tint: 'sky',
      selected: !isLater && selectedDay === todayIndex && selectedDateKey === todayKey,
      pick: () => selectSingleDay(todayIndex),
    },
    {
      label: 'Tomorrow',
      date: tomorrow,
      tint: 'amber',
      selected: !isLater && selectedDateKey === tomorrowKey,
      pick: () => selectSingleDay(tomorrowIndex),
    },
    {
      label: 'Next week',
      date: nextWeek,
      tint: 'violet',
      selected: !isLater && selectedDateKey === nextWeekKey,
      pick: () => selectCalendarDate(nextWeek),
    },
  ];

  return (
    <div>
      <div role="radiogroup" aria-label="Day" className="mb-3 grid grid-cols-3 gap-2">
        {quick.map((option) => (
          <button
            key={option.label}
            type="button"
            role="radio"
            aria-checked={option.selected}
            onClick={() => {
              hapticTick();
              option.pick();
            }}
            className={`flex h-[72px] items-center gap-2.5 rounded-2xl pl-2.5 pr-2 text-left transition-[background-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.96] ${
              option.selected
                ? 'bg-primary/10 ring-2 ring-inset ring-primary/40'
                : 'bg-muted/50 [@media(hover:hover)]:hover:bg-muted'
            }`}
          >
            <Squircle
              tint={option.tint}
              size="lg"
              className="h-10 w-10 text-[16px] font-black tabular-nums"
            >
              {option.date.getDate()}
            </Squircle>
            <span className="flex min-w-0 flex-col">
              <span
                className={`truncate text-[13.5px] font-extrabold leading-tight ${
                  option.selected ? 'text-primary' : 'text-foreground'
                }`}
              >
                {option.label}
              </span>
              <span className="text-[12px] font-bold leading-tight text-muted-foreground">
                {DAY_NAMES[option.date.getDay()]}
              </span>
            </span>
          </button>
        ))}
      </div>

      <MonthGrid
        monthLabel={calendarMonthLabel}
        cells={calendarCells}
        onShift={shiftCalendarMonth}
        selectedKey={isLater ? null : selectedDateKey}
        todayKey={todayKey}
        onPick={selectCalendarDate}
      />
    </div>
  );
}


/* ─── Reminder time overlay ─────────────────────────────────────────────── */

function ReminderOverlay({
  open,
  time,
  reminder,
  saveReminderTime,
  onClose,
  onRemove,
  canRemove = false,
}: {
  open: boolean;
  time: string;
  reminder: string;
  saveReminderTime: (time: string, offset: string) => void;
  onClose: () => void;
  onRemove?: () => void;
  canRemove?: boolean;
}) {
  return (
    <BaseSheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      zIndex={1504}
      className="bg-background ring-1 ring-border/70 sm:mx-4 sm:max-w-[440px]"
    >
      {() => (
        <div
          dir="ltr"
          className="mx-auto max-h-[88dvh] w-full overflow-y-auto overscroll-contain px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-1 sm:pb-6"
        >
          <NotifyView
            time={time}
            reminder={reminder}
            onSave={saveReminderTime}
            canRemove={canRemove}
            onRemove={onRemove}
          />
        </div>
      )}
    </BaseSheet>
  );
}
