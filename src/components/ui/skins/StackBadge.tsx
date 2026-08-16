'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * One corner badge for both numbers a stack has to report. Trade mode used to
 * paint the picked count over the owned count, hiding the very number the
 * player needs to know how many copies are still spendable.
 */
export function StackBadge({
  owned,
  selected = 0,
}: {
  owned: number;
  selected?: number;
}) {
  const active = selected > 0;

  return (
    <motion.div
      key={selected}
      initial={active ? { scale: 1.3 } : false}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 520, damping: 22 }}
      className={cn(
        'absolute top-1 right-1 md:top-1.5 md:right-1.5 z-20 rounded-md md:rounded-lg border px-1.5 py-0.5 text-[9px] md:text-[10px] font-bold tabular-nums shadow-sm',
        active
          ? 'border-primary-foreground/25 bg-primary text-primary-foreground'
          : 'border-white/10 bg-black/50 text-white backdrop-blur-sm',
      )}
    >
      {active ? (
        <>
          <span className="font-black">{selected}</span>
          <span className="opacity-70">/{owned}</span>
        </>
      ) : (
        `x${owned}`
      )}
    </motion.div>
  );
}
