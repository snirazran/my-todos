'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { Check, Compass, Pencil, Plus, Tag as TagIcon } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import TagsPopup from '@/components/ui/TagsPopup';
import { fetcher } from '@/components/ui/quick-add/utils';
import type {
  FocusCategoryTagMap,
  MacroCategoryDefinition,
  MacroCategoryId,
} from '@/lib/quests/types';
import { cn } from '@/lib/utils';

type UserTag = { id: string; name: string; color: string };

export function QuestOnboardingPopup({
  show,
  isCompleted = false,
  initialSelectedCategoryIds,
  initialCategoryTagMap,
  categories,
  isPremium,
  onCompleted,
  onClose,
}: {
  show: boolean;
  isCompleted?: boolean;
  initialSelectedCategoryIds: MacroCategoryId[];
  initialCategoryTagMap?: FocusCategoryTagMap[];
  categories: MacroCategoryDefinition[];
  isPremium?: boolean;
  onCompleted: () => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<MacroCategoryId[]>(
    initialSelectedCategoryIds,
  );
  const [categoryTagMap, setCategoryTagMap] = useState<FocusCategoryTagMap[]>(
    initialCategoryTagMap ?? [],
  );
  const [editingCategoryId, setEditingCategoryId] =
    useState<MacroCategoryId | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Seed from the server only as the sheet opens. Re-seeding on every prop
  // identity change would throw away edits the moment SWR revalidates.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (show && !wasOpenRef.current) {
      setSelectedCategoryIds(initialSelectedCategoryIds);
      setCategoryTagMap(initialCategoryTagMap ?? []);
      setEditingCategoryId(null);
      setError(null);
    }
    wasOpenRef.current = show;
  }, [initialSelectedCategoryIds, initialCategoryTagMap, show]);

  // Same SWR key the tag picker uses, so a tag created in there is named here
  // straight away instead of after the next quests refetch.
  const { data: tagsData } = useSWR(show ? '/api/tags' : null, fetcher);
  const tagById = useMemo(
    () =>
      new Map<string, UserTag>(
        ((tagsData?.tags ?? []) as UserTag[]).map((tag) => [tag.id, tag]),
      ),
    [tagsData],
  );

  const tagIdsFor = (categoryId: MacroCategoryId) =>
    categoryTagMap.find((entry) => entry.categoryId === categoryId)?.tagIds ?? [];

  // A tag belongs to one area at a time, so the picker can warn before moving
  // one that is already spoken for.
  const tagAssignments = useMemo(() => {
    const assignments: Record<
      string,
      { categoryId: string; categoryName: string }
    > = {};
    for (const entry of categoryTagMap) {
      const category = categories.find((c) => c.id === entry.categoryId);
      for (const tagId of entry.tagIds) {
        assignments[tagId] = {
          categoryId: entry.categoryId,
          categoryName: category?.shortLabel || category?.name || 'another area',
        };
      }
    }
    return assignments;
  }, [categoryTagMap, categories]);

  const toggleCategory = (categoryId: MacroCategoryId) => {
    setError(null);
    setSelectedCategoryIds((prev) =>
      prev.includes(categoryId)
        ? prev.filter((entry) => entry !== categoryId)
        : [...prev, categoryId],
    );
  };

  // Local only — the whole map is persisted with the areas on save, so a
  // cancelled sheet leaves nothing half-applied.
  const saveTagsForCategory = (categoryId: MacroCategoryId, nextTags: string[]) => {
    const limited = isPremium ? nextTags : nextTags.slice(0, 1);
    const claimed = new Set(limited);
    setCategoryTagMap((prev) => {
      const next = prev
        .filter((entry) => entry.categoryId !== categoryId)
        .map((entry) => ({
          ...entry,
          tagIds: entry.tagIds.filter((tagId) => !claimed.has(tagId)),
        }))
        .filter((entry) => entry.tagIds.length > 0);
      if (limited.length > 0) next.push({ categoryId, tagIds: limited });
      return next;
    });
    setEditingCategoryId(null);
  };

  const saveOnboarding = async () => {
    if (saving || selectedCategoryIds.length === 0) return;
    setSaving(true);
    setError(null);

    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const selected = new Set(selectedCategoryIds);
      const res = await fetch('/api/quests/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedCategoryIds,
          categoryTagMap: categoryTagMap.filter((entry) =>
            selected.has(entry.categoryId),
          ),
          createSuggestions: false,
          timezone,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || 'Could not save your quest focus');
      }
      onCompleted();
    } catch (err: any) {
      setError(err.message || 'Could not save your quest focus');
    } finally {
      setSaving(false);
    }
  };

  if (!mounted) return null;

  const count = selectedCategoryIds.length;
  const areaNoun = count === 1 ? 'area' : 'areas';
  const countLabel =
    count === 0 ? 'Pick at least 1 area' : `${count} ${areaNoun} selected`;
  const editingCategory = editingCategoryId
    ? categories.find((c) => c.id === editingCategoryId) ?? null
    : null;

  return (
    <>
    <BaseSheet
      open={show}
      onOpenChange={(v) => !v && onClose()}
      zIndex={1200}
      backdropClassName="backdrop-blur-sm"
      className="h-[90vh] bg-popover sm:h-auto sm:max-h-[85vh] sm:max-w-3xl"
    >
      {({ isDesktop, dragControls, bindScroll }) => (
        <>
            {/* Header (doubles as the drag handle on mobile) */}
            <div
              className="flex shrink-0 items-start justify-between gap-4 px-6 pb-4 pt-2 sm:px-8 sm:pt-7"
              style={!isDesktop ? { touchAction: 'none' } : undefined}
              onPointerDown={(event) => {
                if (!isDesktop) dragControls.start(event);
              }}
            >
              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                  <Compass className="h-3.5 w-3.5 text-primary" strokeWidth={2.75} />
                  Your areas
                </p>
                <h2 className="mt-1.5 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                  {isCompleted ? 'Update your focus' : 'Shape your quests'}
                </h2>
                <p className="mt-1.5 max-w-md text-[13px] font-medium leading-relaxed text-muted-foreground">
                  Pick the areas you want to work on, and the tag whose tasks
                  belong to each one.
                </p>
              </div>

            </div>

            {/* Categories */}
            <div
              ref={bindScroll}
              className="min-h-0 flex-1 overflow-y-auto overscroll-none px-6 pb-6 pt-2 sm:px-8"
            >
              <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 sm:gap-4">
                {categories.map((category) => {
                  const selected = selectedCategoryIds.includes(category.id);
                  const linkedTags = tagIdsFor(category.id)
                    .map((tagId) => tagById.get(tagId))
                    .filter(Boolean) as UserTag[];

                  return (
                    <div
                      key={category.id}
                      className={cn(
                        'group flex flex-col overflow-hidden rounded-[24px] border bg-card text-left shadow-sm transition-all duration-200',
                        selected
                          ? 'border-primary ring-2 ring-primary'
                          : 'border-border/50 [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-md',
                      )}
                    >
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleCategory(category.id)}
                        className="flex flex-1 flex-col text-left active:scale-[0.98]"
                      >
                        <div className="relative h-28 w-full shrink-0 overflow-hidden">
                          {category.coverImageUrl ? (
                            <img
                              src={category.coverImageUrl}
                              alt=""
                              className="h-full w-full object-cover transition duration-500 [@media(hover:hover)]:group-hover:scale-105"
                            />
                          ) : (
                            <div
                              className="h-full w-full"
                              style={{
                                background: `linear-gradient(135deg, ${category.backgroundFrom}, ${category.backgroundTo})`,
                              }}
                            />
                          )}
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/50 to-transparent" />
                          <span
                            className="absolute bottom-2 left-3 right-3 truncate uppercase leading-none tracking-wide text-white drop-shadow-[0_3px_0_rgba(15,23,42,0.9)] text-[clamp(0.9375rem,calc(0.5rem_+_2vw),1.125rem)]"
                            style={{
                              fontFamily: 'var(--font-display), "Luckiest Guy", cursive',
                              WebkitTextStroke: '1.5px rgba(15, 23, 42, 0.95)',
                              paintOrder: 'stroke fill',
                            }}
                          >
                            {category.name}
                          </span>
                          <div
                            className={cn(
                              'absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full border-2 backdrop-blur-md transition-all',
                              selected
                                ? 'border-white bg-primary text-white'
                                : 'border-white/70 bg-black/25 text-white/80',
                            )}
                            aria-hidden
                          >
                            {selected ? (
                              <Check className="h-4 w-4 stroke-[3]" />
                            ) : (
                              <Plus className="h-4 w-4 stroke-[3]" />
                            )}
                          </div>
                        </div>
                        <div className="flex flex-1 items-start px-3 py-2.5">
                          <p className="line-clamp-2 text-[11px] font-bold leading-snug text-muted-foreground">
                            {category.onboardingSentence || category.description}
                          </p>
                        </div>
                      </button>

                      {/* The tag whose tasks count for this area. Only a picked
                          area has anything to connect, so the row hides until
                          then. */}
                      {selected && (
                        <button
                          type="button"
                          aria-label={
                            linkedTags.length > 0
                              ? `Change the tag connected to ${category.name}`
                              : `Connect a tag to ${category.name}`
                          }
                          onClick={() => setEditingCategoryId(category.id)}
                          className={cn(
                            'group/tag flex w-full items-center justify-between gap-2 border-t px-3 py-2.5 text-left transition-colors',
                            linkedTags.length > 0
                              ? 'border-border/50 [@media(hover:hover)]:hover:bg-muted/60'
                              : 'border-primary/25 bg-primary/[0.06] [@media(hover:hover)]:hover:bg-primary/10',
                          )}
                        >
                          {linkedTags.length > 0 ? (
                            <span className="flex min-w-0 flex-wrap items-center gap-1">
                              {linkedTags.map((tag) => (
                                <span
                                  key={tag.id}
                                  className="max-w-full truncate rounded-lg border px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider"
                                  style={{
                                    backgroundColor: `${tag.color}20`,
                                    color: tag.color,
                                    borderColor: `${tag.color}40`,
                                  }}
                                >
                                  {tag.name}
                                </span>
                              ))}
                            </span>
                          ) : (
                            <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-primary">
                              <TagIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.75} />
                              Connect a tag
                            </span>
                          )}
                          <span
                            aria-hidden
                            className={cn(
                              'grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors',
                              linkedTags.length > 0
                                ? 'border-border/60 bg-muted/60 text-muted-foreground [@media(hover:hover)]:group-hover/tag:border-primary/40 [@media(hover:hover)]:group-hover/tag:text-primary'
                                : 'border-primary/30 bg-primary/10 text-primary',
                            )}
                          >
                            <Pencil className="h-3 w-3" strokeWidth={2.75} />
                          </span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {categories.length === 0 && (
                <div className="rounded-2xl border border-dashed border-border/60 px-5 py-10 text-center text-sm text-muted-foreground">
                  No areas are available yet.
                </div>
              )}

              {error && (
                <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-border/60 bg-popover px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-8">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold text-muted-foreground">
                  {countLabel}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex h-11 items-center justify-center rounded-2xl px-4 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {isCompleted ? 'Keep current' : 'Later'}
                  </button>
                  <button
                    type="button"
                    onClick={saveOnboarding}
                    disabled={saving || count === 0}
                    className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-6 text-sm font-black text-primary-foreground shadow-[0_4px_0_0_rgba(0,0,0,0.18)] transition-all active:translate-y-1 active:shadow-none disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0 disabled:active:shadow-[0_4px_0_0_rgba(0,0,0,0.18)]"
                  >
                    {saving
                      ? 'Saving...'
                      : isCompleted
                        ? 'Save changes'
                        : 'Save focus'}
                  </button>
                </div>
              </div>
            </div>
        </>
      )}
    </BaseSheet>

    <TagsPopup
      open={editingCategoryId !== null}
      taskId={editingCategoryId}
      onClose={() => setEditingCategoryId(null)}
      title={
        editingCategory ? `Pick a tag for ${editingCategory.name}` : 'Pick a tag'
      }
      description={
        isPremium
          ? 'Tasks with these tags count toward this area.'
          : 'Tasks with this tag count toward this area.'
      }
      initialTags={editingCategoryId ? tagIdsFor(editingCategoryId) : []}
      maxSelectedTags={isPremium ? undefined : 1}
      currentFocusCategoryId={editingCategoryId ?? undefined}
      tagAssignments={tagAssignments}
      suggestedTagName={editingCategory?.name}
      saveLabel="Connect"
      onSave={(categoryId, newTags) =>
        saveTagsForCategory(categoryId as MacroCategoryId, newTags)
      }
    />
    </>
  );
}
