'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarDays,
  CopyPlus,
  ListChecks,
  MoreHorizontal,
  Repeat,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { useMediaQuery } from '@/hooks/useMediaQuery';

export type BulkAction =
  | 'move'
  | 'tags'
  | 'repeat'
  | 'duplicate'
  | 'backlog'
  | 'delete'
  | 'selectAll';

const PRIMARY: { id: BulkAction; label: string; icon: React.ReactNode }[] = [
  { id: 'move', label: 'Move', icon: <CalendarDays className="h-5 w-5" /> },
  { id: 'tags', label: 'Tags', icon: <Tag className="h-5 w-5" /> },
  { id: 'repeat', label: 'Repeat', icon: <Repeat className="h-5 w-5" /> },
];

export default function BulkActionBar({
  count,
  bottomOffset,
  onAction,
  onClear,
}: {
  count: number;
  /** Extra px to lift the bar above the notification stack. */
  bottomOffset: number;
  onAction: (action: BulkAction) => void;
  onClear: () => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  // Labels are dropped only on genuinely narrow phones — the icon row alone is
  // ambiguous, so it stays the exception rather than the mobile default.
  const iconOnly = useMediaQuery('(max-width: 389px)');

  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: PointerEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [moreOpen]);

  useEffect(() => {
    if (count === 0) setMoreOpen(false);
  }, [count]);

  const run = (action: BulkAction) => {
    setMoreOpen(false);
    onAction(action);
  };

  const disabled = count === 0;

  return (
    <div
      style={{ ['--stack' as string]: `${bottomOffset}px` }}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] px-3 pb-[calc(env(safe-area-inset-bottom)+84px+var(--stack))] md:px-4 md:pb-[calc(env(safe-area-inset-bottom)+32px+var(--stack))]"
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        className="pointer-events-auto relative mx-auto flex w-full max-w-[420px] items-center gap-1 rounded-[28px] border border-border/50 bg-card px-2 py-2 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.35)] md:max-w-[520px]"
      >
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors active:scale-90 [@media(hover:hover)]:hover:bg-muted [@media(hover:hover)]:hover:text-foreground"
        >
          <X className="h-5 w-5" strokeWidth={2.5} />
        </button>

        <span
          aria-live="polite"
          className="shrink-0 whitespace-nowrap rounded-full bg-primary/12 px-2.5 py-1.5 text-[13px] font-black tabular-nums text-primary"
        >
          {count}
          {!iconOnly && ' selected'}
        </span>

        <div className="ml-auto flex min-w-0 items-center gap-0.5">
          {PRIMARY.map((a) => {
            return (
              <button
                key={a.id}
                type="button"
                disabled={disabled}
                onClick={() => run(a.id)}
                aria-label={a.label}
                title={a.label}
                className={`flex h-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl transition-colors active:scale-95 disabled:pointer-events-none disabled:opacity-35 ${
                  iconOnly ? 'w-11' : 'w-[54px]'
                } text-muted-foreground [@media(hover:hover)]:hover:bg-primary/10 [@media(hover:hover)]:hover:text-primary`}
              >
                {a.icon}
                {!iconOnly && (
                  <span className="text-[9px] font-black uppercase tracking-wide">
                    {a.label}
                  </span>
                )}
              </button>
            );
          })}

          <div ref={moreRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              aria-label="More actions"
              aria-expanded={moreOpen}
              className={`flex h-11 flex-col items-center justify-center gap-0.5 rounded-2xl transition-colors active:scale-95 ${
                iconOnly ? 'w-11' : 'w-[54px]'
              } ${
                moreOpen
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground [@media(hover:hover)]:hover:bg-primary/10 [@media(hover:hover)]:hover:text-primary'
              }`}
            >
              <MoreHorizontal className="h-5 w-5" />
              {!iconOnly && (
                <span className="text-[9px] font-black uppercase tracking-wide">
                  More
                </span>
              )}
            </button>

            <AnimatePresence>
              {moreOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.96 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="absolute bottom-[calc(100%+10px)] right-0 z-10 w-[212px] overflow-hidden rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg"
                >
                  <MoreItem
                    icon={<ListChecks className="h-[18px] w-[18px]" />}
                    label="Select all this day"
                    onClick={() => run('selectAll')}
                  />
                  <MoreItem
                    icon={<CopyPlus className="h-[18px] w-[18px]" />}
                    label="Duplicate to…"
                    disabled={disabled}
                    onClick={() => run('duplicate')}
                  />
                  <MoreItem
                    icon={<Icon name="saved" className="h-[18px] w-[18px]" />}
                    label="Save for later"
                    disabled={disabled}
                    onClick={() => run('backlog')}
                  />
                  <MoreItem
                    icon={<Trash2 className="h-[18px] w-[18px] text-red-500" />}
                    label="Delete"
                    danger
                    disabled={disabled}
                    onClick={() => run('delete')}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function MoreItem({
  icon,
  label,
  onClick,
  danger = false,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-[14px] font-bold transition-colors disabled:pointer-events-none disabled:opacity-40 ${
        danger
          ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20'
          : 'text-foreground hover:bg-accent'
      }`}
    >
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      {label}
    </button>
  );
}
