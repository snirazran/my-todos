'use client';

import React, { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { Palette, Trash2 } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { TAG_MAX_LENGTH } from './constants';
import {
  DANGER_BUTTON,
  FIELD_TILE,
  KitSection,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SHEET_TITLE,
  SwatchGrid,
  TagPillContent,
  tagPillProps,
} from './kit';
import { fetcher } from './utils';
import type { SavedTag } from './types';

type TagUsage = {
  tasks: { id: string; text: string; type: 'repeating' | 'once'; when: string }[];
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
  const usedIn = data?.tasks?.length ?? 0;

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
  const preview = tagPillProps({ color, selected: true, size: 'sm' });

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
              <div className="relative mb-4 flex h-9 items-center justify-center">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  aria-label="Delete tag"
                  title="Delete tag"
                  className="absolute left-0 grid h-9 w-9 place-items-center rounded-full text-muted-foreground/60 transition-colors hover:bg-rose-500/10 hover:text-rose-500"
                >
                  <Trash2 className="h-[18px] w-[18px]" />
                </button>
                <h2 className={SHEET_TITLE}>Edit tag</h2>
              </div>

              <label className={`mb-3 flex h-14 items-center gap-3 px-4 ${FIELD_TILE}`}>
                <span
                  aria-hidden
                  className="h-4 w-4 shrink-0 rounded-full shadow-[0_0_0_3px_hsl(var(--card))]"
                  style={{ backgroundColor: color }}
                />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={TAG_MAX_LENGTH}
                  placeholder="Tag name"
                  aria-label="Tag name"
                  className="h-full min-w-0 flex-1 bg-transparent text-[17px] font-black text-foreground outline-none placeholder:text-muted-foreground/60"
                />
                <span className="shrink-0 text-[11px] font-bold tabular-nums text-muted-foreground/70">
                  {name.length}/{TAG_MAX_LENGTH}
                </span>
              </label>

              <KitSection
                tint="violet"
                icon={<Palette className="h-3.5 w-3.5" strokeWidth={2.75} />}
                title="Color"
                className="mb-4"
                aside={
                  <span className={preview.className} style={preview.style}>
                    <TagPillContent
                      name={trimmed || 'Tag'}
                      color={color}
                      selected
                      maxWidth="max-w-[140px]"
                    />
                  </span>
                }
              >
                <SwatchGrid value={color} onChange={setColor} />
              </KitSection>
            </div>

            <div className="shrink-0 bg-background px-5 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-2">
              <button
                type="button"
                disabled={!dirty}
                onClick={() => onSave({ name: trimmed, color })}
                className={PRIMARY_BUTTON}
              >
                Save changes
              </button>
            </div>
          </>
        )}
      </BaseSheet>

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
              {usedIn > 0 ? (
                <span className="font-bold text-foreground">
                  {usedIn} {usedIn === 1 ? 'task' : 'tasks'}
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
                className={SECONDARY_BUTTON}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(false);
                  onDelete();
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
