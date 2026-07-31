'use client';

import React from 'react';
import { Filter, X } from 'lucide-react';
import { taskFilterChips, type TaskFilters } from '@/lib/taskFilters';
import type { FilterTag } from '@/components/ui/TaskFilterSheet';

export function FilterTriggerButton({
  onClick,
  activeCount,
  open,
  compact = false,
  label = 'Filter',
  triggerRef,
}: {
  onClick: () => void;
  activeCount: number;
  open?: boolean;
  compact?: boolean;
  label?: string;
  triggerRef?: React.Ref<HTMLButtonElement>;
}) {
  const on = activeCount > 0 || open;
  if (compact) {
    return (
      <button
        ref={triggerRef}
        onClick={onClick}
        aria-label="Filter"
        title="Filter"
        className={`relative flex h-7 w-7 items-center justify-center rounded-lg transition-all active:scale-90 ${
          on
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground [@media(hover:hover)]:hover:bg-muted [@media(hover:hover)]:hover:text-foreground'
        }`}
      >
        <Filter size={16} />
        {activeCount > 0 && (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-black tabular-nums text-primary-foreground ring-2 ring-card">
            {activeCount}
          </span>
        )}
      </button>
    );
  }
  return (
    <button
      ref={triggerRef}
      onClick={onClick}
      className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-bold transition-all md:px-4 md:py-2 md:text-[13px] ${
        on
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground [@media(hover:hover)]:hover:bg-accent/50 [@media(hover:hover)]:hover:text-foreground'
      }`}
    >
      <Filter className="h-3.5 w-3.5 md:h-4 md:w-4" />
      <span>{label}</span>
      {activeCount > 0 && (
        <span className="grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-black tabular-nums text-primary-foreground">
          {activeCount}
        </span>
      )}
    </button>
  );
}

/**
 * The applied filters, each one tap from being undone. It only takes up room
 * when something is actually filtering, so an unfiltered list looks untouched.
 */
export function AppliedFilterChips({
  filters,
  base,
  tags,
  onChange,
  onClearAll,
  className = '',
}: {
  filters: TaskFilters;
  base: TaskFilters;
  tags: FilterTag[];
  onChange: (filters: TaskFilters) => void;
  onClearAll: () => void;
  className?: string;
}) {
  const chips = taskFilterChips(filters, base, tags);
  if (chips.length === 0) return null;
  return (
    <div
      className={`flex items-center gap-1.5 overflow-x-auto no-scrollbar ${className}`}
    >
      {chips.map((chip) => (
        <button
          key={chip.key}
          onClick={() => onChange(chip.next)}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border py-1 pl-2.5 pr-1.5 text-[11px] font-black transition-all active:scale-95"
          style={
            chip.color
              ? {
                  backgroundColor: `${chip.color}20`,
                  color: chip.color,
                  borderColor: `${chip.color}40`,
                }
              : undefined
          }
        >
          <span className="max-w-[140px] truncate">{chip.label}</span>
          <X className="h-3 w-3 shrink-0 opacity-70" strokeWidth={3} />
        </button>
      ))}
      {chips.length > 1 && (
        <button
          onClick={onClearAll}
          className="shrink-0 px-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground transition-colors [@media(hover:hover)]:hover:text-foreground"
        >
          Clear all
        </button>
      )}
    </div>
  );
}

/** Shown in place of a list that filters have emptied. */
export function FilteredEmptyState({
  hidden,
  onClearAll,
  compact = false,
}: {
  hidden: number;
  onClearAll: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-muted-foreground/20 bg-muted/20 text-center ${
        compact ? 'py-4' : 'py-6'
      }`}
    >
      <p className="text-xs font-bold text-muted-foreground">
        {hidden} {hidden === 1 ? 'task' : 'tasks'} hidden by filters
      </p>
      <button
        onClick={onClearAll}
        className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-black text-primary transition-colors [@media(hover:hover)]:hover:bg-primary/20"
      >
        Clear filters
      </button>
    </div>
  );
}
