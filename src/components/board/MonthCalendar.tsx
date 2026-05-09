'use client';

import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  ymd,
  parseYmd,
  todayYmd,
  longMonthYear,
  cmpYmd,
} from './helpers';

/**
 * Expandable month calendar overlay. Tap a date to jump to it.
 * Disables dates before `minDate` (account creation).
 */
export default function MonthCalendar({
  open,
  selectedDate,
  minDate,
  hasTasksOn,
  onSelect,
  onClose,
}: {
  open: boolean;
  selectedDate: string;
  minDate?: string | null;
  /** Optional set of YYYY-MM-DD that have tasks (to render a dot under the number). */
  hasTasksOn?: Set<string>;
  onSelect: (dateKey: string) => void;
  onClose: () => void;
}) {
  const today = todayYmd();
  const [viewMonth, setViewMonth] = useState(() => selectedDate.slice(0, 7));

  // re-anchor view month to selected when reopening
  React.useEffect(() => {
    if (open) setViewMonth(selectedDate.slice(0, 7));
  }, [open, selectedDate]);

  const monthLabel = useMemo(
    () => longMonthYear(`${viewMonth}-01`),
    [viewMonth],
  );

  const cells = useMemo(() => {
    const first = parseYmd(`${viewMonth}-01`);
    // Monday-first like screenshot: M T W T F S S
    const dow = (first.getDay() + 6) % 7; // 0..6 Mon..Sun
    const daysInMonth = new Date(
      first.getFullYear(),
      first.getMonth() + 1,
      0,
    ).getDate();
    const items: { key: string; label: number; placeholder?: boolean }[] = [];
    for (let i = 0; i < dow; i++)
      items.push({ key: `pad-${i}`, label: 0, placeholder: true });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(first.getFullYear(), first.getMonth(), d);
      items.push({ key: ymd(date), label: d });
    }
    return items;
  }, [viewMonth]);

  const minMonth = minDate ? minDate.slice(0, 7) : null;
  const canGoPrev = !minMonth || viewMonth > minMonth;

  const goPrev = () => {
    if (!canGoPrev) return;
    const [y, m] = viewMonth.split('-').map(Number);
    const next = new Date(y, m - 2, 1);
    setViewMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  };
  const goNext = () => {
    const [y, m] = viewMonth.split('-').map(Number);
    const next = new Date(y, m, 1);
    setViewMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
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
            onClick={onClose}
            className="fixed inset-0 z-[54] bg-black/0 pointer-events-auto"
          />
        <motion.div
          key="cal"
          initial={{ y: -8 }}
          animate={{ y: 0 }}
          exit={{ y: -8, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="absolute left-0 right-0 top-0 z-[55] px-3 pt-14 pointer-events-none"
        >
          <div className="mx-auto w-[min(96vw,560px)] rounded-3xl bg-primary text-primary-foreground p-4 md:p-5 shadow-2xl pointer-events-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={goPrev}
                disabled={!canGoPrev}
                className={`p-1.5 rounded-full ${canGoPrev ? 'hover:bg-white/10' : 'opacity-30 cursor-not-allowed'}`}
                aria-label="Previous month"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="text-sm font-semibold">{monthLabel}</div>
              <button
                onClick={goNext}
                className="p-1.5 rounded-full hover:bg-white/10"
                aria-label="Next month"
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1.5 text-[11px] uppercase opacity-80 mb-2">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => (
                <div key={i} className="text-center font-bold">{l}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {cells.map((c) => {
                if (c.placeholder)
                  return <div key={c.key} className="h-11 md:h-12" />;
                const isToday = c.key === today;
                const isSelected = c.key === selectedDate;
                const disabled = !!minDate && cmpYmd(c.key, minDate) < 0;
                const hasDot = hasTasksOn?.has(c.key);
                return (
                  <button
                    key={c.key}
                    disabled={disabled}
                    onClick={() => {
                      onSelect(c.key);
                      onClose();
                    }}
                    className={`relative h-11 md:h-12 rounded-xl text-base md:text-lg font-bold flex items-center justify-center transition-colors
                      ${disabled ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/15'}
                      ${isSelected ? 'bg-white text-primary shadow-md' : ''}
                      ${isToday && !isSelected ? 'ring-2 ring-white/90 text-white' : ''}
                    `}
                  >
                    {c.label}
                    {isToday && !isSelected && (
                      <span className="absolute -top-1 -right-1 px-1 py-0.5 text-[8px] font-black rounded-full bg-white text-primary leading-none">
                        TODAY
                      </span>
                    )}
                    {hasDot && (
                      <span className="absolute bottom-1 w-1 h-1 rounded-full bg-white/80" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
