'use client';

import React from 'react';
import { ArrowUpDown, Check, Filter, SlidersHorizontal, X } from 'lucide-react';
import {
  SORT_LABELS,
  matchesTaskFilters,
  taskFilterChips,
  type FilterableTask,
  type TaskFilters,
  type TaskSort,
} from '@/lib/taskFilters';
import type { FilterTag } from '@/components/ui/TaskFilterSheet';

const SORTS: TaskSort[] = ['manual', 'time', 'flies', 'alpha', 'tag'];

export function FilterTriggerButton({
  onClick,
  activeCount,
  open,
  compact = false,
  size = 'sm',
  label = 'Filter',
  triggerRef,
}: {
  onClick: () => void;
  activeCount: number;
  open?: boolean;
  compact?: boolean;
  /** Compact only — 'lg' is the thumb-sized variant for the mobile toolbar. */
  size?: 'sm' | 'lg';
  label?: string;
  triggerRef?: React.Ref<HTMLButtonElement>;
}) {
  const on = activeCount > 0 || open;
  if (compact) {
    const lg = size === 'lg';
    return (
      <button
        ref={triggerRef}
        onClick={onClick}
        aria-label="Filter"
        title="Filter"
        className={`relative flex items-center justify-center transition-all active:scale-90 ${
          lg ? 'h-11 w-11 rounded-2xl' : 'h-7 w-7 rounded-lg'
        } ${
          on
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground [@media(hover:hover)]:hover:bg-muted [@media(hover:hover)]:hover:text-foreground'
        }`}
      >
        <Filter size={lg ? 20 : 16} strokeWidth={lg ? 2.5 : 2} />
        {activeCount > 0 && (
          <span
            className={`absolute grid place-items-center rounded-full bg-primary font-black tabular-nums text-primary-foreground ring-2 ring-card ${
              lg
                ? 'right-0.5 top-0.5 h-[18px] min-w-[18px] px-1 text-[10px]'
                : '-right-1 -top-1 h-4 min-w-4 px-1 text-[9px]'
            }`}
          >
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
 * The lens: tag chips that apply the moment they're tapped, sitting on the
 * board rather than over it, so the list visibly changes underneath. Anything
 * rarer than a tag (search, quick views, sort, completed) lives behind More —
 * but once it's on it rides here too, as a chip you can drop with one tap.
 */
export function FilterChipStrip({
  filters,
  base,
  tags,
  tasks,
  onChange,
  onClearAll,
  onOpenMore,
  menuDirection = 'down',
  className = '',
}: {
  filters: TaskFilters;
  base: TaskFilters;
  tags: FilterTag[];
  tasks: FilterableTask[];
  onChange: (filters: TaskFilters) => void;
  onClearAll: () => void;
  onOpenMore: () => void;
  /** Which way the sort/display menu opens — up when the strip sits low. */
  menuDirection?: 'up' | 'down';
  className?: string;
}) {
  const usedTagIds = new Set<string>();
  for (const task of tasks) for (const id of task.tags ?? []) usedTagIds.add(id);

  const tagOptions = tags.filter(
    (t) => usedTagIds.has(t.id) || filters.tags.includes(t.id),
  );
  // Everything that isn't a tag shows up only once it's actually on.
  const extras = taskFilterChips(filters, base, tags).filter(
    (c) => !c.key.startsWith('tag:'),
  );
  const anyOn = extras.length > 0 || filters.tags.length > 0;

  const toggleTag = (id: string) =>
    onChange({
      ...filters,
      tags: filters.tags.includes(id)
        ? filters.tags.filter((t) => t !== id)
        : [...filters.tags, id],
    });

  const { ref: scrollerRef, overflow } = useEdgeOverflow([
    tagOptions.length,
    extras.length,
    anyOn,
  ]);

  return (
    <div className={`flex items-center gap-1.5 sm:gap-2 ${className}`}>
      <button
        onClick={onOpenMore}
        aria-label="More filters"
        title="More filters"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted/70 text-muted-foreground transition-colors active:scale-95 narrow:h-9 narrow:w-9 [@media(hover:hover)]:hover:bg-muted [@media(hover:hover)]:hover:text-foreground"
      >
        <SlidersHorizontal className="h-4 w-4" strokeWidth={2.5} />
      </button>

      <ViewOptionsButton
        filters={filters}
        base={base}
        onChange={onChange}
        direction={menuDirection}
      />

      {/* The fades are the only honest signal that chips continue past the
          edge — a cut-off chip reads as the end of the list otherwise. */}
      <div className="relative min-w-0 flex-1">
        <div
          ref={scrollerRef}
          className="flex items-center gap-1.5 overflow-x-auto no-scrollbar sm:gap-2"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
        {extras.map((chip) => (
          <button
            key={chip.key}
            onClick={() => onChange(chip.next)}
            className="inline-flex h-10 shrink-0 items-center gap-1 rounded-full bg-primary py-1 pl-3.5 pr-2.5 text-[13px] font-black text-primary-foreground transition-all active:scale-95 narrow:h-9 narrow:pl-3 narrow:text-[12px]"
          >
            <span className="max-w-[120px] truncate narrow:max-w-[92px]">
              {chip.label}
            </span>
            <X className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={3} />
          </button>
        ))}

        {tagOptions.map((tag) => {
          const on = filters.tags.includes(tag.id);
          return (
            <button
              key={tag.id}
              onClick={() => toggleTag(tag.id)}
              aria-pressed={on}
              className="inline-flex h-10 shrink-0 items-center gap-1 rounded-full border px-3.5 text-[13px] font-black transition-all active:scale-95 narrow:h-9 narrow:px-3 narrow:text-[12px]"
              style={{
                backgroundColor: on ? tag.color : `${tag.color}1a`,
                color: on ? '#fff' : tag.color,
                borderColor: on ? tag.color : `${tag.color}33`,
              }}
            >
              <span className="max-w-[120px] truncate narrow:max-w-[92px]">
                {tag.name}
              </span>
              {on && (
                <X className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={3} />
              )}
            </button>
          );
        })}

          {anyOn && (
            <button
              onClick={onClearAll}
              className="h-10 shrink-0 px-2 text-[13px] font-black text-muted-foreground transition-colors narrow:h-9 [@media(hover:hover)]:hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>

        {overflow.left && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-[hsl(var(--strip-fade,var(--background)))] to-transparent"
          />
        )}
        {overflow.right && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-[hsl(var(--strip-fade,var(--background)))] to-transparent"
          />
        )}
      </div>
    </div>
  );
}

/** Which sides of a horizontal scroller still have content hidden past them. */
function useEdgeOverflow(deps: unknown[]) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [overflow, setOverflow] = React.useState({ left: false, right: false });

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const max = el.scrollWidth - el.clientWidth;
      setOverflow({
        left: el.scrollLeft > 4,
        right: max > 4 && el.scrollLeft < max - 4,
      });
    };
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ref, overflow };
}

/**
 * Order and display — deliberately not in the filter surface. Sorting doesn't
 * hide anything and hiding done isn't a query; keeping them here stops the two
 * ideas from being read as one.
 */
export function ViewOptionsButton({
  filters,
  base,
  onChange,
  direction = 'down',
}: {
  filters: TaskFilters;
  base: TaskFilters;
  onChange: (filters: TaskFilters) => void;
  direction?: 'up' | 'down';
}) {
  const [open, setOpen] = React.useState(false);
  const changed =
    filters.sort !== base.sort || filters.showCompleted !== base.showCompleted;

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Sort and display"
        title="Sort and display"
        aria-expanded={open}
        className={`grid h-10 w-10 place-items-center rounded-full transition-colors active:scale-95 narrow:h-9 narrow:w-9 ${
          open || changed
            ? 'bg-primary/10 text-primary'
            : 'bg-muted/70 text-muted-foreground [@media(hover:hover)]:hover:bg-muted [@media(hover:hover)]:hover:text-foreground'
        }`}
      >
        <ArrowUpDown className="h-4 w-4" strokeWidth={2.5} />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-[1] cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            className={`absolute left-0 z-[2] w-52 max-w-[calc(100vw-2.5rem)] rounded-2xl border border-border/60 bg-card p-1.5 shadow-xl ${
              direction === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'
            }`}
          >
            <p className="px-2.5 pb-1 pt-1.5 text-[12px] font-black text-muted-foreground">
              Sort
            </p>
            {SORTS.map((sort) => (
              <button
                key={sort}
                onClick={() => onChange({ ...filters, sort })}
                className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-[13px] font-bold transition-colors ${
                  filters.sort === sort
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground [@media(hover:hover)]:hover:bg-muted'
                }`}
              >
                {SORT_LABELS[sort]}
                {filters.sort === sort && (
                  <Check className="h-4 w-4" strokeWidth={3} />
                )}
              </button>
            ))}

            <div className="my-1 h-px bg-border/60" />

            <button
              onClick={() =>
                onChange({ ...filters, showCompleted: !filters.showCompleted })
              }
              aria-pressed={filters.showCompleted}
              className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-[13px] font-bold text-foreground transition-colors [@media(hover:hover)]:hover:bg-muted"
            >
              Show completed
              <span
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                  filters.showCompleted ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                    filters.showCompleted ? 'left-[18px]' : 'left-0.5'
                  }`}
                />
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** "3 of 12 shown" — the mode, said out loud where the list is. */
export function FilterStatusLine({
  tasks,
  filters,
  onClearAll,
  className = '',
}: {
  tasks: FilterableTask[];
  filters: TaskFilters;
  onClearAll: () => void;
  className?: string;
}) {
  const total = tasks.length;
  if (total === 0) return null;
  let shown = 0;
  for (const task of tasks) if (matchesTaskFilters(task, filters)) shown++;
  return (
    <button
      onClick={onClearAll}
      className={`inline-flex items-center gap-1.5 rounded-full bg-primary/10 py-0.5 pl-2 pr-1.5 text-[11px] font-black text-primary transition-colors active:scale-95 [@media(hover:hover)]:hover:bg-primary/20 ${className}`}
    >
      <span className="tabular-nums">
        {shown} of {total} shown
      </span>
      <X className="h-3 w-3 opacity-80" strokeWidth={3} />
    </button>
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
