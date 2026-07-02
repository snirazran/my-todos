'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { mutate } from 'swr';
import {
  AnimatePresence,
  animate,
  motion,
  useDragControls,
  useMotionValue,
} from 'framer-motion';
import {
  Bell,
  CalendarDays,
  Lock,
  Plus,
  Repeat,
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
import { Icon as AppIcon } from '@/components/ui/Icon';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import { PlusUpgradeModal } from './PlusUpgradeModal';
import { PickerSheet } from './quick-add/PickerSheet';
import { SuggestionTabs } from './quick-add/SuggestionTabs';
import { useTagManager } from './quick-add/useTagManager';
import { useCalendarMonth } from './quick-add/useCalendarMonth';
import { useKeyboardInset } from './quick-add/useKeyboardInset';
import {
  parseYmdLocal,
  repeatModeFor,
  ymdLocal,
  type RepeatRule,
} from './quick-add/utils';

// Click-and-drag horizontal scrolling — mirrors the shop/wardrobe FilterBar.
// Touch scrolls natively via `touch-pan-x`; this adds desktop drag, and `guard`
// swallows the click that ends a drag so a chip doesn't toggle on release.
function useDragScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const isDown = useRef(false);
  const startX = useRef(0);
  const startScroll = useRef(0);
  const dragging = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    isDown.current = true;
    dragging.current = false;
    startX.current = e.pageX - el.offsetLeft;
    startScroll.current = el.scrollLeft;
  }, []);
  const onMouseLeave = useCallback(() => {
    isDown.current = false;
  }, []);
  const onMouseUp = useCallback(() => {
    isDown.current = false;
    setTimeout(() => {
      dragging.current = false;
    }, 0);
  }, []);
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const el = ref.current;
    if (!isDown.current || !el) return;
    e.preventDefault();
    const walk = e.pageX - el.offsetLeft - startX.current;
    if (Math.abs(walk) > 5) {
      dragging.current = true;
      el.scrollLeft = startScroll.current - walk;
    }
  }, []);
  const guard = useCallback(
    (fn: () => void) => () => {
      if (dragging.current) return;
      fn();
    },
    [],
  );

  return {
    ref,
    handlers: { onMouseDown, onMouseLeave, onMouseUp, onMouseMove },
    guard,
  };
}

function ToolbarPill({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-3.5 text-[13px] font-bold text-primary transition-transform active:scale-95"
    >
      {icon}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

function ToolbarIcon({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors active:scale-95 ${
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground [@media(hover:hover)]:hover:bg-muted [@media(hover:hover)]:hover:text-foreground'
      }`}
    >
      {icon}
    </button>
  );
}
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
  submitLabel = 'Add Task',
  defaultRepeatDaily = false,
}: QuickAddSheetProps) {
  const [text, setText] = useState(initialText);
  const [repeat, setRepeat] = useState<RepeatChoice>(defaultRepeat);
  const [tags, setTags] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const dragControls = useDragControls();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragExitRef = useRef({ velocity: 0, offset: 0 });
  const backdropOpacity = useMotionValue(0);
  useRegisterOpenSheet(open);

  useEffect(() => {
    if (open) dragExitRef.current = { velocity: 0, offset: 0 };
  }, [open]);
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const tagScroll = useDragScroll();
  const [tagFadeRight, setTagFadeRight] = useState(false);
  const updateTagFade = useCallback(() => {
    const el = tagScroll.ref.current;
    if (!el) return;
    setTagFadeRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
  }, [tagScroll.ref]);
  const [chipView, setChipView] = useState<{
    startTime: string;
    notify: boolean;
  }>({ startTime: '', notify: false });

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

  const questTagIds = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of categoryTagMap ?? []) {
      if (focusCategoryIds && !focusCategoryIds.includes(entry.categoryId)) {
        continue;
      }
      for (const id of entry.tagIds) ids.add(id);
    }
    return ids;
  }, [categoryTagMap, focusCategoryIds]);

  const stripTags = useMemo(() => {
    if (questTagIds.size === 0) return tagManager.savedTags;
    return [
      ...tagManager.savedTags.filter((t) => questTagIds.has(t.id)),
      ...tagManager.savedTags.filter((t) => !questTagIds.has(t.id)),
    ];
  }, [tagManager.savedTags, questTagIds]);

  useEffect(() => {
    updateTagFade();
  }, [stripTags.length, open, updateTagFade]);

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

  // Desktop only: focus the task input when the sheet opens. On mobile this is
  // skipped so the on-screen keyboard doesn't pop up unprompted.
  useEffect(() => {
    if (!open || !isDesktop) return;
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 60);
    return () => window.clearTimeout(id);
  }, [open, isDesktop]);

  useEffect(() => {
    if (!activePicker) {
      setShowCalendarPicker(false);
      setShowReminderPicker(false);
    }
  }, [activePicker]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [text, open]);

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
    setPickedDays(
      defaultRepeatDaily
        ? ([0, 1, 2, 3, 4, 5, 6] as DisplayDay[])
        : [
            (initialDay >= 0
              ? initialDay
              : todayDisplayIndex(daysOrder)) as DisplayDay,
          ],
    );

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
  const hasChips = notifyEnabled;
  const isShortScreen = availableSheetHeight < 700;
  // The sheet hugs its content and sits at the bottom; this is just the cap so a
  // long saved list can't grow past the screen (it scrolls internally instead).
  const bottomGap = Math.round(availableSheetHeight * 0.02);
  let sheetMaxHeight = Math.max(
    360,
    Math.min(
      availableSheetHeight - bottomGap - 12,
      isShortScreen ? availableSheetHeight : 600,
    ),
  );
  if (keyboardActive && viewportHeight) {
    sheetMaxHeight = Math.min(sheetMaxHeight, viewportHeight - 20);
  }
  const suggestionsOffset = 360;
  // Cap the saved list so it can't push the input card off-screen; below the cap
  // it sizes to its content, above it scrolls inside.
  const suggestionsMax = Math.min(420, Math.round(availableSheetHeight * 0.42));

  // Keep the last chip rendered while the row collapses.
  useEffect(() => {
    if (hasChips) {
      setChipView({ startTime, notify: notifyEnabled });
      return;
    }
    const t = window.setTimeout(
      () => setChipView({ startTime: '', notify: false }),
      320,
    );
    return () => window.clearTimeout(t);
  }, [hasChips, startTime, notifyEnabled]);

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
  const repeatShortLabel =
    {
      daily: 'Daily',
      weekdays: 'Weekdays',
      weekend: 'Weekends',
      weekly: `Weekly · ${labelForDisplayDay(repeatDay as Exclude<DisplayDay, 7>, daysOrder).slice(0, 3)}`,
      monthly: 'Monthly',
      custom: 'Custom',
      none: 'Repeat',
    }[repeatMode] ?? 'Repeat';

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

  const sheetVariants = {
    hidden: isDesktop ? { opacity: 0, scale: 0.96 } : { y: '100%' },
    visible: isDesktop ? { opacity: 1, scale: 1 } : { y: 0 },
    exit: ({ velocity, offset }: { velocity: number; offset: number }) => {
      if (isDesktop) {
        return {
          opacity: 0,
          scale: 0.96,
          transition: {
            type: 'tween' as const,
            ease: [0.32, 0.72, 0, 1] as const,
            duration: 0.2,
          },
        };
      }
      if (velocity > 40) {
        const h = sheetRef.current?.offsetHeight || 480;
        const remaining = Math.max(h - offset, 60);
        const duration = Math.min(Math.max(remaining / velocity, 0.12), 0.3);
        return {
          y: '100%',
          transition: { type: 'tween' as const, duration, ease: 'easeOut' as const },
        };
      }
      return {
        y: '100%',
        transition: {
          type: 'tween' as const,
          ease: [0.32, 0.72, 0, 1] as const,
          duration: 0.3,
        },
      };
    },
  };

  return (
    <>
      {createPortal(
        <AnimatePresence custom={dragExitRef.current}>
          {open && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => onOpenChange(false)}
                transition={{ duration: 0.16, ease: 'easeOut' }}
                className="fixed inset-0 z-[1399] bg-black/80 will-change-opacity"
                style={{ opacity: backdropOpacity }}
              />

              <motion.div
                ref={sheetRef}
                variants={sheetVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                custom={dragExitRef.current}
                transition={{
                  type: 'tween',
                  ease: [0.32, 0.72, 0, 1],
                  duration: isDesktop ? 0.2 : 0.4,
                }}
                drag={!isDesktop ? 'y' : false}
                dragControls={dragControls}
                dragListener={false}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0.05, bottom: 1 }}
                dragMomentum={false}
                dragTransition={{ bounceStiffness: 400, bounceDamping: 40 }}
                onDrag={(_e, info) => {
                  const h = sheetRef.current?.offsetHeight || 400;
                  const progress = Math.min(1, Math.max(0, info.offset.y / h));
                  backdropOpacity.set(1 - progress * 0.75);
                }}
                onDragEnd={(_e, { offset, velocity }) => {
                  if (offset.y + velocity.y * 0.15 > 130 || velocity.y > 800) {
                    dragExitRef.current = {
                      velocity: Math.max(velocity.y, 0),
                      offset: Math.max(offset.y, 0),
                    };
                    onOpenChange(false);
                  } else {
                    dragExitRef.current = { velocity: 0, offset: 0 };
                    animate(backdropOpacity, 1, {
                      type: 'spring',
                      stiffness: 400,
                      damping: 40,
                    });
                  }
                }}
                style={{
                  contain: 'layout paint style',
                  // Mobile only: pin the sheet above the on-screen keyboard using
                  // the real visualViewport inset so the Add Task button can never
                  // hide behind it.
                  bottom:
                    isDesktop || !keyboardActive ? undefined : keyboardInset,
                  transition: 'bottom 280ms cubic-bezier(0.32,0.72,0,1)',
                }}
                className={`fixed z-[1400] flex max-h-[100dvh] transform-gpu pointer-events-none will-change-transform ${
                  isDesktop
                    ? 'inset-0 items-center justify-center p-6'
                    : 'inset-x-0 bottom-0 items-end px-3 pt-2 pb-4 sm:px-6 sm:pb-6'
                }`}
              >
                <div
                  style={{ maxHeight: sheetMaxHeight }}
                  className="pointer-events-auto mx-auto flex w-full max-w-[500px] flex-col pb-[env(safe-area-inset-bottom)] sm:max-w-[620px]"
                >
                  <div className="flex min-h-0 flex-1 flex-col gap-3">
                  <div className="flex flex-none flex-col overflow-hidden rounded-[28px] bg-popover px-5 pb-3 pt-2 ring-1 ring-border/80 shadow-[0_3px_0_0_rgba(0,0,0,0.18)] sm:pt-5">
                    {!isDesktop && (
                      <div
                        onPointerDown={(e) => dragControls.start(e)}
                        className="-mx-5 -mt-2 mb-1 flex h-7 items-center justify-center touch-none cursor-grab active:cursor-grabbing"
                      >
                        <div className="h-1.5 w-10 rounded-full bg-muted-foreground/25" />
                      </div>
                    )}
                    <div dir="ltr" className="w-full pt-1">
                      {/* Tags render above the input */}
                      <div
                        className={`grid px-1 transition-[grid-template-rows,opacity] duration-[280ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${
                          hasChips
                            ? 'mb-2 grid-rows-[1fr] opacity-100'
                            : 'grid-rows-[0fr] opacity-0'
                        }`}
                      >
                        <div className="min-h-0 overflow-hidden">
                          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 px-1 -mx-1 mask-fade-right">
                            {chipView.notify && (
                              <span className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-primary/20 bg-primary/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-primary shadow-sm">
                                <Bell className="h-3 w-3 shrink-0 text-amber-500" />
                                <span className="tabular-nums">
                                  {chipView.startTime || '09:00'}
                                </span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-start gap-3">
                        <div className="relative flex-1">
                          <textarea
                            ref={inputRef}
                            value={text}
                            rows={1}
                            onChange={(e) =>
                              setText(e.target.value.replace(/\s*\n+\s*/g, ' '))
                            }
                            onFocus={() => setInputFocused(true)}
                            onBlur={() => setInputFocused(false)}
                            placeholder="What needs doing?"
                            disabled={isSubmitting}
                            spellCheck={false}
                            autoComplete="off"
                            maxLength={100}
                            className="block w-full min-h-[76px] max-h-[136px] resize-none overflow-y-auto rounded-xl bg-transparent px-1 pt-3 pb-1 text-[22px] font-semibold leading-[30px] tracking-tight text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50 text-left sm:text-2xl"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                if (!e.shiftKey) handleSubmit();
                              }
                              if (e.key === 'Escape') onOpenChange(false);
                            }}
                          />
                          {text.length >= 90 && (
                            <span
                              aria-hidden="true"
                              className={`pointer-events-none absolute bottom-1 right-1 text-[11px] font-bold tabular-nums ${
                                text.length >= 100 ? 'text-rose-500' : 'text-rose-400'
                              }`}
                            >
                              {text.length}/100
                            </span>
                          )}
                        </div>
                        <div className="mt-1 grid h-14 w-14 shrink-0 place-items-center rounded-full bg-muted/60 ring-1 ring-inset ring-border/60 sm:h-16 sm:w-16">
                          <Fly size={48} y={-3} />
                        </div>
                      </div>

                      <div className="mt-1.5 mb-2.5 h-px bg-border/60" />

                      <div
                        ref={tagScroll.ref}
                        onScroll={updateTagFade}
                        onMouseDown={tagScroll.handlers.onMouseDown}
                        onMouseLeave={tagScroll.handlers.onMouseLeave}
                        onMouseUp={tagScroll.handlers.onMouseUp}
                        onMouseMove={tagScroll.handlers.onMouseMove}
                        className={`-mx-2 mb-1.5 grid auto-cols-max grid-flow-col ${
                          stripTags.length > 5 ? 'grid-rows-2' : 'grid-rows-1'
                        } cursor-grab select-none items-center gap-x-2 gap-y-4 overflow-x-auto no-scrollbar px-2 pt-2 pb-2 touch-pan-x active:cursor-grabbing ${
                          tagFadeRight ? 'mask-fade-right' : ''
                        }`}
                      >
                        {stripTags.map((tag) => {
                          const selected = tags.includes(tag.id);
                          const isQuestTag =
                            questTagIds.has(tag.id) && !tag.disabled;
                          return (
                            <button
                              key={tag.id}
                              type="button"
                              onClick={tagScroll.guard(() =>
                                tagManager.toggleTag(tag),
                              )}
                              className={`relative inline-flex h-9 select-none items-center justify-center gap-1.5 rounded-xl border pr-3 text-[11px] font-black uppercase tracking-wider shadow-sm transition-all active:scale-95 [@media(hover:hover)]:hover:opacity-75 ${
                                isQuestTag ? 'pl-[56px]' : 'pl-3'
                              } ${
                                tag.disabled
                                  ? 'border-dashed border-border bg-muted text-muted-foreground/70'
                                  : selected
                                    ? 'ring-2 ring-offset-1 ring-offset-popover'
                                    : ''
                              }`}
                              style={
                                tag.disabled
                                  ? undefined
                                  : {
                                      backgroundColor: `${tag.color}20`,
                                      color: tag.color,
                                      borderColor: `${tag.color}40`,
                                    }
                              }
                            >
                              {isQuestTag && (
                                <span
                                  className="pointer-events-none absolute left-1 top-1/2 grid h-12 w-11 -translate-y-1/2 -rotate-3 place-items-center rounded-[10px] border bg-popover shadow-sm"
                                  style={{ borderColor: `${tag.color}40` }}
                                >
                                  <AppIcon name="quests" className="h-7 w-7" />
                                </span>
                              )}
                              <span className="max-w-[128px] truncate">
                                {tag.name}
                              </span>
                              {tag.disabled && (
                                <Lock className="h-3 w-3 shrink-0" />
                              )}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          aria-label="Add tag"
                          onClick={tagScroll.guard(() => setActivePicker('tags'))}
                          className="inline-flex h-9 items-center justify-center gap-1 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-3 text-[11px] font-extrabold uppercase tracking-wider text-primary transition-colors active:scale-95 [@media(hover:hover)]:hover:bg-primary/10"
                        >
                          <Plus className="h-3.5 w-3.5 shrink-0 stroke-[3]" />
                          {stripTags.length === 0 && (
                            <span className="whitespace-nowrap">Create tag</span>
                          )}
                        </button>
                      </div>

                      <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar px-1 pb-0.5">
                        {!hideDayPicker && (
                          <ToolbarPill
                            icon={<CalendarDays className="h-4 w-4" />}
                            label={selectedDateLabel}
                            onClick={() => setActivePicker('date')}
                          />
                        )}
                        {!hideRepeatPicker && repeatsOn && (
                          <ToolbarPill
                            icon={<Repeat className="h-4 w-4" />}
                            label={repeatShortLabel}
                            onClick={() => setActivePicker('repeat')}
                          />
                        )}
                        <div className="ml-auto flex items-center gap-1">
                          <ToolbarIcon
                            icon={<Bell className="h-5 w-5" />}
                            label="Reminder"
                            active={notifyEnabled}
                            onClick={() => setShowReminderPicker(true)}
                          />
                          {!hideRepeatPicker && !repeatsOn && (
                            <ToolbarIcon
                              icon={<Repeat className="h-5 w-5" />}
                              label="Repeat"
                              onClick={() => setActivePicker('repeat')}
                            />
                          )}
                        </div>
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
                          className="pointer-events-auto absolute inset-x-0 top-0 pt-1"
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
                                  <span>{submitLabel}</span>
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
