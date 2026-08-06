'use client';

import { motion } from 'framer-motion';
import { Icon as AppIcon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import type { TaskQuestChip } from '@/lib/quests/taskQuestChip';

/**
 * One line under the input confirming the tagged task joins a live ladder.
 *
 * Deliberately states where the ladder stands rather than previewing a gain:
 * adding a task advances almost nothing on its own — the tiers that move are
 * the ones you finish — so a "+1" here would promise progress the add does
 * not make. The segmented bar matches the area card so it reads as the same
 * object seen from somewhere else.
 */
export function QuestProgressStrip({
  chip,
  color,
  className,
}: {
  chip: TaskQuestChip;
  color?: string;
  className?: string;
}) {
  const accent = color || 'var(--primary)';
  const total = Math.max(0, chip.total);
  const done = Math.min(total, Math.max(0, chip.done));

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={cn(
        'flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-1.5',
        className,
      )}
      style={{
        backgroundColor: `${accent}12`,
        borderColor: `${accent}33`,
      }}
    >
      <AppIcon name="quests" className="h-4 w-4 shrink-0" />
      <span
        className="min-w-0 flex-1 truncate text-[11px] font-bold"
        style={{ color: accent }}
      >
        {chip.label}
      </span>
      {total > 0 && (
        <span className="flex shrink-0 items-center gap-1">
          <span className="flex items-center gap-0.5" aria-hidden>
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className="h-1.5 w-2.5 rounded-full transition-colors"
                style={{
                  backgroundColor: i < done ? accent : `${accent}2E`,
                }}
              />
            ))}
          </span>
          <span
            className="text-[10px] font-black tabular-nums"
            style={{ color: accent }}
          >
            {done}/{total}
          </span>
        </span>
      )}
    </motion.div>
  );
}
