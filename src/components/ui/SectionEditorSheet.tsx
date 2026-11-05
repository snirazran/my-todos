'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, Plus, Trash2, X } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { useKeyboardInset } from '@/components/ui/quick-add/useKeyboardInset';
import { revealInScroller } from '@/lib/revealInScroller';
import { useDragScroll } from '@/components/ui/quick-add/useDragScroll';
import {
  DANGER_BUTTON,
  FIELD_TILE,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SHEET_TITLE,
  TagPillContent,
  tagPillProps,
} from '@/components/ui/quick-add/kit';

export type SectionTagOption = { id: string; name: string; color: string };

const NAME_SUGGESTIONS = [
  'Morning',
  'Afternoon',
  'Evening',
  'Work',
  'Home',
  'Errands',
];

export function SectionEditorSheet({
  open,
  mode,
  initialName = '',
  initialTagIds = [],
  tags,
  tagOwners = {},
  existingNames = [],
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  initialName?: string;
  initialTagIds?: string[];
  tags: SectionTagOption[];
  tagOwners?: Record<string, string>;
  existingNames?: string[];
  onClose: () => void;
  onSave: (name: string, tagIds: string[]) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [tagIds, setTagIds] = useState<string[]>(initialTagIds);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nameRail = useDragScroll();
  const tagRail = useDragScroll();
  const [tagFadeRight, setTagFadeRight] = useState(false);
  const updateTagFade = () => {
    const el = tagRail.ref.current;
    if (!el) return;
    setTagFadeRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };
  const { inset: keyboardInset, height: viewportHeight } = useKeyboardInset(open);
  const keyboardActive = inputFocused && keyboardInset > 0;

  useEffect(() => {
    if (!keyboardActive) return;
    const timer = window.setTimeout(() => {
      const el = inputRef.current;
      if (el && document.activeElement === el) revealInScroller(el);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [keyboardActive, keyboardInset, viewportHeight]);

  // Cache the mode so the slide-down exit keeps rendering the sheet the user
  // was just looking at, after the parent has cleared its editor state.
  const lastModeRef = useRef(mode);
  const lastDeleteRef = useRef(onDelete);
  useEffect(() => {
    if (!open) return;
    lastModeRef.current = mode;
    lastDeleteRef.current = onDelete;
  }, [open, mode, onDelete]);
  const displayMode = open ? mode : lastModeRef.current;
  const displayDelete = open ? onDelete : lastDeleteRef.current;

  const initialKey = initialTagIds.join(',');
  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setTagIds(initialTagIds);
    setConfirmDelete(false);
    setInputFocused(false);
    const id = window.setTimeout(() => {
      if (mode === 'create') inputRef.current?.focus({ preventScroll: true });
    }, 120);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialName, initialKey, mode]);

  const commit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed, tagIds);
    onClose();
  };

  const taken = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  const suggestions = NAME_SUGGESTIONS.filter(
    (n) => !taken.has(n.toLowerCase()),
  );

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(updateTagFade);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tags.length]);

  const movingFrom = Array.from(
    new Set(
      tagIds
        .filter((id) => !initialTagIds.includes(id))
        .map((id) => tagOwners[id])
        .filter((owner): owner is string => !!owner),
    ),
  );

  const toggleTag = (id: string) =>
    setTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );

  return (
    <>
    <BaseSheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      zIndex={1500}
      bottomInset={keyboardActive ? keyboardInset : 0}
      panelStyle={
        keyboardActive && viewportHeight
          ? { maxHeight: Math.max(220, viewportHeight - 8) }
          : undefined
      }
      className="max-h-[92vh] bg-background ring-1 ring-border/70 sm:max-w-[440px]"
    >
      {({ bindScroll }) => (
        <div className="flex min-h-0 w-full flex-1 flex-col">
          <div className="flex h-11 shrink-0 items-center justify-center px-14 sm:h-14 sm:pt-1">
            <h2 className={SHEET_TITLE}>
              {displayMode === 'create' ? 'New section' : 'Edit section'}
            </h2>
          </div>

          <div
            ref={bindScroll}
            className="min-h-0 w-full flex-1 touch-pan-y overflow-y-auto overscroll-contain px-4 pb-3 pt-2 sm:px-5"
          >
            <label className={`flex h-14 items-center gap-2 pl-4 pr-2 ${FIELD_TILE}`}>
              <input
                ref={inputRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                maxLength={60}
                placeholder="Section name"
                aria-label="Section name"
                enterKeyHint="done"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commit();
                  }
                }}
                className="min-w-0 flex-1 bg-transparent text-[17px] font-black text-foreground placeholder:font-bold placeholder:text-muted-foreground/50 focus:outline-none"
              />
              {name && (
                <button
                  type="button"
                  aria-label="Clear name"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setName('');
                    inputRef.current?.focus({ preventScroll: true });
                  }}
                  className="-mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground/70 transition-colors active:bg-muted [@media(hover:hover)]:hover:text-foreground"
                >
                  <X className="h-4 w-4" strokeWidth={3} />
                </button>
              )}
            </label>

            {displayMode === 'create' && suggestions.length > 0 && (
              <div
                ref={nameRail.ref}
                {...nameRail.handlers}
                className="no-scrollbar -mx-4 mt-2 flex cursor-grab select-none gap-1.5 overflow-x-auto px-4 touch-pan-x active:cursor-grabbing sm:-mx-5 sm:px-5"
              >
                {suggestions.map((suggestion) => {
                  const picked = name.trim() === suggestion;
                  return (
                    <button
                      key={suggestion}
                      type="button"
                      aria-pressed={picked}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={nameRail.guard(() => setName(picked ? '' : suggestion))}
                      className={`h-8 shrink-0 rounded-full px-3 text-[13px] font-bold transition-[transform,background-color,color,box-shadow] active:scale-95 ${
                        picked
                          ? 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/40'
                          : 'text-muted-foreground ring-1 ring-inset ring-border [@media(hover:hover)]:hover:bg-muted/50 [@media(hover:hover)]:hover:text-foreground'
                      }`}
                    >
                      {suggestion}
                    </button>
                  );
                })}
              </div>
            )}

            {tags.length > 0 && (
              <div className="mt-6">
                <div className="flex min-h-8 items-center justify-between gap-3 px-1 pb-1">
                  <p className="text-[14px] font-black text-foreground">
                    Tasks with these tags go here
                  </p>
                  {tagIds.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setTagIds([])}
                      className="-mr-1 shrink-0 rounded-full px-2 py-1 text-[13px] font-bold text-muted-foreground transition-colors active:bg-muted [@media(hover:hover)]:hover:text-foreground"
                    >
                      Clear
                    </button>
                  ) : (
                    <span className="shrink-0 text-[13px] font-semibold text-muted-foreground/70">
                      Optional
                    </span>
                  )}
                </div>
                <div className="relative -mx-4 sm:-mx-5">
                  <div
                    ref={tagRail.ref}
                    {...tagRail.handlers}
                    onScroll={updateTagFade}
                    className={`no-scrollbar grid auto-cols-max grid-flow-col ${
                      tags.length > 5 ? 'grid-rows-2' : 'grid-rows-1'
                    } cursor-grab select-none items-center justify-start gap-2 overflow-x-auto px-4 py-1 touch-pan-x active:cursor-grabbing sm:px-5 ${
                      tagFadeRight ? 'mask-fade-right' : ''
                    }`}
                  >
                    {tags.map((tag) => {
                      const selected = tagIds.includes(tag.id);
                      const owner = tagOwners[tag.id];
                      const pill = tagPillProps({ color: tag.color, selected });
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={tagRail.guard(() => toggleTag(tag.id))}
                          className={pill.className}
                          style={pill.style}
                        >
                          <TagPillContent
                            name={tag.name}
                            color={tag.color}
                            selected={selected}
                            trailing={
                              owner && !selected ? (
                                <span className="shrink-0 text-[11.5px] font-semibold text-muted-foreground/70">
                                  {owner}
                                </span>
                              ) : undefined
                            }
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
                {movingFrom.length > 0 && (
                  <p className="px-1 pt-1.5 text-[12.5px] font-semibold text-muted-foreground">
                    Moves from {movingFrom.join(', ')}
                  </p>
                )}
              </div>
            )}
          </div>

          <div
            className={`shrink-0 px-4 pt-2 sm:px-5 sm:pb-5 ${
              keyboardActive ? 'pb-3' : 'pb-[calc(env(safe-area-inset-bottom)+16px)]'
            }`}
          >
            <button
              type="button"
              onClick={commit}
              disabled={!name.trim()}
              className={PRIMARY_BUTTON}
            >
              {displayMode === 'create' ? 'Create section' : 'Save'}
            </button>

            {displayMode === 'edit' && displayDelete && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="mt-1.5 flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-[14px] font-black text-rose-500 transition-colors active:bg-rose-500/10 [@media(hover:hover)]:hover:bg-rose-500/10"
              >
                <Trash2 className="h-4 w-4" strokeWidth={2.5} />
                Delete section
              </button>
            )}
          </div>
        </div>
      )}
    </BaseSheet>

    <BaseSheet
      open={confirmDelete}
      onOpenChange={(v) => !v && setConfirmDelete(false)}
      zIndex={1610}
      className="sm:max-w-[400px] max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-3rem)]"
    >
      {({ bindScroll }) => (
        <div
          ref={bindScroll}
          className="relative overflow-y-auto overscroll-none px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-1 text-card-foreground sm:px-6 sm:pb-6 sm:pt-3"
        >
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-500">
            <Trash2 className="h-7 w-7" strokeWidth={2.5} />
          </div>
          <h3 className="text-center text-xl font-black text-foreground">
            Delete section?
          </h3>
          <p className="mx-auto mt-1.5 max-w-[20rem] text-center text-[14px] leading-snug text-muted-foreground">
            <span className="font-bold text-foreground">{name.trim()}</span>{' '}
            will be removed. Its tasks stay on your list, just without a
            section.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className={SECONDARY_BUTTON}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmDelete(false);
                displayDelete?.();
                onClose();
              }}
              className={DANGER_BUTTON}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </BaseSheet>
    </>
  );
}

export function SectionsManagerSheet({
  open,
  onClose,
  sections,
  taskCounts,
  tags,
  canCreate,
  onEdit,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  sections: { id: string; name: string; tagIds?: string[] }[];
  taskCounts: Record<string, number>;
  tags: SectionTagOption[];
  canCreate: boolean;
  onEdit: (sectionId: string) => void;
  onCreate: () => void;
}) {
  const tagById = new Map(tags.map((t) => [t.id, t]));
  return (
    <BaseSheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      zIndex={1400}
      className="max-h-[88vh] bg-background ring-1 ring-border/70 sm:max-w-[440px]"
    >
      {({ bindScroll }) => (
        <div className="flex min-h-0 w-full flex-1 flex-col">
          <div className="flex h-11 shrink-0 items-center justify-center px-14 sm:h-14 sm:pt-1">
            <h2 className={SHEET_TITLE}>Sections</h2>
          </div>

          <div
            ref={bindScroll}
            className="min-h-0 w-full flex-1 touch-pan-y overflow-y-auto overscroll-contain px-4 pb-2 pt-2 sm:px-5"
          >
            <div className="flex flex-col gap-2">
              {sections.map((section) => {
                const count = taskCounts[section.id] ?? 0;
                const sectionTags = (section.tagIds ?? [])
                  .map((id) => tagById.get(id))
                  .filter((t): t is SectionTagOption => !!t);
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => onEdit(section.id)}
                    className="flex min-h-[60px] w-full items-center gap-3 rounded-2xl bg-muted/50 px-4 py-2.5 text-left transition-[transform,background-color] active:scale-[0.985] active:bg-muted [@media(hover:hover)]:hover:bg-muted/80"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] font-black text-foreground">
                        {section.name}
                      </span>
                      <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">
                        <span className="shrink-0 tabular-nums">
                          {count} {count === 1 ? 'task' : 'tasks'}
                        </span>
                        {sectionTags.length > 0 && (
                          <>
                            <span aria-hidden className="shrink-0">·</span>
                            <span className="flex min-w-0 items-center gap-1">
                              {sectionTags.map((t) => (
                                <span
                                  key={t.id}
                                  aria-hidden
                                  className="h-2 w-2 shrink-0 rounded-full"
                                  style={{ backgroundColor: t.color }}
                                />
                              ))}
                              <span className="truncate">
                                {sectionTags.map((t) => t.name).join(', ')}
                              </span>
                            </span>
                          </>
                        )}
                      </span>
                    </span>
                    <ChevronRight
                      className="h-5 w-5 shrink-0 text-muted-foreground/60"
                      strokeWidth={2.5}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="shrink-0 border-t border-border/60 px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3 sm:px-5 sm:pb-5">
            {canCreate ? (
              <button type="button" onClick={onCreate} className={PRIMARY_BUTTON}>
                <Plus className="h-5 w-5" strokeWidth={3} />
                New section
              </button>
            ) : (
              <p className="py-2 text-center text-[13px] font-semibold text-muted-foreground">
                You've reached the 10-section limit.
              </p>
            )}
          </div>
        </div>
      )}
    </BaseSheet>
  );
}
