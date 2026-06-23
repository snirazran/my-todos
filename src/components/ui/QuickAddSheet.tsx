'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { mutate } from 'swr';
import { Icon } from '@/components/ui/Icon';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import {
  Bell,
  Plus,
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
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import { PlusUpgradeModal } from './PlusUpgradeModal';
import { PickerSheet } from './quick-add/PickerSheet';
import { SuggestionTabs } from './quick-add/SuggestionTabs';
import { useTagManager } from './quick-add/useTagManager';
import { useCalendarMonth } from './quick-add/useCalendarMonth';
import { useKeyboardInset } from './quick-add/useKeyboardInset';
import {
  customRepeatLabel,
  formatEndDateLabel,
  formatTimeDisplay,
  monthlyRepeatLabel,
  parseYmdLocal,
  repeatModeFor,
  ymdLocal,
  type RepeatRule,
} from './quick-add/utils';
import type {
  ActivePicker,
  ChecklistItem,
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
  const [isDesktop, setIsDesktop] = useState(false);
  const dragControls = useDragControls();
  useRegisterOpenSheet(open);
  const [showPremiumLimit, setShowPremiumLimit] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [pickedBacklogTaskId, setPickedBacklogTaskId] = useState<string | null>(null);
  const [pickedBacklogText, setPickedBacklogText] = useState<string | null>(null);
  const [pickedNotes, setPickedNotes] = useState<string | undefined>(undefined);
  const [pickedChecklist, setPickedChecklist] = useState<
    ChecklistItem[] | undefined
  >(undefined);
  const [showSavedConfirm, setShowSavedConfirm] = useState(false);
  const pendingSubmitRef = useRef<(() => Promise<void>) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const chipRowRef = useRef<HTMLDivElement>(null);
  const [chipLift, setChipLift] = useState(0);
  const [chipView, setChipView] = useState<{
    tags: string[];
    startTime: string;
    endTime: string;
    notify: boolean;
  }>({ tags: [], startTime: '', endTime: '', notify: false });

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
  const [repeatEndDate, setRepeatEndDate] = useState<string | null>(null);
  const [repeatRule, setRepeatRule] = useState<RepeatRule | null>(null);

  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reminder, setReminder] = useState('at_time');
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [autoAddedTagIds, setAutoAddedTagIds] = useState<string[]>([]);
  const [sheetBaseHeight, setSheetBaseHeight] = useState<number | null>(null);
  const [suggestionsReady, setSuggestionsReady] = useState(false);
  const [hasSuggestionContent, setHasSuggestionContent] = useState(false);

  const calendar = useCalendarMonth(new Date());
  const { inset: keyboardInset, height: viewportHeight } = useKeyboardInset(open);

  useEffect(() => {
    setMounted(true);
    const check = () =>
      setIsDesktop(window.matchMedia('(min-width: 640px)').matches);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (!activePicker) {
      setShowCalendarPicker(false);
      setShowReminderPicker(false);
    }
  }, [activePicker]);

  useEffect(() => {
    // Render the saved area immediately so its height is reserved from the first
    // frame — the whole sheet then rises as one motion instead of growing late.
    setSuggestionsReady(open);
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
    setRepeatEndDate(null);
    setRepeatRule(null);
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
    setPickedBacklogTaskId(null);
    setPickedBacklogText(null);
    setPickedNotes(undefined);
    setPickedChecklist(undefined);
    setShowSavedConfirm(false);
    setHasSuggestionContent(false);

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
  const repeatsOn = repeat !== 'this-week';
  const hasTaskText = text.trim().length > 0;
  const keyboardActive = inputFocused && keyboardInset > 0;
  const availableSheetHeight = Math.max(
    320,
    sheetBaseHeight ?? viewportHeight ?? 900,
  );
  const showSuggestions = suggestionsReady && !hasTaskText && hasSuggestionContent;
  // Time now lives in its own "Remind me" row, so only tag chips drive this.
  const hasChips = tags.length > 0;
  const isShortScreen = availableSheetHeight < 700;
  // The sheet hugs its content and sits at the bottom; this is just the cap so a
  // long saved list can't grow past the screen (it scrolls internally instead).
  const bottomGap = Math.round(availableSheetHeight * 0.02);
  const sheetMaxHeight = Math.max(
    360,
    Math.min(
      availableSheetHeight - bottomGap - 12,
      isShortScreen ? availableSheetHeight : 560,
    ),
  );
  const suggestionsOffset = 360;
  // Cap the saved list so it can't push the input card off-screen; below the cap
  // it sizes to its content, above it scrolls inside.
  const suggestionsMax = Math.min(420, Math.round(availableSheetHeight * 0.42));

  // When the keyboard is up, a tag chip grows the card and would push the Add
  // Task button down behind the keyboard. Lift the whole sheet up by exactly
  // the chip row's height so the card growth is cancelled out and the button
  // stays put — without resizing the suggestions area.
  useEffect(() => {
    if (!keyboardActive || !hasChips) {
      setChipLift(0);
      return;
    }
    const measure = () => setChipLift(chipRowRef.current?.offsetHeight ?? 0);
    measure();
    const id = window.requestAnimationFrame(measure);
    return () => window.cancelAnimationFrame(id);
  }, [keyboardActive, hasChips, chipView]);

  // Keep last chip set rendered while the row collapses (tags empties instantly).
  useEffect(() => {
    if (hasChips) {
      setChipView({ tags, startTime, endTime, notify: notifyEnabled });
      return;
    }
    const t = window.setTimeout(
      () => setChipView({ tags: [], startTime: '', endTime: '', notify: false }),
      320,
    );
    return () => window.clearTimeout(t);
  }, [hasChips, tags, startTime, endTime, notifyEnabled]);

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

  const repeatMode =
    repeat === 'custom'
      ? 'custom'
      : repeat === 'monthly'
        ? 'monthly'
        : repeatModeFor(pickedDays, repeat, daysOrder);
  const repeatBaseLabel =
    repeatMode === 'daily'
      ? 'Every day'
      : repeatMode === 'weekdays'
        ? 'Every weekday'
        : repeatMode === 'weekend'
          ? 'Every weekend'
          : repeatMode === 'weekly'
            ? `Every week on ${labelForDisplayDay(repeatDay as Exclude<DisplayDay, 7>, daysOrder)}`
            : repeatMode === 'monthly'
              ? monthlyRepeatLabel(selectedDateKey || todayKey)
              : repeatMode === 'custom' && repeatRule
                ? customRepeatLabel(repeatRule)
                : 'Does not repeat';
  const repeatLabel =
    repeatMode !== 'none' && repeatEndDate
      ? `${repeatBaseLabel} · until ${formatEndDateLabel(repeatEndDate)}`
      : repeatBaseLabel;

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

  const doSubmit = async (removeSavedTask: boolean) => {
    if (isSubmitting) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    const apiDays: ApiDay[] = pickedDays
      .slice()
      .sort()
      .map((d) => apiDayFromDisplay(d, daysOrder));
    if (apiDays.length === 0) return;

    const exactDates =
      repeat === 'monthly' || repeat === 'custom'
        ? selectedDateKey
          ? [selectedDateKey]
          : undefined
        : repeat === 'this-week' && !isLater && selectedDateKey
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
        repeatEndDate: repeat !== 'this-week' ? repeatEndDate : null,
        repeatRule: repeat === 'custom' ? repeatRule : null,
        notes: pickedBacklogTaskId ? pickedNotes : undefined,
        checklist: pickedBacklogTaskId ? pickedChecklist : undefined,
      });
      if (removeSavedTask && pickedBacklogTaskId) {
        const backlogKey = '/api/tasks?view=board&day=-1';
        // Drop it from the SWR cache right away so it doesn't flicker back in
        // (stale-while-revalidate) the next time the sheet opens.
        mutate(
          backlogKey,
          (cur?: { id: string }[]) =>
            cur?.filter((t) => t.id !== pickedBacklogTaskId),
          { revalidate: false },
        );
        fetch(`/api/tasks?view=board`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ day: -1, taskId: pickedBacklogTaskId }),
        })
          .then(() => mutate(backlogKey))
          .catch(console.error);
      }
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!pickedBacklogTaskId) {
      return doSubmit(false);
    }
    const textModified = text.trim() !== pickedBacklogText?.trim();
    if (!textModified) {
      return doSubmit(true);
    }
    pendingSubmitRef.current = () => doSubmit(false);
    setShowSavedConfirm(true);
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
                className="fixed inset-0 z-[1399] bg-black/80 will-change-opacity"
              />

              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{
                  type: 'tween',
                  ease: [0.32, 0.72, 0, 1],
                  duration: 0.4,
                }}
                drag={!isDesktop ? 'y' : false}
                dragControls={dragControls}
                dragListener={false}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.6 }}
                dragMomentum={false}
                onDragEnd={(_e, { offset, velocity }) => {
                  if (offset.y + velocity.y * 0.15 > 130 || velocity.y > 800) {
                    onOpenChange(false);
                  }
                }}
                style={{
                  contain: 'layout paint style',
                  // Offset the sheet upward by the chip row height so adding a
                  // tag while the keyboard is open doesn't push the Add Task
                  // button behind the keyboard. Transition matches the chip
                  // row's expand animation so the button doesn't wiggle.
                  bottom: chipLift || undefined,
                  transition: 'bottom 280ms cubic-bezier(0.32,0.72,0,1)',
                }}
                className={`fixed inset-x-0 bottom-0 z-[1400] flex max-h-[100dvh] transform-gpu items-end px-4 pt-2 pointer-events-none will-change-transform sm:px-6 ${
                  keyboardActive ? 'pb-[7vh] sm:pb-[8vh]' : 'pb-4 sm:pb-6'
                }`}
              >
                <div
                  style={{ maxHeight: sheetMaxHeight }}
                  className="pointer-events-auto mx-auto flex w-full max-w-[500px] flex-col pb-[env(safe-area-inset-bottom)] sm:max-w-[620px]"
                >
                  <div className="flex min-h-0 flex-1 flex-col gap-3">
                  <div className="flex flex-none flex-col overflow-hidden rounded-[28px] bg-popover px-4 pb-2 pt-2 ring-1 ring-border/80 shadow-[0_3px_0_0_rgba(0,0,0,0.18)] sm:pt-5">
                    {!isDesktop && (
                      <div
                        onPointerDown={(e) => dragControls.start(e)}
                        className="-mx-4 -mt-2 mb-1 flex h-6 items-center justify-center touch-none cursor-grab active:cursor-grabbing"
                      >
                        <div className="h-1.5 w-10 rounded-full bg-muted-foreground/25" />
                      </div>
                    )}
                    <div dir="ltr" className="w-full pt-1">
                      <div className="mb-1 flex shrink-0 items-center gap-2 sm:gap-3">
                        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-muted-foreground/10 bg-muted sm:h-16 sm:w-16">
                          <Fly size={36} y={-3} />
                        </div>
                        <div className="relative flex-1">
                          <input
                            ref={inputRef}
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onFocus={() => setInputFocused(true)}
                            onBlur={() => setInputFocused(false)}
                            placeholder="Enter a new task..."
                            disabled={isSubmitting}
                            spellCheck={false}
                            autoComplete="off"
                            maxLength={100}
                            className="h-14 w-full rounded-[16px] bg-muted/50 pl-4 pr-14 text-xl font-medium text-foreground ring-2 ring-border shadow-[0_3px_0_0_rgba(15,23,42,0.08)] focus:outline-none focus:ring-2 focus:ring-primary/60 disabled:opacity-50 text-left sm:h-16 sm:text-xl"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit();
                              }
                              if (e.key === 'Escape') onOpenChange(false);
                            }}
                          />
                          {text.length >= 95 && (
                            <span
                              aria-hidden="true"
                              className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold tabular-nums ${
                                text.length >= 100 ? 'text-rose-500' : 'text-rose-400'
                              }`}
                            >
                              {text.length}/100
                            </span>
                          )}
                        </div>
                      </div>

                      <div
                        className={`grid px-1 transition-[grid-template-rows,opacity] duration-[280ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${
                          hasChips
                            ? 'grid-rows-[1fr] opacity-100'
                            : 'grid-rows-[0fr] opacity-0'
                        }`}
                      >
                        <div className="min-h-0 overflow-hidden">
                          <div ref={chipRowRef} className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 px-1 -mx-1 mask-fade-right">
                            {chipView.tags.map((tagId) => {
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
                      </div>

                      <div className="mb-0 mt-1 shrink-0 space-y-1">
                        <button
                          type="button"
                          onClick={() => {
                            setActivePicker('tags');
                          }}
                          className="group flex h-12 w-full items-center gap-3 rounded-xl text-left transition-colors [@media(hover:hover)]:hover:bg-muted/45 sm:h-14 sm:gap-3"
                        >
                          <span className="grid h-full w-12 shrink-0 place-items-center sm:w-14">
                            <span className="grid h-11 w-11 place-items-center rounded-full bg-primary/10 text-primary sm:h-12 sm:w-12">
                              <Icon name="filter" label="Tags" className="h-7 w-7 sm:h-8 sm:w-8" />
                            </span>
                          </span>
                          <span className="min-w-0 flex-1 text-[15px] font-extrabold text-muted-foreground sm:text-[16px]">
                            {tags.length > 0
                              ? `${tags.length} tag${tags.length === 1 ? '' : 's'} selected`
                              : 'Add tags'}
                          </span>
                        </button>

                        {!hideDayPicker && (
                          <button
                            type="button"
                            onClick={() => setActivePicker('date')}
                            className="group flex h-12 w-full items-center gap-3 rounded-xl text-left transition-colors [@media(hover:hover)]:hover:bg-muted/45 sm:h-14 sm:gap-3"
                          >
                            <span className="grid h-full w-12 shrink-0 place-items-center sm:w-14">
                              <span className="grid h-11 w-11 place-items-center rounded-full bg-primary/10 text-primary sm:h-12 sm:w-12">
                                <Icon name="planner" label="Date" className="h-7 w-7 sm:h-8 sm:w-8" />
                              </span>
                            </span>
                            <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[15px] font-extrabold text-muted-foreground sm:text-[16px]">
                              <span className="truncate">{selectedDateLabel}</span>
                            </span>
                          </button>
                        )}

                        {/* Remind me — dedicated time row */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setShowReminderPicker(true)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setShowReminderPicker(true);
                            }
                          }}
                          className="group flex h-12 w-full cursor-pointer items-center gap-3 rounded-xl text-left transition-colors [@media(hover:hover)]:hover:bg-muted/45 sm:h-14 sm:gap-3"
                        >
                          <span className="grid h-full w-12 shrink-0 place-items-center sm:w-14">
                            <span className={`grid h-11 w-11 place-items-center rounded-full transition-colors sm:h-12 sm:w-12 ${notifyEnabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                              <Bell className="h-[18px] w-[18px] stroke-[2.5] sm:h-5 sm:w-5" />
                            </span>
                          </span>
                          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[15px] font-extrabold text-muted-foreground sm:text-[16px]">
                            <span>Notify</span>
                            {notifyEnabled && (
                              <span className="text-primary">· {formatTimeDisplay(startTime || '09:00')}</span>
                            )}
                          </span>
                          {notifyEnabled && (
                            <span
                              role="button"
                              tabIndex={0}
                              aria-label="Turn reminder off"
                              onClick={(e) => {
                                e.stopPropagation();
                                setNotifyEnabled(false);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setNotifyEnabled(false);
                                }
                              }}
                              className="mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors [@media(hover:hover)]:hover:bg-muted [@media(hover:hover)]:hover:text-foreground"
                            >
                              <X className="h-4 w-4" />
                            </span>
                          )}
                        </div>

                        {!hideRepeatPicker && (
                          <button
                            type="button"
                            onClick={() => setActivePicker('repeat')}
                            className="group flex h-12 w-full items-center gap-3 rounded-xl text-left transition-colors [@media(hover:hover)]:hover:bg-muted/45 sm:h-14 sm:gap-3"
                          >
                            <span className="grid h-full w-12 shrink-0 place-items-center sm:w-14">
                              <span className={`grid h-11 w-11 place-items-center rounded-full sm:h-12 sm:w-12 ${repeatsOn ? 'bg-primary/10' : 'bg-muted'}`}>
                                <Icon name="repeat" label="Repeat" className={`h-7 w-7 sm:h-8 sm:w-8 ${repeatsOn ? '' : 'opacity-50 grayscale'}`} />
                              </span>
                            </span>
                            <span className="min-w-0 flex-1 text-[15px] font-extrabold text-muted-foreground sm:text-[16px]">
                              {repeatLabel}
                            </span>
                          </button>
                        )}

                      </div>
                    </div>

                  </div>

                  <div
                    style={{ minHeight: hasTaskText ? 56 : undefined }}
                    className="pointer-events-none relative min-h-0 rounded-[28px] [clip-path:inset(0_-40px_-40px_-40px)]"
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
                              'group relative h-14 w-full rounded-[28px] text-[17px] font-black overflow-hidden transition-all sm:h-16 sm:text-[18px]',
                              'bg-[#4f9149] text-white',
                              'shadow-[0_4px_0_0_#34631f] ring-1 ring-[#34631f]/40',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f9149]/40',
                              '[@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-[0_5px_0_0_#34631f] active:translate-y-1 active:shadow-none',
                              'disabled:opacity-50 disabled:grayscale disabled:pointer-events-none',
                            ].join(' ')}
                          >
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
                        initial={{ opacity: 0, y: 0 }}
                        animate={{
                          opacity: showSuggestions ? 1 : 0,
                          y: showSuggestions ? 0 : suggestionsOffset,
                        }}
                        exit={{ opacity: 0 }}
                        transition={{
                          duration: 0.4,
                          ease: [0.32, 0.72, 0, 1],
                        }}
                        style={{ maxHeight: suggestionsMax }}
                        className={[
                          'relative flex min-h-0 flex-col overflow-hidden rounded-[28px] border border-border/80 bg-popover p-4 shadow-[0_3px_0_0_rgba(0,0,0,0.18)]',
                          showSuggestions ? 'pointer-events-auto' : 'pointer-events-none',
                        ].join(' ')}
                      >
                        <SuggestionTabs
                          open={open}
                          focusCategoryIds={focusCategoryIds}
                          categoryTagMap={categoryTagMap}
                          className="mt-0 min-h-0 border-t-0 pt-0"
                          onContentChange={setHasSuggestionContent}
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
                            if (pick.backlogTaskId) {
                              setPickedBacklogTaskId(pick.backlogTaskId);
                              setPickedBacklogText(pick.text);
                              setPickedNotes(pick.notes);
                              setPickedChecklist(pick.checklist);
                            } else {
                              setPickedBacklogTaskId(null);
                              setPickedBacklogText(null);
                              setPickedNotes(undefined);
                              setPickedChecklist(undefined);
                            }
                            inputRef.current?.focus();
                          }}
                        />
                      </motion.div>
                    )}
                  </div>
                  </div>
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
                  repeatEndDate={repeatEndDate}
                  setRepeatEndDate={setRepeatEndDate}
                  repeatRule={repeatRule}
                  setRepeatRule={setRepeatRule}
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

      <PlusUpgradeModal
        open={showPremiumLimit}
        onClose={() => setShowPremiumLimit(false)}
      />

      {mounted && showSavedConfirm && createPortal(
        <div
          className="fixed inset-0 z-[9998] bg-black/80 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowSavedConfirm(false); }}
        >
          <div className="w-full max-w-[340px] rounded-2xl bg-background p-5 shadow-xl ring-1 ring-border/70">
            <h3 className="mb-2 text-[16px] font-extrabold text-foreground">
              Modified saved task
            </h3>
            <p className="mb-4 text-[13px] text-muted-foreground">
              You changed the text. Add as a new task or replace the saved one?
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowSavedConfirm(false);
                  doSubmit(true);
                }}
                className="h-11 w-full rounded-xl bg-primary text-[13px] font-extrabold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Replace saved task
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSavedConfirm(false);
                  doSubmit(false);
                }}
                className="h-11 w-full rounded-xl bg-muted text-[13px] font-extrabold text-foreground transition-colors hover:bg-muted/70"
              >
                Add as new task
              </button>
              <button
                type="button"
                onClick={() => setShowSavedConfirm(false)}
                className="h-10 w-full text-[12px] font-bold text-muted-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
