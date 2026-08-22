'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Search, Star, Trash2, X } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { useKeyboardInset } from '@/components/ui/quick-add/useKeyboardInset';
import {
  QUICK_VIEWS,
  SORT_LABELS,
  previewMatchCount,
  type FilterableTask,
  type TaskFilters,
  type TaskSort,
} from '@/lib/taskFilters';
import type { FilterPreset } from '@/hooks/useTaskFilters';

export type FilterTag = { id: string; name: string; color: string };

const SORTS: TaskSort[] = ['manual', 'time', 'flies', 'alpha', 'tag'];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 px-1 text-[12px] font-black text-muted-foreground">
      {children}
    </p>
  );
}

function Count({ n, on }: { n: number; on: boolean }) {
  return (
    <span
      className={`text-[10px] font-black tabular-nums ${
        on ? 'opacity-80' : 'text-muted-foreground/60'
      }`}
    >
      {n}
    </span>
  );
}

export function TaskFilterSheet({
  open,
  onOpenChange,
  filters,
  onChange,
  onReset,
  tags,
  tasks,
  presets,
  onSavePreset,
  onDeletePreset,
  showSort = true,
  showTags = true,
  showCompletedToggle = true,
  title = 'Filter',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: TaskFilters;
  onChange: (filters: TaskFilters) => void;
  onReset: () => void;
  tags: FilterTag[];
  /** The unfiltered pool this surface draws from — used for the live counts. */
  tasks: FilterableTask[];
  presets: FilterPreset[];
  onSavePreset: (name: string) => void;
  onDeletePreset: (id: string) => void;
  showSort?: boolean;
  /** Off where a live chip strip already owns the tags. */
  showTags?: boolean;
  /** Off where a view menu already owns the completed toggle. */
  showCompletedToggle?: boolean;
  title?: string;
}) {
  const [inputFocused, setInputFocused] = useState(false);
  const [savingPreset, setSavingPreset] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [presetName, setPresetName] = useState('');
  const presetInputRef = useRef<HTMLInputElement>(null);
  const { inset: keyboardInset } = useKeyboardInset(open);

  useEffect(() => {
    if (!open) {
      setSavingPreset(false);
      setShowPresets(false);
      setPresetName('');
    }
  }, [open]);

  useEffect(() => {
    if (savingPreset) presetInputRef.current?.focus();
  }, [savingPreset]);

  const toggleView = (id: (typeof QUICK_VIEWS)[number]['id']) =>
    onChange({
      ...filters,
      views: filters.views.includes(id)
        ? filters.views.filter((v) => v !== id)
        : [...filters.views, id],
    });

  const toggleTag = (id: string) =>
    onChange({
      ...filters,
      tags: filters.tags.includes(id)
        ? filters.tags.filter((t) => t !== id)
        : [...filters.tags, id],
    });

  const commitPreset = () => {
    const name = presetName.trim();
    if (!name) return;
    onSavePreset(name);
    setPresetName('');
    setSavingPreset(false);
  };

  const anyFilterOn =
    filters.search.trim().length > 0 ||
    filters.tags.length > 0 ||
    filters.views.length > 0;

  // Only tags that actually sit on something in this pool are worth offering —
  // plus any already picked, so a chip can never strand itself.
  const usedTagIds = new Set<string>();
  for (const task of tasks) for (const id of task.tags ?? []) usedTagIds.add(id);

  // A control that would match nothing is noise, so it isn't rendered at all —
  // only what's already on stays, so a selection can always be undone.
  const quickViewOptions = QUICK_VIEWS.map((view) => {
    const on = filters.views.includes(view.id);
    return {
      view,
      on,
      n: previewMatchCount(tasks, filters, {
        views: on ? filters.views : [...filters.views, view.id],
      }),
    };
  }).filter((o) => o.on || o.n > 0);

  const tagOptions = (showTags ? tags : [])
    .filter((t) => usedTagIds.has(t.id) || filters.tags.includes(t.id))
    .map((tag) => {
      const on = filters.tags.includes(tag.id);
      return {
        tag,
        on,
        n: previewMatchCount(tasks, filters, {
          tags: on ? filters.tags : [...filters.tags, tag.id],
        }),
      };
    })
    .filter((o) => o.on || o.n > 0);

  return (
    <BaseSheet
      open={open}
      onOpenChange={onOpenChange}
      zIndex={1400}
      bottomInset={inputFocused ? keyboardInset : 0}
      className="bg-background ring-1 ring-border/70 sm:max-w-[560px] max-h-[88vh]"
    >
      {({ bindScroll }) => (
        <div className="flex min-h-0 w-full flex-1 flex-col">
        <div
          ref={bindScroll}
          className="min-h-0 w-full flex-1 touch-pan-y overflow-y-auto overscroll-contain px-5 pt-1 narrow:px-4"
        >
          <div className="relative mb-4 flex h-9 items-center justify-center sm:justify-start">
            <h2 className="text-[17px] font-black text-foreground">{title}</h2>
          </div>

          <div className="relative mb-5">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
            <input
              value={filters.search}
              onChange={(e) => onChange({ ...filters, search: e.target.value })}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder="Search tasks, notes, steps"
              enterKeyHint="search"
              className="w-full rounded-2xl bg-muted/60 py-3 pl-11 pr-10 text-[16px] font-bold text-foreground ring-1 ring-inset ring-border/60 placeholder:font-semibold placeholder:text-muted-foreground/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            />
            {filters.search && (
              <button
                onClick={() => onChange({ ...filters, search: '' })}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="sm:grid sm:grid-cols-2 sm:gap-x-6">
          {tagOptions.length > 0 && (
            <div className="mb-5">
              <div className="flex items-center justify-between">
                <SectionLabel>Tags</SectionLabel>
                {filters.tags.length > 0 && (
                  <button
                    onClick={() => onChange({ ...filters, tags: [] })}
                    className="mb-2 text-[12px] font-black text-primary"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {tagOptions.map(({ tag, on, n }) => (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    aria-pressed={on}
                    className={`inline-flex max-w-full items-center gap-1.5 rounded-xl border px-3 py-2 text-[12px] font-black transition-all active:scale-95 ${
                      on ? 'ring-2 ring-offset-1 ring-offset-background' : ''
                    }`}
                    style={{
                      backgroundColor: `${tag.color}20`,
                      color: tag.color,
                      borderColor: `${tag.color}40`,
                      ...(on
                        ? ({
                            ['--tw-ring-color' as string]: tag.color,
                          } as React.CSSProperties)
                        : {}),
                    }}
                  >
                    {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                    <span className="truncate">{tag.name}</span>
                    <Count n={n} on={on} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {quickViewOptions.length > 0 && (
            <div className="mb-5">
              <SectionLabel>Quick views</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {quickViewOptions.map(({ view, on, n }) => (
                  <button
                    key={view.id}
                    onClick={() => toggleView(view.id)}
                    aria-pressed={on}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12px] font-black transition-all active:scale-95 ${
                      on
                        ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                        : 'border-border bg-background text-muted-foreground [@media(hover:hover)]:hover:border-foreground/30 [@media(hover:hover)]:hover:text-foreground'
                    }`}
                  >
                    {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                    {view.label}
                    <Count n={n} on={on} />
                  </button>
                ))}
              </div>
            </div>
          )}
          </div>

          <button
            onClick={() =>
              onChange({ ...filters, showCompleted: !filters.showCompleted })
            }
            aria-pressed={filters.showCompleted}
            className={`mb-5 w-full items-center justify-between rounded-2xl bg-muted/50 px-4 py-3 text-left transition-colors [@media(hover:hover)]:hover:bg-muted ${
              showCompletedToggle ? 'flex' : 'hidden'
            }`}
          >
            <span className="text-[14px] font-black text-foreground">
              Show completed
            </span>
            <span
              className={`relative h-6 w-11 rounded-full transition-colors ${
                filters.showCompleted ? 'bg-primary' : 'bg-muted-foreground/30'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  filters.showCompleted ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </span>
          </button>

          {showSort && (
            <div className="mb-5">
              <SectionLabel>Sort</SectionLabel>
              <div className="grid grid-cols-5 gap-1 rounded-2xl bg-muted/50 p-1.5 narrow:grid-cols-3">
                {SORTS.map((sort) => (
                  <button
                    key={sort}
                    onClick={() => onChange({ ...filters, sort })}
                    aria-pressed={filters.sort === sort}
                    className={`rounded-xl py-2 text-[11px] font-black transition-all ${
                      filters.sort === sort
                        ? 'bg-background text-foreground shadow-sm ring-1 ring-border/60'
                        : 'text-muted-foreground [@media(hover:hover)]:hover:text-foreground'
                    }`}
                  >
                    {SORT_LABELS[sort]}
                  </button>
                ))}
              </div>
              {filters.sort !== 'manual' && (
                <p className="mt-2 px-1 text-[11px] font-semibold text-muted-foreground">
                  {filters.sort === 'tag'
                    ? 'Tasks group by tag, untagged last. Drag to reorder is off.'
                    : 'Drag to reorder is off while sorted.'}
                </p>
              )}
            </div>
          )}

          {/* Saved views only show up once there's something worth saving —
              until then the machinery is pure perceived weight. */}
          <div
            className={`mb-6 ${
              presets.length > 0 || anyFilterOn ? '' : 'hidden'
            }`}
          >
            <button
              onClick={() => setShowPresets((v) => !v)}
              aria-expanded={showPresets}
              className="flex w-full items-center gap-1.5 px-1 py-1 text-[12px] font-black text-muted-foreground transition-colors [@media(hover:hover)]:hover:text-foreground"
            >
              Presets
              {presets.length > 0 && (
                <span className="tabular-nums opacity-60">
                  {presets.length}
                </span>
              )}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${
                  showPresets ? 'rotate-180' : ''
                }`}
              />
            </button>
            <div
              className={`flex flex-wrap gap-2 ${showPresets ? 'mt-2' : 'hidden'}`}
            >
              {presets.map((preset) => (
                <span
                  key={preset.id}
                  className="group inline-flex items-center gap-1 rounded-xl border border-border bg-background py-1 pl-2.5 pr-1 text-[12px] font-black text-foreground"
                >
                  <button
                    onClick={() => onChange(preset.filters)}
                    className="inline-flex items-center gap-1.5 py-1"
                  >
                    <Star className="h-3.5 w-3.5 text-amber-500" />
                    {preset.name}
                  </button>
                  <button
                    onClick={() => onDeletePreset(preset.id)}
                    aria-label={`Delete ${preset.name}`}
                    className="grid h-6 w-6 place-items-center rounded-lg text-muted-foreground/50 transition-colors hover:bg-muted hover:text-rose-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
              {savingPreset ? (
                <span className="inline-flex items-center gap-1 rounded-xl border border-primary bg-background py-1 pl-2.5 pr-1">
                  <input
                    ref={presetInputRef}
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    onFocus={() => setInputFocused(true)}
                    onBlur={() => setInputFocused(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitPreset();
                      if (e.key === 'Escape') setSavingPreset(false);
                    }}
                    maxLength={24}
                    placeholder="Name"
                    className="w-24 bg-transparent py-1 text-[12px] font-black text-foreground focus:outline-none"
                  />
                  <button
                    onClick={commitPreset}
                    aria-label="Save preset"
                    className="grid h-6 w-6 place-items-center rounded-lg text-primary transition-colors hover:bg-primary/10"
                  >
                    <Check className="h-4 w-4" strokeWidth={3} />
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setSavingPreset(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2 text-[12px] font-black text-muted-foreground transition-colors [@media(hover:hover)]:hover:border-foreground/30 [@media(hover:hover)]:hover:text-foreground"
                >
                  + Save current
                </button>
              )}
            </div>
          </div>

        </div>

        {/* Pinned so Clear all / Close never scroll out of reach. Nothing here
            commits anything — every control above already applied itself. */}
        <div className="shrink-0 border-t border-border/60 bg-background px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3 narrow:px-4 sm:pb-4">
          <div className="flex gap-2.5">
            <button
              onClick={onReset}
              className="h-12 flex-1 rounded-2xl bg-muted/60 text-[14px] font-black text-muted-foreground transition-colors [@media(hover:hover)]:hover:text-foreground"
            >
              Clear all
            </button>
            <button
              onClick={() => onOpenChange(false)}
              className="h-12 flex-[1.4] rounded-2xl bg-[#4f9149] text-[15px] font-black text-white shadow-[0_3px_0_0_#34631f] transition-all active:translate-y-[2px] active:shadow-none"
            >
              Close
            </button>
          </div>
        </div>
        </div>
      )}
    </BaseSheet>
  );
}

export default TaskFilterSheet;
