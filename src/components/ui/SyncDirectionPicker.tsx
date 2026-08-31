'use client';

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Check,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticSelect } from '@/lib/haptics';
import type { SyncDirection } from '@/lib/calendar/direction';

type Option = {
  value: SyncDirection;
  title: string;
  icon: React.ReactNode;
  /** `%s` is replaced with the provider's name, or "your calendar". */
  hint: string;
};

export const DIRECTION_OPTIONS: Option[] = [
  {
    value: 'two_way',
    title: 'Both ways',
    icon: <ArrowLeftRight className="h-[18px] w-[18px]" strokeWidth={2.75} />,
    hint: 'Your events become tasks, and your tasks show up in %s.',
  },
  {
    value: 'import_only',
    title: 'Calendar to Frogress',
    icon: <ArrowDownToLine className="h-[18px] w-[18px]" strokeWidth={2.75} />,
    hint: 'Your events become tasks. Frogress never adds anything to %s.',
  },
  {
    value: 'export_only',
    title: 'Frogress to calendar',
    icon: <ArrowUpFromLine className="h-[18px] w-[18px]" strokeWidth={2.75} />,
    hint: 'Your tasks show up in %s. Frogress never reads your events.',
  },
];

export function directionOption(direction: SyncDirection) {
  return DIRECTION_OPTIONS.find((o) => o.value === direction) ?? DIRECTION_OPTIONS[0];
}

export function directionHint(direction: SyncDirection, providerLabel?: string) {
  return directionOption(direction).hint.replace('%s', providerLabel ?? 'your calendar');
}

function OptionRow({
  option,
  providerLabel,
  selected,
  onSelect,
}: {
  option: Option;
  providerLabel?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => {
        hapticSelect();
        onSelect();
      }}
      className={cn(
        'flex w-full items-start gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors',
        selected
          ? 'border-primary/60 bg-primary/[0.07]'
          : 'border-border/60 bg-card hover:bg-muted/40',
      )}
    >
      <span
        className={cn(
          'mt-px grid h-8 w-8 shrink-0 place-items-center rounded-xl transition-colors',
          selected ? 'bg-primary text-primary-foreground' : 'bg-muted/60 text-muted-foreground',
        )}
      >
        {option.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-black tracking-tight text-foreground">
          {option.title}
        </span>
        <span className="mt-0.5 block text-[12.5px] font-bold leading-snug text-muted-foreground">
          {option.hint.replace('%s', providerLabel ?? 'your calendar')}
        </span>
      </span>
      <span
        className={cn(
          'mt-1 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-2 transition-colors',
          selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
        )}
      >
        {selected && <Check className="h-3 w-3" strokeWidth={4} />}
      </span>
    </button>
  );
}

/**
 * Which way the sync runs.
 *
 * `collapsed` shows the current choice as one line with the rest a tap away —
 * the default answer is right for most people, so it stays a glance rather
 * than a decision, while the one-way options are never more than a tap from
 * the moment someone is deciding whether to trust the connection at all.
 */
export function SyncDirectionPicker({
  value,
  onChange,
  providerLabel,
  variant = 'list',
  disabled = false,
}: {
  value: SyncDirection;
  onChange: (direction: SyncDirection) => void;
  providerLabel?: string;
  variant?: 'list' | 'collapsed';
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(variant === 'list');
  const current = directionOption(value);
  const expanded = variant === 'list' || open;

  return (
    <div className={cn('space-y-2', disabled && 'pointer-events-none opacity-60')}>
      {variant === 'collapsed' && (
        <button
          type="button"
          onClick={() => {
            hapticSelect();
            setOpen((prev) => !prev);
          }}
          aria-expanded={open}
          className="flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-card px-3.5 py-2.5 text-left transition-colors hover:bg-muted/40"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            {current.icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-black tracking-tight text-foreground">
              {current.title}
            </span>
            <span className="block truncate text-[11.5px] font-bold text-muted-foreground">
              {current.hint.replace('%s', providerLabel ?? 'your calendar')}
            </span>
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>
      )}

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="options"
            initial={variant === 'list' ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden"
          >
            <div role="radiogroup" aria-label="Sync direction" className="grid gap-2 pt-0.5">
              {DIRECTION_OPTIONS.map((option) => (
                <OptionRow
                  key={option.value}
                  option={option}
                  providerLabel={providerLabel}
                  selected={option.value === value}
                  onSelect={() => {
                    onChange(option.value);
                    if (variant === 'collapsed') setOpen(false);
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default SyncDirectionPicker;
