'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Tag, Trash2 } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { useKeyboardInset } from '@/components/ui/quick-add/useKeyboardInset';

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
  const [tagsOpen, setTagsOpen] = useState(initialTagIds.length > 0);
  const [inputFocused, setInputFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { inset: keyboardInset } = useKeyboardInset(open);

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
    setTagsOpen(initialTagIds.length > 0);
    setConfirmDelete(false);
    setInputFocused(false);
    const id = window.setTimeout(() => {
      if (mode === 'create') inputRef.current?.focus();
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
      bottomInset={inputFocused ? keyboardInset : 0}
      className="bg-background ring-1 ring-border/70 sm:max-w-[460px] max-h-[92vh]"
    >
      {({ bindScroll }) => (
        <div
          ref={bindScroll}
          className="mx-auto min-h-0 w-full flex-1 touch-pan-y overflow-y-auto overscroll-contain px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-1 sm:pb-6"
        >
          <div className="relative mb-4 flex h-9 items-center justify-center">
            <h2 className="text-[17px] font-black text-foreground">
              {displayMode === 'create' ? 'New section' : 'Edit section'}
            </h2>
          </div>

          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            maxLength={60}
            placeholder="e.g. Morning routine"
            aria-label="Section name"
            enterKeyHint="done"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              }
            }}
            className="w-full rounded-2xl bg-muted/60 px-4 py-3.5 text-[16px] font-black text-foreground ring-1 ring-inset ring-border/60 transition-shadow placeholder:font-bold placeholder:text-muted-foreground/50 focus:outline-none focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/50"
          />

          {displayMode === 'create' && suggestions.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {suggestions.map((suggestion) => {
                const picked = name.trim() === suggestion;
                return (
                  <button
                    key={suggestion}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setName(suggestion)}
                    className={`h-8 rounded-full px-3 text-[13px] font-bold transition-[transform,background-color,color] active:scale-95 ${
                      picked
                        ? 'bg-primary/15 text-primary'
                        : 'bg-muted/70 text-muted-foreground [@media(hover:hover)]:hover:bg-muted [@media(hover:hover)]:hover:text-foreground'
                    }`}
                  >
                    {suggestion}
                  </button>
                );
              })}
            </div>
          )}

          {tags.length > 0 && (
            <div className="mt-5 overflow-hidden rounded-2xl ring-1 ring-inset ring-border/60">
              <button
                type="button"
                aria-expanded={tagsOpen}
                onClick={() => setTagsOpen((v) => !v)}
                className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors [@media(hover:hover)]:hover:bg-muted/40"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <Tag className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-black text-foreground">
                    File tasks by tag
                  </span>
                  <span className="block truncate text-[12px] font-semibold text-muted-foreground">
                    {tagIds.length === 0
                      ? 'Optional'
                      : tags
                          .filter((t) => tagIds.includes(t.id))
                          .map((t) => t.name)
                          .join(', ')}
                  </span>
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
                    tagsOpen ? 'rotate-180' : ''
                  }`}
                  strokeWidth={2.75}
                />
              </button>

              {tagsOpen && (
                <div className="border-t border-border/60 px-4 pb-4 pt-3">
                  <p className="text-[12px] font-semibold leading-snug text-muted-foreground">
                    New tasks you add with these tags go into this section.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {tags.map((tag) => {
                      const selected = tagIds.includes(tag.id);
                      const owner = tagOwners[tag.id];
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => toggleTag(tag.id)}
                          className="inline-flex h-9 max-w-full items-center gap-1.5 rounded-full border px-3 text-[13px] font-black transition-[transform,background-color,border-color,color] active:scale-95"
                          style={
                            selected
                              ? {
                                  backgroundColor: tag.color,
                                  borderColor: tag.color,
                                  color: '#fff',
                                }
                              : {
                                  backgroundColor: 'transparent',
                                  borderColor: `${tag.color}55`,
                                  color: tag.color,
                                }
                          }
                        >
                          {selected ? (
                            <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3.5} />
                          ) : (
                            <span
                              aria-hidden
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: tag.color }}
                            />
                          )}
                          <span className="max-w-[140px] truncate">{tag.name}</span>
                          {owner && !selected && (
                            <span className="shrink-0 text-[11px] font-bold opacity-60">
                              · in {owner}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {tagIds.some((id) => tagOwners[id]) && (
                    <p className="mt-2.5 text-[12px] font-semibold text-muted-foreground">
                      Tags already in another section will move here.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={commit}
            disabled={!name.trim()}
            className="mt-6 w-full rounded-2xl bg-[#4f9149] py-3.5 text-[15px] font-black text-white shadow-[0_4px_0_0_#34631f] transition-all active:translate-y-1 active:shadow-none disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
          >
            {displayMode === 'create' ? 'Create section' : 'Save'}
          </button>

          {displayMode === 'edit' && displayDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-[13px] font-black text-rose-500 transition-colors [@media(hover:hover)]:hover:bg-rose-500/10"
            >
              <Trash2 className="h-4 w-4" />
              Delete section
            </button>
          )}
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
              className="h-12 rounded-2xl bg-muted text-[14px] font-black text-foreground transition hover:bg-muted/80"
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
              className="h-12 rounded-2xl bg-rose-500 text-[14px] font-black tracking-wide text-white transition active:translate-y-[2px]"
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
