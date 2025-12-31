'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { WEEK_ORDER, englishDays } from './helpers';

interface Props {
  count: number;
  activeIndex: number;
  todayIndex: number;
  onSelectDay: (index: number) => void;
}

export default function PaginationDots({
  count,
  activeIndex,
  todayIndex,
  onSelectDay,
}: Props) {
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
    <div className="flex items-center gap-0.5">
      {Array.from({ length: count }).map((_, i) => {
        const apiDay = WEEK_ORDER[i];
        const label = getDayLabel(apiDay);
        const isActive = i === activeIndex;
        const isToday = i === todayIndex;

        return (
          <button
            key={i}
            onClick={() => onSelectDay(i)}
            className="relative flex flex-col items-center px-0.5 outline-none group"
          >
            <div
              className={`
                flex items-center justify-center
                w-6 h-6 rounded-[8px] text-[10px] font-black transition-all duration-300
                ${
                  isActive
                    ? 'bg-gradient-to-r from-primary/20 to-emerald-400/20 text-primary scale-105'
                    : 'text-muted-foreground/60 hover:text-muted-foreground/90 hover:bg-muted/30'
                }
                ${isToday && !isActive ? 'text-primary/80' : ''}
              `}
            >
              {label}
            </div>
            
            {isToday && (
              <motion.div
                layoutId={`today-dot-${activeIndex}`} // Unique-ish ID to prevent weird jumps across columns
                className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-primary/30"
                style={{ y: isActive ? -3 : 0 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
