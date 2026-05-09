'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import useSWR, { mutate } from 'swr';
import {
  todayDisplayIndex,
  apiDayFromDisplay,
  labelForDisplayDay,
  type ApiDay,
  type DisplayDay,
} from '@/components/board/helpers';
import {
  CalendarCheck,
  RotateCcw,
  Plus,
  X,
  Tag,
  Palette,
  Trash2,
  Loader2,
  Pencil,
  Check,
  Lock,
  Clock,
  Bell,
  ChevronDown,
} from 'lucide-react';
import Fly from '@/components/ui/fly';
import { AnimatePresence, motion } from 'framer-motion';
import { PremiumLimitDialog } from './PremiumLimitDialog';

type RepeatChoice = 'this-week' | 'weekly';

type Props = Readonly<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (data: {
    text: string;
    /** API days: 0..6 (Sun..Sat), -1 for "Later" */
    days: ApiDay[];
    /** Exact calendar dates, YYYY-MM-DD. Used for one-off scheduled tasks. */
    dates?: string[];
    repeat: RepeatChoice;
    tags: string[];
    startTime?: string;
    endTime?: string;
    reminder?: string;
  }) => Promise<void> | void;
  initialText?: string;
  defaultRepeat?: RepeatChoice;
  defaultPickedDay?: number;
  defaultDateKey?: string;
  daysOrder?: ReadonlyArray<Exclude<ApiDay, -1>>;
  hideDayPicker?: boolean;
  hideRepeatPicker?: boolean;
}>;

type SavedTag = {
  id: string;
  name: string;
  color: string;
  disabled?: boolean;
};

const pad = (n: number) => String(n).padStart(2, '0');

function ymdLocal(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseYmdLocal(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

const TIME_SLIDER_ITEM_H = 44;
const TIME_SLIDER_PAD = 66;
const HOURS_12 = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTES_60 = Array.from({ length: 60 }, (_, index) => index);
const PERIODS = ['AM', 'PM'] as const;

function TimeSliderColumn<T extends string | number>({
  items,
  value,
  onChange,
  formatLabel = String,
}: {
  items: T[];
  value: T;
  onChange: (value: T) => void;
  formatLabel?: (value: T) => string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const isSyncingRef = React.useRef(false);
  const isDraggingRef = React.useRef(false);
  const startYRef = React.useRef(0);
  const startScrollTopRef = React.useRef(0);

  useEffect(() => {
    const index = items.indexOf(value);
    const el = ref.current;
    if (!el || index < 0) return;

    isSyncingRef.current = true;
    el.scrollTo({ top: index * TIME_SLIDER_ITEM_H, behavior: 'smooth' });
    const timeout = window.setTimeout(() => {
      isSyncingRef.current = false;
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [items, value]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!isDraggingRef.current || !ref.current) return;
      ref.current.scrollTop =
        startScrollTopRef.current - (event.clientY - startYRef.current);
    };

    const handlePointerUp = () => {
      if (!isDraggingRef.current || !ref.current) return;
      isDraggingRef.current = false;
      const index = Math.round(ref.current.scrollTop / TIME_SLIDER_ITEM_H);
      ref.current.scrollTo({
        top: Math.max(0, Math.min(index, items.length - 1)) * TIME_SLIDER_ITEM_H,
        behavior: 'smooth',
      });
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [items.length]);

  const updateFromScroll = () => {
    const el = ref.current;
    if (!el || isSyncingRef.current || isDraggingRef.current) return;
    const index = Math.max(
      0,
      Math.min(Math.round(el.scrollTop / TIME_SLIDER_ITEM_H), items.length - 1),
    );
    const next = items[index];
    if (next !== value) onChange(next);
  };

  return (
    <div
      ref={ref}
      onScroll={updateFromScroll}
      onPointerDown={(event) => {
        isDraggingRef.current = true;
        startYRef.current = event.clientY;
        startScrollTopRef.current = ref.current?.scrollTop ?? 0;
      }}
      className="relative z-10 h-[176px] overflow-y-auto overscroll-contain no-scrollbar snap-y snap-mandatory select-none"
      style={{
        paddingTop: TIME_SLIDER_PAD,
        paddingBottom: TIME_SLIDER_PAD,
      }}
    >
      {items.map((item) => {
        const selected = item === value;
        return (
          <button
            key={String(item)}
            type="button"
            onClick={() => onChange(item)}
            className={`flex h-11 w-full snap-center items-center justify-center text-[24px] font-medium transition-all ${
              selected
                ? 'text-foreground scale-105'
                : 'text-muted-foreground/55 scale-95'
            }`}
          >
            {formatLabel(item)}
          </button>
        );
      })}
    </div>
  );
}

const TAG_COLORS = [
  {
    name: 'Red',
    value: '#ef4444',
    bg: 'bg-red-500',
    text: 'text-red-950 dark:text-red-100',
  },
  {
    name: 'Orange',
    value: '#f97316',
    bg: 'bg-orange-500',
    text: 'text-orange-950 dark:text-orange-100',
  },
  {
    name: 'Amber',
    value: '#f59e0b',
    bg: 'bg-amber-500',
    text: 'text-amber-950 dark:text-amber-100',
  },
  {
    name: 'Yellow',
    value: '#eab308',
    bg: 'bg-yellow-400',
    text: 'text-yellow-950 dark:text-yellow-100',
  },
  {
    name: 'Lime',
    value: '#84cc16',
    bg: 'bg-lime-500',
    text: 'text-lime-950 dark:text-lime-100',
  },
  {
    name: 'Green',
    value: '#22c55e',
    bg: 'bg-green-500',
    text: 'text-green-950 dark:text-green-100',
  },
  {
    name: 'Emerald',
    value: '#10b981',
    bg: 'bg-emerald-500',
    text: 'text-emerald-950 dark:text-emerald-100',
  },
  {
    name: 'Teal',
    value: '#14b8a6',
    bg: 'bg-teal-500',
    text: 'text-teal-950 dark:text-teal-100',
  },
  {
    name: 'Cyan',
    value: '#06b6d4',
    bg: 'bg-cyan-500',
    text: 'text-cyan-950 dark:text-cyan-100',
  },
  {
    name: 'Blue',
    value: '#3b82f6',
    bg: 'bg-blue-500',
    text: 'text-blue-950 dark:text-blue-100',
  },
  {
    name: 'Indigo',
    value: '#6366f1',
    bg: 'bg-indigo-500',
    text: 'text-indigo-950 dark:text-indigo-100',
  },
  {
    name: 'Violet',
    value: '#8b5cf6',
    bg: 'bg-violet-500',
    text: 'text-violet-950 dark:text-violet-100',
  },
  {
    name: 'Purple',
    value: '#a855f7',
    bg: 'bg-purple-500',
    text: 'text-purple-950 dark:text-purple-100',
  },
  {
    name: 'Fuchsia',
    value: '#d946ef',
    bg: 'bg-fuchsia-500',
    text: 'text-fuchsia-950 dark:text-fuchsia-100',
  },
  {
    name: 'Pink',
    value: '#ec4899',
    bg: 'bg-pink-500',
    text: 'text-pink-950 dark:text-pink-100',
  },
  {
    name: 'Rose',
    value: '#f43f5e',
    bg: 'bg-rose-500',
    text: 'text-rose-950 dark:text-rose-100',
  },
];

const TAG_MAX_LENGTH = 20;
const MAX_SAVED_TAGS = 50;

const fetcher = (url: string) => fetch(url).then((r) => r.json());

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
}: Props) {
  const [text, setText] = useState(initialText);
  const [repeat, setRepeat] = useState<RepeatChoice>(defaultRepeat);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Tag Management State
  const { data: tagsData } = useSWR(open ? '/api/tags' : null, fetcher);
  const savedTags: SavedTag[] = tagsData?.tags || [];
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[5].value); // Default blue
  const [manageTagsMode, setManageTagsMode] = useState(false);
  const [isTagPanelOpen, setIsTagPanelOpen] = useState(false);

  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [showPremiumLimit, setShowPremiumLimit] = useState(false);

  // Scheduling State
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reminder, setReminder] = useState('at_time');
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [activePicker, setActivePicker] = useState<
    'tags' | 'date' | 'repeat' | null
  >(null);
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [selectedDateKey, setSelectedDateKey] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  const tagInputRef = React.useRef<HTMLInputElement>(null);
  const ignoreClickRef = React.useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!activePicker) {
      setShowCalendarPicker(false);
      setShowReminderPicker(false);
    }
  }, [activePicker]);

  // Indices
  const [pickedDays, setPickedDays] = useState<Array<DisplayDay>>([]);

  useEffect(() => {
    if (open) {
      setText(initialText);
      // Use defaultPickedDay if provided, otherwise fallback to today
      const initialDay =
        defaultDateKey
          ? (daysOrder
              ? daysOrder.indexOf(
                  parseYmdLocal(defaultDateKey).getDay() as Exclude<ApiDay, -1>,
                )
              : parseYmdLocal(defaultDateKey).getDay())
        : defaultPickedDay !== undefined
          ? (defaultPickedDay as DisplayDay)
          : todayDisplayIndex(daysOrder);
      setPickedDays([(initialDay >= 0 ? initialDay : todayDisplayIndex(daysOrder)) as DisplayDay]);
      setRepeat(defaultRepeat);
      setTags([]);
      setTagInput('');
      setIsSubmitting(false);
      setShowColorPicker(false);
      setManageTagsMode(false);
      setIsCreatingTag(false);
      
      // Reset Schedule
      setStartTime('');
      setEndTime('');
      setReminder('at_time');
      setNotifyEnabled(false);
      setShowReminderPicker(false);
      setActivePicker(null);
      setShowCalendarPicker(false);
      const initialDate = defaultDateKey ?? ymdLocal(new Date());
      setSelectedDateKey(initialDate);
      const initialCalendarDate = parseYmdLocal(initialDate);
      setCalendarMonth(
        new Date(initialCalendarDate.getFullYear(), initialCalendarDate.getMonth(), 1),
      );
    }
    // Always reset tag panel state when open changes to prevent animation flash
    setIsTagPanelOpen(false);
  }, [
    open,
    initialText,
    defaultRepeat,
    defaultPickedDay,
    defaultDateKey,
    daysOrder,
  ]);

  const filteredTags = useMemo(() => {
    if (!tagInput) return savedTags;
    const lower = tagInput.toLowerCase();
    return savedTags.filter((st) => st.name.toLowerCase().includes(lower));
  }, [savedTags, tagInput]);

  // ... rest of useEffects

  const isLater = pickedDays.includes(7);

  const handleAddTag = () => {
    if (isCreatingTag) return;
    const trimmed = tagInput.trim();
    if (!trimmed) return;

    // Check if tag exists
    const existing = savedTags.find(
      (t) => t.name.toLowerCase() === trimmed.toLowerCase(),
    );

    if (existing) {
      // Select existing if not already selected
      if (!tags.includes(existing.id)) {
        setTags((prev) => [...prev, existing.id]);
      }
      setTagInput('');
      setShowColorPicker(false);
    } else {
      // New tag
      const isPremium = tagsData?.isPremium;
      const limit = isPremium ? 50 : 3;

      if (savedTags.length >= limit) {
        setShowPremiumLimit(true);
        return;
      }

      if (showColorPicker) {
        // If picker is ALREADY open, save it
        createAndSaveTag();
      } else {
        // Open picker
        setShowColorPicker(true);
      }
    }
  };

  const createAndSaveTag = async () => {
    if (isCreatingTag) return;
    const trimmed = tagInput.trim();
    if (!trimmed) return;

    const isPremium = tagsData?.isPremium;
    const limit = isPremium ? 50 : 3;

    if (savedTags.length >= limit) {
      setShowPremiumLimit(true);
      return;
    }

    setIsCreatingTag(true);
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, color: newTagColor }),
      });
      const data = await res.json();

      mutate('/api/tags'); // Refresh list

      if (data.tag && !tags.includes(data.tag.id)) {
        setTags((prev) => [...prev, data.tag.id]);
      }
      setShowColorPicker(false);
      setTagInput('');
    } catch (e) {
      console.error('Failed to save tag', e);
    } finally {
      setIsCreatingTag(false);
    }
  };

  const deleteSavedTag = async (
    id: string,
    name: string,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();

    // Optimistic Update
    const updatedTags = savedTags.filter((t) => t.id !== id);

    // 1. Update SWR cache immediately
    mutate('/api/tags', { tags: updatedTags }, false);

    // 2. Remove from currently selected tags immediately
    setTags((prev) => prev.filter((tId) => tId !== id));

    // 3. Notify app
    window.dispatchEvent(new Event('tags-updated'));

    try {
      await fetch(`/api/tags?id=${id}`, { method: 'DELETE' });
      mutate('/api/tags');
    } catch (error) {
      console.error('Failed to delete tag', error);
      mutate('/api/tags'); // Revert
    }
  };

  const removeTag = (tagId: string) => {
    setTags((prev) => prev.filter((t) => t !== tagId));
  };

  const getTagDetails = (tagId: string) => {
    return savedTags.find((t) => t.id === tagId);
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    const apiDays: ApiDay[] = pickedDays
      .slice()
      .sort()
      .map((d) => apiDayFromDisplay(d, daysOrder));
    const exactDates =
      repeat === 'this-week' && !isLater && selectedDateKey
        ? [selectedDateKey]
        : undefined;

    if (apiDays.length === 0) return;

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

  const repeatsOn = repeat === 'weekly';
  const todayKey = ymdLocal(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowKey = ymdLocal(tomorrowDate);
  const selectedDay = pickedDays[0] ?? todayDisplayIndex(daysOrder);
  const todayIndex = todayDisplayIndex(daysOrder);
  const tomorrowIndex = ((todayIndex + 1) % 7) as DisplayDay;
  const repeatDay = selectedDay === 7 ? todayIndex : selectedDay;
  const selectedDateLabel =
    isLater
      ? 'Later'
      : selectedDateKey === todayKey
        ? 'Today'
        : selectedDateKey === tomorrowKey
          ? 'Tomorrow'
          : selectedDateKey
            ? parseYmdLocal(selectedDateKey).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })
            : labelForDisplayDay(selectedDay as Exclude<DisplayDay, 7>, daysOrder);
  const repeatLabel = repeatsOn
    ? `Every week on ${labelForDisplayDay(repeatDay as Exclude<DisplayDay, 7>, daysOrder)}`
    : 'Does not repeat';
  const repeatOptions: Array<{
    label: string;
    value?: RepeatChoice;
    disabled?: boolean;
  }> = [
    { label: 'Every day', disabled: true },
    { label: 'Every weekday', disabled: true },
    {
      label: `Every week on ${labelForDisplayDay(repeatDay as Exclude<DisplayDay, 7>, daysOrder)}`,
      value: 'weekly',
    },
    { label: 'Every month', disabled: true },
    { label: 'Custom...', disabled: true },
  ];

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
    setPickedDays([displayDay >= 0 ? displayDay : todayDisplayIndex(daysOrder)]);
    setShowCalendarPicker(false);
    setActivePicker(null);
  };

  const calendarMonthLabel = calendarMonth.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
  const calendarCells = (() => {
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const startOffset = first.getDay();
    const daysInMonth = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth() + 1,
      0,
    ).getDate();
    return Array.from({ length: 42 }, (_, index) => {
      const dayNumber = index - startOffset + 1;
      if (dayNumber < 1 || dayNumber > daysInMonth) return null;
      return new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), dayNumber);
    });
  })();

  const shiftCalendarMonth = (delta: number) => {
    setCalendarMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + delta, 1),
    );
  };
  
  const formatDisplay = (t: string) => {
    if (!t) return '--:--';
    const [hh, mm] = t.split(':').map(Number);
    const suffix = hh >= 12 ? 'PM' : 'AM';
    const h12 = hh % 12 || 12;
    return `${h12}:${pad(mm)} ${suffix}`;
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
    setShowReminderPicker(false);
  };

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
                className="fixed inset-0 z-[999] bg-background/80 backdrop-blur-[2px]"
              />

              <motion.div
                initial={{ y: '100%', opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: '100%', opacity: 0 }}
                transition={{
                  type: 'tween',
                  ease: [0.32, 0.72, 0, 1],
                  duration: 0.4,
                }}
                className="fixed left-0 right-0 z-[1000] px-4 py-6 sm:px-6 sm:py-5 pointer-events-none bottom-0 will-change-transform"
              >
                <div className="pointer-events-auto mx-auto w-full max-w-[820px] pb-[env(safe-area-inset-bottom)]">
                  <div className="rounded-[28px] bg-popover/95 backdrop-blur-2xl ring-1 ring-border/80 shadow-[0_24px_48px_rgba(15,23,42,0.25)] p-4">
                    {/* Input Area */}
                    <div dir="ltr" className="w-full">
                      <input
                        ref={inputRef}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="New task?"
                        disabled={isSubmitting}
                        spellCheck={false}
                        autoComplete="off"
                        maxLength={45}
                        className="w-full h-12 px-4 mb-1 rounded-[16px] bg-muted/50 text-foreground ring-1 ring-border/80 shadow-[0_1px_0_rgba(255,255,255,.1)_inset] focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 text-lg font-medium text-left"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSubmit();
                          }
                          if (e.key === 'Escape') onOpenChange(false);
                        }}
                      />

                      {/* Selected Tags Display (Horizontal Scroll) */}
                      {(tags.length > 0 || startTime) && (
                        <div className="relative mb-3 mt-2 px-1 overflow-visible">
                          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 pt-1 px-1 -mx-1 mask-fade-right">
                            {startTime && (
                               <button
                                  type="button"
                                  onClick={() => {
                                      setStartTime('');
                                      setEndTime('');
                                      setNotifyEnabled(false);
                                  }}
                                  className="group shrink-0 relative inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider border border-primary/20 bg-primary/10 text-primary transition-all shadow-sm hover:opacity-75 active:scale-95"
                                >
                                  <Clock className="w-3 h-3" />
                                  <span>{formatDisplay(startTime)}{endTime && ` - ${formatDisplay(endTime)}`}</span>
                                  <X className="w-3 h-3 opacity-50 group-hover:opacity-100 transition-opacity" />
                                </button>
                            )}
                            {tags.map((tagId) => {
                              const tag = getTagDetails(tagId);
                              const color = tag?.color;
                              const name = tag?.name || 'Unknown';

                              return (
                                <button
                                  key={tagId}
                                  type="button"
                                  onClick={() => removeTag(tagId)}
                                  className="group shrink-0 relative inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider border transition-all shadow-sm hover:opacity-75 active:scale-95"
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
                                  <X className="w-3 h-3 opacity-50 group-hover:opacity-100 transition-opacity" />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="mt-2 mb-3 space-y-1">
                        <button
                          type="button"
                          onClick={() => {
                            setActivePicker('tags');
                            setIsTagPanelOpen(false);
                            setTimeout(() => tagInputRef.current?.focus(), 100);
                          }}
                          className="group flex h-9 w-full items-center gap-2.5 rounded-xl px-3 text-left transition-colors hover:bg-muted/45"
                        >
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                            <Tag className="h-3.5 w-3.5 stroke-[3]" />
                          </span>
                          <span className="min-w-0 flex-1 text-[13px] font-extrabold text-muted-foreground">
                            {tags.length > 0 ? `${tags.length} tag${tags.length === 1 ? '' : 's'} selected` : 'Add tags'}
                          </span>
                        </button>

                        {!hideDayPicker && (
                          <button
                            type="button"
                            onClick={() => {
                              setActivePicker('date');
                              setIsTagPanelOpen(false);
                            }}
                            className="group flex h-9 w-full items-center gap-2.5 rounded-xl px-3 text-left transition-colors hover:bg-muted/45"
                          >
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                              <CalendarCheck className="h-3.5 w-3.5 stroke-[3]" />
                            </span>
                            <span className="min-w-0 flex-1 text-[13px] font-extrabold text-muted-foreground">
                              {selectedDateLabel}
                            </span>
                            {notifyEnabled && (
                              <Bell className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                            )}
                          </button>
                        )}

                        {!hideRepeatPicker && (
                          <button
                            type="button"
                            onClick={() => {
                              setActivePicker('repeat');
                              setIsTagPanelOpen(false);
                            }}
                            className="group flex h-9 w-full items-center gap-2.5 rounded-xl px-3 text-left transition-colors hover:bg-muted/45"
                          >
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                              <RotateCcw className="h-3.5 w-3.5 stroke-[3]" />
                            </span>
                            <span className="min-w-0 flex-1 text-[13px] font-extrabold text-muted-foreground">
                              {repeatLabel}
                            </span>
                          </button>
                        )}

                        <div className="flex justify-end px-3">
                          <span
                            className={`text-[11px] font-bold ${
                              text.length >= 40
                                ? 'text-rose-500'
                                : 'text-slate-400'
                            }`}
                          >
                            {text.length}/45
                          </span>
                        </div>
                      </div>

                      {/* Tag Management Panel */}
                      <AnimatePresence initial={false}>
                        {isTagPanelOpen && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{
                              opacity: 1,
                              transition: { duration: 0 },
                            }}
                            exit={{
                              opacity: 0,
                              transition: { duration: 0 },
                            }}
                            style={{ transformOrigin: 'top' }}
                            className="overflow-hidden mb-3"
                          >
                            <div className="p-3 mb-3 bg-muted/30 rounded-xl border border-border/50">
                              {/* Tag Input */}
                              <div className="relative flex items-center mb-3">
                                <Tag className="absolute left-2.5 w-4 h-4 text-slate-400" />
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
                                  placeholder="Name your new tag..."
                                  className="w-full h-10 pl-9 pr-10 rounded-xl bg-card text-base md:text-sm font-medium text-foreground ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground"
                                />
                                <button
                                  type="button"
                                  onClick={handleAddTag}
                                  disabled={!tagInput}
                                  className="absolute right-1.5 p-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
                                >
                                  {showColorPicker ? (
                                    <Palette className="w-4 h-4" />
                                  ) : (
                                    <Plus className="w-4 h-4" />
                                  )}
                                </button>
                              </div>

                              {/* Color Picker (Conditionally shown) */}
                              <AnimatePresence>
                                {showColorPicker && (
                                  <motion.div
                                    initial={{ opacity: 0, maxHeight: 0 }}
                                    animate={{
                                      opacity: 1,
                                      maxHeight: 500,
                                      transition: {
                                        duration: 0.25,
                                        ease: [0.25, 0.46, 0.45, 0.94],
                                      },
                                    }}
                                    exit={{
                                      opacity: 0,
                                      maxHeight: 0,
                                      transition: { duration: 0 },
                                    }}
                                    className="overflow-hidden mb-3"
                                  >
                                    <div className="p-2 bg-card rounded-lg shadow-sm border border-border">
                                      <div className="flex items-center justify-between mb-2">
                                        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                                          Pick a color for "{tagInput}"
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setShowColorPicker(false);
                                            setTagInput('');
                                          }}
                                          className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                                          title="Cancel"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                      <div className="flex gap-2 flex-wrap">
                                        {TAG_COLORS.map((c) => (
                                          <button
                                            key={c.name}
                                            type="button"
                                            onClick={() =>
                                              setNewTagColor(c.value)
                                            }
                                            className={`w-8 h-8 rounded-full ${c.bg} ring-2 ring-offset-2 ring-offset-card transition-all ${
                                              newTagColor === c.value
                                                ? 'ring-primary scale-110'
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
                                        className="w-full mt-3 py-2 text-xs font-bold text-primary-foreground bg-primary rounded-lg shadow-sm hover:bg-primary/90 active:scale-95 transition-transform disabled:opacity-50 disabled:active:scale-100"
                                      >
                                        {isCreatingTag
                                          ? 'Saving...'
                                          : 'Save Tag'}
                                      </button>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>

                              {/* Available Tags (Wrap layout for mobile) */}
                              <AnimatePresence mode="wait">
                                {savedTags.length > 0 && !showColorPicker && (
                                  <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0 }}
                                  >
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                          Saved Tags{' '}
                                          <span
                                            className={
                                              savedTags.length >=
                                              (tagsData?.isPremium ? 50 : 3)
                                                ? 'text-red-500'
                                                : ''
                                            }
                                          >
                                            ({savedTags.length}/
                                            {tagsData?.isPremium ? 50 : 3})
                                          </span>
                                        </span>
                                        {/* Hint text only shown when NOT managing */}
                                        {!manageTagsMode && (
                                          <span className="hidden sm:inline text-[10px] text-muted-foreground/50 italic">
                                            (Long press to edit)
                                          </span>
                                        )}
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setManageTagsMode(!manageTagsMode)
                                        }
                                        className={`p-1.5 rounded-lg transition-colors ${
                                          manageTagsMode
                                            ? 'bg-primary/10 text-primary'
                                            : 'text-muted-foreground/50 hover:text-foreground hover:bg-muted'
                                        }`}
                                        title={
                                          manageTagsMode
                                            ? 'Done editing'
                                            : 'Manage tags'
                                        }
                                      >
                                        {manageTagsMode ? (
                                          <Check className="w-3.5 h-3.5" />
                                        ) : (
                                          <Pencil className="w-3.5 h-3.5" />
                                        )}
                                      </button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <AnimatePresence>
                                        {filteredTags.map((st) => {
                                          const isSelected = tags.includes(
                                            st.id,
                                          );
                                          return (
                                            <motion.button
                                              exit={{
                                                opacity: 0,
                                                scale: 0.5,
                                                transition: { duration: 0.2 },
                                              }}
                                              key={st.id}
                                              type="button"
                                              // Long Press Handlers
                                              onPointerDown={(e) => {
                                                ignoreClickRef.current = false; // Reset
                                                const timer = setTimeout(() => {
                                                  setManageTagsMode(true);
                                                  ignoreClickRef.current = true; // Mark to ignore next click
                                                  // Optional: Vibrate if device supports it
                                                  if (navigator.vibrate)
                                                    navigator.vibrate(50);
                                                }, 500); // 500ms long press
                                                (
                                                  e.target as any
                                                )._longPressTimer = timer;
                                              }}
                                              onPointerUp={(e) => {
                                                if (
                                                  (e.target as any)
                                                    ._longPressTimer
                                                )
                                                  clearTimeout(
                                                    (e.target as any)
                                                      ._longPressTimer,
                                                  );
                                              }}
                                              onPointerLeave={(e) => {
                                                if (
                                                  (e.target as any)
                                                    ._longPressTimer
                                                )
                                                  clearTimeout(
                                                    (e.target as any)
                                                      ._longPressTimer,
                                                  );
                                              }}
                                              onClick={(e) => {
                                                if (ignoreClickRef.current) {
                                                  ignoreClickRef.current = false;
                                                  return;
                                                }

                                                if (manageTagsMode) {
                                                  deleteSavedTag(
                                                    st.id,
                                                    st.name,
                                                    e,
                                                  );
                                                  return;
                                                }
                                                if (st.disabled) {
                                                  setShowPremiumLimit(true);
                                                  return;
                                                }

                                                if (isSelected)
                                                  removeTag(st.id);
                                                else
                                                  setTags((prev) => [
                                                    ...prev,
                                                    st.id,
                                                  ]);
                                              }}
                                              className={`
                                                                relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold uppercase tracking-wider transition-all
                                                                border disabled:opacity-50 disabled:cursor-not-allowed
                                                                ${manageTagsMode ? 'animate-wiggle cursor-pointer' : ''}
                                                                ${
                                                                  isSelected
                                                                    ? 'ring-2 ring-offset-1 ring-offset-background'
                                                                    : st.disabled
                                                                      ? 'opacity-60 grayscale-[0.8] cursor-pointer bg-muted/50 border-dashed hover:opacity-80 hover:bg-muted'
                                                                      : 'hover:opacity-80 opacity-70 bg-card'
                                                                }
                                                            `}
                                              style={{
                                                backgroundColor: isSelected
                                                  ? `${st.color}20`
                                                  : undefined,
                                                color: manageTagsMode
                                                  ? '#ef4444'
                                                  : st.color, // Red text when managing
                                                borderColor: manageTagsMode
                                                  ? '#ef4444'
                                                  : isSelected
                                                    ? `${st.color}40`
                                                    : st.disabled
                                                      ? 'currentColor'
                                                      : `${st.color}20`,
                                                boxShadow: isSelected
                                                  ? `0 0 0 1px ${st.color}`
                                                  : 'none',
                                                opacity:
                                                  manageTagsMode && !isSelected
                                                    ? 1
                                                    : undefined, // Keep visible during manage
                                              }}
                                            >
                                              {st.name}
                                              {st.disabled && (
                                                <Lock className="w-3 h-3 ml-1.5 opacity-70" />
                                              )}
                                              {manageTagsMode && (
                                                <div className="absolute -top-2 -left-2 bg-red-500 text-white rounded-full p-0.5 shadow-sm z-10">
                                                  <X className="w-3 h-3" />
                                                </div>
                                              )}
                                            </motion.button>
                                          );
                                        })}
                                      </AnimatePresence>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                    </div>

                    {/* Actions */}
                    <div
                      className="grid grid-cols-2 gap-3 mt-4"
                      style={{ transform: 'translateZ(0)' }}
                    >
                      <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!text.trim() || isSubmitting}
                        className={[
                          'relative h-12 rounded-full text-[15px] font-bold overflow-hidden transition-all',
                          'bg-primary text-primary-foreground',
                          'shadow-sm ring-1 ring-white/20',
                          'hover:brightness-105 active:scale-[0.985]',
                          'disabled:opacity-50 disabled:grayscale disabled:pointer-events-none',
                        ].join(' ')}
                      >
                        <span className="absolute inset-0 pointer-events-none bg-gradient-to-b from-white/25 to-transparent" />
                        <span className="relative z-10 flex items-center justify-center gap-2">
                          {isSubmitting ? (
                            'Adding...'
                          ) : (
                            <>
                              <Plus className="w-4 h-4 stroke-[3]" />
                              <span>Add Task</span>
                              <Fly size={32} x={-1} y={-3} />
                            </>
                          )}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        className={[
                          'h-12 rounded-full text-[15px] font-semibold transition-all',
                          'bg-secondary text-secondary-foreground',
                          'hover:bg-secondary/80 active:scale-[0.985]',
                          'ring-1 ring-border',
                        ].join(' ')}
                      >
                        <span className="inline-flex items-center justify-center gap-2">
                          <X className="w-4 h-4" />
                          Cancel
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>

              <AnimatePresence>
                {activePicker && (
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
                      transition={{
                        type: 'tween',
                        ease: [0.32, 0.72, 0, 1],
                        duration: 0.32,
                      }}
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

                        {activePicker === 'tags' ? (
                          <div className="space-y-3">
                            <section className="rounded-[18px] bg-card p-3 shadow-sm ring-1 ring-border/70">
                              <div className="mb-3 flex items-center gap-2.5">
                                <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-primary">
                                  <Tag className="h-3.5 w-3.5 stroke-[3]" />
                                </span>
                                <h3 className="text-[15px] font-extrabold text-muted-foreground">
                                  Add tags
                                </h3>
                              </div>

                              <div className="relative mb-2 flex items-center">
                                <Tag className="absolute left-3 h-3.5 w-3.5 text-muted-foreground" />
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
                                  placeholder="Name your new tag..."
                                  className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-11 text-sm font-bold text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"
                                />
                                <button
                                  type="button"
                                  onClick={handleAddTag}
                                  disabled={!tagInput}
                                  className="absolute right-2 grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary transition-opacity hover:bg-primary/20 disabled:opacity-30"
                                >
                                  {showColorPicker ? (
                                    <Palette className="h-3.5 w-3.5" />
                                  ) : (
                                    <Plus className="h-3.5 w-3.5" />
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
                                      Saved Tags ({savedTags.length}/
                                      {tagsData?.isPremium ? 50 : 3})
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setManageTagsMode(!manageTagsMode)
                                      }
                                      className={`grid h-7 w-7 place-items-center rounded-lg transition-colors ${
                                        manageTagsMode
                                          ? 'bg-primary/10 text-primary'
                                          : 'text-muted-foreground hover:bg-muted'
                                      }`}
                                      title={
                                        manageTagsMode
                                          ? 'Done editing'
                                          : 'Manage tags'
                                      }
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
                                      const isSelected = tags.includes(st.id);
                                      return (
                                        <button
                                          key={st.id}
                                          type="button"
                                          onClick={(e) => {
                                            if (manageTagsMode) {
                                              deleteSavedTag(st.id, st.name, e);
                                              return;
                                            }
                                            if (st.disabled) {
                                              setShowPremiumLimit(true);
                                              return;
                                            }
                                            if (isSelected) removeTag(st.id);
                                            else setTags((prev) => [...prev, st.id]);
                                          }}
                                          className={`relative m-0.5 rounded-lg border px-3 py-2 text-[11px] font-extrabold uppercase tracking-wide transition-all ${
                                            isSelected
                                              ? 'ring-2 ring-offset-1 ring-offset-background'
                                              : st.disabled
                                                ? 'cursor-pointer border-dashed opacity-60 grayscale'
                                                : 'bg-background opacity-80 hover:opacity-100'
                                          } ${manageTagsMode ? 'text-rose-500' : ''}`}
                                          style={{
                                            backgroundColor: isSelected
                                              ? `${st.color}20`
                                              : undefined,
                                            color: manageTagsMode
                                              ? '#ef4444'
                                              : st.color,
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
                            </section>
                            <button
                              type="button"
                              onClick={() => setActivePicker(null)}
                              className="h-11 w-full rounded-xl bg-primary text-[15px] font-extrabold text-primary-foreground shadow-[0_4px_0_rgba(22,101,52,0.35)] transition-transform active:translate-y-1 active:shadow-none"
                            >
                              Done
                              {tags.length > 0
                                ? ` (${tags.length} tag${tags.length === 1 ? '' : 's'})`
                                : ''}
                            </button>
                          </div>
                        ) : activePicker === 'date' ? (
                          <div className="space-y-3">
                            <section className="rounded-[18px] bg-card p-3 shadow-sm ring-1 ring-border/70">
                              <div className="mb-3 flex items-center gap-2.5">
                                <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-primary">
                                  <CalendarCheck className="h-3.5 w-3.5 stroke-[3]" />
                                </span>
                                <h3 className="text-[15px] font-extrabold text-muted-foreground">
                                  Date
                                </h3>
                              </div>
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
                                      className={`h-10 rounded-xl border text-[12px] font-extrabold transition-all ${
                                        isSelected
                                          ? 'border-primary bg-primary/5 text-primary ring-2 ring-primary/20'
                                          : 'border-border bg-background text-muted-foreground hover:bg-muted/50'
                                      }`}
                                    >
                                      {label}
                                    </button>
                                  );
                                })}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowCalendarPicker(true);
                                  }}
                                  className={`h-10 rounded-xl border text-[12px] font-extrabold transition-all ${
                                    selectedDateKey !== todayKey &&
                                    selectedDateKey !== tomorrowKey &&
                                    !isLater
                                      ? 'border-primary bg-primary/5 text-primary ring-2 ring-primary/20'
                                      : 'border-border bg-background text-muted-foreground hover:bg-muted/50'
                                  }`}
                                >
                                  On a date...
                                </button>
                              </div>
                            </section>

                            <section className="rounded-[18px] bg-card p-3 shadow-sm ring-1 ring-border/70">
                              <div className="flex items-center justify-between gap-2.5">
                                <div className="flex min-w-0 items-center gap-2.5">
                                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-500">
                                    <Bell className="h-3.5 w-3.5 fill-current stroke-[3]" />
                                  </span>
                                  <span className="text-[15px] font-extrabold text-muted-foreground">
                                    Remind me
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (notifyEnabled) {
                                      setNotifyEnabled(false);
                                      setStartTime('');
                                      setReminder('at_time');
                                      setShowReminderPicker(false);
                                      return;
                                    }
                                    setNotifyEnabled(true);
                                    if (!startTime) setStartTime('09:00');
                                    setShowReminderPicker(true);
                                  }}
                                  aria-pressed={notifyEnabled}
                                  className={`relative h-7 w-12 rounded-full transition-colors ${
                                    notifyEnabled ? 'bg-primary' : 'bg-muted'
                                  }`}
                                >
                                  <span
                                    className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
                                      notifyEnabled ? 'translate-x-5' : 'translate-x-0.5'
                                    }`}
                                  />
                                </button>
                              </div>

                              {notifyEnabled && (
                                <div className="mt-3">
                                  <button
                                    type="button"
                                    onClick={() => setShowReminderPicker(true)}
                                    className="flex h-9 w-full items-center justify-between rounded-xl border border-border bg-background px-3 text-[12px] font-bold text-muted-foreground"
                                  >
                                    <span>{formatDisplay(startTime || '09:00')}</span>
                                    <Clock className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )}
                            </section>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <button
                              type="button"
                              onClick={() => {
                                setRepeat('this-week');
                                setActivePicker(null);
                              }}
                              className="flex h-12 w-full items-center justify-between rounded-[18px] bg-card px-4 text-left text-[14px] font-extrabold text-muted-foreground shadow-sm ring-1 ring-border/70"
                            >
                              Does not repeat
                              {!repeatsOn && (
                                <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground">
                                  <Check className="h-4 w-4 stroke-[3]" />
                                </span>
                              )}
                            </button>

                            <div className="flex h-12 items-center justify-between rounded-[18px] bg-card px-4 text-[14px] font-extrabold text-muted-foreground shadow-sm ring-1 ring-border/70">
                              <span>Ends</span>
                              <span className="inline-flex items-center gap-2 font-bold text-muted-foreground/80">
                                Never
                                <ChevronDown className="h-4 w-4" />
                              </span>
                            </div>

                            <div className="overflow-hidden rounded-[18px] bg-card shadow-sm ring-1 ring-border/70">
                              {repeatOptions.map((option, idx) => (
                                <button
                                  key={option.label}
                                  type="button"
                                  disabled={option.disabled}
                                  onClick={() => {
                                    if (option.value) {
                                      setRepeat(option.value);
                                      setActivePicker(null);
                                    }
                                  }}
                                  className={`flex h-12 w-full items-center justify-between px-4 text-left text-[14px] font-extrabold transition-colors ${
                                    idx > 0 ? 'border-t border-border/70' : ''
                                  } ${
                                    option.disabled
                                      ? 'cursor-not-allowed text-muted-foreground/45'
                                      : 'text-muted-foreground hover:bg-muted/50'
                                  }`}
                                >
                                  {option.label}
                                  {option.value === repeat && (
                                    <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground">
                                      <Check className="h-4 w-4 stroke-[3]" />
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>

                    <AnimatePresence>
                      {activePicker === 'date' && showCalendarPicker && (
                        <>
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowCalendarPicker(false)}
                            className="fixed inset-0 z-[1003] bg-black/10"
                          />
                          <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{
                              type: 'tween',
                              ease: [0.32, 0.72, 0, 1],
                              duration: 0.28,
                            }}
                            className="fixed inset-x-0 bottom-0 z-[1004] rounded-t-[24px] bg-background px-5 pb-[calc(env(safe-area-inset-bottom)+18px)] pt-4 shadow-[0_-18px_42px_rgba(15,23,42,0.18)] ring-1 ring-border/70"
                          >
                            <div className="mx-auto w-full max-w-[560px]">
                              <div className="mb-3 flex items-center justify-between">
                                <h3 className="text-[16px] font-semibold text-foreground">
                                  {calendarMonthLabel}
                                </h3>
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <button
                                    type="button"
                                    onClick={() => shiftCalendarMonth(-1)}
                                    className="grid h-7 w-7 place-items-center rounded-full transition-colors hover:bg-muted hover:text-foreground"
                                    aria-label="Previous month"
                                  >
                                    <ChevronDown className="h-4 w-4 rotate-90" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => shiftCalendarMonth(1)}
                                    className="grid h-7 w-7 place-items-center rounded-full transition-colors hover:bg-muted hover:text-foreground"
                                    aria-label="Next month"
                                  >
                                    <ChevronDown className="h-4 w-4 -rotate-90" />
                                  </button>
                                </div>
                              </div>

                              <div className="mb-2 grid grid-cols-7 text-center text-[12px] font-semibold text-foreground">
                                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                                  <div key={`${day}-${index}`} className="py-1">
                                    {day}
                                  </div>
                                ))}
                              </div>

                              <div className="grid grid-cols-7 gap-y-2 text-center">
                                {calendarCells.map((date, index) => {
                                  if (!date) return <div key={`empty-${index}`} className="h-9" />;

                                  const dateKey = ymdLocal(date);
                                  const selected = dateKey === selectedDateKey;
                                  const muted = dateKey < todayKey;

                                  return (
                                    <button
                                      key={dateKey}
                                      type="button"
                                      onClick={() => selectCalendarDate(date)}
                                      className={`mx-auto grid h-9 w-9 place-items-center rounded-full text-[13px] font-semibold transition-all ${
                                        selected
                                          ? 'border border-muted-foreground text-primary shadow-sm'
                                          : muted
                                            ? 'text-muted-foreground/55 hover:bg-muted/40'
                                            : 'text-foreground hover:bg-muted/60'
                                      }`}
                                    >
                                      {date.getDate()}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>

                    <AnimatePresence>
                      {activePicker === 'date' && showReminderPicker && (
                        <>
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowReminderPicker(false)}
                            className="fixed inset-0 z-[1005] bg-black/10"
                          />
                          <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{
                              type: 'tween',
                              ease: [0.32, 0.72, 0, 1],
                              duration: 0.28,
                            }}
                            className="fixed inset-x-0 bottom-0 z-[1006] rounded-t-[24px] bg-background px-5 pb-[calc(env(safe-area-inset-bottom)+18px)] pt-4 shadow-[0_-18px_42px_rgba(15,23,42,0.18)] ring-1 ring-border/70"
                          >
                            <div className="mx-auto w-full max-w-[560px]">
                              <div className="relative mb-4 flex h-7 items-center justify-center">
                                <button
                                  type="button"
                                  onClick={() => setShowReminderPicker(false)}
                                  className="absolute left-0 grid h-7 w-7 place-items-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground"
                                  aria-label="Close time picker"
                                >
                                  <X className="h-4 w-4 stroke-[3]" />
                                </button>
                                <h3 className="text-[15px] font-extrabold text-muted-foreground">
                                  Time
                                </h3>
                              </div>

                              <div className="relative mx-auto mb-4 grid max-w-[300px] grid-cols-3 items-center overflow-hidden text-center">
                                <div className="pointer-events-none absolute inset-x-0 top-1/2 z-0 h-11 -translate-y-1/2 rounded-xl bg-muted" />
                                <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-10 bg-gradient-to-b from-background to-transparent" />
                                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-10 bg-gradient-to-t from-background to-transparent" />

                                <TimeSliderColumn
                                  items={HOURS_12}
                                  value={reminderHour12}
                                  onChange={(hour) =>
                                    setReminderTimeParts(
                                      hour,
                                      reminderMinute,
                                      reminderPeriod,
                                    )
                                  }
                                />
                                <TimeSliderColumn
                                  items={MINUTES_60}
                                  value={reminderMinute}
                                  onChange={(minute) =>
                                    setReminderTimeParts(
                                      reminderHour12,
                                      minute,
                                      reminderPeriod,
                                    )
                                  }
                                  formatLabel={pad}
                                />
                                <TimeSliderColumn
                                  items={[...PERIODS]}
                                  value={reminderPeriod}
                                  onChange={(period) =>
                                    setReminderTimeParts(
                                      reminderHour12,
                                      reminderMinute,
                                      period,
                                    )
                                  }
                                />
                              </div>

                              <div className="mb-4 grid grid-cols-3 gap-3">
                                {[
                                  { label: 'Morning', time: '09:00' },
                                  { label: 'Afternoon', time: '13:00' },
                                  { label: 'Evening', time: '20:00' },
                                ].map((preset) => (
                                  <button
                                    key={preset.label}
                                    type="button"
                                    onClick={() => setReminderPreset(preset.time)}
                                    className={`rounded-xl px-2 py-2 text-center transition-colors ${
                                      reminderTime === preset.time
                                        ? 'bg-primary/10 text-primary'
                                        : 'bg-muted text-foreground hover:bg-muted/80'
                                    }`}
                                  >
                                    <div className="text-[13px] font-extrabold">
                                      {preset.label}
                                    </div>
                                    <div className="text-[12px] font-medium">
                                      {formatDisplay(preset.time).replace(' ', '').toLowerCase()}
                                    </div>
                                  </button>
                                ))}
                              </div>

                              <button
                                type="button"
                                onClick={saveReminderTime}
                                className="h-11 w-full rounded-xl bg-primary text-[15px] font-extrabold text-primary-foreground shadow-[0_4px_0_rgba(22,101,52,0.35)] transition-transform active:translate-y-1 active:shadow-none"
                              >
                                Save
                              </button>
                            </div>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </>
                )}
              </AnimatePresence>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}

      {/* Premium Limit Dialog */}
      <PremiumLimitDialog
        open={showPremiumLimit}
        onClose={() => setShowPremiumLimit(false)}
      />
    </>
  );
}
