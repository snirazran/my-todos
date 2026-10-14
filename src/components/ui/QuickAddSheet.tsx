'use client';

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import useSWR, { mutate } from 'swr';
import {
  AnimatePresence,
  animate,
  motion,
  useDragControls,
  useMotionValue,
  useReducedMotion,
} from 'framer-motion';
import {
  ArrowUp,
  Bell,
  CalendarDays,
  Check,
  ListPlus,
  Lock,
  Plus,
  Repeat,
  Rows3,
  Sparkles,
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
import { LilyInk } from '@/components/ui/TaskAdornments';
import { useLeapView } from '@/components/leap/useLeapView';
import { useIntros } from '@/hooks/useIntros';
import { useUIStore } from '@/lib/uiStore';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import { hapticSuccess, hapticTick } from '@/lib/haptics';
import { launchTaskEntranceFrom } from '@/lib/taskEntrance';
import { useNotification } from '@/components/providers/NotificationProvider';
import { PlusUpgradeModal } from './PlusUpgradeModal';
import { PickerSheet } from './quick-add/PickerSheet';
import { QuickAddTip } from './quick-add/QuickAddTip';
import { TagManagerSheet } from './quick-add/TagManagerSheet';
import {
  SAVED_TASKS_KEY,
  SuggestionTabs,
  type SuggestionPick,
} from './quick-add/SuggestionTabs';
import { SavedTasksSheet } from './quick-add/SavedTasksSheet';
import { Icon as AppIcon } from '@/components/ui/Icon';
import { useDragScroll } from './quick-add/useDragScroll';
import {
  TINT,
  TagPillContent,
  tagPillProps,
  type Tint,
} from './quick-add/kit';
import { useTagManager } from './quick-add/useTagManager';
import { useCalendarMonth } from './quick-add/useCalendarMonth';
import { useKeyboardInset } from './quick-add/useKeyboardInset';
import { parseBulkTasks } from './quick-add/bulkTasks';
import {
  matchSuggestionBuckets,
  nameMatchesBucket,
  parseNaturalInput,
  parseYmdLocal,
  stripNaturalTokens,
  repeatModeFor,
  ymdLocal,
  fetcher,
  type RepeatRule,
} from './quick-add/utils';

// Horizontal rails here scroll but must not show a scrollbar, so the only cue
// that more is off-screen is a soft fade on the trailing edge.
function useScrollFade(contentVersion: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const [faded, setFaded] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setFaded(maxScroll > 4 && el.scrollLeft < maxScroll - 4);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [update, contentVersion]);

  return { ref, faded, update };
}

const ToolbarChip = React.forwardRef<
  HTMLButtonElement,
  {
    icon: React.ReactNode;
    label: string;
    ariaLabel?: string;
    active?: boolean;
    hint?: string;
    tint: Tint;
    onClick: () => void;
  }
>(function ToolbarChip({ icon, label, ariaLabel, active = false, hint, tint, onClick }, ref) {
  const settled = useRef(false);
  useEffect(() => {
    settled.current = true;
  }, []);
  return (
    <button
      ref={ref}
      type="button"
      aria-label={ariaLabel ?? label}
      data-hint={hint}
      onClick={onClick}
      className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl bg-muted/50 pl-1 pr-3.5 text-[14px] font-bold transition-[transform,background-color] active:scale-95 active:bg-muted sm:h-10 sm:pr-3 sm:text-[13.5px] [@media(hover:hover)]:hover:bg-muted ${
        active ? 'text-foreground' : 'text-muted-foreground'
      }`}
    >
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl sm:h-8 sm:w-8 ${TINT[tint]}`}>
        {icon}
      </span>
      <motion.span
        key={label}
        initial={settled.current ? { opacity: 0, y: 5 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 560, damping: 32 }}
        className="whitespace-nowrap"
      >
        {label}
      </motion.span>
    </button>
  );
});
import type {
  ActivePicker,
  ChecklistItem,
  QuickAddSheetProps,
  QuickAddSubmit,
  RepeatChoice,
  SavedTag,
} from './quick-add/types';

const BulkAddReviewSheet = dynamic(
  () => import('./quick-add/BulkAddReviewSheet'),
  { ssr: false },
);

export type { QuickAddSheetProps } from './quick-add/types';

export default function QuickAddSheet({
  open,
  onOpenChange,
  onSubmit,
  onBulkSubmit,
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
  defaultSectionId = null,
}: QuickAddSheetProps) {
  const [text, setText] = useState(initialText);
  const { showNotification } = useNotification();
  const [bulkInitialTasks, setBulkInitialTasks] = useState<string[] | null>(null);
  const [bulkOmittedCount, setBulkOmittedCount] = useState(0);
  const [nlDismissed, setNlDismissed] = useState('');
  const [nlOverride, setNlOverride] = useState({ date: false, time: false });
  const [tagSuggestDismissed, setTagSuggestDismissed] = useState('');
  const sendRef = useRef<HTMLButtonElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
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

  const submitLockRef = useRef(false);
  useEffect(() => {
    if (!open) return;
    dragExitRef.current = { velocity: 0, offset: 0 };
    submitLockRef.current = false;
  }, [open]);
  const [showPremiumLimit, setShowPremiumLimit] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [pickedSectionId, setPickedSectionId] = useState<string | null>(null);
  const [sectionPickedManually, setSectionPickedManually] = useState(false);
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
  const actionsScroll = useDragScroll();
  const [tagFadeRight, setTagFadeRight] = useState(false);
  const updateTagFade = useCallback(() => {
    const el = tagScroll.ref.current;
    if (!el) return;
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    const clampedScroll = Math.min(maxScroll, Math.max(0, el.scrollLeft));
    if (el.scrollLeft !== clampedScroll) el.scrollLeft = clampedScroll;
    setTagFadeRight(maxScroll - clampedScroll > 4);
  }, [tagScroll.ref]);
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

  // Same deal for the chips above the input (parsed date/time, suggested tags):
  // handlers that commit on pointerup when the tap came from a touch with the
  // keyboard up, and ignore the click that may follow.
  const keyboardSafeTap = (run: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      kbTagTapRef.current =
        e.pointerType !== 'mouse' && document.activeElement === inputRef.current;
      e.preventDefault();
    },
    onPointerUp: () => {
      if (!kbTagTapRef.current) return;
      kbTagTapRef.current = false;
      swallowTagClickUntil.current = performance.now() + 400;
      run();
    },
    onPointerCancel: () => {
      kbTagTapRef.current = false;
    },
    onClick: () => {
      if (performance.now() < swallowTagClickUntil.current) return;
      run();
    },
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
  const pickSetTimeRef = useRef(false);
  const { seenIntros, markIntroSeen } = useIntros(open);
  const markIntroSeenRef = useRef(markIntroSeen);
  markIntroSeenRef.current = markIntroSeen;
  // A quest guide can already be pointing into this sheet (the tag beat anchors
  // `quickadd-tag`). Two coaches on one control is worse than none, so the
  // first-run material stands down whenever one is running.
  const questHintActive = useUIStore((state) => state.activeHint !== null);
  const [tagEditTipOpen, setTagEditTipOpen] = useState(false);
  // Dismissal has to stick on its own: the seenIntros write is optimistic, so
  // without this the tip re-arms the moment its condition is still true.
  const [tagEditTipDismissed, setTagEditTipDismissed] = useState(false);

  const { data: questContext } = useSWR<{
    isPremium?: boolean;
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

  const stripTags = tagManager.savedTags;
  const tagColors = tags
    .map((id) => stripTags.find((t) => t.id === id)?.color)
    .filter((c): c is string => !!c)
    .slice(0, 3);

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

  // Focus the task input when the sheet opens, so typing can start straight
  // away. Mobile waits out the slide-in first: focusing mid-animation raises
  // the keyboard against a sheet that is still travelling.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(
      () => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        // Selecting the lot is a desktop convention and easy to undo there. On
        // a phone it would put one stray keystroke between the user and losing
        // the text they came back to edit, so the caret goes to the end.
        if (isDesktop) el.select();
        else el.setSelectionRange(el.value.length, el.value.length);
      },
      isDesktop ? 60 : 420,
    );
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
      if (showPremiumLimit || showSavedConfirm || bulkInitialTasks) return;
      if (showSectionPicker) {
        closeSectionPicker();
        return;
      }
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
    bulkInitialTasks,
    showSectionPicker,
    managedTag,
    onOpenChange,
  ]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [text, open]);


  const [openSeen, setOpenSeen] = useState(false);
  if (open !== openSeen) {
    setOpenSeen(open);
    setSuggestionsReady(open);
    if (open) {
      setText(initialText);
      setBulkInitialTasks(null);
      setBulkOmittedCount(0);

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
      setPickedSectionId(defaultSectionId);
      setSectionPickedManually(!!defaultSectionId);
      setShowSectionPicker(false);

      const initialDate = defaultDateKey ?? ymdLocal(new Date());
      setSelectedDateKey(initialDate);
      calendar.setCalendarMonthFromDate(parseYmdLocal(initialDate));
      setNlOverride({ date: false, time: false });
      setNlDismissed('');
      setTagSuggestDismissed('');
    }
  }

  const isLater = pickedDays.includes(7);
  const nlParsed = useMemo(() => parseNaturalInput(text), [text]);
  const nlActive = !isLater && !!nlParsed && text !== nlDismissed;
  const nlDateKey = nlActive && !nlOverride.date ? nlParsed?.dateKey : undefined;
  const nlStartTime =
    nlActive && !nlOverride.time ? nlParsed?.startTime : undefined;
  const nlApplied = !!(nlDateKey || nlStartTime);
  const nlTokens = nlApplied
    ? (nlParsed?.tokens ?? []).filter((t) =>
        t.kind === 'date' ? !!nlDateKey : !!nlStartTime,
      )
    : [];
  const displayDayOf = (date: Date) => {
    const displayDay = daysOrder
      ? daysOrder.indexOf(date.getDay() as Exclude<ApiDay, -1>)
      : date.getDay();
    return (
      displayDay >= 0 ? displayDay : todayDisplayIndex(daysOrder)
    ) as DisplayDay;
  };
  const effectiveDateKey = nlDateKey ?? selectedDateKey;
  const effectivePickedDays = nlDateKey
    ? [displayDayOf(parseYmdLocal(nlDateKey))]
    : pickedDays;
  const effectiveStartTime = nlStartTime ?? startTime;
  const effectiveNotify = nlStartTime ? true : notifyEnabled;
  const nlKey = `${nlParsed?.dateKey ?? ''}|${nlParsed?.startTime ?? ''}`;
  useLayoutEffect(() => {
    setNlOverride({ date: false, time: false });
  }, [nlKey]);
  useEffect(() => {
    if (open && nlApplied) markIntroSeenRef.current('quickAddNl');
  }, [open, nlApplied]);
  const takeOverNlTime = () => {
    if (!nlStartTime) return;
    setStartTime(nlStartTime);
    setNotifyEnabled(true);
    setNlOverride((o) => ({ ...o, time: true }));
  };
  const pickedSection =
    sections.find((s) => s.id === pickedSectionId) ?? null;
  const sectionBtnRef = useRef<HTMLButtonElement>(null);
  const [sectionMenuPos, setSectionMenuPos] = useState<{
    left: number;
    bottom: number;
  } | null>(null);
  // The backdrop closes the menu on pointerdown, so the chip's own click would
  // otherwise re-open it immediately — swallow taps that land right after.
  const sectionClosedAt = useRef(0);
  const closeSectionPicker = () => {
    sectionClosedAt.current = performance.now();
    setShowSectionPicker(false);
  };
  const toggleSectionPicker = () => {
    if (showSectionPicker || performance.now() - sectionClosedAt.current < 300) {
      closeSectionPicker();
      return;
    }
    const r = sectionBtnRef.current?.getBoundingClientRect();
    if (!r) return;
    setSectionMenuPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - 232)),
      bottom: window.innerHeight - r.top + 8,
    });
    setShowSectionPicker(true);
  };
  // A tag connected to a section files the task there on its own; an explicit
  // pick from the menu wins and is never overwritten.
  const sectionTagKey = sections
    .map((s) => `${s.id}:${(s.tagIds ?? []).join('|')}`)
    .join(',');
  const selectedTagKey = tags.join(',');
  useEffect(() => {
    if (!open || sectionPickedManually || defaultSectionId) return;
    const match = sections.find((s) =>
      (s.tagIds ?? []).some((id) => tags.includes(id)),
    );
    setPickedSectionId(match?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sectionPickedManually, sectionTagKey, selectedTagKey]);
  const todayKey = ymdLocal(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowKey = ymdLocal(tomorrowDate);
  const todayIndex = todayDisplayIndex(daysOrder);
  const tomorrowIndex = ((todayIndex + 1) % 7) as DisplayDay;
  const selectedDay = (effectivePickedDays[0] ?? todayIndex) as DisplayDay;
  const anchorDate = effectiveDateKey
    ? parseYmdLocal(effectiveDateKey)
    : new Date();
  const anchorApiDay = anchorDate.getDay() as Exclude<ApiDay, -1>;
  const anchorDisplayDay = displayDayFromApi(anchorApiDay, daysOrder);
  const repeatDay = (
    isLater || anchorDisplayDay === 7 ? todayIndex : anchorDisplayDay
  ) as DisplayDay;
  const repeatsOn = repeat !== 'this-week';
  const { data: leapView } = useLeapView(open);
  const reduceMotion = useReducedMotion();
  const leapLily = repeatsOn && !!leapView?.enabled;
  const [savedOpen, setSavedOpen] = useState(false);
  const { data: savedBacklog } = useSWR<unknown>(open ? SAVED_TASKS_KEY : null, fetcher);
  const savedCount = Array.isArray(savedBacklog) ? savedBacklog.length : 0;
  const applySavedPick = (pick: SuggestionPick) => {
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
    pickSetTimeRef.current = pick.startTime !== undefined;
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
  };
  const hasTaskText = text.trim().length > 0;
  const keyboardActive = inputFocused && keyboardInset > 0;
  const availableSheetHeight = Math.max(
    320,
    sheetBaseHeight ?? viewportHeight ?? 900,
  );
  const showSuggestions = suggestionsReady && !hasTaskText && hasSuggestionContent;
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
    : effectiveDateKey === todayKey
      ? 'Today'
      : effectiveDateKey === tomorrowKey
        ? 'Tomorrow'
        : effectiveDateKey
          ? parseYmdLocal(effectiveDateKey).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })
          : labelForDisplayDay(selectedDay as Exclude<DisplayDay, 7>, daysOrder);

  const nlMirror =
    nlTokens.length > 0
      ? (() => {
          const parts: React.ReactNode[] = [];
          let at = 0;
          [...nlTokens]
            .sort((a, b) => a.start - b.start)
            .forEach((token) => {
              if (token.start > at) parts.push(text.slice(at, token.start));
              parts.push(
                <mark
                  key={`${token.kind}-${text.slice(token.start, token.end)}`}
                  className="nl-mark rounded-[8px] bg-primary/15 text-transparent shadow-[0_0_0_2px_hsl(var(--primary)/0.15)] [-webkit-box-decoration-break:clone] [box-decoration-break:clone]"
                >
                  {text.slice(token.start, token.end)}
                </mark>,
              );
              at = token.end;
            });
          parts.push(text.slice(at));
          return parts;
        })()
      : null;
  const nlLabel = nlApplied
    ? [
        nlDateKey
          ? nlDateKey === todayKey
            ? 'Today'
            : nlDateKey === tomorrowKey
              ? 'Tomorrow'
              : parseYmdLocal(nlDateKey).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })
          : null,
        nlStartTime ?? null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';
  useEffect(() => {
    if (open) return;
    setTagEditTipOpen(false);
    setTagEditTipDismissed(false);
  }, [open]);

  // The one control whose behaviour is still invisible after labelling: a tag
  // chip looks like a toggle, and nothing says it also opens an editor.
  useEffect(() => {
    if (!open || questHintActive || tagEditTipDismissed) return;
    if (!seenIntros || seenIntros.quickAddTagEdit) return;
    if (tags.length === 0) return;
    setTagEditTipOpen(true);
    markIntroSeenRef.current('quickAddTagEdit');
  }, [
    open,
    seenIntros,
    questHintActive,
    tagEditTipDismissed,
    tags.length,
  ]);

  // Natural-language parsing is the only capability with no control to point
  // at, so it gets the one line of teaching — and it stays until the user has
  // actually used it once, not merely been shown it.
  const showNlHint =
    !hasTaskText &&
    !!seenIntros &&
    !seenIntros.quickAddNl;

  // The reminder wheel resolves clicks against its own container, so a click
  // that lands where the wheel is about to mount reads as a position outside
  // it. One frame of delay lets the opening click finish first.
  const openReminderPicker = useCallback(() => {
    requestAnimationFrame(() => setShowReminderPicker(true));
  }, []);

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

  // Area-first: the task text resolves to a focus AREA (bucket → selected
  // area), then ALL of that area's connected tags are offered (up to 3),
  // name-matching tags first.
  const questTagSuggestions = useMemo(() => {
    if (!hasTaskText || suggestionEntries.length === 0) return [];
    const buckets = matchSuggestionBuckets(text);
    if (buckets.length === 0) return [];
    const candidates = tagManager.savedTags.filter(
      (t) => !t.disabled && !tags.includes(t.id),
    );
    if (candidates.length === 0) return [];
    const categoryName = (id: string) =>
      questContext?.macroCategories?.find((c) => c.id === id)?.name ?? id;
    const picked: typeof candidates = [];
    const pushAreaTags = (entry: (typeof suggestionEntries)[number], bucket: string) => {
      const areaTags = candidates.filter((t) => entry.tagIds.includes(t.id));
      const ordered = [
        ...areaTags.filter((t) => nameMatchesBucket(bucket, t.name)),
        ...areaTags.filter((t) => !nameMatchesBucket(bucket, t.name)),
      ];
      for (const tag of ordered) {
        if (picked.length >= 3) return;
        if (!picked.some((p) => p.id === tag.id)) picked.push(tag);
      }
    };
    for (const bucket of buckets) {
      if (picked.length >= 3) break;
      let entryMatch = suggestionEntries.find((entry) =>
        nameMatchesBucket(bucket, categoryName(entry.categoryId)),
      );
      if (!entryMatch) {
        entryMatch = suggestionEntries.find((entry) =>
          candidates.some(
            (t) =>
              entry.tagIds.includes(t.id) && nameMatchesBucket(bucket, t.name),
          ),
        );
      }
      if (entryMatch) pushAreaTags(entryMatch, bucket);
    }
    return picked;
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
    tagIds: string[];
  } | null>(null);
  const aiCacheRef = useRef<Map<string, string[]>>(new Map());

  useEffect(() => {
    if (!open || !hasTaskText || questTagSuggestions.length > 0) return;
    if (suggestionEntries.length === 0) return;
    const key = text.trim().toLowerCase();
    if (key.length < 4) return;
    const cache = aiCacheRef.current;
    const cached = cache.get(key);
    if (cached) {
      setAiSuggestion({ key, tagIds: cached });
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
        const tagIds = Array.isArray(data?.tagIds)
          ? data.tagIds.filter((id: unknown) => typeof id === 'string')
          : [];
        if (cache.size > 200) cache.clear();
        cache.set(key, tagIds);
        setAiSuggestion({ key, tagIds });
      } catch {
        // Aborted or offline — keyword matching already had its chance.
      }
    }, 900);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, hasTaskText, text, questTagSuggestions, suggestionEntries]);

  const aiTagSuggestions = useMemo(() => {
    if (!aiSuggestion || aiSuggestion.tagIds.length === 0) return [];
    if (aiSuggestion.key !== text.trim().toLowerCase()) return [];
    return aiSuggestion.tagIds
      .map((id) => tagManager.savedTags.find((t) => t.id === id))
      .filter(
        (t): t is NonNullable<typeof t> =>
          !!t && !t.disabled && !tags.includes(t.id),
      )
      .slice(0, 3);
  }, [aiSuggestion, text, tagManager.savedTags, tags]);

  const resolvedTagSuggestions =
    questTagSuggestions.length > 0 ? questTagSuggestions : aiTagSuggestions;
  const showQuestTagSuggestion =
    resolvedTagSuggestions.length > 0 && text !== tagSuggestDismissed;

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

  const actionsFade = useScrollFade(
    `${selectedDateLabel}|${repeatShortLabel}|${repeatsOn}|${effectiveNotify}|${effectiveStartTime}|${pickedSection?.id ?? ''}|${sections.length}|${stripTags.length}`,
  );

  const selectSingleDay = (day: DisplayDay) => {
    setNlOverride((o) => ({ ...o, date: true }));
    setPickedDays([day]);
    const date = new Date();
    const offset = day === tomorrowIndex ? 1 : 0;
    date.setDate(date.getDate() + offset);
    setSelectedDateKey(ymdLocal(date));
    setActivePicker(null);
  };

  const selectCalendarDate = (date: Date) => {
    setNlOverride((o) => ({ ...o, date: true }));
    setSelectedDateKey(ymdLocal(date));
    setPickedDays([displayDayOf(date)]);
    setShowCalendarPicker(false);
    setActivePicker(null);
  };

  const submitDataFor = (
    taskText: string,
    includeSavedDetails: boolean,
  ): QuickAddSubmit | null => {
    const trimmed = taskText.trim();
    if (!trimmed) return null;

    const apiDays: ApiDay[] = effectivePickedDays
      .slice()
      .sort()
      .map((day) => apiDayFromDisplay(day, daysOrder));
    if (apiDays.length === 0) return null;

    const exactDates =
      repeat === 'monthly' || repeat === 'custom'
        ? effectiveDateKey
          ? [effectiveDateKey]
          : undefined
        : repeat === 'this-week' && !isLater && effectiveDateKey
          ? [effectiveDateKey]
          : undefined;

    return {
      text: trimmed,
      days: apiDays,
      dates: exactDates,
      repeat,
      tags,
      startTime: effectiveStartTime || undefined,
      endTime: (nlStartTime ? undefined : endTime) || undefined,
      reminder: effectiveNotify ? reminder : undefined,
      repeatEndDate: repeat !== 'this-week' ? repeatEndDate : null,
      repeatRule: repeat === 'custom' ? repeatRule : null,
      notes: includeSavedDetails && pickedBacklogTaskId ? pickedNotes : undefined,
      checklist:
        includeSavedDetails && pickedBacklogTaskId ? pickedChecklist : undefined,
      sectionId: pickedSectionId ?? undefined,
    };
  };

  const doSubmit = async (removeSavedTask: boolean) => {
    if (isSubmitting || submitLockRef.current) return;
    const submitData = submitDataFor(
      nlTokens.length > 0 ? stripNaturalTokens(text, nlTokens) || text : text,
      true,
    );
    if (!submitData) return;
    submitLockRef.current = true;
    const savedTaskId = removeSavedTask ? pickedBacklogTaskId : null;

    hapticSuccess();
    markIntroSeenRef.current('quickAddNl');
    const origin = sendRef.current?.getBoundingClientRect();
    if (origin) launchTaskEntranceFrom(origin);
    onOpenChange(false);

    const attempt = async (): Promise<void> => {
      try {
        await onSubmit(submitData);
      } catch (error) {
        console.error('Add task failed', error);
        showNotification(
          `Couldn't add "${submitData.text}"`,
          () => attempt(),
          { durationMs: 8000, actionLabel: 'Retry' },
        );
        return;
      }
      if (savedTaskId) {
        const backlogKey = '/api/tasks?view=board&day=-1';
        mutate(
          backlogKey,
          (cur?: { id: string }[]) => cur?.filter((t) => t.id !== savedTaskId),
          { revalidate: false },
        );
        fetch(`/api/tasks?view=board`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            day: -1,
            taskId: savedTaskId,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        })
          .then(() => mutate(backlogKey))
          .catch(console.error);
      }
    };
    void attempt();
  };

  const submitBulkTasks = async (taskTexts: string[]) => {
    if (isSubmitting || submitLockRef.current) return;
    const tasks = taskTexts
      .map((taskText) => submitDataFor(taskText, false))
      .filter((task): task is QuickAddSubmit => !!task);
    if (tasks.length === 0) return;

    hapticTick();
    submitLockRef.current = true;
    setIsSubmitting(true);
    try {
      if (onBulkSubmit) {
        await onBulkSubmit(tasks);
      } else {
        for (const task of tasks) await onSubmit(task);
      }
      setBulkInitialTasks(null);
      onOpenChange(false);
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  const openBulkAdd = (tasks: string[], omittedCount = 0) => {
    inputRef.current?.blur();
    setBulkInitialTasks(tasks.length > 0 ? tasks : ['']);
    setBulkOmittedCount(omittedCount);
  };

  const handleTaskPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = event.clipboardData.getData('text/plain');
    if (!/[\r\n]/.test(pasted)) return;
    const target = event.currentTarget;
    const start = target.selectionStart ?? text.length;
    const end = target.selectionEnd ?? start;
    const combined = `${text.slice(0, start)}${pasted}${text.slice(end)}`;
    const parsed = parseBulkTasks(combined);
    if (parsed.tasks.length < 2) return;
    event.preventDefault();
    openBulkAdd(parsed.tasks, parsed.omittedCount);
  };

  const handleSubmit = async () => {
    hapticTick();
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
    hidden: isDesktop ? { opacity: 0, y: 14 } : { y: '100%' },
    visible: isDesktop ? { opacity: 1, y: 0 } : { y: 0 },
    exit: ({ velocity, offset }: { velocity: number; offset: number }) => {
      if (isDesktop) {
        return {
          opacity: 0,
          y: 8,
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
                className="fixed inset-0 z-[1399] bg-black/50 will-change-opacity sm:bg-black/40"
                style={{ opacity: backdropOpacity }}
              />

              <motion.div
                ref={sheetRef}
                variants={sheetVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                custom={dragExitRef.current}
                transition={
                  isDesktop
                    ? {
                        y: { type: 'spring', stiffness: 520, damping: 40 },
                        opacity: { duration: 0.16, ease: 'easeOut' },
                      }
                    : { type: 'spring', stiffness: 420, damping: 40, mass: 0.9 }
                }
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
                    ? 'inset-0 items-start justify-center p-6 pt-[14vh]'
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
                  <div className="flex min-h-0 flex-1 flex-col gap-3">
                  <div className="flex flex-none flex-col overflow-hidden rounded-[28px] bg-popover px-5 pb-3.5 pt-2 ring-1 ring-border/80 shadow-[0_3px_0_0_rgba(0,0,0,0.14),0_22px_44px_-18px_rgba(15,23,42,0.4)] sm:pt-5">
                    {!isDesktop && (
                      <div
                        onPointerDown={(e) => dragControls.start(e)}
                        className="-mx-5 -mt-2 mb-1 flex h-7 items-center justify-center touch-none cursor-grab active:cursor-grabbing"
                      >
                        <div className="h-1.5 w-10 rounded-full bg-muted-foreground/25" />
                      </div>
                    )}
                    <div dir="ltr" className="w-full pt-1">
                      <div className="relative flex shrink-0 items-start gap-3">
                        <AnimatePresence initial={false}>
                          {tagColors.length > 0 && (
                            <motion.span
                              key="tag-bar"
                              aria-hidden="true"
                              initial={{ scaleY: 0, opacity: 0 }}
                              animate={{ scaleY: 1, opacity: 1 }}
                              exit={{ scaleY: 0, opacity: 0 }}
                              transition={{ type: 'spring', stiffness: 520, damping: 30 }}
                              className="absolute -left-5 top-[13px] flex h-7 w-[4px] origin-center flex-col overflow-hidden rounded-r-full sm:top-[15px]"
                            >
                              {tagColors.map((color, i) => (
                                <span
                                  key={`${color}-${i}`}
                                  className="min-h-0 flex-1 transition-colors duration-200"
                                  style={{ backgroundColor: color }}
                                />
                              ))}
                            </motion.span>
                          )}
                        </AnimatePresence>
                        <div className="relative min-w-0 flex-1">
                          <div
                            ref={mirrorRef}
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-1 pt-3 pb-1 text-left text-[22px] font-semibold leading-[30px] tracking-tight text-transparent sm:text-2xl"
                          >
                            {nlMirror}
                          </div>
                          <textarea
                            ref={inputRef}
                            value={text}
                            rows={1}
                            onChange={(e) =>
                              setText(e.target.value.replace(/\s*\n+\s*/g, ' '))
                            }
                            onScroll={(e) => {
                              if (mirrorRef.current) {
                                mirrorRef.current.scrollTop =
                                  e.currentTarget.scrollTop;
                              }
                            }}
                            onPaste={handleTaskPaste}
                            onFocus={() => setInputFocused(true)}
                            onBlur={() => setInputFocused(false)}
                            placeholder="Add a task"
                            aria-label="Task name"
                            disabled={isSubmitting}
                            spellCheck={false}
                            autoComplete="off"
                            autoCorrect="on"
                            autoCapitalize="sentences"
                            enterKeyHint="done"
                            maxLength={100}
                            className="no-scrollbar relative block w-full min-h-[60px] max-h-[136px] resize-none overflow-y-auto rounded-xl bg-transparent px-1 pt-3 pb-1 text-[22px] font-semibold leading-[30px] tracking-tight text-foreground caret-primary placeholder:text-muted-foreground/45 focus:outline-none disabled:opacity-50 text-left sm:text-2xl"
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
                        {!isDesktop && (
                        <button
                          ref={sendRef}
                          type="button"
                          {...keyboardSafeTap(() => {
                            if (hasTaskText && !isSubmitting) void handleSubmit();
                          })}
                          disabled={isSubmitting}
                          aria-disabled={!hasTaskText}
                          aria-label={submitLabel}
                          className={`relative mt-1.5 grid h-12 w-12 shrink-0 place-items-center rounded-full transition-[background-color,box-shadow,transform] duration-200 ease-out sm:mt-2 sm:h-[52px] sm:w-[52px] ${
                            hasTaskText
                              ? 'bg-[#447d3f] text-white shadow-[0_3px_0_0_#2c511a] active:translate-y-[3px] active:shadow-none [@media(hover:hover)]:hover:bg-[#3d7038]'
                              : 'cursor-default bg-primary/[0.16] ring-1 ring-inset ring-primary/25'
                          }`}
                        >
                          <AnimatePresence initial={false} mode="popLayout">
                            {hasTaskText ? (
                              <motion.span
                                key="send"
                                initial={{ scale: 0.3, opacity: 0, rotate: -60 }}
                                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                                exit={{ scale: 0.3, opacity: 0, rotate: 30 }}
                                transition={{ type: 'spring', stiffness: 640, damping: 26 }}
                                className="grid place-items-center"
                              >
                                <ArrowUp className="h-6 w-6" strokeWidth={3} />
                              </motion.span>
                            ) : (
                              <motion.span
                                key="fly"
                                initial={{ scale: 0.4, opacity: 0, y: 8 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ scale: 0.5, opacity: 0, y: -14, rotate: -12 }}
                                transition={{ type: 'spring', stiffness: 520, damping: 24 }}
                                className="grid place-items-center"
                              >
                                <Fly size={40} y={-3} interactive={false} />
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </button>
                        )}
                      </div>

                      {showNlHint && (
                        <p className="mt-0.5 px-1 text-[13px] font-medium leading-snug text-muted-foreground/70">
                          Dates work too — try “gym tomorrow 7am”
                        </p>
                      )}

                      {(nlApplied || showQuestTagSuggestion) && (
                        <div className="mt-2 mb-0.5 flex flex-wrap items-center gap-2 px-0.5">
                          {nlApplied && (
                            <motion.span
                              key={nlLabel}
                              initial={{ opacity: 0, scale: 0.88, y: 4 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              transition={{ type: 'spring', stiffness: 560, damping: 30 }}
                              className="inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full bg-primary/10 pl-2.5 pr-0.5 text-[13px] font-black text-primary"
                            >
                              <Sparkles className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
                              <span className="truncate tabular-nums">{nlLabel}</span>
                              <button
                                type="button"
                                aria-label="Keep as text"
                                title="Keep as text"
                                {...keyboardSafeTap(() => setNlDismissed(text))}
                                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-primary/60 transition-colors [@media(hover:hover)]:hover:bg-primary/15 [@media(hover:hover)]:hover:text-primary"
                              >
                                <X className="h-3.5 w-3.5" strokeWidth={3} />
                              </button>
                            </motion.span>
                          )}
                          {showQuestTagSuggestion && (
                            <>
                              {resolvedTagSuggestions.map((suggestedTag) => (
                                <button
                                  key={suggestedTag.id}
                                  type="button"
                                  {...keyboardSafeTap(() =>
                                    setTags((prev) =>
                                      prev.includes(suggestedTag.id)
                                        ? prev
                                        : [...prev, suggestedTag.id],
                                    ),
                                  )}
                                  {...tagPillProps({
                                    color: suggestedTag.color,
                                    suggest: true,
                                    size: 'sm',
                                  })}
                                >
                                  <TagPillContent
                                    name={suggestedTag.name}
                                    color={suggestedTag.color}
                                    suggest
                                  />
                                </button>
                              ))}
                              <button
                                type="button"
                                aria-label="Dismiss tag suggestions"
                                {...keyboardSafeTap(() => setTagSuggestDismissed(text))}
                                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground/50 transition-colors [@media(hover:hover)]:hover:bg-muted [@media(hover:hover)]:hover:text-foreground"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      <div className="h-3" />

                      {/* One row that scrolls. Every control keeps its word —
                          a bare icon in here reads as a puzzle to anyone who
                          has not already learnt it. */}
                      <div
                        ref={(el) => {
                          (actionsFade.ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
                          (actionsScroll.ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
                        }}
                        onScroll={actionsFade.update}
                        {...actionsScroll.handlers}
                        className={`-mx-1 flex cursor-grab select-none items-center gap-2 overflow-x-auto overscroll-x-none no-scrollbar px-1 pb-0.5 touch-pan-x active:cursor-grabbing ${
                          actionsFade.faded ? 'mask-fade-right' : ''
                        }`}
                      >
                        {!hideDayPicker && (
                          <ToolbarChip
                            tint="sky"
                            icon={<CalendarDays className="h-4 w-4" strokeWidth={2.5} />}
                            label={selectedDateLabel}
                            ariaLabel={`When: ${selectedDateLabel}`}
                            active
                            onClick={() => setActivePicker('date')}
                          />
                        )}
                        {!hideRepeatPicker && (
                          <ToolbarChip
                            tint="green"
                            icon={
                              leapLily && leapView ? (
                                <motion.span
                                  key="leap-lily"
                                  className="-my-1 inline-flex"
                                  initial={reduceMotion ? false : { scale: 0.4, rotate: -14 }}
                                  animate={{ scale: 1, rotate: 0 }}
                                  transition={{ type: 'spring', stiffness: 520, damping: 18 }}
                                >
                                  <LilyInk index={leapView.league} ink={16} />
                                </motion.span>
                              ) : (
                                <Repeat className="h-4 w-4" strokeWidth={2.5} />
                              )
                            }
                            label={repeatsOn ? repeatShortLabel : 'Repeat'}
                            ariaLabel={
                              repeatsOn
                                ? `Repeats ${repeatShortLabel}${leapLily ? ', counts toward your weekly league' : ''}`
                                : 'Repeat'
                            }
                            active={repeatsOn}
                            hint="quickadd-repeat"
                            onClick={() => setActivePicker('repeat')}
                          />
                        )}
                        <ToolbarChip
                          tint="amber"
                          icon={<Bell className="h-4 w-4" strokeWidth={2.5} />}
                          label={
                            effectiveNotify && effectiveStartTime
                              ? effectiveStartTime
                              : 'Reminder'
                          }
                          ariaLabel={
                            effectiveNotify && effectiveStartTime
                              ? `Reminder at ${effectiveStartTime}`
                              : 'Set a reminder'
                          }
                          active={effectiveNotify}
                          onClick={openReminderPicker}
                        />
                        {savedCount > 0 && (
                          <ToolbarChip
                            tint="green"
                            icon={<AppIcon name="saved" className="h-[18px] w-[18px]" />}
                            label={`${savedCount} saved`}
                            ariaLabel={`Pick from ${savedCount} saved tasks`}
                            active={!!pickedBacklogTaskId}
                            onClick={() => setSavedOpen(true)}
                          />
                        )}
                        {sections.length > 0 && !isLater && (
                          <ToolbarChip
                            ref={sectionBtnRef}
                            tint="teal"
                            icon={<Rows3 className="h-4 w-4" strokeWidth={2.5} />}
                            label={pickedSection?.name ?? 'Section'}
                            active={!!pickedSection}
                            onClick={toggleSectionPicker}
                          />
                        )}
                        {stripTags.length === 0 && (
                          <ToolbarChip
                            tint="violet"
                            icon={<Tag className="h-4 w-4" strokeWidth={2.5} />}
                            label="Tag"
                            ariaLabel="Add a tag"
                            onClick={() => setActivePicker('tags')}
                          />
                        )}
                        {!isDesktop && (
                          <ToolbarChip
                            tint="neutral"
                            icon={<ListPlus className="h-4 w-4" strokeWidth={2.5} />}
                            label="Multiple"
                            ariaLabel="Add multiple tasks"
                            onClick={() => openBulkAdd([])}
                          />
                        )}
                      </div>

                      {/* No rail until tags exist: a dashed "Create tag" button
                          was the loudest thing on an empty sheet, asking for
                          taxonomy before the first task. The toolbar's Tag chip
                          is the way in until then. */}
                      {stripTags.length > 0 && (
                      <div
                        className="relative -mx-2 mt-1.5"
                      >
                        <div
                          ref={tagScroll.ref}
                          data-hint="tag-picker"
                          onScroll={updateTagFade}
                          onMouseDown={tagScroll.handlers.onMouseDown}
                          onMouseLeave={tagScroll.handlers.onMouseLeave}
                          onMouseUp={tagScroll.handlers.onMouseUp}
                          onMouseMove={tagScroll.handlers.onMouseMove}
                          onWheel={tagScroll.handlers.onWheel}
                          className={`flex cursor-grab select-none items-center gap-2 overflow-x-auto overscroll-x-none no-scrollbar px-2 py-1 touch-pan-x active:cursor-grabbing ${
                            tagFadeRight ? 'mask-fade-right' : ''
                          }`}
                          style={{ overscrollBehaviorX: 'none' }}
                        >
                        {stripTags.map((tag) => {
                          const selected = tags.includes(tag.id);
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
                              aria-pressed={selected}
                              {...tagPillProps({
                                color: tag.color,
                                selected: selected && !tag.disabled,
                                locked: tag.disabled,
                                size: isDesktop ? 'sm' : 'md',
                              })}
                            >
                              <TagPillContent
                                name={tag.name}
                                color={tag.color}
                                selected={selected && !tag.disabled}
                                locked={tag.disabled}
                              />
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          aria-label="Add tag"
                          onClick={tagScroll.guard(() => setActivePicker('tags'))}
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-[1.5px] border-dashed border-muted-foreground/35 sm:h-8 sm:w-8 text-muted-foreground transition-colors active:scale-95 [@media(hover:hover)]:hover:border-muted-foreground/60 [@media(hover:hover)]:hover:text-foreground"
                        >
                          <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={3} />
                        </button>
                        </div>
                      </div>
                      )}

                      <QuickAddTip
                        show={tagEditTipOpen}
                        text="Hold a tag to rename or recolour it"
                        onDismiss={() => {
                          setTagEditTipDismissed(true);
                          setTagEditTipOpen(false);
                        }}
                      />

                      <SuggestionTabs
                        open={open}
                        variant="chips"
                        query={text}
                        selectedId={pickedBacklogTaskId}
                        onUnpick={() => {
                          if (pickedBacklogText !== null && text === pickedBacklogText) {
                            setText('');
                          }
                          const removed = new Set(autoAddedTagIds);
                          setTags((prev) => prev.filter((id) => !removed.has(id)));
                          setAutoAddedTagIds([]);
                          if (pickSetTimeRef.current) {
                            setStartTime('');
                            setEndTime('');
                            setNotifyEnabled(false);
                            pickSetTimeRef.current = false;
                          }
                          setPickedBacklogTaskId(null);
                          setPickedBacklogText(null);
                          setPickedNotes(undefined);
                          setPickedChecklist(undefined);
                          inputRef.current?.focus();
                        }}
                        onContentChange={setHasSuggestionContent}
                        onPick={applySavedPick}
                      />

                      {isDesktop && (
                        <div className="-mx-5 -mb-3.5 mt-3.5 flex items-center justify-between gap-3 border-t border-border/60 bg-muted/30 px-5 py-3">
                          <button
                            type="button"
                            onClick={() => openBulkAdd([])}
                            className="-ml-2 inline-flex h-10 items-center gap-2 rounded-xl px-2.5 text-[14px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <ListPlus className="h-4 w-4" strokeWidth={2.5} />
                            Add multiple
                          </button>
                          <span className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onOpenChange(false)}
                              className="h-10 rounded-xl px-3.5 text-[14px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                              Cancel
                            </button>
                            <button
                              ref={sendRef}
                              type="button"
                              onClick={() => {
                                if (hasTaskText && !isSubmitting) void handleSubmit();
                              }}
                              disabled={!hasTaskText || isSubmitting}
                              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#447d3f] px-4 text-[14px] font-black text-white shadow-[0_3px_0_0_#2c511a] transition-[transform,box-shadow,background-color,opacity] hover:-translate-y-px hover:bg-[#3d7038] hover:shadow-[0_4px_0_0_#2c511a] active:translate-y-[3px] active:shadow-none disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none"
                            >
                              <Plus className="h-4 w-4" strokeWidth={3} />
                              {submitLabel}
                            </button>
                          </span>
                        </div>
                      )}
                    </div>
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
                  selectedDateKey={effectiveDateKey}
                  selectSingleDay={selectSingleDay}
                  selectCalendarDate={selectCalendarDate}
                  showCalendarPicker={showCalendarPicker}
                  setShowCalendarPicker={setShowCalendarPicker}
                  calendarMonthLabel={calendar.calendarMonthLabel}
                  calendarCells={calendar.calendarCells}
                  shiftCalendarMonth={calendar.shiftCalendarMonth}
                  notifyEnabled={effectiveNotify}
                  setNotifyEnabled={(v) => {
                    takeOverNlTime();
                    setNotifyEnabled(v);
                  }}
                  startTime={effectiveStartTime}
                  setStartTime={(v) => {
                    takeOverNlTime();
                    setStartTime(v);
                  }}
                  reminder={reminder}
                  setReminder={setReminder}
                  showReminderPicker={showReminderPicker}
                  setShowReminderPicker={setShowReminderPicker}
                  repeatsOn={repeatsOn}
                  repeatShortLabel={repeatShortLabel}
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
              <SavedTasksSheet
                open={savedOpen}
                onClose={() => setSavedOpen(false)}
                onPick={applySavedPick}
              />
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
            onPointerDown={closeSectionPicker}
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
                  setSectionPickedManually(true);
                  closeSectionPicker();
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
                    setSectionPickedManually(true);
                    closeSectionPicker();
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

      {bulkInitialTasks ? (
        <BulkAddReviewSheet
          open
          initialTasks={bulkInitialTasks}
          initialOmittedCount={bulkOmittedCount}
          summary={[
            selectedDateLabel,
            ...(repeatsOn ? [repeatShortLabel] : []),
            ...(tags.length > 0
              ? [`${tags.length} ${tags.length === 1 ? 'tag' : 'tags'}`]
              : []),
            ...(effectiveNotify ? ['Reminder'] : []),
            ...(pickedSection ? [pickedSection.name] : []),
          ]}
          submitting={isSubmitting}
          onOpenChange={(nextOpen) => {
            if (!nextOpen && !isSubmitting) setBulkInitialTasks(null);
          }}
          onConfirm={submitBulkTasks}
        />
      ) : null}
    </>
  );
}
