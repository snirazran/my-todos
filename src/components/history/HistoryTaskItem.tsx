'use client';

import React, { useRef, useState } from 'react';
import { RotateCcw, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import Fly from '@/components/ui/fly';

export type HistoryTaskItemProps = {
  id: string; // Added ID for toggle
  text: string;
  completed: boolean;
  type: 'weekly' | 'regular';
  date?: string; // Needed for toggle
  index?: number;
  onToggle?: (id: string, date: string, currentStatus: boolean) => void;
  setFlyRef?: (el: HTMLDivElement | null) => void;
  isEaten?: boolean;
};

export default function HistoryTaskItem({
  id,
  text,
  completed,
  type,
  date,
  index = 0,
  onToggle,
  setFlyRef,
  isEaten = false,
}: HistoryTaskItemProps) {
  const isWeekly = type === 'weekly';
  const [isHovered, setIsHovered] = useState(false);
  
  // Combine real completion status with visual "eaten" state
  // to ensure smooth transition (Fly disappears -> Check appears)
  const displayedCompleted = completed || isEaten;

  const handleClick = () => {
    if (onToggle && date) {
      onToggle(id, date, completed);
    }
  };

  return (
    <motion.div
      layout // allow smooth reordering/layout changes
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "group flex items-center gap-3 p-3.5 rounded-xl border transition-all duration-200 cursor-pointer select-none",
        "bg-white dark:bg-slate-800/50",
        "border-slate-100 dark:border-slate-700/50",
        "hover:border-purple-200 dark:hover:border-purple-800/50",
        "hover:shadow-md hover:bg-slate-50 dark:hover:bg-slate-800/80" // Enhanced hover state
      )}
    >
      {/* Icon */}
      <div className="relative shrink-0 transition-transform duration-200 flex items-center justify-center w-7 h-7">
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          initial={false}
          animate={{
            opacity: displayedCompleted ? 1 : 0,
            scale: displayedCompleted ? 1 : 0.6,
          }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          style={{ pointerEvents: displayedCompleted ? 'auto' : 'none' }}
        >
          <CheckCircle2 className="w-5 h-5 text-green-500" />
        </motion.div>

        <motion.div
          ref={setFlyRef}
          className="absolute inset-0 flex items-center justify-center"
          initial={false}
          animate={{ opacity: displayedCompleted ? 0 : 1 }}
          transition={{ duration: 0.18 }}
          style={{ pointerEvents: displayedCompleted ? 'none' : 'auto' }}
        >
          <Fly size={24} paused={displayedCompleted} />
        </motion.div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
        {/* Weekly Tag - Matches TaskCard.tsx style */}
        {isWeekly && (
          <div className="flex items-center">
            <span
              title="Repeats weekly"
              className="inline-flex items-center gap-1 rounded-md bg-purple-50/80 px-1.5 py-0.5 text-[10px] font-bold text-purple-600 dark:bg-purple-900/40 dark:text-purple-200 transition-colors"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              <span className="tracking-wider uppercase">Weekly</span>
            </span>
          </div>
        )}

        {/* Text */}
        <span
          className={cn(
            "truncate text-[15px] font-medium leading-snug transition-colors",
            displayedCompleted
              ? "text-slate-400 dark:text-slate-500 line-through decoration-slate-400 dark:decoration-slate-600" 
              : "text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white"
          )}
        >
          {text}
        </span>
      </div>
    </motion.div>
  );
}