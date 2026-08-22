'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { useKeyboardInset } from '@/components/ui/quick-add/useKeyboardInset';

export type SectionTagOption = { id: string; name: string; color: string };

export function SectionEditorSheet({
  open,
  mode,
  initialName = '',
  initialTagIds = [],
  tags,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  initialName?: string;
  initialTagIds?: string[];
  tags: SectionTagOption[];
  onClose: () => void;
  onSave: (name: string, tagIds: string[]) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [tagIds, setTagIds] = useState<string[]>(initialTagIds);
  const [confirmDelete, setConfirmDelete] = useState(false);
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
            placeholder="Section name"
            enterKeyHint="done"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              }
            }}
            className="w-full rounded-2xl bg-muted/60 px-4 py-3.5 text-[16px] font-black text-foreground ring-1 ring-inset ring-border/60 placeholder:font-bold placeholder:normal-case placeholder:tracking-normal placeholder:text-muted-foreground/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          />

          <div className="mt-5">
            <p className="px-1 text-[13px] font-black text-foreground">
              Connected tags
            </p>
            <p className="mt-0.5 px-1 text-[12px] font-semibold text-muted-foreground">
              New tasks with these tags land in this section automatically.
            </p>

            {tags.length === 0 ? (
              <p className="mt-3 px-1 text-[13px] font-semibold text-muted-foreground/70">
                You don&apos;t have any tags yet.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {tags.map((tag) => {
                  const selected = tagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      className={`inline-flex h-9 items-center rounded-xl border px-3 text-[13px] font-black shadow-sm transition-all active:scale-95 [@media(hover:hover)]:hover:opacity-75 ${
 selected ? 'ring-2 ring-offset-1 ring-offset-background' : ''
 }`}
                      style={{
                        backgroundColor: `${tag.color}20`,
                        color: tag.color,
                        borderColor: `${tag.color}40`,
                      }}
                    >
                      <span className="max-w-[140px] truncate">{tag.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={commit}
            disabled={!name.trim()}
            className="mt-6 w-full rounded-2xl bg-[#4f9149] py-3.5 text-[15px] font-black text-white shadow-[0_4px_0_0_#34631f] transition-all active:translate-y-1 active:shadow-none disabled:opacity-50 disabled:shadow-none"
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
