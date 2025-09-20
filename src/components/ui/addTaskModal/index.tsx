'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

import Frog from '@/components/ui/frog';
import { byId } from '@/lib/skins/catalog';
import type { WardrobeSlot } from '@/components/ui/frog';

import StepWhen from './StepWhen';
import PrimaryButton from './PrimaryButton';
import type { RepeatMode, WhenMode } from './types';
import { todayIdx } from './utils';

type FrogIndices = Partial<Record<WardrobeSlot, number>>;

type Props = Readonly<{
  initialText?: string;
  onClose: () => void;
  onSave: (data: {
    text: string;
    days: number[];
    repeat: RepeatMode;
  }) => Promise<void> | void;
  allowMultipleDays?: boolean;
  defaultRepeat?: RepeatMode; // used as a fixed repeat mode now
  initialDays?: number[];
  frogIndices?: FrogIndices;
}>;

export default function AddTaskModal({
  initialText = '',
  onClose,
  onSave,
  allowMultipleDays = true,
  defaultRepeat = 'this-week',
  initialDays = [],
  frogIndices,
}: Props) {
  // Start with no preselected day when initialDays is empty
  const initWhen: WhenMode = useMemo(() => {
    if (!initialDays || initialDays.length === 0) return 'pick-days';
    if (initialDays.includes(7)) return 'week-no-day';
    if (initialDays.some((d) => d >= 0 && d <= 6)) {
      return initialDays.length === 1 && initialDays[0] === todayIdx()
        ? 'today'
        : 'pick-days';
    }
    return 'pick-days';
  }, [initialDays]);

  const [text, setText] = useState(initialText);
  const [when, setWhen] = useState<WhenMode>(initWhen);

  const [pickedDays, setPickedDays] = useState<number[]>(
    initWhen === 'pick-days'
      ? (initialDays ?? []).filter((d) => d >= 0 && d <= 6)
      : initWhen === 'today'
      ? [todayIdx()]
      : [] // week-no-day or others → []
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const canSave =
    text.trim().length > 0 &&
    (when === 'today' || when === 'week-no-day' || pickedDays.length > 0);

  const saveNow = async () => {
    if (!canSave) return;
    const days =
      when === 'today'
        ? [todayIdx()]
        : when === 'week-no-day'
        ? [7]
        : pickedDays.slice().sort((a, b) => a - b);

    await onSave({ text: text.trim(), days, repeat: defaultRepeat });
    onClose();
  };

  const toggleDay = (d: number) => {
    setPickedDays((prev) => {
      if (!allowMultipleDays) return prev.includes(d) ? [] : [d];
      return prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d];
    });
  };

  const { data: wardrobeData } = useSWR(
    frogIndices ? null : '/api/skins/inventory',
    (u: string) => fetch(u).then((r) => r.json()),
    { revalidateOnFocus: false }
  );

  const resolvedFrogIndices: FrogIndices | undefined = useMemo(() => {
    if (frogIndices) return frogIndices;
    const eq = wardrobeData?.wardrobe?.equipped;
    if (!eq) return undefined;
    return {
      skin: eq.skin ? byId[eq.skin]?.riveIndex ?? 0 : 0,
      hat: eq.hat ? byId[eq.hat]?.riveIndex ?? 0 : 0,
      scarf: eq.scarf ? byId[eq.scarf]?.riveIndex ?? 0 : 0,
      hand_item: eq.hand_item ? byId[eq.hand_item]?.riveIndex ?? 0 : 0,
    };
  }, [frogIndices, wardrobeData]);

  const spring = { type: 'spring', stiffness: 360, damping: 28 } as const;

  // Keep keyboard closed on open
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const id = setTimeout(() => {
      closeBtnRef.current?.focus({ preventScroll: true });
      const ae = document.activeElement as HTMLElement | null;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) {
        (ae as HTMLInputElement | HTMLTextAreaElement).blur();
      }
    }, 30);
    return () => clearTimeout(id);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      dir="ltr"
      aria-modal="true"
    >
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-gradient-to-br from-emerald-900 via-emerald-800 to-lime-900/90"
      />

      <motion.div
        role="dialog"
        aria-label="Add new task"
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={spring}
        className="relative w-full max-w-[640px] max-h-[88vh] sm:max-h-[78vh] rounded-[24px] bg-white/90 backdrop-blur-xl shadow-2xl ring-1 ring-emerald-700/20 dark:bg-emerald-950/70 dark:ring-emerald-300/10 overflow-hidden flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          ref={closeBtnRef}
          aria-label="Close"
          onClick={onClose}
          className="absolute z-20 p-2 rounded-full shadow-md top-3 right-3 ring-1 ring-emerald-600/20 bg-emerald-50 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100 dark:ring-emerald-500/30"
        >
          <X className="w-4 h-4" />
        </button>

        {/* TITLE BAR */}
        <header className="px-4 pt-4 pb-3 sm:px-6">
          <h1 className="text-2xl font-extrabold tracking-tight text-center text-transparent bg-gradient-to-r from-emerald-700 via-lime-600 to-emerald-700 bg-clip-text dark:from-emerald-300 dark:via-lime-300 dark:to-emerald-200">
            Add a task
          </h1>
          <div className="w-full h-px mt-3 bg-gradient-to-r from-transparent via-emerald-600/20 to-transparent" />
        </header>

        {/* BODY */}
        <div className="flex-1 px-4 pb-4 overflow-y-auto sm:px-6 overscroll-contain no-scrollbar">
          {/* Frog sits just above the input */}
          <div className="relative pt-[110px]">
            <div className="absolute left-1/2 -translate-x-1/2 -top-[40px]">
              <Frog width={220} height={157} indices={resolvedFrogIndices} />
            </div>

            {/* Input */}
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What are we tackling?"
              className="w-full px-4 py-3 mb-4 text-base border shadow-inner rounded-2xl border-emerald-600/20 bg-white/80 focus:outline-none focus:ring-4 focus:ring-lime-300/50 dark:bg-emerald-900/40 dark:border-emerald-400/20 dark:text-emerald-50"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void saveNow();
                }
              }}
              inputMode="text"
            />
          </div>

          {/* When selector (single step) */}
          <StepWhen
            when={when}
            setWhen={(w) => {
              setWhen(w);
              // Optional: save immediately when choosing "week-no-day"
              // if (w === 'week-no-day' && text.trim()) void saveNow();
            }}
            pickedDays={pickedDays}
            toggleDay={toggleDay}
          />
        </div>

        {/* FOOTER */}
        <div className="px-4 py-3 border-t sm:px-6 border-emerald-900/10 dark:border-emerald-200/10 bg-white/70 dark:bg-emerald-950/70 backdrop-blur">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-base rounded-2xl bg-emerald-900/5 text-emerald-900 hover:bg-emerald-900/10 ring-1 ring-emerald-700/10 dark:bg-emerald-900/30 dark:text-emerald-100 dark:ring-emerald-500/20"
            >
              Cancel
            </button>

            <PrimaryButton
              label={when === 'week-no-day' ? 'Add to this week' : 'Add task'}
              disabled={!canSave}
              onClick={saveNow}
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
