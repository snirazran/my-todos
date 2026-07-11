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
  forwardRef: React.Ref<HTMLDivElement>;
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
  const dropHeight = isDesktop ? 72 : 56;
  const countBadgeClass = isDesktop
    ? 'min-w-6 h-6 px-1 text-[11px]'
    : 'w-5 h-5 text-[10px]';

  return (
    <div
      ref={forwardRef}
      className="relative flex w-full shrink-0 items-center justify-center pointer-events-auto"
      style={{ height: dropHeight }}
    >
      {/* Fixed-size drop target: transform/opacity only, so opening and closing
          stay on the compositor instead of recalculating layout every frame. */}
      <motion.div
        initial={false}
        animate={{
          opacity: isDragging ? 1 : 0,
          scaleX: isDragging ? 1 : 0.94,
          scaleY: isDragging ? 1 : 0.9,
        }}
        transition={{
          duration: isDragging ? 0.18 : 0.26,
          ease: [0.22, 1, 0.36, 1],
        }}
        className={`absolute inset-0 flex items-center justify-center gap-2 overflow-hidden rounded-[18px] border shadow-lg ${
          isDragOver
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-primary/50 bg-card text-foreground'
        }`}
        style={{
          pointerEvents: isDragging ? 'auto' : 'none',
          willChange: 'transform, opacity',
          backfaceVisibility: 'hidden',
        }}
      >
        {isRepeating ? (
          <EyeOff size={isDesktop ? 24 : 20} />
        ) : (
          <ArrowDownToLine size={isDesktop ? 24 : 20} />
        )}
        <span className={`${isDesktop ? 'text-sm' : 'text-xs'} font-black whitespace-nowrap`}>
          {isRepeating
            ? isDragOver
              ? 'Release to skip this day'
              : 'Drop here to skip this day'
            : isDragOver
              ? 'Release to save for later'
              : 'Drop here to save for later'}
        </span>
      </motion.div>

      {/* Idle bookmark is a separate fixed layer; it never stretches into the
          drop target, avoiding width/height/border-radius interpolation. */}
      <motion.div
        initial={false}
        animate={{
          opacity: isDragging ? 0 : 1,
          scale: isDragging ? 0.86 : 1,
        }}
        transition={{
          duration: isDragging ? 0.18 : 0.24,
          ease: [0.22, 1, 0.36, 1],
        }}
        className="relative"
        style={{
          pointerEvents: isDragging ? 'none' : 'auto',
          willChange: 'transform, opacity',
        }}
      >
        <button
          type="button"
          onClick={onClick}
          aria-label="Saved tasks"
          className="grid place-items-center rounded-[18px] border border-border/80 bg-card shadow-lg shadow-black/5 transition-colors hover:border-primary/50 hover:bg-card/95 dark:shadow-black/20"
          style={{ width: idleSize, height: idleSize }}
        >
          <Icon name="saved" className={isDesktop ? 'h-10 w-10' : 'h-8 w-8'} />
        </button>

        <AnimatePresence>
          {count > 0 && (
            <motion.div
              key="backlog-count"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className={`absolute -right-2.5 -top-2.5 z-10 flex ${countBadgeClass} items-center justify-center rounded-full bg-primary font-black text-primary-foreground shadow-sm ring-2 ring-background pointer-events-none`}
            >
              {count}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
