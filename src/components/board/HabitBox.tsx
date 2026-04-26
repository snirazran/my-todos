'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarClock } from 'lucide-react';

interface Props {
  count: number;
  onClick: () => void;
  isDragging?: boolean;
}

export default function HabitBox({
  count,
  onClick,
  isDragging = false,
}: Props) {
  return (
    <motion.div 
      className="relative flex pointer-events-auto origin-left shrink-0"
      initial={false}
      animate={{
        opacity: isDragging ? 0 : 1,
        scale: isDragging ? 0.9 : 1,
      }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 28,
      }}
      style={{ width: isDragging ? 0 : '48px' }}
    >
      <motion.button
        onClick={onClick}
        aria-label="Habits"
        initial={false}
        animate={{
          width: '100%',
          height: '48px',
          borderRadius: 14,
        }}
        className={`
           relative flex items-center justify-center overflow-hidden w-full
           bg-card border-border/80 border backdrop-blur-2xl will-change-transform
           hover:bg-card/95 hover:border-emerald-500/50 transition-colors shadow-lg shadow-black/5 dark:shadow-black/20
           group
        `}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <CalendarClock 
            size={22}
            className="text-muted-foreground group-hover:text-emerald-500 transition-colors"
            strokeWidth={2} 
          />
        </div>
      </motion.button>

      {/* Count Badge */}
      <AnimatePresence>
        {count > 0 && (
          <motion.div
            key="habit-count"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="absolute -top-2.5 -right-2.5 z-10 flex items-center justify-center w-5 h-5 text-[10px] font-black text-primary-foreground bg-primary rounded-full shadow-sm ring-2 ring-background pointer-events-none"
          >
            {count}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
