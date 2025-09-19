'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

import Frog from '@/components/ui/frog';
import { byId } from '@/lib/skins/catalog';
import type { WardrobeSlot } from '@/components/ui/frog';

import StepPill from './StepPill';
import StepWhen from './StepWhen';
import StepRepeat from './StepRepeat';
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
  defaultRepeat?: RepeatMode;
  /** pass [todayIndex] to pre-select today; pass [7] for “no day” (weekly backlog) */
  initialDays?: number[];
  /** Optional: if omitted, we fetch /api/skins/inventory to mirror the user’s outfit */
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
  // derive initial "when"
  const initWhen: WhenMode = useMemo(() => {
    if (initialDays.includes(7)) return 'week-no-day';
    if (initialDays.some((d) => d >= 0 && d <= 6)) {
      return initialDays.length === 1 && initialDays[0] === todayIdx()
        ? 'today'
        : 'pick-days';
    }
    return 'today';
  }, [initialDays]);

  // state
  const [text, setText] = useState(initialText);
  const [step, setStep] = useState<1 | 2>(1);
  const [when, setWhen] = useState<WhenMode>(initWhen);
  const [repeat, setRepeat] = useState<RepeatMode>(defaultRepeat);
  const [pickedDays, setPickedDays] = useState<number[]>(
    initWhen === 'pick-days'
      ? initialDays.filter((d) => d >= 0 && d <= 6)
      : [todayIdx()]
  );

  // Close on Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // helpers
  const canContinueStep1 =
    when === 'today' || when === 'week-no-day' || pickedDays.length > 0;

  const canSaveStep2 =
    text.trim().length > 0 &&
    (when === 'today' || pickedDays.some((d) => d >= 0 && d <= 6));

  const toggleDay = (d: number) => {
    setPickedDays((prev) => {
      if (!allowMultipleDays) return prev.includes(d) ? [] : [d];
      return prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d];
    });
  };

  const saveImmediateWeek = async () => {
    if (!text.trim()) return;
    await onSave({ text: text.trim(), days: [7], repeat: 'this-week' });
    onClose();
  };

  const saveStep2 = async () => {
    if (!canSaveStep2) return;
    const days =
      when === 'today'
        ? [todayIdx()]
        : pickedDays.slice().sort((a, b) => a - b);
    await onSave({ text: text.trim(), days, repeat });
    onClose();
  };

  // Resolve CTA without nested ternary (lint-friendly)
  const cta = (() => {
    if (step === 1) {
      if (when === 'week-no-day') {
        return {
          label: 'Add to this week',
          disabled: !text.trim(),
          onClick: saveImmediateWeek,
        };
      }
      return {
        label: 'Continue',
        disabled: !canContinueStep1,
        onClick: () => setStep(2),
      };
    }
    return {
      label: 'Add task',
      disabled: !canSaveStep2,
      onClick: saveStep2,
    };
  })();

  /** ─────────────────────────────────────────────────────────
   * Outfit indices for frog
   * - If frogIndices prop is provided, use it.
   * - Else fetch from /api/skins/inventory and map to rive indices via byId.
   * ─────────────────────────────────────────────────────────*/
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

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      dir="ltr"
      aria-modal="true"
    >
      {/* Pond backdrop */}
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-gradient-to-br from-emerald-900 via-emerald-800 to-lime-900/90"
      />

      {/* Modal card — flex column with pinned footer */}
      <motion.div
        role="dialog"
        aria-label="Add new task"
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={spring}
        className="relative w-full max-w-[640px] max-h-[90vh] sm:max-h-[88vh] rounded-[24px] bg-white/90 backdrop-blur-xl shadow-2xl ring-1 ring-emerald-700/20 dark:bg-emerald-950/70 dark:ring-emerald-300/10 overflow-hidden flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          aria-label="Close"
          onClick={onClose}
          className="absolute z-20 p-2 rounded-full shadow-md top-3 right-3 ring-1 ring-emerald-600/20 bg-emerald-50 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100 dark:ring-emerald-500/30"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header with frog */}
        <div className="relative px-4 pb-2 text-center sm:px-6 sm:pb-3 bg-gradient-to-b from-emerald-200/50 to-transparent dark:from-emerald-800/30">
          <div className="flex justify-center">
            <div
              className="relative"
              style={{
                transform: 'translateY(-6px)' /* lift to avoid finger crop */,
              }}
            >
              <Frog width={220} height={157} indices={resolvedFrogIndices} />
            </div>
          </div>
          <h3 className="mt-0.5 text-2xl sm:text-[28px] font-extrabold tracking-tight bg-gradient-to-r from-emerald-700 via-lime-600 to-emerald-700 bg-clip-text text-transparent dark:from-emerald-300 dark:via-lime-300 dark:to-emerald-200">
            New task <span aria-hidden>🐸</span>
          </h3>
          <p className="mt-1 text-xs sm:text-sm text-emerald-700/70 dark:text-emerald-200/70">
            Flies are tasks. The frog is hungry.
          </p>
        </div>

        {/* BODY — single scroll area */}
        <div className="flex-1 px-4 pb-4 overflow-y-auto sm:px-6 overscroll-contain">
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What are we tackling?"
            className="w-full px-4 py-3 mb-4 text-base border shadow-inner rounded-2xl border-emerald-600/20 bg-white/80 focus:outline-none focus:ring-4 focus:ring-lime-300/50 dark:bg-emerald-900/40 dark:border-emerald-400/20 dark:text-emerald-50"
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              if (step === 1) {
                if (when === 'week-no-day') void saveImmediateWeek();
                else if (canContinueStep1) setStep(2);
              } else {
                void saveStep2();
              }
            }}
          />

          <AnimatePresence mode="wait" initial={false}>
            {step === 1 ? (
              <motion.div
                key="step1"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              >
                <StepWhen
                  when={when}
                  setWhen={setWhen}
                  pickedDays={pickedDays}
                  toggleDay={toggleDay}
                />
              </motion.div>
            ) : (
              <motion.div
                key="step2"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              >
                <StepRepeat
                  when={when}
                  repeat={repeat}
                  setRepeat={setRepeat}
                  pickedDays={pickedDays}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* FOOTER — pinned */}
        <div className="px-4 py-3 border-t sm:px-6 border-emerald-900/10 dark:border-emerald-200/10 bg-white/70 dark:bg-emerald-950/70 backdrop-blur">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-base rounded-2xl bg-emerald-900/5 text-emerald-900 hover:bg-emerald-900/10 ring-1 ring-emerald-700/10 dark:bg-emerald-900/30 dark:text-emerald-100 dark:ring-emerald-500/20"
            >
              Cancel
            </button>

            <PrimaryButton
              label={cta.label}
              disabled={cta.disabled}
              onClick={cta.onClick}
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
