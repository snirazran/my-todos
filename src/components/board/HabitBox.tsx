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
      className="relative flex pointer-events-auto shrink-0"
      initial={false}
      animate={{
        opacity: isDragging ? 0 : 1,
        scale: isDragging ? 0.9 : 1,
        width: isDragging ? 0 : '56px',
      }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 28,
      }}
    >
      <motion.button
        onClick={onClick}
        aria-label="Habits"
        initial={false}
        animate={{
          width: '56px',
          height: '56px',
          borderRadius: 16, 
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
            strokeWidth={2} 
            className="text-muted-foreground group-hover:text-emerald-500 transition-colors" 
          />
        </div>
      </motion.button>

      {/* Count Badge */}
      <AnimatePresence>
        {count > 0 && (
          <motion.div 
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="absolute -top-2 -right-2 z-10 flex items-center justify-center min-w-[20px] h-[20px] px-1 text-[10px] font-black text-white bg-emerald-500 rounded-full shadow-sm ring-2 ring-background pointer-events-none"
          >
            {count}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
