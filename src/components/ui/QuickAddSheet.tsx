'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell,
  CalendarCheck,
  Clock,
  Plus,
  RotateCcw,
  Tag,
  X,
} from 'lucide-react';
import {
  apiDayFromDisplay,
  displayDayFromApi,
  labelForDisplayDay,
  todayDisplayIndex,
  type ApiDay,
  type DisplayDay,
} from '@/components/board/helpers';
import Fly from '@/components/ui/fly';
import { PremiumLimitDialog } from './PremiumLimitDialog';
import { PickerSheet } from './quick-add/PickerSheet';
import { SuggestionTabs } from './quick-add/SuggestionTabs';
import { useTagManager } from './quick-add/useTagManager';
import { useCalendarMonth } from './quick-add/useCalendarMonth';
import { useKeyboardInset } from './quick-add/useKeyboardInset';
import {
  formatTimeDisplay,
  parseYmdLocal,
  repeatModeFor,
  ymdLocal,
} from './quick-add/utils';
import type {
  ActivePicker,
  QuickAddSheetProps,
  RepeatChoice,
} from './quick-add/types';

export type { QuickAddSheetProps } from './quick-add/types';

export default function QuickAddSheet({
  open,
  onOpenChange,
  onSubmit,
  initialText = '',
  defaultRepeat = 'this-week',
  defaultPickedDay,
  defaultDateKey,
  daysOrder,
  hideDayPicker = false,
  hideRepeatPicker = false,
  focusCategoryIds,
  categoryTagMap,
}: QuickAddSheetProps) {
  const [text, setText] = useState(initialText);
  const [repeat, setRepeat] = useState<RepeatChoice>(defaultRepeat);
  const [tags, setTags] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showPremiumLimit, setShowPremiumLimit] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const tagManager = useTagManager({
    open,
    selectedTags: tags,
    setSelectedTags: setTags,
    onPremiumLimit: () => setShowPremiumLimit(true),
  });

  const [pickedDays, setPickedDays] = useState<DisplayDay[]>([]);
  const [activePicker, setActivePicker] = useState<ActivePicker>(null);
  const [selectedDateKey, setSelectedDateKey] = useState('');
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);

  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reminder, setReminder] = useState('at_time');
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [autoAddedTagIds, setAutoAddedTagIds] = useState<string[]>([]);
  const [sheetBaseHeight, setSheetBaseHeight] = useState<number | null>(null);
  const [suggestionsReady, setSuggestionsReady] = useState(false);

  const calendar = useCalendarMonth(new Date());
  const { inset: keyboardInset, height: viewportHeight } = useKeyboardInset(open);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!activePicker) {
      setShowCalendarPicker(false);
      setShowReminderPicker(false);
    }
  }, [activePicker]);

  useEffect(() => {
    if (!open) {
      setSuggestionsReady(false);
      return;
    }

    const id = window.setTimeout(() => setSuggestionsReady(true), 180);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    setText(initialText);

    const initialDay = (() => {
      if (defaultDateKey) {
        const dow = parseYmdLocal(defaultDateKey).getDay() as Exclude<ApiDay, -1>;
        return daysOrder ? daysOrder.indexOf(dow) : dow;
      }
      if (defaultPickedDay !== undefined) return defaultPickedDay as DisplayDay;
      return todayDisplayIndex(daysOrder);
    })();
    setPickedDays([
      (initialDay >= 0 ? initialDay : todayDisplayIndex(daysOrder)) as DisplayDay,
    ]);

    setRepeat(defaultRepeat);
    setTags([]);
    setIsSubmitting(false);
    tagManager.reset();

    setStartTime('');
    setEndTime('');
    setReminder('at_time');
    setNotifyEnabled(false);
    setShowReminderPicker(false);
    setActivePicker(null);
    setShowCalendarPicker(false);
    setAutoAddedTagIds([]);
    setInputFocused(false);

    const initialDate = defaultDateKey ?? ymdLocal(new Date());
    setSelectedDateKey(initialDate);
    calendar.setCalendarMonthFromDate(parseYmdLocal(initialDate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialText, defaultRepeat, defaultPickedDay, defaultDateKey, daysOrder]);

  const isLater = pickedDays.includes(7);
  const todayKey = ymdLocal(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowKey = ymdLocal(tomorrowDate);
  const todayIndex = todayDisplayIndex(daysOrder);
  const tomorrowIndex = ((todayIndex + 1) % 7) as DisplayDay;
  const selectedDay = (pickedDays[0] ?? todayIndex) as DisplayDay;
  const anchorDate = selectedDateKey ? parseYmdLocal(selectedDateKey) : new Date();
  const anchorApiDay = anchorDate.getDay() as Exclude<ApiDay, -1>;
  const anchorDisplayDay = displayDayFromApi(anchorApiDay, daysOrder);
  const repeatDay = (
    isLater || anchorDisplayDay === 7 ? todayIndex : anchorDisplayDay
  ) as DisplayDay;
  const repeatsOn = repeat === 'weekly';
  const hasTaskText = text.trim().length > 0;
  const keyboardActive = inputFocused && keyboardInset > 0;
  const availableSheetHeight = Math.max(
    320,
    sheetBaseHeight ?? viewportHeight ?? 900,
  );
  const showSuggestions = suggestionsReady && !hasTaskText;
  const suggestionsPanelHeight = Math.min(
    Math.max(availableSheetHeight - 420, 180),
    420,
  );

  useEffect(() => {
    if (!open) {
      setSheetBaseHeight(null);
      return;
    }
    if (typeof window === 'undefined') return;
    if (keyboardInset > 0) return;

    setSheetBaseHeight(window.visualViewport?.height ?? window.innerHeight);
  }, [open, keyboardInset, viewportHeight]);

  const selectedDateLabel = isLater
    ? 'Later'
    : selectedDateKey === todayKey
      ? 'Today'
      : selectedDateKey === tomorrowKey
        ? 'Tomorrow'
        : selectedDateKey
          ? parseYmdLocal(selectedDateKey).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })
          : labelForDisplayDay(selectedDay as Exclude<DisplayDay, 7>, daysOrder);

  const repeatMode = repeatModeFor(pickedDays, repeat, daysOrder);
  const repeatLabel =
    repeatMode === 'daily'
      ? 'Every day'
      : repeatMode === 'weekdays'
        ? 'Every weekday'
        : repeatMode === 'weekly'
          ? `Every week on ${labelForDisplayDay(repeatDay as Exclude<DisplayDay, 7>, daysOrder)}`
          : 'Does not repeat';

  const selectSingleDay = (day: DisplayDay) => {
    setPickedDays([day]);
    const date = new Date();
    const offset = day === tomorrowIndex ? 1 : 0;
    date.setDate(date.getDate() + offset);
    setSelectedDateKey(ymdLocal(date));
    setActivePicker(null);
  };

  const selectCalendarDate = (date: Date) => {
    const dateKey = ymdLocal(date);
    const displayDay = daysOrder
      ? (daysOrder.indexOf(date.getDay() as Exclude<ApiDay, -1>) as DisplayDay)
      : (date.getDay() as DisplayDay);
    setSelectedDateKey(dateKey);
    setPickedDays([
      (displayDay >= 0 ? displayDay : todayDisplayIndex(daysOrder)) as DisplayDay,
    ]);
    setShowCalendarPicker(false);
    setActivePicker(null);
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    const apiDays: ApiDay[] = pickedDays
      .slice()
      .sort()
      .map((d) => apiDayFromDisplay(d, daysOrder));
    if (apiDays.length === 0) return;

    const exactDates =
      repeat === 'this-week' && !isLater && selectedDateKey
        ? [selectedDateKey]
        : undefined;

    setIsSubmitting(true);
    try {
      await onSubmit({
        text: trimmed,
        days: apiDays,
        dates: exactDates,
        repeat,
        tags,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        reminder: notifyEnabled ? reminder : undefined,
      });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!mounted) return null;

  return (
    <>
      {createPortal(
        <AnimatePresence>
          {open && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => onOpenChange(false)}
                transition={{ duration: 0.16, ease: 'easeOut' }}
                className="fixed inset-0 z-[1399] bg-[linear-gradient(to_bottom,transparent_0%,transparent_18%,hsl(var(--primary)/0.18)_30%,hsl(var(--primary)/0.45)_42%,hsl(var(--primary)/0.75)_54%,hsl(var(--primary))_68%)] will-change-opacity"
              />

              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{
                  type: 'tween',
                  ease: [0.32, 0.72, 0, 1],
                  duration: 0.32,
                }}
                style={{
                  contain: 'layout paint style',
                }}
                className="fixed inset-x-0 bottom-0 z-[1400] flex max-h-[100dvh] transform-gpu items-end px-4 py-2 pointer-events-none will-change-transform sm:px-6 sm:py-5"
              >
                <div className="pointer-events-auto mx-auto flex w-full max-w-[620px] flex-col pb-[env(safe-area-inset-bottom)]">
                  <div className="mb-2 flex shrink-0 justify-end px-3">
                    <button
                      type="button"
                      aria-label="Close"
                      onClick={() => onOpenChange(false)}
                      className="grid h-10 w-10 place-items-center rounded-full bg-popover text-foreground shadow-sm ring-1 ring-border/70 transition-colors [@media(hover:hover)]:hover:bg-muted"
                    >
                      <X className="h-5 w-5 stroke-[3]" />
                    </button>
                  </div>

                  <div className="flex max-h-[calc(100dvh_-_5rem_-_env(safe-area-inset-bottom))] flex-col overflow-hidden rounded-[28px] bg-popover px-4 pb-2 pt-4 ring-1 ring-border/80 sm:max-h-[calc(100dvh_-_5.5rem_-_env(safe-area-inset-bottom))]">
                    <div dir="ltr" className="w-full pt-1">
                      <div className="mb-1 flex shrink-0 items-center gap-2">
                        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-muted-foreground/10 bg-muted">
                          <Fly size={36} y={-3} />
                        </div>
                        <div className="relative flex-1">
                          <input
                            ref={inputRef}
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onFocus={() => setInputFocused(true)}
                            onBlur={() => setInputFocused(false)}
                            placeholder="New task?"
                            disabled={isSubmitting}
                            spellCheck={false}
                            autoComplete="off"
                            maxLength={45}
                            className="h-12 w-full rounded-[16px] bg-muted/50 pl-4 pr-14 text-lg font-medium text-foreground ring-1 ring-border/80 shadow-[0_1px_0_rgba(255,255,255,.1)_inset] focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 text-left"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit();
                              }
                              if (e.key === 'Escape') onOpenChange(false);
                            }}
                          />
                          {text.length >= 40 && (
                            <span
                              aria-hidden="true"
                              className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold tabular-nums ${
                                text.length >= 45 ? 'text-rose-500' : 'text-rose-400'
                              }`}
                            >
                              {text.length}/45
                            </span>
                          )}
                        </div>
                      </div>

                      {(tags.length > 0 || startTime) && (
                        <div className="relative mb-1 mt-2 shrink-0 overflow-visible px-1">
                          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5 pt-1 px-1 -mx-1 mask-fade-right">
                            {startTime && (
                              <button
                                type="button"
                                onClick={() => {
                                  setStartTime('');
                                  setEndTime('');
                                  setNotifyEnabled(false);
                                }}
                                className="group shrink-0 relative inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider border border-primary/20 bg-primary/10 text-primary transition-all shadow-sm [@media(hover:hover)]:hover:opacity-75 active:scale-95"
                              >
                                <Clock className="w-3 h-3" />
                                <span>
                                  {formatTimeDisplay(startTime)}
                                  {endTime && ` - ${formatTimeDisplay(endTime)}`}
                                </span>
                                <X className="w-3 h-3 opacity-50 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity" />
                              </button>
                            )}
                            {tags.map((tagId) => {
                              const tag = tagManager.getTagDetails(tagId);
                              const color = tag?.color;
                              const name = tag?.name || 'Unknown';

                              return (
                                <button
                                  key={tagId}
                                  type="button"
                                  onClick={() => tagManager.removeTag(tagId)}
                                  className="group shrink-0 relative inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider border transition-all shadow-sm [@media(hover:hover)]:hover:opacity-75 active:scale-95"
                                  style={
                                    color
                                      ? {
                                          backgroundColor: `${color}20`,
                                          color: color,
                                          borderColor: `${color}40`,
                                        }
                                      : undefined
                                  }
                                >
                                  {!color && (
                                    <span className="bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800 flex items-center gap-1 h-full w-full absolute inset-0 rounded-md px-2 opacity-10 pointer-events-none" />
                                  )}
                                  <span
                                    className={
                                      !color
                                        ? 'text-indigo-700 dark:text-indigo-300 relative z-10'
                                        : 'relative z-10'
                                    }
                                  >
                                    {name}
                                  </span>
                                  <X className="w-3 h-3 opacity-50 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity" />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="mb-0 mt-1 shrink-0 space-y-1">
                        <button
                          type="button"
                          onClick={() => {
                            setActivePicker('tags');
                          }}
                          className="group flex h-10 w-full items-center gap-2 rounded-xl text-left transition-colors [@media(hover:hover)]:hover:bg-muted/45"
                        >
                          <span className="grid h-full w-12 shrink-0 place-items-center">
                            <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-primary">
                              <Tag className="h-3.5 w-3.5 stroke-[3]" />
                            </span>
                          </span>
                          <span className="min-w-0 flex-1 text-[13px] font-extrabold text-muted-foreground">
                            {tags.length > 0
                              ? `${tags.length} tag${tags.length === 1 ? '' : 's'} selected`
                              : 'Add tags'}
                          </span>
                        </button>

                        {!hideDayPicker && (
                          <button
                            type="button"
                            onClick={() => setActivePicker('date')}
                            className="group flex h-10 w-full items-center gap-2 rounded-xl text-left transition-colors [@media(hover:hover)]:hover:bg-muted/45"
                          >
                            <span className="grid h-full w-12 shrink-0 place-items-center">
                              <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-primary">
                                <CalendarCheck className="h-3.5 w-3.5 stroke-[3]" />
                              </span>
                            </span>
                            <span className="min-w-0 flex-1 text-[13px] font-extrabold text-muted-foreground">
                              {selectedDateLabel}
                            </span>
                            {notifyEnabled && (
                              <Bell className="h-3.5 w-3.5 shrink-0 mr-3 text-amber-500" />
                            )}
                          </button>
                        )}

                        {!hideRepeatPicker && (
                          <button
                            type="button"
                            onClick={() => setActivePicker('repeat')}
                            className="group flex h-10 w-full items-center gap-2 rounded-xl text-left transition-colors [@media(hover:hover)]:hover:bg-muted/45"
                          >
                            <span className="grid h-full w-12 shrink-0 place-items-center">
                              <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-primary">
                                <RotateCcw className="h-3.5 w-3.5 stroke-[3]" />
                              </span>
                            </span>
                            <span className="min-w-0 flex-1 text-[13px] font-extrabold text-muted-foreground">
                              {repeatLabel}
                            </span>
                          </button>
                        )}

                      </div>
                    </div>

                  </div>

                  <motion.div
                    key="quick-add-suggestions-slot"
                    initial={{ height: suggestionsPanelHeight, marginTop: 12 }}
                    animate={{ height: suggestionsPanelHeight, marginTop: 12 }}
                    transition={{
                      duration: 0.28,
                      ease: [0.32, 0.72, 0, 1],
                    }}
                    className="pointer-events-none relative min-h-0 overflow-hidden rounded-[28px]"
                  >
                    <AnimatePresence initial={false}>
                      {hasTaskText && (
                        <motion.div
                          key="quick-add-actions"
                          initial={{ opacity: 0, y: -64 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -64 }}
                          transition={{
                            duration: 0.4,
                            ease: [0.32, 0.72, 0, 1],
                          }}
                          className="pointer-events-auto absolute inset-x-0 top-0 px-1 pt-1"
                        >
                          <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={!hasTaskText || isSubmitting}
                            className={[
                              'group relative h-12 w-full rounded-[28px] text-[15px] font-black overflow-hidden transition-all',
                              'bg-popover text-primary',
                              'shadow-[0_5px_0_0_rgba(63,98,18,0.45)] ring-1 ring-primary/20',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35',
                              '[@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-[0_6px_0_0_rgba(63,98,18,0.45)] active:translate-y-1 active:shadow-none',
                              'disabled:opacity-50 disabled:grayscale disabled:pointer-events-none',
                            ].join(' ')}
                          >
                            <span className="pointer-events-none absolute inset-0 rounded-[28px] bg-gradient-to-b from-white/35 to-transparent" />
                            <span className="relative z-10 flex items-center justify-center gap-2">
                              {isSubmitting ? (
                                'Adding...'
                              ) : (
                                <>
                                  <Plus className="w-4 h-4 stroke-[3]" />
                                  <span>Add Task</span>
                                </>
                              )}
                            </span>
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {suggestionsReady && (
                      <motion.div
                        key="quick-add-suggestions"
                        initial={{ opacity: 1, y: suggestionsPanelHeight + 24 }}
                        animate={{
                          opacity: 1,
                          y: showSuggestions ? 0 : suggestionsPanelHeight + 24,
                        }}
                        transition={{
                          duration: 0.4,
                          ease: [0.32, 0.72, 0, 1],
                        }}
                        className={[
                          'absolute inset-0 h-full min-h-0 overflow-hidden rounded-[28px] border border-border/80 bg-popover p-4',
                          showSuggestions ? 'pointer-events-auto' : 'pointer-events-none',
                        ].join(' ')}
                      >
                        <SuggestionTabs
                          open={open}
                          focusCategoryIds={focusCategoryIds}
                          categoryTagMap={categoryTagMap}
                          className="mt-0 h-full min-h-0 border-t-0 pt-0"
                          onPick={(pick) => {
                            setText(pick.text);
                            setTags((prev) => {
                              const removed = new Set(autoAddedTagIds);
                              const seen = new Set<string>();
                              const next: string[] = [];
                              for (const id of prev) {
                                if (removed.has(id)) continue;
                                if (seen.has(id)) continue;
                                seen.add(id);
                                next.push(id);
                              }
                              for (const id of pick.tagIds) {
                                if (seen.has(id)) continue;
                                seen.add(id);
                                next.push(id);
                              }
                              return next;
                            });
                            setAutoAddedTagIds(pick.tagIds);
                            if (pick.startTime !== undefined) {
                              setStartTime(pick.startTime);
                              setEndTime(pick.endTime ?? '');
                              setNotifyEnabled(!!pick.reminder);
                              if (pick.reminder) setReminder(pick.reminder);
                            }
                            inputRef.current?.focus();
                          }}
                        />
                      </motion.div>
                    )}
                  </motion.div>
                </div>
              </motion.div>

              <AnimatePresence>
                <PickerSheet
                  activePicker={activePicker}
                  setActivePicker={setActivePicker}
                  daysOrder={daysOrder}
                  selectedDay={selectedDay}
                  isLater={isLater}
                  todayIndex={todayIndex}
                  tomorrowIndex={tomorrowIndex}
                  todayKey={todayKey}
                  tomorrowKey={tomorrowKey}
                  selectedDateKey={selectedDateKey}
                  selectSingleDay={selectSingleDay}
                  selectCalendarDate={selectCalendarDate}
                  showCalendarPicker={showCalendarPicker}
                  setShowCalendarPicker={setShowCalendarPicker}
                  calendarMonthLabel={calendar.calendarMonthLabel}
                  calendarCells={calendar.calendarCells}
                  shiftCalendarMonth={calendar.shiftCalendarMonth}
                  notifyEnabled={notifyEnabled}
                  setNotifyEnabled={setNotifyEnabled}
                  startTime={startTime}
                  setStartTime={setStartTime}
                  setReminder={setReminder}
                  showReminderPicker={showReminderPicker}
                  setShowReminderPicker={setShowReminderPicker}
                  repeat={repeat}
                  setRepeat={setRepeat}
                  repeatDay={repeatDay}
                  pickedDays={pickedDays}
                  setPickedDays={setPickedDays}
                  tagManager={tagManager}
                  selectedTagIds={tags}
                  setSelectedTagIds={setTags}
                  onPremiumLimit={() => setShowPremiumLimit(true)}
                  tagInputRef={tagInputRef}
                />
              </AnimatePresence>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}

      <PremiumLimitDialog
        open={showPremiumLimit}
        onClose={() => setShowPremiumLimit(false)}
      />
    </>
  );
}
