'use client';

import React, { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { Check, ListChecks, Repeat, Sparkles, Trash2, X } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { TAG_COLORS, TAG_MAX_LENGTH } from './constants';
import { fetcher } from './utils';
import type { SavedTag } from './types';

type TagUsageTask = {
  id: string;
  text: string;
  type: 'repeating' | 'once';
  when: string;
};

type TagUsage = {
  tasks: TagUsageTask[];
  focus: { categoryId: string; name: string; accent?: string } | null;
};

interface Props {
  open: boolean;
  tag: SavedTag | null;
  onClose: () => void;
  onSave: (updates: { name: string; color: string }) => void;
  onDelete: () => void;
}

export function TagManagerSheet({ open, tag, onClose, onSave, onDelete }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState('');

  // Keep the last tag so the slide-down exit can still render after the parent
  // clears it.
  const lastTagRef = useRef<SavedTag | null>(tag);
  useEffect(() => {
    if (tag) lastTagRef.current = tag;
  }, [tag]);
  const displayTag = tag ?? lastTagRef.current;

  // Seed the staged fields whenever a (different) tag opens.
  useEffect(() => {
    if (open && tag) {
      setName(tag.name);
      setColor(tag.color);
      setConfirmDelete(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tag?.id]);

  const tz =
    typeof window !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'UTC';
  const { data, mutate } = useSWR<TagUsage>(
    open && tag ? `/api/tags?usage=${tag.id}&timezone=${encodeURIComponent(tz)}` : null,
    fetcher,
  );
  const tasks = data?.tasks ?? [];
  const focus = data?.focus ?? null;

  // Keep the "used in" list live — refetch whenever tasks/tags change elsewhere
  // (e.g. the tag is added to a new task) so no manual refresh is needed.
  useEffect(() => {
    if (!open) return;
    const refresh = () => mutate();
    window.addEventListener('tags-updated', refresh);
    window.addEventListener('board-refresh', refresh);
    return () => {
      window.removeEventListener('tags-updated', refresh);
      window.removeEventListener('board-refresh', refresh);
    };
  }, [open, mutate]);

  if (!displayTag) return null;

  const trimmed = name.trim();
  const dirty =
    !!trimmed && (trimmed !== displayTag.name || color !== displayTag.color);

  return (
    <>
      <BaseSheet
        open={open}
        onOpenChange={(v) => !v && onClose()}
        zIndex={1700}
        className="bg-background ring-1 ring-border/70 sm:max-w-[480px] max-h-[88vh]"
      >
        {({ bindScroll }) => (
          <>
          <div
            ref={bindScroll}
            className="mx-auto w-full min-h-0 flex-1 overflow-y-auto overscroll-none px-5 pt-1"
          >
            {/* Header — close (left), delete (right) */}
            <div className="relative mb-5 flex h-9 items-center justify-center">
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="absolute left-0 grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-5 w-5 stroke-[3]" />
              </button>
              <h2 className="text-[18px] font-extrabold text-muted-foreground">
                Edit tag
              </h2>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                aria-label="Delete tag"
                title="Delete tag"
                className="absolute right-0 grid h-10 w-10 place-items-center rounded-full bg-rose-100/70 text-rose-600 transition-colors hover:bg-rose-200/70 dark:bg-rose-500/15 dark:text-rose-300"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>

            {/* Name */}
            <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
              Name
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={TAG_MAX_LENGTH}
              placeholder="Tag name"
              className="mb-4 h-12 w-full rounded-2xl border border-border bg-background px-4 text-base font-bold text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"
            />

            {/* Color */}
            <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
              Color
            </div>
            <div className="mb-4 flex flex-wrap gap-2.5">
              {TAG_COLORS.map((c) => {
                const isActive = color === c.value;
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => setColor(c.value)}
                    title={c.name}
                    className={`grid h-9 w-9 place-items-center rounded-full ${c.bg} ring-2 ring-offset-2 ring-offset-background transition-transform active:scale-95 ${
                      isActive ? 'scale-110 ring-foreground/70' : 'ring-transparent'
                    }`}
                  >
                    {isActive && <Check className="h-4 w-4 text-white" strokeWidth={3.5} />}
                  </button>
                );
              })}
            </div>

            {/* Live preview */}
            <div className="mb-5 flex items-center gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                Preview
              </span>
              <span
                className="inline-flex max-w-[60%] items-center rounded-2xl border px-3.5 py-2 text-[13px] font-black uppercase tracking-wider shadow-sm"
                style={{
                  backgroundColor: `${color}20`,
                  borderColor: `${color}40`,
                  color,
                }}
              >
                <span className="truncate">{trimmed || 'Tag'}</span>
              </span>
            </div>

            {/* Focus association */}
            {focus && (
              <div className="mb-4 flex items-center gap-2 rounded-2xl border border-border/50 bg-muted/30 px-4 py-3">
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-white"
                  style={{ backgroundColor: focus.accent || color }}
                >
                  <Sparkles className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                    Focus area
                  </p>
                  <p className="truncate text-[14px] font-bold text-foreground">
                    {focus.name}
                  </p>
                </div>
              </div>
            )}

            {/* Tasks using this tag */}
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
              <ListChecks className="h-3.5 w-3.5" />
              Used in {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
            </div>
            {tasks.length > 0 ? (
              <div className="mb-5 max-h-[30vh] space-y-1.5 overflow-y-auto">
                {tasks.map((t) => (
                  <div
                    key={`${t.type}-${t.id}`}
                    className="flex items-center gap-2.5 rounded-2xl border border-border/50 bg-muted/30 px-3.5 py-2.5"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-foreground">
                      {t.text}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-muted-foreground">
                      {t.type === 'repeating' && <Repeat className="h-3 w-3" />}
                      {t.when}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mb-2 rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-4 text-center text-[13px] font-medium text-muted-foreground">
                Not used by any upcoming tasks.
              </p>
            )}
          </div>

          {/* Pinned Save footer — always visible regardless of scroll. */}
          <div className="shrink-0 border-t border-border/50 bg-background px-5 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
            <button
              type="button"
              disabled={!dirty}
              onClick={() => onSave({ name: trimmed, color })}
              className="h-12 w-full rounded-2xl bg-primary text-[15px] font-extrabold text-primary-foreground transition-transform active:scale-[0.985] disabled:opacity-40 disabled:active:scale-100"
            >
              Save changes
            </button>
          </div>
          </>
        )}
      </BaseSheet>

      {/* Themed delete confirmation */}
      <BaseSheet
        open={confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(false)}
        zIndex={1710}
        className="sm:max-w-[400px] max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-3rem)]"
      >
        {({ bindScroll }) => (
          <div
            ref={bindScroll}
            className="relative overflow-y-auto overscroll-none px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 text-card-foreground sm:px-6 sm:pb-6"
          >
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-500">
              <Trash2 className="h-7 w-7" strokeWidth={2.5} />
            </div>
            <h3 className="text-center text-xl font-black text-foreground">
              Delete tag?
            </h3>
            <p className="mx-auto mt-1.5 max-w-[20rem] text-center text-[14px] leading-snug text-muted-foreground">
              <span className="font-bold" style={{ color }}>
                {displayTag.name}
              </span>{' '}
              will be removed from{' '}
              {tasks.length > 0 ? (
                <span className="font-bold text-foreground">
                  {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
                </span>
              ) : (
                'your saved tags'
              )}
              . This can&rsquo;t be undone.
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
                  onDelete();
                }}
                className="h-12 rounded-2xl bg-rose-500 text-[14px] font-black uppercase tracking-wide text-white transition active:translate-y-[2px] hover:bg-rose-600"
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
