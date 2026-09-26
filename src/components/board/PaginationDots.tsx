'use client';

import React from 'react';
import { motion, LayoutGroup, AnimatePresence } from 'framer-motion';

import { WEEK_ORDER, englishDays, dayLetterFromYmd, parseYmd, todayYmd, cmpYmd } from './helpers';

interface Props {
  /** legacy: total dot count (ignored when `dates` is provided) */
  count?: number;
  /** legacy: index of currently active dot */
  activeIndex?: number;
  /** legacy: index of today's dot */
  todayIndex?: number;
  /** legacy: weekday API order */
  daysOrder?: ReadonlyArray<number>;
  /** legacy click-by-index */
  onSelectDay?: (index: number) => void;

  /** date-mode: 7 visible YYYY-MM-DD strings centered on the active page */
  dates?: string[];
  /** date-mode: which YYYY-MM-DD is currently active */
  activeDate?: string;
  /** date-mode: click-by-date */
  onSelectDate?: (dateKey: string) => void;
}

export default function PaginationDots({
  count,
  activeIndex,
  todayIndex,
  daysOrder,
  onSelectDay,
  dates,
  activeDate,
  onSelectDate,
}: Props) {
  // Date-mode rendering (preferred)
  if (dates && dates.length > 0) {
    const today = todayYmd();
    return (
      <LayoutGroup id="pagination-dots-dates">
        <div className="flex items-end justify-between gap-1 pb-1.5 px-1 w-full overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            {dates.map((d) => {
              const letter = dayLetterFromYmd(d);
              const dayNum = parseYmd(d).getDate();
              const isActive = d === activeDate;
              const isToday = d === today;
              const isPast = cmpYmd(d, today) < 0;

              const letterColor = isActive
                ? 'text-primary'
                : isPast
                  ? 'text-muted-foreground/40'
                  : 'text-foreground/80';

              const numberColor = isActive
                ? 'text-primary'
                : isPast
                  ? 'text-muted-foreground/40 hover:text-muted-foreground/70'
                  : 'text-foreground';

              return (
                <motion.button
                  key={d}
                  layout="position"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 520, damping: 42 }}
                  onClick={() => onSelectDate?.(d)}
                  className="relative flex flex-1 flex-col items-center px-1 outline-none group"
                  aria-label={d}
                  aria-current={isActive ? 'date' : undefined}
                >
                  <span
                    className={`text-[11px] font-bold tracking-wide leading-none mb-1 transition-colors duration-200 ${letterColor}`}
                  >
                    {letter}
                  </span>
                  <div
                    className={`relative flex items-center justify-center w-11 h-11 rounded-2xl text-[16px] font-black transition-colors duration-200 ${numberColor}`}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="active-date-pill"
                        className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/25 to-emerald-400/25 ring-1 ring-primary/40"
                        transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                      />
                    )}
                    <span className="relative">{dayNum}</span>
                  </div>
                  {isToday && (
                    <span className="absolute -bottom-1 w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      </LayoutGroup>
    );
  }

  // Legacy weekday-mode rendering (unchanged behavior)
  const getDayLabel = (apiDay: number) => {
    switch (apiDay) {
      case 0: return 'Su';
      case 6: return 'Sa';
      case 4: return 'Th';
      case 2: return 'Tu';
      default: return englishDays[apiDay].charAt(0);
    }
  };

  return (
    <LayoutGroup id="pagination-dots">
      <div className="flex items-center gap-0.5 pb-1">
        {Array.from({ length: count ?? 0 }).map((_, i) => {
          const apiDay = daysOrder ? daysOrder[i] : WEEK_ORDER[i];
          const label = getDayLabel(apiDay);
          const isActive = i === activeIndex;
          const isToday = i === todayIndex;
          return (
            <button
              key={i}
              onClick={() => onSelectDay?.(i)}
              className="relative flex flex-col items-center px-0.5 outline-none group"
            >
              <div
                className={`flex items-center justify-center w-6 h-6 rounded-[8px] text-[10px] font-black transition-all duration-300
                  ${isActive
                    ? 'bg-gradient-to-r from-primary/20 to-emerald-400/20 text-primary scale-105'
                    : 'text-muted-foreground/60 hover:text-muted-foreground/90 hover:bg-muted/30'}
                  ${isToday && !isActive ? 'text-primary/80' : ''}
                `}
              >
                {label}
              </div>
              {isToday && (
                <motion.div
                  animate={{ y: isActive ? -3 : 0, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-primary/30"
                />
              )}
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
