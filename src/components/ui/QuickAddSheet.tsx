'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  todayDisplayIndex,
  apiDayFromDisplay,
  labelForDisplayDay,
  type ApiDay,
  type DisplayDay,
} from '@/components/board/helpers';
import {
  CalendarDays,
  CalendarCheck,
  RotateCcw,
  Info,
  Plus,
  X,
} from 'lucide-react';
import Fly from '@/components/ui/fly';
import { AnimatePresence, motion } from 'framer-motion';

type RepeatChoice = 'this-week' | 'weekly';
type WhenChoice = 'pick' | 'later';

type Props = Readonly<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (data: {
    text: string;
    /** API days: 0..6 (Sun..Sat), -1 for "Later" */
    days: ApiDay[];
    repeat: RepeatChoice;
  }) => Promise<void> | void;
  initialText?: string;
  defaultRepeat?: RepeatChoice;
}>;

export default function QuickAddSheet({
  open,
  onOpenChange,
  onSubmit,
  initialText = '',
  defaultRepeat = 'this-week',
}: Props) {
  const [text, setText] = useState(initialText);
  const [repeat, setRepeat] = useState<RepeatChoice>(defaultRepeat);
  const [when, setWhen] = useState<WhenChoice>('pick');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    
    // Track visual viewport to handle mobile keyboard
    if (typeof window !== 'undefined' && window.visualViewport) {
      const handleVisualViewportChange = () => {
        const vv = window.visualViewport;
        if (!vv) return;
        // Calculate how much the keyboard is covering
        const offset = window.innerHeight - vv.height;
        setKeyboardHeight(Math.max(0, offset));
      };

      window.visualViewport.addEventListener('resize', handleVisualViewportChange);
      window.visualViewport.addEventListener('scroll', handleVisualViewportChange);
      return () => {
        window.visualViewport?.removeEventListener('resize', handleVisualViewportChange);
        window.visualViewport?.removeEventListener('scroll', handleVisualViewportChange);
      };
    }
  }, []);

  // Handle manual focus with a slight delay
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 150); // Wait for animation to settle
      return () => clearTimeout(timer);
    }
  }, [open]);

  // DISPLAY indices only (0..6). 7 ("Later") is handled via `when === 'later'`.
  const [pickedDays, setPickedDays] = useState<Array<Exclude<DisplayDay, 7>>>(
    []
  );

  // Reset every time the sheet opens
  useEffect(() => {
    if (open) {
      setText(initialText);
      setWhen('pick');
      setPickedDays([todayDisplayIndex()]); // default to today (DISPLAY index)
      setRepeat(defaultRepeat);
      setIsSubmitting(false);
    }
  }, [open, initialText, defaultRepeat]);

  // Safety: ensure at least one day is selected in "pick" mode
  useEffect(() => {
    if (open && when === 'pick' && pickedDays.length === 0) {
      setPickedDays([todayDisplayIndex()]);
    }
  }, [open, when, pickedDays.length]);

  // Labels that respect WEEK_START config via helpers
  const dayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, d) => {
        const full = labelForDisplayDay(d as Exclude<DisplayDay, 7>); // e.g., "Sunday"
        return { short: full.slice(0, 2), title: full };
      }),
    []
  );

  const toggleDay = (d: Exclude<DisplayDay, 7>) =>
    setPickedDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );

  const handleSubmit = async () => {
    if (isSubmitting) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    // Convert DISPLAY -> API days
    const apiDays: ApiDay[] =
      when === 'later'
        ? [-1]
        : pickedDays.slice().sort().map(apiDayFromDisplay);

    if (apiDays.length === 0) return;

    setIsSubmitting(true);
    try {
      // Guard: if "Later", force non-repeating
      const finalRepeat: RepeatChoice = when === 'later' ? 'this-week' : repeat;

      await onSubmit({ text: trimmed, days: apiDays, repeat: finalRepeat });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!mounted) return null;

  const repeatsOn = repeat === 'weekly';
  const isLater = when === 'later';

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
            className="fixed inset-0 z-[999] bg-slate-950/20 backdrop-blur-[2px]"
          />
          
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed left-0 right-0 z-[1000] px-4 py-6 sm:px-6 sm:py-5 pointer-events-none transition-[bottom] duration-200"
            style={{ bottom: keyboardHeight * 0.8 }}
          >
            <div className="pointer-events-auto mx-auto w-full max-w-[820px] pb-[env(safe-area-inset-bottom)]">
              <div className="rounded-[28px] bg-white/95 dark:bg-slate-950/90 backdrop-blur-2xl ring-1 ring-slate-200/80 dark:ring-slate-800/70 shadow-[0_24px_48px_rgba(15,23,42,0.25)] p-4">
                {/* Input */}
                <div dir="ltr" className="w-full">
                  <input
                    ref={inputRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="New task?"
                    disabled={isSubmitting}
                    autoFocus
                    spellCheck={false}
                    autoComplete="off"
                    style={{ direction: 'ltr', textAlign: 'left' }}
                    className="w-full h-12 px-4 mb-3 rounded-[16px] bg-white/95 dark:bg-slate-900/70 text-slate-900 dark:text-white ring-1 ring-slate-200/80 dark:ring-slate-700/70 shadow-[0_1px_0_rgba(255,255,255,.7)_inset] focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:opacity-50 text-lg font-medium text-left"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit();
                      }
                      if (e.key === 'Escape') onOpenChange(false);
                    }}
                    inputMode="text"
                  />
                </div>

                {/* Segmented control */}
                <div className="mb-3">
                  <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl bg-slate-100/70 dark:bg-slate-900/80 ring-1 ring-slate-200/80 dark:ring-slate-800/70">
                    <button
                      type="button"
                      aria-pressed={when === 'pick'}
                      data-active={when === 'pick'}
                      onClick={() => {
                        setWhen('pick');
                        setPickedDays((prev) =>
                          prev.length ? prev : [todayDisplayIndex()]
                        );
                      }}
                      className={[
                        'h-10 rounded-xl text-[14px] font-bold inline-flex items-center justify-center gap-2 transition',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300',
                        'data-[active=true]:bg-white dark:data-[active=true]:bg-slate-800 data-[active=true]:shadow-sm data-[active=true]:ring-1 data-[active=true]:ring-slate-200/80 dark:data-[active=true]:ring-slate-700',
                        'data-[active=false]:text-slate-600 dark:data-[active=false]:text-slate-400',
                      ].join(' ')}
                    >
                      <CalendarDays className="w-4 h-4" />
                      Pick day
                    </button>

                    <button
                      type="button"
                      aria-pressed={when === 'later'}
                      data-active={when === 'later'}
                      onClick={() => {
                        setWhen('later');
                        setPickedDays([]);
                        setRepeat('this-week');
                      }}
                      className={[
                        'h-10 rounded-xl text-[14px] font-bold inline-flex items-center justify-center gap-2 transition',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300',
                        'data-[active=true]:bg-white dark:data-[active=true]:bg-slate-800 data-[active=true]:shadow-sm data-[active=true]:ring-1 data-[active=true]:ring-slate-200/80 dark:data-[active=true]:ring-slate-700',
                        'data-[active=false]:text-slate-600 dark:data-[active=false]:text-slate-400',
                      ].join(' ')}
                    >
                      <CalendarCheck className="w-4 h-4" />
                      Saved Tasks
                    </button>
                  </div>
                </div>

                {/* PICK MODE */}
                {when === 'pick' && (
                  <div className="flex flex-col gap-2 mt-1 sm:flex-row sm:items-center">
                    <div className="flex-1 min-w-0 px-1 -mx-1 overflow-x-auto overflow-y-visible no-scrollbar">
                      <div className="inline-flex w-max gap-2 pr-2 py-1.5">
                        {dayLabels.map(({ short, title }, idx) => {
                          const d = idx as Exclude<DisplayDay, 7>;
                          const on = pickedDays.includes(d);
                          return (
                            <button
                              key={d}
                              type="button"
                              onClick={() => toggleDay(d)}
                              aria-pressed={on}
                              data-active={on}
                              title={title}
                              className={[
                                'inline-flex items-center justify-center select-none',
                                'h-10 w-10 rounded-full text-sm font-bold',
                                'border border-slate-300/80 dark:border-slate-700/70',
                                'bg-white dark:bg-slate-900/70 text-slate-800 dark:text-white',
                                'data-[active=true]:bg-purple-50 dark:data-[active=true]:bg-purple-900/40 data-[active=true]:border-purple-300 data-[active=true]:text-purple-900 dark:data-[active=true]:text-purple-200',
                                'transition-all duration-200',
                              ].join(' ')}
                            >
                              {short}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="sm:shrink-0 sm:pl-1">
                      <div
                        className={[
                          'inline-flex items-center gap-2 px-3 py-1.5 border rounded-full bg-white/90 dark:bg-slate-900/70 border-slate-300/70 dark:border-slate-800/70',
                          isLater ? 'opacity-50 pointer-events-none' : '',
                        ].join(' ')}
                        aria-disabled={isLater}
                        title={
                          isLater ? 'Repeat is not available for Later' : undefined
                        }
                      >
                        <RotateCcw className="w-4 h-4 text-purple-700/80 dark:text-purple-200" />
                        <span className="text-[13px] font-bold text-slate-700 dark:text-slate-200">
                          Repeat weekly
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={repeatsOn}
                          onClick={() =>
                            setRepeat((r) =>
                              r === 'weekly' ? 'this-week' : 'weekly'
                            )
                          }
                          data-on={repeatsOn}
                          className={[
                            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                            'bg-slate-300/70 data-[on=true]:bg-purple-500',
                          ].join(' ')}
                          title={repeatsOn ? 'Weekly' : 'One-time'}
                          disabled={isLater}
                        >
                          <span
                            className={[
                              'inline-block h-4 w-4 transform rounded-full bg-white shadow ring-1 ring-black/10 transition-transform',
                              repeatsOn ? 'translate-x-4' : 'translate-x-1',
                            ].join(' ')}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {when === 'later' && (
                  <div className="mt-2 flex items-start gap-2 rounded-xl bg-purple-50/75 dark:bg-purple-900/30 ring-1 ring-purple-300/40 p-3 text-[13px] text-purple-900/90 dark:text-purple-100/90">
                    <Info className="w-4 h-4 mt-0.5 shrink-0 text-purple-600 dark:text-purple-400" />
                    <span>
                      Not sure when? We&apos;ll keep it in your <span className="font-bold">Saved Tasks</span> for later.
                    </span>
                  </div>
                )}

                {/* Actions */}
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!text.trim() || isSubmitting}
                    className={[
                      'relative h-12 rounded-full text-[15px] font-bold overflow-hidden transition-all',
                      'bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500 text-white',
                      'shadow-[0_10px_25px_-4px_rgba(99,102,241,0.4)] ring-1 ring-white/20',
                      'hover:brightness-105 hover:shadow-[0_12px_30px_-4px_rgba(99,102,241,0.5)] active:scale-[0.985]',
                      'disabled:opacity-50 disabled:grayscale disabled:pointer-events-none',
                    ].join(' ')}
                  >
                    <span className="absolute inset-0 bg-gradient-to-b from-white/25 to-transparent pointer-events-none" />
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      {isSubmitting ? (
                        'Adding...'
                      ) : (
                        <>
                          <Plus className="w-4 h-4 stroke-[3]" />
                          <span>Add Task</span>
                          <Fly size={24} x={-1} y={-3} />
                        </>
                      )}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className={[
                      'h-12 rounded-full text-[15px] font-semibold transition-all',
                      'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
                      'hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-[0.985]',
                      'ring-1 ring-slate-200 dark:ring-slate-700',
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
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

