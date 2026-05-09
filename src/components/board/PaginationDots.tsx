'use client';

import React from 'react';
import { motion, LayoutGroup } from 'framer-motion';

import { WEEK_ORDER, englishDays, dayLetterFromYmd, parseYmd, todayYmd } from './helpers';

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
        <div className="flex items-end justify-between gap-1 pb-1.5 px-1 w-full">
          {dates.map((d) => {
            const letter = dayLetterFromYmd(d);
            const dayNum = parseYmd(d).getDate();
            const isActive = d === activeDate;
            const isToday = d === today;

            return (
              <button
                key={d}
                onClick={() => onSelectDate?.(d)}
                className="relative flex flex-1 flex-col items-center px-1 outline-none group"
                aria-label={d}
              >
                <span
                  className={`text-[11px] font-bold tracking-wide leading-none mb-1
                    ${isActive ? 'text-primary' : 'text-muted-foreground/70'}
                  `}
                >
                  {letter}
                </span>
                <div
                  className={`flex items-center justify-center
                    w-11 h-11 rounded-2xl text-[16px] font-black transition-all duration-200
                    ${isActive
                      ? 'bg-gradient-to-br from-primary/25 to-emerald-400/25 text-primary scale-105 ring-1 ring-primary/40'
                      : 'text-muted-foreground/80 hover:text-foreground hover:bg-muted/30'}
                  `}
                >
                  {dayNum}
                </div>
                {isToday && (
                  <motion.span
                    layoutId="today-dot"
                    className="absolute -bottom-1 w-1.5 h-1.5 rounded-full bg-primary"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
              </button>
            );
          })}
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
