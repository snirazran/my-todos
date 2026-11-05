'use client';

import React from 'react';
import { Check, Filter } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { PRIMARY_BUTTON } from '@/components/ui/quick-add/kit';
import {
  SORT_LABELS,
  matchesTaskFilters,
  type FilterableTask,
  type TaskFilters,
  type TaskSort,
} from '@/lib/taskFilters';
import type { FilterTag } from '@/components/ui/TaskFilterSheet';

export function FilterTriggerButton({
  onClick,
  activeCount,
  open,
  compact = false,
  size = 'sm',
  label = 'Filter',
  triggerRef,
}: {
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  activeCount: number;
  open?: boolean;
  compact?: boolean;
  /** Compact only — 'md' fits a column header, 'lg' a thumb-sized toolbar. */
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  triggerRef?: React.Ref<HTMLButtonElement>;
}) {
  const on = activeCount > 0 || open;
  if (compact) {
    const box =
      size === 'lg'
        ? 'h-11 w-11 rounded-2xl'
        : size === 'md'
          ? 'h-9 w-9 rounded-xl'
          : 'h-7 w-7 rounded-lg';
    const glyph = size === 'lg' ? 20 : size === 'md' ? 18 : 16;
    return (
      <button
        ref={triggerRef}
        type="button"
        onClick={onClick}
        aria-label={activeCount > 0 ? `Filter, ${activeCount} on` : 'Filter'}
        aria-pressed={open ?? undefined}
        title="Filter"
        className={`relative flex shrink-0 items-center justify-center transition-all active:scale-90 ${box} ${
          on
            ? 'bg-primary text-primary-foreground dark:bg-[#4a8a44] dark:text-white'
            : 'text-muted-foreground [@media(hover:hover)]:hover:bg-muted [@media(hover:hover)]:hover:text-foreground'
        }`}
      >
        <Filter size={glyph} strokeWidth={size === 'sm' ? 2 : 2.5} />
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

const QUICK_SORTS: TaskSort[] = ['manual', 'time', 'tag'];

export function QuickFilterSheet({
  open,
  onOpenChange,
  filters,
  base,
  tags,
  tasks,
  onChange,
  onClearAll,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: TaskFilters;
  base: TaskFilters;
  tags: FilterTag[];
  tasks: FilterableTask[];
  onChange: (filters: TaskFilters) => void;
  onClearAll: () => void;
}) {
  const tagCounts = new Map<string, number>();
  for (const task of tasks)
    for (const id of task.tags ?? [])
      tagCounts.set(id, (tagCounts.get(id) ?? 0) + 1);
  const tagOptions = tags.filter(
    (t) => tagCounts.has(t.id) || filters.tags.includes(t.id),
  );
  const anyOn =
    filters.tags.length > 0 ||
    filters.views.length > 0 ||
    filters.search.trim().length > 0 ||
    filters.sort !== base.sort;
  let matched = 0;
  for (const task of tasks) if (matchesTaskFilters(task, filters)) matched++;

  const toggleTag = (id: string) =>
    onChange({
      ...filters,
      tags: filters.tags.includes(id)
        ? filters.tags.filter((t) => t !== id)
        : [...filters.tags, id],
    });

  return (
    <BaseSheet
      open={open}
      onOpenChange={onOpenChange}
      zIndex={1400}
      closeAriaLabel="Close filters"
      className="max-h-[88vh] bg-background ring-1 ring-border/70 sm:max-w-[420px]"
    >
      {({ bindScroll }) => (
        <div className="flex min-h-0 w-full flex-1 flex-col">
          <div className="flex h-12 shrink-0 items-center px-6 sm:h-16 sm:pt-1">
            <h2 className="text-[20px] font-black tracking-tight text-foreground">
              Filter
            </h2>
          </div>

          <div className="shrink-0 px-3 pb-3">
            <p className="px-3 pb-2 text-[13px] font-black uppercase tracking-wide text-muted-foreground">
              Sort by
            </p>
            <div className="grid grid-cols-3 gap-2 px-3">
              {QUICK_SORTS.map((sort) => {
                const on = filters.sort === sort;
                return (
                  <button
                    key={sort}
                    type="button"
                    onClick={() => onChange({ ...filters, sort })}
                    aria-pressed={on}
                    className={`h-11 rounded-2xl px-2 text-[15px] font-black transition-[background-color,color,transform] active:scale-95 ${
                      on
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/70 text-muted-foreground [@media(hover:hover)]:hover:bg-muted [@media(hover:hover)]:hover:text-foreground'
                    }`}
                  >
                    {SORT_LABELS[sort]}
                  </button>
                );
              })}
            </div>
          </div>

          {tagOptions.length > 0 && <div className="mx-6 h-px shrink-0 bg-border/60" />}

          <div
            ref={bindScroll}
            className="min-h-0 w-full flex-1 touch-pan-y overflow-y-auto overscroll-contain px-3 pb-2"
          >
            {tagOptions.length > 0 && (
              <>
                <div className="sticky top-0 z-10 flex items-baseline justify-between bg-background px-3 pb-2 pt-3">
                  <p className="text-[13px] font-black uppercase tracking-wide text-muted-foreground">
                    Tags
                  </p>
                  {filters.tags.length > 0 && (
                    <span className="text-[13px] font-bold tabular-nums text-primary">
                      {filters.tags.length} selected
                    </span>
                  )}
                </div>
                {tagOptions.map((tag) => {
                  const on = filters.tags.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      aria-pressed={on}
                      className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl px-3 text-left text-[16px] font-bold text-foreground transition-colors active:bg-muted [@media(hover:hover)]:hover:bg-muted"
                    >
                      <span
                        aria-hidden
                        className="h-3.5 w-3.5 shrink-0 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                      <span className="text-[14px] font-black tabular-nums text-muted-foreground/70">
                        {tagCounts.get(tag.id) ?? 0}
                      </span>
                      <span
                        className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg transition-colors ${
                          on
                            ? 'bg-primary text-primary-foreground'
                            : 'ring-2 ring-inset ring-muted-foreground/25'
                        }`}
                      >
                        {on && <Check className="h-4 w-4" strokeWidth={3.5} />}
                      </span>
                    </button>
                  );
                })}
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-3 border-t border-border/60 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:pb-4">
            <button
              type="button"
              onClick={onClearAll}
              disabled={!anyOn}
              className="h-12 shrink-0 rounded-2xl px-4 text-[15px] font-black text-muted-foreground transition-[background-color,color,opacity] active:scale-95 disabled:opacity-40 [@media(hover:hover)]:hover:bg-muted [@media(hover:hover)]:hover:text-foreground"
            >
              Clear all
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className={`${PRIMARY_BUTTON} min-w-0 flex-1 truncate px-4 text-[16px]`}
            >
              {matched === 0
                ? 'No tasks match'
                : `Show ${matched} ${matched === 1 ? 'task' : 'tasks'}`}
            </button>
          </div>
        </div>
      )}
    </BaseSheet>
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
