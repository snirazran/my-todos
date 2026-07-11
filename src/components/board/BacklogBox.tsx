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
  const dropHeight = isDesktop ? 56 : 46;
  const countBadgeClass = isDesktop
    ? 'min-w-6 h-6 px-1 text-[11px]'
    : 'w-5 h-5 text-[10px]';
  const DropIcon = isRepeating ? EyeOff : ArrowDownToLine;

  return (
    <div
      ref={forwardRef}
      className="relative grid w-full shrink-0 place-items-center pointer-events-auto"
      style={{ height: idleSize }}
    >
      {/* Drop target: a quiet, icon-only pill while a card is merely in
          flight — it only announces what it does (label + accent) once the
          card is actually held over it, so it doesn't read as a big new UI
          element the moment you pick anything up. Grid-stacked (not
          absolute) so it can share Framer's `layout` transform with the
          idle bookmark layer below without either fighting the other. */}
      <motion.div
        layout
        initial={false}
        animate={{
          opacity: isDragging ? 1 : 0,
          scale: isDragging ? 1 : 0.85,
        }}
        transition={{
          layout: { type: 'spring', stiffness: 500, damping: 38 },
          opacity: { duration: 0.16 },
          scale: { duration: 0.16 },
        }}
        className={`col-start-1 row-start-1 flex items-center justify-center gap-2 overflow-hidden rounded-full border px-4 ${
          isDragOver
            ? 'border-primary bg-primary/12 text-primary shadow-md shadow-primary/10'
            : 'border-border/70 bg-card/95 text-muted-foreground/60 shadow-sm'
        }`}
        style={{
          height: dropHeight,
          pointerEvents: isDragging ? 'auto' : 'none',
          willChange: 'transform, opacity',
          backfaceVisibility: 'hidden',
        }}
      >
        <DropIcon size={isDesktop ? 20 : 17} className="shrink-0" />
        <AnimatePresence initial={false}>
          {isDragOver && (
            <motion.span
              key="label"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className={`${isDesktop ? 'text-sm' : 'text-xs'} font-bold whitespace-nowrap`}
            >
              {isRepeating ? 'Release to skip this day' : 'Release to save for later'}
            </motion.span>
          )}
        </AnimatePresence>
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
        className="col-start-1 row-start-1"
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
