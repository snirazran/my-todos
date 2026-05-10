'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell,
  CalendarCheck,
  Check,
  ChevronDown,
  Clock,
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
import {
  HOURS_12,
  MINUTES_60,
  PERIODS,
  TAG_COLORS,
  TAG_MAX_LENGTH,
} from './constants';
import {
  allDisplayDays,
  formatTimeDisplay,
  pad,
  repeatModeFor,
  weekdayDisplayDays,
  ymdLocal,
  type RepeatMode,
} from './utils';
import type { ActivePicker, RepeatChoice, SavedTag } from './types';
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

  tagInputRef: React.RefObject<HTMLInputElement>;
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
  const reminderPeriod = reminderHour24 >= 12 ? 'PM' : 'AM';
  const reminderHour12 = reminderHour24 % 12 || 12;

  const setReminderTimeParts = (
    hour12: number,
    minute: number,
    period: 'AM' | 'PM',
  ) => {
    const normalizedHour =
      period === 'PM'
        ? hour12 === 12
          ? 12
          : hour12 + 12
        : hour12 === 12
          ? 0
          : hour12;
    setStartTime(`${pad(normalizedHour)}:${pad(minute)}`);
    setReminder('at_time');
  };
  const setReminderPreset = (time: string) => {
    setStartTime(time);
    setReminder('at_time');
  };
  const saveReminderTime = () => {
    setNotifyEnabled(true);
    if (!startTime) setStartTime('09:00');
    setReminder('at_time');
    reminderSnapshotRef.current = null;
    setShowReminderPicker(false);
  };

  const openReminderPicker = (snapshot: { notifyEnabled: boolean; startTime: string }) => {
    reminderSnapshotRef.current = snapshot;
    setShowReminderPicker(true);
  };

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

  if (!activePicker) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => setActivePicker(null)}
        className="fixed inset-0 z-[1001] bg-black/35"
      />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'tween', ease: [0.32, 0.72, 0, 1], duration: 0.32 }}
        className="fixed inset-x-0 bottom-0 z-[1002] rounded-t-[28px] bg-background px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-5 shadow-[0_-20px_45px_rgba(15,23,42,0.22)] ring-1 ring-border/70"
      >
        <div className="mx-auto w-full max-w-[680px]">
          <div className="relative mb-6 flex h-8 items-center justify-center">
            <button
              type="button"
              onClick={() => setActivePicker(null)}
              className="absolute left-0 grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Close picker"
            >
              <X className="h-5 w-5 stroke-[3]" />
            </button>
            <h2 className="text-[17px] font-extrabold text-muted-foreground">
              {activePicker === 'tags'
                ? 'Tags'
                : activePicker === 'date'
                  ? 'Date and time'
                  : 'Repeat'}
            </h2>
          </div>

          {activePicker === 'tags' && (
            <TagsView
              tagManager={tagManager}
              selectedTagIds={selectedTagIds}
              setSelectedTagIds={setSelectedTagIds}
              onPremiumLimit={onPremiumLimit}
              onDone={() => setActivePicker(null)}
              tagInputRef={tagInputRef}
            />
          )}

          {activePicker === 'date' && (
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
              notifyEnabled={notifyEnabled}
              setNotifyEnabled={setNotifyEnabled}
              setStartTime={setStartTime}
              setReminder={setReminder}
              startTime={startTime}
              openReminderPicker={openReminderPicker}
              setShowReminderPicker={setShowReminderPicker}
            />
          )}

          {activePicker === 'repeat' && (
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
        {activePicker === 'date' && showReminderPicker && (
          <ReminderOverlay
            reminderHour12={reminderHour12}
            reminderMinute={reminderMinute}
            reminderPeriod={reminderPeriod}
            reminderTime={reminderTime}
            setReminderTimeParts={setReminderTimeParts}
            setReminderPreset={setReminderPreset}
            saveReminderTime={saveReminderTime}
            onClose={cancelReminderPicker}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ─── Tags view ─────────────────────────────────────────────────────────── */

function TagsView({
  tagManager,
  selectedTagIds,
  onPremiumLimit,
  onDone,
  tagInputRef,
}: {
  tagManager: TagManager;
  selectedTagIds: string[];
  setSelectedTagIds: React.Dispatch<React.SetStateAction<string[]>>;
  onPremiumLimit: () => void;
  onDone: () => void;
  tagInputRef: React.RefObject<HTMLInputElement>;
}) {
  const {
    savedTags,
    filteredTags,
    isPremium,
    tagInput,
    setTagInput,
    showColorPicker,
    setShowColorPicker,
    newTagColor,
    setNewTagColor,
    manageTagsMode,
    setManageTagsMode,
    isCreatingTag,
    handleAddTag,
    createAndSaveTag,
    deleteSavedTag,
    toggleTag,
  } = tagManager;

  const placeholder = useMemo(() => {
    const suggestions = [
      'work', 'home', 'urgent', 'errands', 'fitness', 'study', 'shopping',
      'health', 'family', 'travel', 'ideas', 'reading', 'finance', 'hobby',
      'meeting', 'project', 'personal', 'chores',
    ];
    return `${suggestions[Math.floor(Math.random() * suggestions.length)]}...`;
  }, []);

  const [pendingDelete, setPendingDelete] = useState<SavedTag | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => setPortalReady(true), []);

  const confirmDelete = (e: React.MouseEvent | React.PointerEvent) => {
    if (!pendingDelete) return;
    deleteSavedTag(pendingDelete.id, pendingDelete.name, e as React.MouseEvent);
    setPendingDelete(null);
  };

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <div className="relative flex-1">
            <Tag className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={tagInputRef}
              value={tagInput}
              onChange={(e) => {
                setTagInput(e.target.value);
                setShowColorPicker(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAddTag();
                }
              }}
              maxLength={TAG_MAX_LENGTH}
              placeholder={placeholder}
              className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm font-bold text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <button
            type="button"
            onClick={handleAddTag}
            disabled={!tagInput}
            aria-label={showColorPicker ? 'Pick color' : 'Add tag'}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition-all hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:active:scale-100"
          >
            {showColorPicker ? (
              <Palette className="h-5 w-5 stroke-[2.5]" />
            ) : (
              <Plus className="h-5 w-5 stroke-[3]" />
            )}
          </button>
        </div>

        <AnimatePresence>
          {showColorPicker && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mb-2 rounded-xl border border-border bg-background p-2.5">
                <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                  Pick a color
                </div>
                <div className="mb-2 flex flex-wrap gap-2">
                  {TAG_COLORS.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => setNewTagColor(c.value)}
                      className={`h-7 w-7 rounded-full ${c.bg} ring-2 ring-offset-2 ring-offset-background transition-transform ${
                        newTagColor === c.value
                          ? 'scale-110 ring-primary'
                          : 'ring-transparent'
                      }`}
                      title={c.name}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={createAndSaveTag}
                  disabled={isCreatingTag}
                  className="h-9 w-full rounded-xl bg-primary text-xs font-extrabold text-primary-foreground disabled:opacity-50"
                >
                  {isCreatingTag ? 'Saving...' : 'Save Tag'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {savedTags.length > 0 && !showColorPicker && (
          <>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                Saved Tags ({savedTags.length}/{isPremium ? 50 : 3})
              </span>
              <button
                type="button"
                onClick={() => setManageTagsMode(!manageTagsMode)}
                className={`grid h-7 w-7 place-items-center rounded-lg transition-colors ${
                  manageTagsMode
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
                title={manageTagsMode ? 'Done editing' : 'Manage tags'}
              >
                {manageTagsMode ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Pencil className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            <div className="flex max-h-[220px] flex-wrap gap-2 overflow-y-auto px-1 py-1.5">
              {filteredTags.map((st) => {
                const isSelected = selectedTagIds.includes(st.id);
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={(e) => {
                      if (manageTagsMode) {
                        e.stopPropagation();
                        setPendingDelete(st);
                        return;
                      }
                      if (st.disabled) {
                        onPremiumLimit();
                        return;
                      }
                      toggleTag(st);
                    }}
                    className={`relative m-0.5 rounded-lg border px-3 py-2 text-[11px] font-extrabold uppercase tracking-wide transition-all ${
                      isSelected
                        ? 'ring-2 ring-offset-1 ring-offset-background'
                        : st.disabled
                          ? 'cursor-pointer border-dashed opacity-60 grayscale'
                          : 'bg-background opacity-80 hover:opacity-100'
                    } ${manageTagsMode ? 'text-rose-500' : ''}`}
                    style={{
                      backgroundColor: isSelected ? `${st.color}20` : undefined,
                      color: manageTagsMode ? '#ef4444' : st.color,
                      borderColor: manageTagsMode
                        ? '#ef4444'
                        : isSelected
                          ? `${st.color}40`
                          : `${st.color}25`,
                    }}
                  >
                    {st.name}
                    {st.disabled && (
                      <Lock className="ml-1 inline h-3 w-3" />
                    )}
                    {manageTagsMode && (
                      <span className="absolute -left-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full bg-rose-500 text-white">
                        <X className="h-2.5 w-2.5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={onDone}
        className="h-11 w-full rounded-xl bg-primary text-[15px] font-extrabold text-primary-foreground transition-transform active:scale-[0.985]"
      >
        Done
        {selectedTagIds.length > 0
          ? ` (${selectedTagIds.length} tag${selectedTagIds.length === 1 ? '' : 's'})`
          : ''}
      </button>

      {portalReady &&
        createPortal(
          <AnimatePresence>
            {pendingDelete && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setPendingDelete(null)}
                  className="fixed inset-0 z-[1010] bg-black/45"
                />
                <div className="fixed inset-0 z-[1011] flex items-center justify-center p-4 pointer-events-none">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.18 }}
                  className="pointer-events-auto w-full max-w-[360px] rounded-2xl bg-background p-5 shadow-xl ring-1 ring-border/70"
                  role="alertdialog"
                  aria-modal="true"
                >
                  <h3 className="mb-1 text-[16px] font-extrabold text-foreground">
                    Delete tag?
                  </h3>
                  <p className="mb-4 text-[13px] text-muted-foreground">
                    Remove{' '}
                    <span
                      className="font-bold"
                      style={{ color: pendingDelete.color }}
                    >
                      {pendingDelete.name}
                    </span>{' '}
                    from your saved tags. This can't be undone.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPendingDelete(null)}
                      className="h-10 rounded-xl bg-muted text-[13px] font-extrabold text-foreground transition-colors hover:bg-muted/70"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={confirmDelete}
                      className="h-10 rounded-xl bg-rose-500 text-[13px] font-extrabold text-white transition-colors hover:bg-rose-600"
                    >
                      Delete
                    </button>
                  </div>
                </motion.div>
                </div>
              </>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
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
  notifyEnabled,
  setNotifyEnabled,
  startTime,
  setStartTime,
  setReminder,
  openReminderPicker,
  setShowReminderPicker,
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
  notifyEnabled: boolean;
  setNotifyEnabled: (v: boolean) => void;
  startTime: string;
  setStartTime: (v: string) => void;
  setReminder: (v: string) => void;
  openReminderPicker: (snapshot: { notifyEnabled: boolean; startTime: string }) => void;
  setShowReminderPicker: (v: boolean) => void;
}) {
  const isCustomDate =
    selectedDateKey !== todayKey && selectedDateKey !== tomorrowKey && !isLater;

  const toggleRemind = () => {
    if (notifyEnabled) {
      setNotifyEnabled(false);
      setStartTime('');
      setReminder('at_time');
      setShowReminderPicker(false);
      return;
    }
    openReminderPicker({ notifyEnabled: false, startTime: '' });
    setNotifyEnabled(true);
    if (!startTime) setStartTime('09:00');
  };

  const editReminderTime = () => {
    openReminderPicker({ notifyEnabled, startTime });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
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
              className={`h-11 rounded-xl border text-[13px] font-extrabold transition-all ${
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
          className={`h-11 rounded-xl border text-[13px] font-extrabold transition-all ${
            isCustomDate
              ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/30'
              : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary'
          }`}
        >
          On a date...
        </button>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={toggleRemind}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleRemind();
          }
        }}
        aria-pressed={notifyEnabled}
        className={`flex h-14 w-full cursor-pointer items-center gap-3 rounded-2xl border px-3 text-left transition-all ${
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
            className={`h-4 w-4 stroke-[3] ${notifyEnabled ? '' : 'fill-current'}`}
          />
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={`block text-[14px] font-extrabold ${
              notifyEnabled ? 'text-primary' : 'text-foreground'
            }`}
          >
            Remind me
          </span>
          <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {notifyEnabled ? 'Tap again to turn off' : 'Off'}
          </span>
        </span>

        {notifyEnabled && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              editReminderTime();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                editReminderTime();
              }
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-[12px] font-extrabold text-primary-foreground transition-transform active:scale-95"
          >
            <Clock className="h-3.5 w-3.5 stroke-[3]" />
            {formatTimeDisplay(startTime || '09:00')}
          </span>
        )}
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
    <div className="space-y-2">
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
            className={`flex h-12 w-full items-center justify-between rounded-2xl border px-4 text-left text-[14px] font-extrabold transition-all ${
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
        className="fixed inset-0 z-[1003] bg-black/10"
      />
      <motion.div
        dir="ltr"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'tween', ease: [0.32, 0.72, 0, 1], duration: 0.28 }}
        className="fixed inset-x-0 bottom-0 z-[1004] rounded-t-[28px] bg-background px-5 pb-[calc(env(safe-area-inset-bottom)+22px)] pt-5 shadow-[0_-18px_42px_rgba(15,23,42,0.18)] ring-1 ring-border/70"
      >
        <div className="mx-auto w-full max-w-[560px]">
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
    </>
  );
}

/* ─── Reminder time overlay ─────────────────────────────────────────────── */

function ReminderOverlay({
  reminderHour12,
  reminderMinute,
  reminderPeriod,
  reminderTime,
  setReminderTimeParts,
  setReminderPreset,
  saveReminderTime,
  onClose,
}: {
  reminderHour12: number;
  reminderMinute: number;
  reminderPeriod: 'AM' | 'PM';
  reminderTime: string;
  setReminderTimeParts: (h: number, m: number, p: 'AM' | 'PM') => void;
  setReminderPreset: (time: string) => void;
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
        className="fixed inset-0 z-[1005] bg-black/10"
      />
      <motion.div
        dir="ltr"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'tween', ease: [0.32, 0.72, 0, 1], duration: 0.28 }}
        className="fixed inset-x-0 bottom-0 z-[1006] rounded-t-[28px] bg-background px-5 pb-[calc(env(safe-area-inset-bottom)+22px)] pt-5 shadow-[0_-18px_42px_rgba(15,23,42,0.18)] ring-1 ring-border/70"
      >
        <div className="mx-auto w-full max-w-[560px]">
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

          <div className="relative mx-auto mb-5 grid max-w-[300px] grid-cols-3 items-center overflow-hidden text-center">
            <div className="pointer-events-none absolute inset-x-0 top-1/2 z-0 h-11 -translate-y-1/2 rounded-2xl bg-primary/10 ring-1 ring-primary/25" />
            <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-12 bg-gradient-to-b from-background to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-12 bg-gradient-to-t from-background to-transparent" />

            <TimeSliderColumn
              items={HOURS_12}
              value={reminderHour12}
              onChange={(hour) =>
                setReminderTimeParts(hour, reminderMinute, reminderPeriod)
              }
            />
            <TimeSliderColumn
              items={MINUTES_60}
              value={reminderMinute}
              onChange={(minute) =>
                setReminderTimeParts(reminderHour12, minute, reminderPeriod)
              }
              formatLabel={pad}
            />
            <TimeSliderColumn
              items={[...PERIODS]}
              value={reminderPeriod}
              onChange={(period) =>
                setReminderTimeParts(reminderHour12, reminderMinute, period)
              }
            />
          </div>

          <div className="mb-4 grid grid-cols-3 gap-2">
            {[
              { label: 'Morning', time: '09:00' },
              { label: 'Afternoon', time: '13:00' },
              { label: 'Evening', time: '20:00' },
            ].map((preset) => {
              const active = reminderTime === preset.time;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setReminderPreset(preset.time)}
                  className={`rounded-xl border px-2 py-2.5 text-center transition-all ${
                    active
                      ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/30'
                      : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary'
                  }`}
                >
                  <div className="text-[13px] font-extrabold">{preset.label}</div>
                  <div className="mt-0.5 text-[11px] font-bold opacity-70">
                    {formatTimeDisplay(preset.time).replace(' ', '').toLowerCase()}
                  </div>
                </button>
              );
            })}
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
    </>
  );
}
