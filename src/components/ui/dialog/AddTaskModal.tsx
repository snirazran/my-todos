// src/components/ui/dialog/AddTaskModal.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  CalendarDays,
  CalendarRange,
  CalendarClock,
  Check,
} from 'lucide-react';

// Rive components (adjust paths if needed)
import Fly from '@/components/ui/fly';
import Frog from '@/components/ui/frog';

const dayNames = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export type RepeatMode = 'weekly' | 'this-week';
type WhenMode = 'today' | 'pick-days' | 'week-no-day';

function todayIdx() {
  return new Date().getDay();
}

export default function AddTaskModal({
  initialText = '',
  onClose,
  onSave,
  allowMultipleDays = true,
  defaultRepeat = 'this-week',
  initialDays = [],
}: {
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
}) {
  /* ——— derive initial “when” ——— */
  const initWhen: WhenMode = useMemo(() => {
    if (initialDays.includes(7)) return 'week-no-day';
    if (initialDays.some((d) => d >= 0 && d <= 6)) {
      return initialDays.length === 1 && initialDays[0] === todayIdx()
        ? 'today'
        : 'pick-days';
    }
    return 'today';
  }, [initialDays]);

  /* ——— state ——— */
  const [text, setText] = useState(initialText);
  const [step, setStep] = useState<1 | 2>(1);
  const [when, setWhen] = useState<WhenMode>(initWhen);
  const [repeat, setRepeat] = useState<RepeatMode>(defaultRepeat);
  const frogBoxRef = useRef<HTMLDivElement | null>(null);
  // Selected days (used only if when === 'pick-days')
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

  /* ——— helpers ——— */
  const canContinueStep1 =
    when === 'today' || when === 'week-no-day' || pickedDays.length > 0;

  const canSaveStep2 =
    !!text.trim() &&
    (when === 'today' || pickedDays.some((d) => d >= 0 && d <= 6));

  const toggleDay = (d: number) => {
    setPickedDays((prev) => {
      if (!allowMultipleDays) return prev.includes(d) ? [] : [d];
      return prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d];
    });
  };

  const saveImmediateWeek = async () => {
    if (!text.trim()) return; // require a task name
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

  /* ——— animation preset ——— */
  const spring = { type: 'spring', stiffness: 360, damping: 28 } as const;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      dir="ltr"
    >
      {/* Pond backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-gradient-to-br from-emerald-900 via-emerald-800 to-lime-900/90"
      />

      {/* Modal card — FLEX COLUMN with pinned footer */}
      <motion.div
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

        {/* Header with frog avatar */}
        <div className="relative px-4 pt-2 pb-2 sm:px-6 sm:pt-3 sm:pb-3 bg-gradient-to-b from-emerald-200/50 to-transparent dark:from-emerald-800/30">
          <div className="flex flex-col items-center w-full">
            <div ref={frogBoxRef} className="relative z-10">
              <div
                className="relative"
                style={{ transform: 'translateY(-8px)' }}
              >
                {/* raised so fingers aren’t cropped */}
                <Frog />
              </div>
            </div>
          </div>
          <div className="text-center mt-0.5">
            <h3 className="text-2xl sm:text-[28px] font-extrabold tracking-tight bg-gradient-to-r from-emerald-700 via-lime-600 to-emerald-700 bg-clip-text text-transparent dark:from-emerald-300 dark:via-lime-300 dark:to-emerald-200">
              New task <span aria-hidden>🐸</span>
            </h3>
            <p className="mt-1 text-xs sm:text-sm text-emerald-700/70 dark:text-emerald-200/70">
              Flies are tasks. The frog is hungry.
            </p>
          </div>
        </div>

        {/* BODY — the ONLY scrollable area */}
        <div
          className="px-4 pb-4 overflow-y-auto sm:px-6 overscroll-contain"
          style={{ maxHeight: 'unset' }} // height managed by flex
        >
          {/* Task text */}
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What are we tackling?"
            className="w-full px-4 py-3 mb-4 text-base border shadow-inner rounded-2xl border-emerald-600/20 bg-white/80 focus:outline-none focus:ring-4 focus:ring-lime-300/50 dark:bg-emerald-900/40 dark:border-emerald-400/20 dark:text-emerald-50"
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              if (step === 1) {
                if (when === 'week-no-day') saveImmediateWeek();
                else if (canContinueStep1) setStep(2);
              } else {
                saveStep2();
              }
            }}
          />

          {/* Step pills */}
          <div className="mb-4 flex items-center justify-center gap-2 text-[11px] sm:text-xs">
            <StepPill active={step === 1}>When</StepPill>
            <span className="text-emerald-700/40">→</span>
            <StepPill active={step === 2}>Repeat</StepPill>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {step === 1 ? (
              <motion.div
                key="step1"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              >
                <Step1
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
                <Step2
                  when={when}
                  repeat={repeat}
                  setRepeat={setRepeat}
                  pickedDays={pickedDays}
                  toggleDay={toggleDay}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* FOOTER — pinned, always visible */}
        <div className="px-4 sm:px-6 py-3 border-t border-emerald-900/10 dark:border-emerald-200/10 bg-white/70 dark:bg-emerald-950/70 backdrop-blur supports-[padding:max(0px)]">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-base rounded-2xl bg-emerald-900/5 text-emerald-900 hover:bg-emerald-900/10 ring-1 ring-emerald-700/10 dark:bg-emerald-900/30 dark:text-emerald-100 dark:ring-emerald-500/20"
            >
              Cancel
            </button>

            {step === 1 ? (
              when === 'week-no-day' ? (
                <PrimaryButton
                  disabled={!text.trim()}
                  onClick={saveImmediateWeek}
                  label="Add to this week"
                />
              ) : (
                <PrimaryButton
                  disabled={!canContinueStep1}
                  onClick={() => setStep(2)}
                  label="Continue"
                />
              )
            ) : (
              <PrimaryButton
                disabled={!canSaveStep2}
                onClick={saveStep2}
                label="Add task"
              />
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* ========== Step 1 ========== */
function Step1({
  when,
  setWhen,
  pickedDays,
  toggleDay,
}: {
  when: WhenMode;
  setWhen: (w: WhenMode) => void;
  pickedDays: number[];
  toggleDay: (d: number) => void;
}) {
  return (
    <div>
      <div className="mb-3 text-sm font-semibold text-emerald-900 dark:text-emerald-100">
        When
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Seg
          icon={<CalendarDays className="w-4 h-4" />}
          active={when === 'today'}
          onClick={() => setWhen('today')}
        >
          Today
        </Seg>
        <Seg
          icon={<CalendarRange className="w-4 h-4" />}
          active={when === 'pick-days'}
          onClick={() => setWhen('pick-days')}
        >
          Choose days
        </Seg>
        <Seg
          icon={<CalendarClock className="w-4 h-4" />}
          active={when === 'week-no-day'}
          onClick={() => setWhen('week-no-day')}
        >
          Sometime this week
        </Seg>
      </div>

      {when === 'pick-days' && (
        <div className="mt-4 border rounded-2xl border-emerald-600/15 bg-emerald-50/60 dark:bg-emerald-900/30 dark:border-emerald-400/10">
          {dayNames.map((label, idx) => {
            const selected = pickedDays.includes(idx);
            return (
              <button
                key={idx}
                onClick={() => toggleDay(idx)}
                className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-lime-50/70 dark:hover:bg-emerald-800/40 border-b border-emerald-600/10 last:border-b-0"
              >
                <span className="text-sm text-emerald-950 dark:text-emerald-50">
                  {label}
                </span>
                <span
                  className={[
                    'inline-flex h-5 w-5 items-center justify-center rounded-full border transition',
                    selected
                      ? 'bg-lime-500 text-emerald-900 border-lime-500 shadow'
                      : 'border-emerald-400/40 text-transparent',
                  ].join(' ')}
                >
                  <Check className="h-3.5 w-3.5" />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ========== Step 2 ========== */
function Step2({
  when,
  repeat,
  setRepeat,
  pickedDays,
  toggleDay,
}: {
  when: WhenMode;
  repeat: RepeatMode;
  setRepeat: (v: RepeatMode) => void;
  pickedDays: number[];
  toggleDay: (d: number) => void;
}) {
  return (
    <div>
      {when === 'pick-days' && (
        <>
          <div className="mb-2 text-sm font-semibold text-emerald-900 dark:text-emerald-100">
            Choose days
          </div>
          <div className="mb-4 border rounded-2xl border-emerald-600/15 bg-emerald-50/60 dark:bg-emerald-900/30 dark:border-emerald-400/10">
            {dayNames.map((label, idx) => {
              const selected = pickedDays.includes(idx);
              return (
                <button
                  key={idx}
                  onClick={() => toggleDay(idx)}
                  className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-lime-50/70 dark:hover:bg-emerald-800/40 border-b border-emerald-600/10 last:border-b-0"
                >
                  <span className="text-sm text-emerald-950 dark:text-emerald-50">
                    {label}
                  </span>
                  <span
                    className={[
                      'inline-flex h-5 w-5 items-center justify-center rounded-full border transition',
                      selected
                        ? 'bg-lime-500 text-emerald-900 border-lime-500 shadow'
                        : 'border-emerald-400/40 text-transparent',
                    ].join(' ')}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="mb-2 text-sm font-semibold text-emerald-900 dark:text-emerald-100">
        Repeat
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <SegmentedOption
          active={repeat === 'this-week'}
          onClick={() => setRepeat('this-week')}
          label="This week only"
          desc="Won’t repeat"
        />
        <SegmentedOption
          active={repeat === 'weekly'}
          onClick={() => setRepeat('weekly')}
          label="Every week"
          desc="Repeats weekly"
        />
      </div>
    </div>
  );
}

/* ——— Presentational ——— */
function Seg({
  icon,
  active,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={[
        'group flex items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-sm transition shadow-sm',
        active
          ? 'border-emerald-600 bg-gradient-to-br from-emerald-500 to-lime-500 text-emerald-950'
          : 'border-emerald-600/10 bg-emerald-50/60 hover:bg-emerald-100/70 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100 dark:border-emerald-400/10 dark:hover:bg-emerald-800/50',
      ].join(' ')}
    >
      <span className="opacity-90 group-hover:opacity-100">{icon}</span>
      {children}
    </motion.button>
  );
}

function SegmentedOption({
  active,
  onClick,
  label,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  desc: string;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={[
        'relative overflow-hidden rounded-2xl border px-3 py-3 text-left transition shadow-sm',
        active
          ? 'border-emerald-600 bg-gradient-to-br from-emerald-500 to-lime-500 text-emerald-950'
          : 'border-emerald-600/10 bg-white/70 hover:bg-emerald-50/70 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100 dark:border-emerald-400/10 dark:hover:bg-emerald-800/40',
      ].join(' ')}
    >
      <div className="text-sm font-semibold">{label}</div>
      <div
        className={[
          'text-xs',
          active
            ? 'text-emerald-900/80'
            : 'text-emerald-700/70 dark:text-emerald-300/70',
        ].join(' ')}
      >
        {desc}
      </div>
      {active && <Glimmer />}
    </motion.button>
  );
}

function StepPill({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={[
        'rounded-full px-2.5 py-1',
        active
          ? 'bg-emerald-200/70 text-emerald-900 dark:bg-emerald-700/60 dark:text-emerald-50'
          : 'bg-emerald-900/5 text-emerald-800/80 dark:bg-emerald-900/30 dark:text-emerald-200/80',
      ].join(' ')}
    >
      {children}
    </span>
  );
}

/* Primary CTA with a static (non-fading) Fly icon on the right */
function PrimaryButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={!!disabled}
      onClick={onClick}
      className="relative overflow-hidden px-5 py-2.5 text-base font-semibold rounded-2xl text-emerald-950 shadow-lg disabled:opacity-50 inline-flex items-center gap-2"
      style={{
        background:
          'radial-gradient(120% 120% at 100% 0%, #bef264 0%, #34d399 40%, #059669 100%)',
      }}
    >
      <span>{label}</span>
      {/* Static fly — no opacity animation */}
      <span className="inline-flex items-center -translate-y-0.5">
        <Fly size={24} />
      </span>
    </button>
  );
}

/* ——— Decorative bits ——— */
function Glimmer() {
  return (
    <span className="pointer-events-none absolute -inset-1 opacity-30 [mask-image:radial-gradient(60%_60%_at_50%_20%,white,transparent)]">
      <span className="absolute inset-0 bg-gradient-to-r from-white/40 via-lime-200/50 to-white/20" />
    </span>
  );
}
