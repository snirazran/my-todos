'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  type PanInfo,
} from 'framer-motion';
import { ChevronLeft, ChevronRight, CalendarCheck, X } from 'lucide-react';
import { isPlannerTourLocked } from '@/lib/tour/plannerTour';
import { useUIStore } from '@/lib/uiStore';
import { ymd, parseYmd, todayYmd, cmpYmd } from './helpers';

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const GRID_CELLS = 42;

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number);
  const next = new Date(y, m - 1 + delta, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
}

function densityDots(count: number) {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  return 3;
}

export default function MonthCalendar({
  open,
  selectedDate,
  minDate,
  taskCounts,
  visibleDates,
  heading,
  todayLabel = 'Jump back to today',
  showClose = true,
  belowHeader = false,
  footer,
  onSelect,
  onClose,
}: {
  open: boolean;
  selectedDate: string;
  minDate?: string | null;
  taskCounts?: Map<string, number>;
  visibleDates?: string[];
  heading?: string;
  todayLabel?: string;
  showClose?: boolean;
  belowHeader?: boolean;
  footer?: React.ReactNode;
  onSelect: (dateKey: string) => void;
  onClose: () => void;
}) {
  const today = todayYmd();
  const todayMonth = today.slice(0, 7);
  const weekStartsOn = useUIStore((s) => s.weekStartsOn);
  const reduceMotion = useReducedMotion();
  const [viewMonth, setViewMonth] = useState(() => selectedDate.slice(0, 7));
  const [direction, setDirection] = useState(0);
  const [tourReserve, setTourReserve] = useState('0px');

  useEffect(() => {
    if (open) setTourReserve(isPlannerTourLocked() ? '288px' : '0px');
  }, [open]);

  useEffect(() => {
    if (open) {
      setDirection(0);
      setViewMonth(selectedDate.slice(0, 7));
    }
  }, [open, selectedDate]);

  const minMonth = minDate ? minDate.slice(0, 7) : null;
  const canGoPrev = !minMonth || viewMonth > minMonth;

  const go = useCallback(
    (delta: 1 | -1) => {
      if (delta < 0 && !canGoPrev) return;
      setDirection(delta);
      setViewMonth((m) => shiftMonth(m, delta));
    },
    [canGoPrev],
  );

  const goToMonth = (month: string) => {
    if (month === viewMonth) return;
    setDirection(month > viewMonth ? 1 : -1);
    setViewMonth(month);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        go(-1);
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        go(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, go, onClose]);

  const monthDate = parseYmd(`${viewMonth}-01`);
  const monthName = monthDate.toLocaleString('en-US', { month: 'long' });
  const yearLabel = String(monthDate.getFullYear());

  const weekdayLetters = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const dow = (weekStartsOn + i) % 7;
        return { letter: WEEKDAY_LETTERS[dow], weekend: dow === 0 || dow === 6 };
      }),
    [weekStartsOn],
  );

  const cells = useMemo(() => {
    const first = parseYmd(`${viewMonth}-01`);
    const lead = (first.getDay() - weekStartsOn + 7) % 7;
    return Array.from({ length: GRID_CELLS }, (_, i) => {
      const date = new Date(
        first.getFullYear(),
        first.getMonth(),
        1 - lead + i,
      );
      const key = ymd(date);
      return {
        key,
        label: date.getDate(),
        outside: key.slice(0, 7) !== viewMonth,
        col: i % 7,
      };
    });
  }, [viewMonth, weekStartsOn]);

  const visibleSet = useMemo(
    () => new Set((visibleDates?.length ?? 0) > 1 ? visibleDates : []),
    [visibleDates],
  );

  const onSwipe = (_: unknown, info: PanInfo) => {
    const { offset, velocity } = info;
    if (offset.x < -50 || velocity.x < -400) go(1);
    else if (offset.x > 50 || velocity.x > 400) go(-1);
  };

  const slide = reduceMotion ? 0 : 48;
  const gridVariants = {
    enter: (d: number) => ({ opacity: 0, x: d * slide }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: -d * slide }),
  };
  const titleVariants = {
    enter: (d: number) => ({ opacity: 0, y: d >= 0 ? 10 : -10 }),
    center: { opacity: 1, y: 0 },
    exit: (d: number) => ({ opacity: 0, y: d >= 0 ? -10 : 10 }),
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="cal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={onClose}
            className="fixed inset-0 z-[95] bg-slate-950/30 pointer-events-auto"
          />
          <motion.div
            key="cal"
            initial={{ y: -8, opacity: 0 }}
            animate={{
              y: 0,
              opacity: 1,
              transition: {
                y: { type: 'spring', stiffness: 420, damping: 34 },
                opacity: { duration: 0.12, ease: 'easeOut' },
              },
            }}
            exit={{
              y: -6,
              opacity: 0,
              transition: { duration: 0.14, ease: 'easeIn' },
            }}
            className={`absolute left-0 right-0 top-0 z-[96] px-3 pointer-events-none ${
              belowHeader
                ? 'pt-[calc(3.6rem+env(safe-area-inset-top))] md:pt-[136px]'
                : 'pt-14'
            }`}
          >
            <div
              data-hint="month-calendar"
              role="dialog"
              aria-label="Pick a date"
              style={{ ['--cal-reserve' as string]: tourReserve }}
              className={`mx-auto w-[min(96vw,520px)] ${
                belowHeader
                  ? 'max-h-[calc(100dvh-9.5rem-env(safe-area-inset-top)-var(--cal-reserve,0px))] md:max-h-[calc(100dvh-176px-var(--cal-reserve,0px))]'
                  : 'max-h-[calc(100dvh-9rem-var(--cal-reserve,0px))]'
              } overflow-y-auto overscroll-contain rounded-[24px] border border-border/60 bg-card p-3.5 text-foreground shadow-[0_18px_44px_-14px_rgba(15,23,42,0.4)] pointer-events-auto md:p-4`}
              onClick={(e) => e.stopPropagation()}
            >
              {(heading || showClose) && (
                <div className="mb-3 flex items-center gap-2">
                  {heading && (
                    <div className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary/10 px-3 py-2 text-center text-[13px] font-bold leading-snug text-primary">
                      <CalendarCheck size={15} className="shrink-0" />
                      <span>{heading}</span>
                    </div>
                  )}
                  {showClose && (
                    <button
                      onClick={onClose}
                      aria-label="Close"
                      className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground active:scale-95"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              )}

              <div className="mb-3 flex items-center gap-2 px-1">
                <div className="relative flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden">
                  <AnimatePresence mode="popLayout" initial={false} custom={direction}>
                    <motion.h3
                      key={viewMonth}
                      custom={direction}
                      variants={titleVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                      aria-live="polite"
                      className="flex items-baseline gap-2 whitespace-nowrap"
                    >
                      <span className="text-[22px] font-black tracking-tight">
                        {monthName}
                      </span>
                      <span className="text-[22px] font-black tracking-tight text-muted-foreground/50">
                        {yearLabel}
                      </span>
                    </motion.h3>
                  </AnimatePresence>
                </div>

                <AnimatePresence initial={false}>
                  {viewMonth !== todayMonth && (
                    <motion.button
                      key="to-this-month"
                      type="button"
                      onClick={() => goToMonth(todayMonth)}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ type: 'spring', stiffness: 480, damping: 32 }}
                      className="h-9 rounded-xl bg-card px-3 text-[13px] font-black text-primary ring-1 ring-border shadow-[0_3px_0_0_hsl(var(--border))] transition-all active:translate-y-0.5 active:shadow-none"
                    >
                      This month
                    </motion.button>
                  )}
                </AnimatePresence>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  disabled={!canGoPrev}
                  aria-label="Previous month"
                  className="grid h-9 w-9 place-items-center rounded-full bg-muted/70 text-foreground/80 transition-colors hover:bg-muted active:scale-90 disabled:opacity-30 disabled:hover:bg-muted/70 disabled:active:scale-100"
                >
                  <ChevronLeft size={18} strokeWidth={2.75} />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label="Next month"
                  className="grid h-9 w-9 place-items-center rounded-full bg-muted/70 text-foreground/80 transition-colors hover:bg-muted active:scale-90"
                >
                  <ChevronRight size={18} strokeWidth={2.75} />
                </button>
              </div>

              <div className="mb-1.5 grid grid-cols-7 text-[11px] font-bold uppercase tracking-wide">
                {weekdayLetters.map((d, i) => (
                  <div
                    key={i}
                    className={`text-center ${d.weekend ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}
                  >
                    {d.letter}
                  </div>
                ))}
              </div>

              <div className="relative overflow-hidden">
                <AnimatePresence mode="popLayout" initial={false} custom={direction}>
                  <motion.div
                    key={viewMonth}
                    custom={direction}
                    variants={gridVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ type: 'spring', stiffness: 420, damping: 38 }}
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.18}
                    dragSnapToOrigin
                    onDragEnd={onSwipe}
                    className="grid grid-cols-7 gap-y-1.5 touch-pan-y"
                  >
                    {cells.map((c, idx) => {
                      const isToday = c.key === today;
                      const isSelected = c.key === selectedDate;
                      const disabled = !!minDate && cmpYmd(c.key, minDate) < 0;
                      const isPast = cmpYmd(c.key, today) < 0;
                      const dots = densityDots(taskCounts?.get(c.key) ?? 0);
                      const inBand = visibleSet.has(c.key);
                      const prevInBand =
                        inBand && c.col > 0 && visibleSet.has(cells[idx - 1]?.key);
                      const nextInBand =
                        inBand && c.col < 6 && visibleSet.has(cells[idx + 1]?.key);
                      return (
                        <div
                          key={c.key}
                          className={[
                            'relative flex justify-center',
                            inBand ? 'bg-primary/[0.07]' : '',
                            inBand && !prevInBand ? 'rounded-l-2xl' : '',
                            inBand && !nextInBand ? 'rounded-r-2xl' : '',
                          ].join(' ')}
                        >
                          <button
                            type="button"
                            disabled={disabled}
                            aria-label={parseYmd(c.key).toLocaleDateString('en-US', {
                              weekday: 'long',
                              month: 'long',
                              day: 'numeric',
                            })}
                            aria-current={isToday ? 'date' : undefined}
                            aria-pressed={isSelected}
                            onClick={() => {
                              onSelect(c.key);
                              onClose();
                            }}
                            className={[
                              'relative flex h-11 w-full max-w-[3.25rem] flex-col items-center justify-center rounded-2xl text-[16px] font-black tabular-nums transition-[background-color,transform] duration-150 md:h-12 md:text-[17px]',
                              disabled
                                ? 'cursor-not-allowed opacity-25'
                                : 'hover:bg-muted active:scale-90',
                              isSelected
                                ? 'bg-primary text-primary-foreground hover:bg-primary'
                                : '',
                              isToday && !isSelected
                                ? 'text-primary ring-2 ring-inset ring-primary/35'
                                : '',
                              !disabled && !isSelected && c.outside ? 'opacity-30' : '',
                              !disabled && !isSelected && !c.outside && isPast
                                ? 'text-muted-foreground/70'
                                : '',
                            ].join(' ')}
                          >
                            <span className="leading-none">{c.label}</span>
                            <span className="mt-1 flex h-1 items-center gap-0.5" aria-hidden>
                              {Array.from({ length: dots }, (_, i) => (
                                <span
                                  key={i}
                                  className={`h-1 w-1 rounded-full ${
                                    isSelected
                                      ? 'bg-white/85'
                                      : isPast
                                        ? 'bg-muted-foreground/35'
                                        : 'bg-primary/55'
                                  }`}
                                />
                              ))}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </motion.div>
                </AnimatePresence>
              </div>

              {selectedDate !== today && (
                <button
                  onClick={() => {
                    onSelect(today);
                    onClose();
                  }}
                  className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#4f9149] text-[15px] font-black tracking-tight text-white shadow-[0_4px_0_0_#34631f] transition-all hover:bg-[#478442] active:translate-y-1 active:shadow-none"
                >
                  <CalendarCheck size={16} />
                  {todayLabel}
                </button>
              )}

              {footer}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
