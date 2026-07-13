'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDownToLine, EyeOff } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';

interface Props {
  count: number;
  isDragOver: boolean;
  isDragging: boolean;
  isRepeating?: boolean;
  isDesktop: boolean;
  onClick: () => void;
  /** Omit when this instance isn't the live drop-hit-test target (e.g. the
   * idle bookmark button in the mobile toolbar, where a separate full-width
   * strip takes over as the real drop target during a drag). */
  forwardRef?: React.Ref<HTMLDivElement>;
}

export default function BacklogBox({
  count,
  isDragOver,
  isDragging,
  isRepeating = false,
  isDesktop,
  onClick,
  forwardRef,
}: Props) {
  const idleSize = isDesktop ? 64 : 52;
  const countBadgeClass = isDesktop
    ? 'min-w-6 h-6 px-1 text-[11px]'
    : 'w-5 h-5 text-[10px]';
  const DropIcon = isRepeating ? EyeOff : ArrowDownToLine;
  const label = isRepeating ? 'Release to skip this day' : 'Release to save for later';

  return (
    <div
      ref={forwardRef}
      className="relative flex shrink-0 items-center justify-center pointer-events-auto"
      style={{ height: idleSize, width: idleSize }}
    >
      {/* The target itself never resizes — a fixed circle at rest, ringed in
          primary once a card is actually over it. What it does is
          communicated by a floating label above it (macOS/iOS dock-drop
          convention) instead of the target growing to fit text, which was
          fighting the toolbar's other children for space and clipping. */}
      <button
        type="button"
        onClick={onClick}
        aria-label="Saved tasks"
        data-hint="saved-tasks"
        className={`grid h-full w-full place-items-center rounded-full border shadow-lg shadow-black/5 transition-colors dark:shadow-black/20 ${
          isDragOver
            ? 'border-primary bg-primary/12 text-primary'
            : isDragging
              ? 'border-primary/40 bg-card text-muted-foreground/70'
              : 'border-border/80 bg-card text-foreground hover:border-primary/50 hover:bg-card/95'
        }`}
      >
        <AnimatePresence initial={false} mode="wait">
          {isDragging ? (
            <motion.span
              key="drop"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: isDragOver ? 1.08 : 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            >
              <DropIcon size={isDesktop ? 24 : 20} />
            </motion.span>
          ) : (
            <motion.span
              key="idle"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            >
              <Icon name="saved" className={isDesktop ? 'h-9 w-9' : 'h-7 w-7'} />
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {count > 0 && !isDragging && (
          <motion.div
            key="backlog-count"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className={`absolute -right-1.5 -top-1.5 z-10 flex ${countBadgeClass} items-center justify-center rounded-full bg-primary font-black text-primary-foreground shadow-sm ring-2 ring-background pointer-events-none`}
          >
            {count}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isDragOver && (
          <motion.div
            key="tooltip"
            initial={{ opacity: 0, y: 4, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 480, damping: 32 }}
            className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-3 -translate-x-1/2 whitespace-nowrap rounded-full border border-primary/30 bg-card px-3.5 py-2 text-xs font-bold text-primary shadow-xl"
          >
            {label}
            <span className="absolute left-1/2 top-full h-2.5 w-2.5 -translate-x-1/2 -translate-y-1.5 rotate-45 border-b border-r border-primary/30 bg-card" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
