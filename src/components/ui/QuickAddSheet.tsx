'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useSWR, { mutate } from 'swr';
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
  Check,
  Lock,
  Plus,
  Repeat,
  Rows3,
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
import { Icon as AppIcon } from '@/components/ui/Icon';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import { hapticSuccess } from '@/lib/haptics';
import { PlusUpgradeModal } from './PlusUpgradeModal';
import { PickerSheet } from './quick-add/PickerSheet';
import { TagManagerSheet } from './quick-add/TagManagerSheet';
import { SuggestionTabs } from './quick-add/SuggestionTabs';
import { useTagManager } from './quick-add/useTagManager';
import { useCalendarMonth } from './quick-add/useCalendarMonth';
import { useKeyboardInset } from './quick-add/useKeyboardInset';
import {
  matchSuggestionBuckets,
  nameMatchesBucket,
  parseNaturalInput,
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

function TagScrollRail({
  scrollerRef,
  contentVersion,
  onVisibilityChange,
}: {
  scrollerRef: React.RefObject<HTMLDivElement | null>;
  contentVersion: unknown;
  onVisibilityChange: (visible: boolean) => void;
}) {
  const [metrics, setMetrics] = useState({
    canScroll: false,
    thumbPercent: 100,
    leftPercent: 0,
  });

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const maxScroll = Math.max(
          0,
          scroller.scrollWidth - scroller.clientWidth,
        );
        const clampedScroll = Math.min(
          maxScroll,
          Math.max(0, scroller.scrollLeft),
        );
        if (scroller.scrollLeft !== clampedScroll) {
          scroller.scrollLeft = clampedScroll;
        }
        const canScroll = maxScroll > 4;
        const thumbPercent = canScroll
          ? Math.max(18, (scroller.clientWidth / scroller.scrollWidth) * 100)
          : 100;
        const leftPercent = canScroll
          ? (clampedScroll / maxScroll) * (100 - thumbPercent)
          : 0;
        setMetrics({ canScroll, thumbPercent, leftPercent });
        onVisibilityChange(canScroll);
      });
    };

    update();
    scroller.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      scroller.removeEventListener('scroll', update);
    };
  }, [contentVersion, onVisibilityChange, scrollerRef]);

  if (!metrics.canScroll) return null;

  const scrollFromPointer = (
    track: HTMLDivElement,
    clientX: number,
  ) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const bounds = track.getBoundingClientRect();
    const thumbWidth = bounds.width * (metrics.thumbPercent / 100);
    const travel = bounds.width - thumbWidth;
    const thumbLeft = Math.min(
      travel,
      Math.max(0, clientX - bounds.left - thumbWidth / 2),
    );
    const maxScroll = scroller.scrollWidth - scroller.clientWidth;
    scroller.scrollLeft = travel > 0 ? (thumbLeft / travel) * maxScroll : 0;
  };

  return (
    <div
      role="scrollbar"
      aria-label="Scroll tags"
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(
        (metrics.leftPercent / Math.max(1, 100 - metrics.thumbPercent)) * 100,
      )}
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        scrollFromPointer(event.currentTarget, event.clientX);
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        scrollFromPointer(event.currentTarget, event.clientX);
      }}
      onKeyDown={(event) => {
        const scroller = scrollerRef.current;
        if (!scroller) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          scroller.scrollBy({
            left: event.key === 'ArrowLeft' ? -80 : 80,
            behavior: 'smooth',
          });
        } else if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          scroller.scrollTo({
            left: event.key === 'Home' ? 0 : scroller.scrollWidth,
            behavior: 'smooth',
          });
        }
      }}
      className="group absolute inset-x-4 -bottom-2 h-2 touch-none cursor-pointer rounded-full bg-slate-200/60 p-px outline-none transition-colors hover:bg-slate-200/90 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-popover dark:bg-white/[0.07] dark:ring-1 dark:ring-inset dark:ring-white/10 dark:hover:bg-white/[0.1] dark:focus-visible:ring-2 dark:focus-visible:ring-primary/40"
    >
      <div
        className="absolute bottom-px top-px flex items-center justify-center rounded-full bg-slate-300/70 transition-[width,background-color] duration-150 group-hover:bg-slate-300 dark:bg-white/20 dark:ring-1 dark:ring-inset dark:ring-white/10 dark:group-hover:bg-white/30"
        style={{
          width: `${metrics.thumbPercent}%`,
          left: `${metrics.leftPercent}%`,
        }}
      >
        <span className="pointer-events-none flex items-center gap-0.5" aria-hidden="true">
          <span className="h-0.5 w-0.5 rounded-full bg-white/90 dark:bg-white/60" />
          <span className="h-0.5 w-0.5 rounded-full bg-white/90 dark:bg-white/60" />
          <span className="h-0.5 w-0.5 rounded-full bg-white/90 dark:bg-white/60" />
        </span>
      </div>
    </div>
  );
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
  SavedTag,
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
  sections = [],
}: QuickAddSheetProps) {
  const [text, setText] = useState(initialText);
  const [nlDismissed, setNlDismissed] = useState('');
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
  const [pickedSectionId, setPickedSectionId] = useState<string | null>(null);
  const [showSectionPicker, setShowSectionPicker] = useState(false);
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
  const [tagScrollerVisible, setTagScrollerVisible] = useState(false);
  const updateTagFade = useCallback(() => {
    const el = tagScroll.ref.current;
    if (!el) return;
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    const clampedScroll = Math.min(maxScroll, Math.max(0, el.scrollLeft));
    if (el.scrollLeft !== clampedScroll) el.scrollLeft = clampedScroll;
    setTagFadeRight(maxScroll - clampedScroll > 4);
  }, [tagScroll.ref]);
  const [chipView, setChipView] = useState<{
    startTime: string;
    notify: boolean;
    reminder: string;
  }>({ startTime: '', notify: false, reminder: 'at_time' });

  const tagManager = useTagManager({
    open,
    selectedTags: tags,
    setSelectedTags: setTags,
    onPremiumLimit: () => setShowPremiumLimit(true),
  });

  // Long-press (or right-click) a strip tag to manage it directly — a plain
  // tap still toggles selection. Mirrors the TagsView interaction.
  const [managedTag, setManagedTag] = useState<SavedTag | null>(null);
  const lpTimer = useRef<number | null>(null);
  const lpFired = useRef(false);
  const lpStart = useRef<{ x: number; y: number } | null>(null);
  const cancelLongPress = () => {
    if (lpTimer.current !== null) {
      window.clearTimeout(lpTimer.current);
      lpTimer.current = null;
    }
    lpStart.current = null;
  };
  const startLongPress = (st: SavedTag, e: React.PointerEvent) => {
    lpFired.current = false;
    lpStart.current = { x: e.clientX, y: e.clientY };
    lpTimer.current = window.setTimeout(() => {
      lpFired.current = true;
      cancelLongPress();
      setManagedTag(st);
    }, 450);
  };
  const moveLongPress = (e: React.PointerEvent) => {
    if (!lpStart.current) return;
    if (
      Math.abs(e.clientX - lpStart.current.x) > 10 ||
      Math.abs(e.clientY - lpStart.current.y) > 10
    )
      cancelLongPress();
  };
  // Tapping a tag while the keyboard is up blurs the input, and the sheet
  // reflows under the finger before the click can dispatch — so the click is
  // lost and the tag needs a second tap. Commit the toggle on pointerup
  // instead for those taps, and swallow the click if it does arrive.
  const kbTagTapRef = useRef(false);
  const swallowTagClickUntil = useRef(0);

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

  const { data: questContext } = useSWR<{
    isPremium?: boolean;
    activeFocusCategoryId?: string | null;
    macroCategories?: { id: string; name: string }[];
    onboarding?: {
      selectedCategoryIds?: string[];
      categoryTagMap?: { categoryId: string; tagIds: string[] }[];
    };
  }>(
    open
      ? `/api/quests?view=home&timezone=${encodeURIComponent(
          Intl.DateTimeFormat().resolvedOptions().timeZone,
        )}`
      : null,
    (url: string) => fetch(url).then((res) => res.json()),
    { revalidateOnFocus: false },
  );

  const questTagIds = useMemo(() => {
    const resolvedTagMap =
      categoryTagMap ?? questContext?.onboarding?.categoryTagMap;
    const resolvedFocusIds =
      focusCategoryIds ?? questContext?.onboarding?.selectedCategoryIds;
    const activeFocusCategoryId = questContext?.activeFocusCategoryId ?? null;
    const ids = new Set<string>();
    for (const entry of resolvedTagMap ?? []) {
      if (resolvedFocusIds && !resolvedFocusIds.includes(entry.categoryId as any)) {
        continue;
      }
      if (activeFocusCategoryId && entry.categoryId !== activeFocusCategoryId) {
        continue;
      }
      for (const id of entry.tagIds) ids.add(id);
    }
    return ids;
  }, [categoryTagMap, focusCategoryIds, questContext]);

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

  // Escape closes the topmost layer: picker first, then the sheet itself —
  // regardless of which element holds focus.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showPremiumLimit || showSavedConfirm) return;
      if (managedTag) {
        setManagedTag(null);
        return;
      }
      if (activePicker || showReminderPicker) {
        setActivePicker(null);
        setShowReminderPicker(false);
        return;
      }
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    open,
    activePicker,
    showReminderPicker,
    showPremiumLimit,
    showSavedConfirm,
    managedTag,
    onOpenChange,
  ]);

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
    setManagedTag(null);
    setPickedSectionId(null);
    setShowSectionPicker(false);

    const initialDate = defaultDateKey ?? ymdLocal(new Date());
    setSelectedDateKey(initialDate);
    calendar.setCalendarMonthFromDate(parseYmdLocal(initialDate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialText, defaultRepeat, defaultPickedDay, defaultDateKey, daysOrder]);

  const isLater = pickedDays.includes(7);
  const pickedSection =
    sections.find((s) => s.id === pickedSectionId) ?? null;
  const sectionBtnRef = useRef<HTMLButtonElement>(null);
  const [sectionMenuPos, setSectionMenuPos] = useState<{
    left: number;
    bottom: number;
  } | null>(null);
  const openSectionPicker = () => {
    const r = sectionBtnRef.current?.getBoundingClientRect();
    if (!r) return;
    setSectionMenuPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - 232)),
      bottom: window.innerHeight - r.top + 8,
    });
    setShowSectionPicker(true);
  };
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
  if (isDesktop) {
    sheetMaxHeight = Math.min(
      sheetMaxHeight,
      Math.round(availableSheetHeight * 0.8),
    );
  }
  const suggestionsOffset = 360;
  // Cap the saved list so it can't push the input card off-screen; below the cap
  // it sizes to its content, above it scrolls inside.
  const suggestionsMax = Math.min(420, Math.round(availableSheetHeight * 0.42));

  // Keep the last chip rendered while the row collapses.
  useEffect(() => {
    if (hasChips) {
      setChipView({ startTime, notify: notifyEnabled, reminder });
      return;
    }
    const t = window.setTimeout(
      () => setChipView({ startTime: '', notify: false, reminder: 'at_time' }),
      320,
    );
    return () => window.clearTimeout(t);
  }, [hasChips, startTime, notifyEnabled, reminder]);

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

  // "call mom tomorrow at 3pm" → offer to schedule and strip the phrase.
  // Suggestion only; typing is never rewritten until the chip is tapped.
  const nlParsed = useMemo(() => parseNaturalInput(text), [text]);
  const nlSuggestion =
    !isLater &&
    nlParsed &&
    text !== nlDismissed &&
    ((nlParsed.dateKey && nlParsed.dateKey !== selectedDateKey) ||
      (nlParsed.startTime && nlParsed.startTime !== startTime))
      ? nlParsed
      : null;
  const nlLabel = nlSuggestion
    ? [
        nlSuggestion.dateKey
          ? nlSuggestion.dateKey === todayKey
            ? 'Today'
            : nlSuggestion.dateKey === tomorrowKey
              ? 'Tomorrow'
              : parseYmdLocal(nlSuggestion.dateKey).toLocaleDateString(
                  'en-US',
                  { weekday: 'short', month: 'short', day: 'numeric' },
                )
          : null,
        nlSuggestion.startTime ?? null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';
  const applyNlSuggestion = () => {
    if (!nlSuggestion) return;
    if (nlSuggestion.dateKey)
      selectCalendarDate(parseYmdLocal(nlSuggestion.dateKey));
    if (nlSuggestion.startTime) {
      setStartTime(nlSuggestion.startTime);
      setNotifyEnabled(true);
    }
    setText(nlSuggestion.cleaned);
  };

  // Focus areas are user-defined docs with arbitrary ids, so matching goes
  // through semantic buckets: task text → bucket → a tag connected to a
  // SELECTED focus area. Areas the user hasn't picked (and tags not connected
  // to any picked area) are never suggested.
  const suggestionEntries = useMemo(() => {
    const resolvedTagMap =
      categoryTagMap ?? questContext?.onboarding?.categoryTagMap;
    const selectedIds =
      focusCategoryIds ?? questContext?.onboarding?.selectedCategoryIds;
    return (resolvedTagMap ?? []).filter(
      (entry) =>
        entry.tagIds.length > 0 &&
        (!selectedIds || selectedIds.includes(entry.categoryId as any)),
    );
  }, [categoryTagMap, focusCategoryIds, questContext]);

  const questTagSuggestion = useMemo(() => {
    if (!hasTaskText || suggestionEntries.length === 0) return null;
    const buckets = matchSuggestionBuckets(text);
    if (buckets.length === 0) return null;
    const candidates = tagManager.savedTags.filter(
      (t) => !t.disabled && !tags.includes(t.id),
    );
    if (candidates.length === 0) return null;
    const categoryName = (id: string) =>
      questContext?.macroCategories?.find((c) => c.id === id)?.name ?? id;
    const connectedIds = new Set(
      suggestionEntries.flatMap((entry) => entry.tagIds),
    );
    for (const bucket of buckets) {
      for (const entry of suggestionEntries) {
        if (!nameMatchesBucket(bucket, categoryName(entry.categoryId)))
          continue;
        const connected =
          candidates.find(
            (t) =>
              entry.tagIds.includes(t.id) && nameMatchesBucket(bucket, t.name),
          ) ?? candidates.find((t) => entry.tagIds.includes(t.id));
        if (connected) return connected;
      }
      const byName = candidates.find(
        (t) => connectedIds.has(t.id) && nameMatchesBucket(bucket, t.name),
      );
      if (byName) return byName;
    }
    return null;
  }, [
    hasTaskText,
    text,
    suggestionEntries,
    questContext,
    tagManager.savedTags,
    tags,
  ]);

  // AI fallback: when keyword matching misses, ask the server (Haiku) to pick
  // among the same focus-connected tags. Cached per text, debounced, aborted
  // on change so a fast typist never fans out requests.
  const [aiSuggestion, setAiSuggestion] = useState<{
    key: string;
    tagId: string | null;
  } | null>(null);
  const aiCacheRef = useRef<Map<string, string | null>>(new Map());

  useEffect(() => {
    if (!open || !hasTaskText || questTagSuggestion) return;
    if (suggestionEntries.length === 0) return;
    const key = text.trim().toLowerCase();
    if (key.length < 4) return;
    const cache = aiCacheRef.current;
    if (cache.has(key)) {
      setAiSuggestion({ key, tagId: cache.get(key) ?? null });
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch('/api/tags/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: key }),
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        const tagId = typeof data?.tagId === 'string' ? data.tagId : null;
        if (cache.size > 200) cache.clear();
        cache.set(key, tagId);
        setAiSuggestion({ key, tagId });
      } catch {
        // Aborted or offline — keyword matching already had its chance.
      }
    }, 900);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, hasTaskText, text, questTagSuggestion, suggestionEntries]);

  const aiTagSuggestion = useMemo(() => {
    if (!aiSuggestion?.tagId) return null;
    if (aiSuggestion.key !== text.trim().toLowerCase()) return null;
    const tag = tagManager.savedTags.find((t) => t.id === aiSuggestion.tagId);
    if (!tag || tag.disabled || tags.includes(tag.id)) return null;
    return tag;
  }, [aiSuggestion, text, tagManager.savedTags, tags]);

  const questTagSuggestionResolved = questTagSuggestion ?? aiTagSuggestion;
  const showQuestTagSuggestion =
    !!questTagSuggestionResolved && text !== nlDismissed;

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
        sectionId: pickedSectionId ?? undefined,
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
    hapticSuccess();
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
    hidden: isDesktop ? { opacity: 0, scale: 0.97, y: -12 } : { y: '100%' },
    visible: isDesktop ? { opacity: 1, scale: 1, y: 0 } : { y: 0 },
    exit: ({ velocity, offset }: { velocity: number; offset: number }) => {
      if (isDesktop) {
        return {
          opacity: 0,
          scale: 0.97,
          y: -12,
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
                className="fixed inset-0 z-[1399] bg-black/80 will-change-opacity sm:bg-black/60 sm:backdrop-blur-[2px]"
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
                    ? 'inset-0 items-start justify-center p-6 pt-[18vh]'
                    : `inset-x-0 bottom-0 items-end px-3 pt-2 sm:px-6 ${
                        keyboardActive ? 'pb-2' : 'pb-4 sm:pb-6'
                      }`
                }`}
              >
                <div
                  style={{ maxHeight: sheetMaxHeight }}
                  className={`pointer-events-auto mx-auto flex w-full max-w-[500px] flex-col sm:max-w-[620px] ${
                    keyboardActive ? '' : 'pb-[env(safe-area-inset-bottom)]'
                  }`}
                >
                  {isDesktop && (
                    <div className="mb-2 flex shrink-0 justify-end">
                      <button
                        type="button"
                        aria-label="Close"
                        onClick={() => onOpenChange(false)}
                        className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white/70 transition-colors hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  )}
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
                                {chipView.reminder !== 'at_time' && (
                                  <span className="text-primary/70">
                                    · {chipView.reminder} before
                                  </span>
                                )}
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
                            placeholder="Add a task"
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

                      {(nlSuggestion || showQuestTagSuggestion) && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 px-1">
                          {nlSuggestion && (
                            <button
                              type="button"
                              onPointerDown={(e) => e.preventDefault()}
                              onClick={applyNlSuggestion}
                              className="inline-flex h-9 min-w-0 items-center gap-1.5 rounded-xl border border-primary/20 bg-primary/10 px-3 text-[11px] font-black uppercase tracking-wider text-primary shadow-sm transition-all active:scale-95 [@media(hover:hover)]:hover:bg-primary/15"
                            >
                              {nlSuggestion.dateKey ? (
                                <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                              ) : (
                                <Bell className="h-3 w-3 shrink-0 text-amber-500" />
                              )}
                              <span className="truncate tabular-nums">
                                {nlLabel}
                              </span>
                              <Plus className="h-3 w-3 shrink-0 stroke-[3]" />
                            </button>
                          )}
                          {showQuestTagSuggestion && questTagSuggestionResolved && (
                            <button
                              type="button"
                              onPointerDown={(e) => e.preventDefault()}
                              onClick={() =>
                                setTags((prev) =>
                                  prev.includes(questTagSuggestionResolved.id)
                                    ? prev
                                    : [...prev, questTagSuggestionResolved.id],
                                )
                              }
                              className={`relative inline-flex h-9 min-w-0 items-center gap-1.5 rounded-xl border pr-3 text-[11px] font-black uppercase tracking-wider shadow-sm transition-all active:scale-95 [@media(hover:hover)]:hover:opacity-75 ${
                                questTagIds.has(questTagSuggestionResolved.id)
                                  ? 'pl-[56px]'
                                  : 'pl-3'
                              }`}
                              style={{
                                backgroundColor: `${questTagSuggestionResolved.color}20`,
                                color: questTagSuggestionResolved.color,
                                borderColor: `${questTagSuggestionResolved.color}40`,
                              }}
                            >
                              {questTagIds.has(questTagSuggestionResolved.id) && (
                                <span
                                  className="pointer-events-none absolute left-1 top-1/2 grid h-12 w-11 -translate-y-1/2 -rotate-3 place-items-center rounded-[10px] border bg-popover shadow-sm"
                                  style={{
                                    borderColor: `${questTagSuggestionResolved.color}40`,
                                  }}
                                >
                                  <AppIcon name="quests" className="h-7 w-7" />
                                </span>
                              )}
                              <Plus className="h-3.5 w-3.5 shrink-0 stroke-[3]" />
                              <span className="max-w-[128px] truncate">
                                {questTagSuggestionResolved.name}
                              </span>
                            </button>
                          )}
                          <button
                            type="button"
                            aria-label="Dismiss suggestions"
                            onPointerDown={(e) => e.preventDefault()}
                            onClick={() => setNlDismissed(text)}
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground/50 transition-colors [@media(hover:hover)]:hover:bg-muted [@media(hover:hover)]:hover:text-foreground"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}

                      <div className="mt-1.5 mb-2.5 h-px bg-border/60" />

                      <div
                        className={`relative -mx-2 ${
                          tagScrollerVisible
                            ? keyboardActive
                              ? 'mb-3'
                              : 'mb-4'
                            : 'mb-1.5'
                        }`}
                      >
                        <div
                          ref={tagScroll.ref}
                          data-hint="tag-picker"
                          onScroll={updateTagFade}
                          onMouseDown={tagScroll.handlers.onMouseDown}
                          onMouseLeave={tagScroll.handlers.onMouseLeave}
                          onMouseUp={tagScroll.handlers.onMouseUp}
                          onMouseMove={tagScroll.handlers.onMouseMove}
                          className={`grid auto-cols-max grid-flow-col ${
                            stripTags.length > 5 ? 'grid-rows-2' : 'grid-rows-1'
                          } cursor-grab select-none items-center gap-x-2 gap-y-4 overflow-x-auto overscroll-x-none no-scrollbar px-2 pt-2 pb-2 touch-pan-x active:cursor-grabbing ${
                            tagFadeRight ? 'mask-fade-right' : ''
                          }`}
                          style={{ overscrollBehaviorX: 'none' }}
                        >
                        {stripTags.map((tag) => {
                          const selected = tags.includes(tag.id);
                          const isQuestTag =
                            questTagIds.has(tag.id) && !tag.disabled;
                          return (
                            <button
                              key={tag.id}
                              type="button"
                              title="Hold to edit"
                              data-hint="quickadd-tag"
                              data-tag-id={tag.id}
                              data-selected={selected ? 'true' : undefined}
                              onPointerDown={(e) => {
                                // Keep the textarea focused so mobile browsers do
                                // not start hiding the keyboard before `onClick`.
                                // Refocusing after the click is too late and causes
                                // a visible close/reopen flicker. Touch-only: on
                                // desktop this also suppresses the browser's
                                // synthetic mousedown (the pointer-event spec's
                                // compatibility-event behavior), which silently
                                // broke the row's click-and-drag scroll whenever
                                // the textarea had focus.
                                kbTagTapRef.current =
                                  e.pointerType !== 'mouse' &&
                                  document.activeElement === inputRef.current;
                                if (kbTagTapRef.current) {
                                  e.preventDefault();
                                }
                                startLongPress(tag, e);
                              }}
                              onPointerMove={moveLongPress}
                              onPointerUp={() => {
                                const wasTap = lpStart.current !== null;
                                cancelLongPress();
                                if (
                                  kbTagTapRef.current &&
                                  wasTap &&
                                  !lpFired.current &&
                                  !tag.disabled
                                ) {
                                  kbTagTapRef.current = false;
                                  swallowTagClickUntil.current =
                                    performance.now() + 400;
                                  tagManager.toggleTag(tag);
                                }
                              }}
                              onPointerLeave={cancelLongPress}
                              onPointerCancel={() => {
                                kbTagTapRef.current = false;
                                cancelLongPress();
                              }}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                cancelLongPress();
                                setManagedTag(tag);
                              }}
                              onClick={tagScroll.guard(() => {
                                if (performance.now() < swallowTagClickUntil.current) {
                                  return;
                                }
                                if (lpFired.current) {
                                  lpFired.current = false;
                                  return;
                                }
                                tagManager.toggleTag(tag);
                              })}
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
                        <TagScrollRail
                          scrollerRef={tagScroll.ref}
                          contentVersion={stripTags}
                          onVisibilityChange={setTagScrollerVisible}
                        />
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
                        {sections.length > 0 && !isLater && (
                          <button
                            ref={sectionBtnRef}
                            type="button"
                            onClick={openSectionPicker}
                            className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold transition-transform active:scale-95 ${
                              pickedSection
                                ? 'bg-primary/10 text-primary'
                                : 'bg-muted/70 text-muted-foreground'
                            }`}
                          >
                            <Rows3 className="h-4 w-4 shrink-0" />
                            <span className="max-w-[110px] truncate whitespace-nowrap">
                              {pickedSection?.name ?? 'Section'}
                            </span>
                          </button>
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
                    style={{
                      minHeight: hasTaskText || keyboardActive ? 56 : undefined,
                    }}
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
                            {isDesktop && !isSubmitting && (
                              <span className="pointer-events-none absolute right-5 top-1/2 z-10 -translate-y-1/2 inline-flex items-center rounded-lg border border-white/25 bg-white/15 px-2 py-1 text-[11px] font-bold tracking-wide text-white/85">
                                Enter ↵
                              </span>
                            )}
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {suggestionsReady && (
                      <motion.div
                        key="quick-add-suggestions"
                        initial={{ opacity: 0, y: suggestionsOffset }}
                        animate={{
                          opacity: showSuggestions ? 1 : 0,
                          y: showSuggestions ? 0 : suggestionsOffset,
                        }}
                        exit={{ opacity: 0, y: suggestionsOffset }}
                        transition={{
                          duration: 0.4,
                          ease: [0.32, 0.72, 0, 1],
                        }}
                        style={{ maxHeight: suggestionsMax }}
                        className={[
                          // Opaque (not the /70 blend used elsewhere) — this
                          // panel sits over a blurred sheet backdrop, so a
                          // translucent tint picks up whatever's behind it
                          // instead of landing on the intended flat color.
                          'flex min-h-0 flex-col overflow-hidden rounded-[28px] border border-border/80 bg-muted dark:bg-background p-4 shadow-[0_3px_0_0_rgba(0,0,0,0.18)]',
                          showSuggestions
                            ? 'relative pointer-events-auto'
                            : 'invisible absolute inset-x-0 top-0 pointer-events-none',
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
                  reminder={reminder}
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
                  questTagIds={questTagIds}
                />
              </AnimatePresence>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}

      <PlusUpgradeModal
        open={showPremiumLimit}
        placement="quick_add_tag_limit"
        onClose={() => setShowPremiumLimit(false)}
      />

      <TagManagerSheet
        open={!!managedTag}
        tag={managedTag}
        onClose={() => setManagedTag(null)}
        onSave={(updates) => {
          if (managedTag) tagManager.updateTag(managedTag.id, updates);
          setManagedTag(null);
        }}
        onDelete={() => {
          if (managedTag) {
            tagManager.deleteSavedTag(
              managedTag.id,
              managedTag.name,
              { stopPropagation() {} } as React.MouseEvent,
            );
          }
          setManagedTag(null);
        }}
      />

      {mounted && showSectionPicker && sectionMenuPos && createPortal(
        <>
          <div
            className="fixed inset-0 z-[1499]"
            onPointerDown={() => setShowSectionPicker(false)}
          />
          <div
            className="fixed z-[1500] w-56 overflow-hidden rounded-2xl border border-border/70 bg-popover py-1 shadow-xl"
            style={{ left: sectionMenuPos.left, bottom: sectionMenuPos.bottom }}
          >
            <div className="max-h-[40vh] overflow-y-auto">
              <button
                type="button"
                onClick={() => {
                  setPickedSectionId(null);
                  setShowSectionPicker(false);
                }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[14px] font-bold text-foreground transition-colors [@media(hover:hover)]:hover:bg-muted/60"
              >
                <span className="grid h-4 w-4 shrink-0 place-items-center">
                  {!pickedSection && (
                    <Check className="h-4 w-4 text-primary" strokeWidth={3} />
                  )}
                </span>
                No section
              </button>
              {sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setPickedSectionId(s.id);
                    setShowSectionPicker(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[14px] font-bold text-foreground transition-colors [@media(hover:hover)]:hover:bg-muted/60"
                >
                  <span className="grid h-4 w-4 shrink-0 place-items-center">
                    {pickedSectionId === s.id && (
                      <Check className="h-4 w-4 text-primary" strokeWidth={3} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                </button>
              ))}
            </div>
          </div>
        </>,
        document.body,
      )}

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
