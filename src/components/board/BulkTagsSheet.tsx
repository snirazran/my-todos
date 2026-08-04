'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { TagsView } from '@/components/ui/quick-add/TagsView';
import { useTagManager } from '@/components/ui/quick-add/useTagManager';
import { PlusUpgradeModal } from '@/components/ui/PlusUpgradeModal';

/**
 * Bulk tag editor — the same sheet as the single-task one, with the multi-task
 * semantics layered on:
 *
 *  - a tag on *every* picked task shows checked;
 *  - a tag on only some of them shows dashed and, left alone, is written
 *    neither way;
 *  - the save is an add/remove delta, never a whole-array replace, so a tag the
 *    user never touched can't be wiped off the tasks that had it.
 */
export default function BulkTagsSheet({
  open,
  onClose,
  taskCount,
  /** Per-tag count of how many picked tasks already carry it. */
  counts,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  taskCount: number;
  counts: Record<string, number>;
  onSave: (delta: { add: string[]; remove: string[] }) => void;
}) {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showPremiumLimit, setShowPremiumLimit] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null!);

  const tagManager = useTagManager({
    open,
    selectedTags,
    setSelectedTags,
    onPremiumLimit: () => setShowPremiumLimit(true),
  });

  // Snapshotted on open so a background board refresh can't reshuffle the
  // chips (or the delta) while the sheet is being used.
  const [snapshot, setSnapshot] = useState<{
    full: Set<string>;
    partial: Set<string>;
    count: number;
  }>(() => ({ full: new Set(), partial: new Set(), count: 0 }));

  useEffect(() => {
    if (!open) return;
    const full = new Set<string>();
    const partial = new Set<string>();
    for (const [tagId, n] of Object.entries(counts)) {
      if (n <= 0) continue;
      if (n >= taskCount) full.add(tagId);
      else partial.add(tagId);
    }
    setSnapshot({ full, partial, count: taskCount });
    // Partial tags start selected (dashed) — that's what makes "leave it alone"
    // the no-op instead of an accidental removal.
    setSelectedTags([...Array.from(full), ...Array.from(partial)]);
    setTouched(new Set());
    tagManager.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // A partial tag the user actually clicked (off, then on again) means "put it
  // on all of them" — untouched partials stay untouched.
  const [touched, setTouched] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const prevSelectedRef = useRef<string[]>([]);
  useEffect(() => {
    const prev = prevSelectedRef.current;
    prevSelectedRef.current = selectedTags;
    if (!open) return;
    const changed = [
      ...prev.filter((id) => !selectedTags.includes(id)),
      ...selectedTags.filter((id) => !prev.includes(id)),
    ];
    if (changed.length === 0) return;
    setTouched((old) => {
      const next = new Set(old);
      for (const id of changed) next.add(id);
      return next;
    });
  }, [selectedTags, open]);

  const delta = useMemo(() => {
    const add: string[] = [];
    const remove: string[] = [];
    const selected = new Set(selectedTags);
    const seen = new Set([
      ...Array.from(snapshot.full),
      ...Array.from(snapshot.partial),
      ...selectedTags,
    ]);
    for (const id of Array.from(seen)) {
      const wasFull = snapshot.full.has(id);
      const wasPartial = snapshot.partial.has(id);
      if (selected.has(id)) {
        if (wasFull) continue;
        if (wasPartial && !touched.has(id)) continue;
        add.push(id);
      } else if (wasFull || wasPartial) {
        remove.push(id);
      }
    }
    return { add, remove };
  }, [selectedTags, snapshot, touched]);

  const dirty = delta.add.length > 0 || delta.remove.length > 0;
  const count = open ? taskCount : snapshot.count;
  const taskLabel = `${count} ${count === 1 ? 'task' : 'tasks'}`;

  return (
    <>
      <BaseSheet
        open={open}
        onOpenChange={(v) => !v && onClose()}
        zIndex={1500}
        className="bg-background ring-1 ring-border/70 sm:max-w-[560px] max-h-[92vh]"
      >
        {({ bindScroll }) => (
          <div
            ref={bindScroll}
            className="mx-auto min-h-0 w-full flex-1 touch-pan-y overflow-y-auto overscroll-contain px-5 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-1 sm:pb-8"
          >
            <div className="relative mb-5 flex h-9 items-center justify-center">
              <h2 className="text-[17px] font-black text-foreground">Tags</h2>
            </div>

            <p className="mb-3 text-center text-[13px] font-semibold text-muted-foreground">
              Editing {taskLabel}
              {snapshot.partial.size > 0 && ' · dashed tags are only on some'}
            </p>

            <TagsView
              tagManager={tagManager}
              selectedTagIds={selectedTags}
              setSelectedTagIds={setSelectedTags}
              onPremiumLimit={() => setShowPremiumLimit(true)}
              onDone={() => {
                if (dirty) onSave(delta);
                onClose();
              }}
              tagInputRef={tagInputRef}
              partialTagIds={snapshot.partial}
              doneLabel={dirty ? `Apply to ${taskLabel}` : 'Done'}
              doneCountLabel=""
              showFocusConnect={false}
            />
          </div>
        )}
      </BaseSheet>

      <PlusUpgradeModal
        open={showPremiumLimit}
        placement="focus_tag_limit"
        onClose={() => setShowPremiumLimit(false)}
      />
    </>
  );
}
