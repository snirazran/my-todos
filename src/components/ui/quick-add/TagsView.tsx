'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { Icon } from '@/components/ui/Icon';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Lock, Pencil, Plus, Sparkles } from 'lucide-react';
import { TAG_COLORS, TAG_MAX_LENGTH } from './constants';
import { fetcher } from './utils';
import type { SavedTag } from './types';
import type { TagManager } from './useTagManager';
import { TagManagerSheet } from './TagManagerSheet';

type QuestContext = {
  isPremium?: boolean;
  activeFocusCategoryId?: string | null;
  onboarding?: {
    selectedCategoryIds?: string[];
    categoryTagMap?: { categoryId: string; tagIds: string[] }[];
  };
  macroCategories?: {
    id: string;
    name: string;
    shortLabel?: string;
    accent?: string;
  }[];
};

type Props = {
  tagManager: TagManager;
  selectedTagIds: string[];
  setSelectedTagIds: React.Dispatch<React.SetStateAction<string[]>>;
  onPremiumLimit: () => void;
  onDone: (extraTagId?: string) => void;
  tagInputRef: React.RefObject<HTMLInputElement | null>;
  /** Max tags the user can have selected. When provided, toggling additional tags is blocked. */
  maxSelectedTags?: number;
  onMaxSelectedTags?: () => void;
  onBlockedTagToggle?: (tag: SavedTag) => boolean;
  /** Override the Done button label. */
  doneLabel?: string;
  /** When set, offers a one-tap chip to create/select a tag with this name. */
  suggestedTagName?: string;
  /** Tags currently connected to the active area quest. */
  questTagIds?: ReadonlySet<string>;
  /** Show the "connect to focus area" chips when creating a new tag. */
  showFocusConnect?: boolean;
};

export function TagsView({
  tagManager,
  selectedTagIds,
  setSelectedTagIds,
  onPremiumLimit,
  onDone,
  tagInputRef,
  maxSelectedTags,
  onMaxSelectedTags,
  onBlockedTagToggle,
  doneLabel = 'Done',
  suggestedTagName,
  questTagIds,
  showFocusConnect = true,
}: Props) {
  const {
    savedTags,
    filteredTags,
    tagLimit,
    tagInput,
    setTagInput,
    showColorPicker,
    setShowColorPicker,
    newTagColor,
    setNewTagColor,
    manageTagsMode,
    setManageTagsMode,
    isCreatingTag,
    handleAddTag,
    createAndSaveTag,
    quickCreateTag,
    deleteSavedTag,
    updateTag,
    toggleTag,
  } = tagManager;

  const placeholder = 'Add a tag';

  // True while the user is typing a brand-new tag (colour picker auto-opened by
  // the input's onChange). Drives the bottom button's "Create" label/action.
  const isCreatingNewTag = showColorPicker && !!tagInput.trim();

  const tz =
    typeof window !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'UTC';
  const questKey = `/api/quests?view=home&timezone=${encodeURIComponent(tz)}`;
  const { data: questContext, mutate: mutateQuests } = useSWR<QuestContext>(
    showFocusConnect ? questKey : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const isPremium = !!questContext?.isPremium;
  const activeFocusCategoryId = questContext?.activeFocusCategoryId ?? null;
  const focusAreas = useMemo(() => {
    const categories = questContext?.macroCategories ?? [];
    const selected = questContext?.onboarding?.selectedCategoryIds ?? [];
    return selected
      .map((id) => categories.find((entry) => entry.id === id))
      .filter((entry): entry is NonNullable<typeof entry> => !!entry);
  }, [questContext]);
  const categoryTagMap = questContext?.onboarding?.categoryTagMap ?? [];

  const [newTagAreaId, setNewTagAreaId] = useState<string | null>(null);
  useEffect(() => {
    if (!showColorPicker) setNewTagAreaId(null);
  }, [showColorPicker]);

  const newTagAreaOccupant = useMemo(() => {
    if (!newTagAreaId) return null;
    const occupiedId = categoryTagMap.find(
      (entry) => entry.categoryId === newTagAreaId,
    )?.tagIds[0];
    if (!occupiedId) return null;
    return savedTags.find((t) => t.id === occupiedId) ?? null;
  }, [newTagAreaId, categoryTagMap, savedTags]);

  const connectTagToArea = async (tagId: string, areaId: string) => {
    const onboarding = questContext?.onboarding;
    if (!onboarding?.selectedCategoryIds?.length) return;
    const nextMap = (onboarding.categoryTagMap ?? [])
      .map((entry) => ({
        categoryId: entry.categoryId,
        tagIds: entry.tagIds.filter((id) => id !== tagId),
      }))
      .filter((entry) => entry.tagIds.length > 0 && entry.categoryId !== areaId);
    const existing =
      (onboarding.categoryTagMap ?? [])
        .find((entry) => entry.categoryId === areaId)
        ?.tagIds.filter((id) => id !== tagId) ?? [];
    nextMap.push({
      categoryId: areaId,
      tagIds: isPremium ? [...existing, tagId] : [tagId],
    });
    try {
      const res = await fetch('/api/quests/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedCategoryIds: onboarding.selectedCategoryIds,
          categoryTagMap: nextMap,
          createSuggestions: false,
          timezone: tz,
        }),
      });
      if (!res.ok) throw new Error('Focus connect failed');
      await mutateQuests();
      window.dispatchEvent(new Event('tags-updated'));
    } catch (error) {
      console.error('Failed to connect tag to focus area', error);
    }
  };

  const handleCreate = async () => {
    const areaId = newTagAreaId;
    const createdId = await createAndSaveTag();
    setNewTagAreaId(null);
    if (createdId && areaId) await connectTagToArea(createdId, areaId);
  };

  const submitTagInput = () => {
    if (isCreatingNewTag) {
      void handleCreate();
    } else {
      handleAddTag();
    }
  };

  const trimmedSuggestion = (suggestedTagName ?? '').trim();
  const suggestionExists = savedTags.some(
    (t) => t.name.toLowerCase() === trimmedSuggestion.toLowerCase(),
  );
  const showSuggestion =
    !!trimmedSuggestion &&
    !suggestionExists &&
    !showColorPicker &&
    !tagInput.trim();

  const handleQuickCreate = () => {
    // The hook enforces the selection cap (and surfaces onMaxSelectedTags).
    quickCreateTag(trimmedSuggestion);
  };

  // The tag being managed (color / rename / usage / delete).
  const [managedTag, setManagedTag] = useState<SavedTag | null>(null);

  // Long-press (or right-click) a tag to open its manager; a plain tap still
  // selects/deselects it.
  const lpTimer = useRef<number | null>(null);
  const lpFired = useRef(false);
  const lpStart = useRef<{ x: number; y: number } | null>(null);
  const cancelLongPress = () => {
    if (lpTimer.current !== null) {
      window.clearTimeout(lpTimer.current);
      lpTimer.current = null;
    }
    lpStart.current = null;
  };
  const startLongPress = (st: SavedTag, e: React.PointerEvent) => {
    lpFired.current = false;
    lpStart.current = { x: e.clientX, y: e.clientY };
    lpTimer.current = window.setTimeout(() => {
      lpFired.current = true;
      cancelLongPress();
      setManagedTag(st);
    }, 450);
  };
  const moveLongPress = (e: React.PointerEvent) => {
    if (!lpStart.current) return;
    if (
      Math.abs(e.clientX - lpStart.current.x) > 10 ||
      Math.abs(e.clientY - lpStart.current.y) > 10
    )
      cancelLongPress();
  };

  const handleToggle = (st: SavedTag) => {
    if (st.disabled) {
      onPremiumLimit();
      return;
    }
    const isSelected = selectedTagIds.includes(st.id);
    if (
      !isSelected &&
      maxSelectedTags !== undefined &&
      selectedTagIds.length >= maxSelectedTags
    ) {
      onMaxSelectedTags?.();
      return;
    }
    if (!isSelected && onBlockedTagToggle?.(st)) {
      return;
    }
    toggleTag(st);
  };

  const unlockedTags = filteredTags.filter((st) => !st.disabled);
  const lockedTags = filteredTags.filter((st) => st.disabled);
  const counterLabel =
    savedTags.length > tagLimit
      ? `${tagLimit} free · ${savedTags.length - tagLimit} locked`
      : `${savedTags.length}/${tagLimit}`;

  return (
    <div className="space-y-4">
      {savedTags.length > 0 && !showColorPicker && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
              Saved tags{' '}
              <span className="font-bold text-muted-foreground/60">
                {counterLabel}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setManageTagsMode(!manageTagsMode)}
              className={`inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[10px] font-black uppercase tracking-wide transition-colors ${
                manageTagsMode
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground [@media(hover:hover)]:hover:bg-muted [@media(hover:hover)]:hover:text-foreground'
              }`}
            >
              <Pencil className="h-3 w-3" strokeWidth={2.75} />
              {manageTagsMode ? 'Done' : 'Edit'}
            </button>
          </div>

          <div className="flex max-h-[46vh] flex-wrap content-start items-start gap-2.5 overflow-y-auto px-1 py-1.5">
            {unlockedTags.map((st) => {
              const isSelected = selectedTagIds.includes(st.id);
              const isQuestTag = questTagIds?.has(st.id) ?? false;
              return (
                <button
                  key={st.id}
                  type="button"
                  data-hint="tags-popup-tag"
                  data-tag-id={st.id}
                  onPointerDown={(e) => startLongPress(st, e)}
                  onPointerMove={moveLongPress}
                  onPointerUp={cancelLongPress}
                  onPointerLeave={cancelLongPress}
                  onPointerCancel={cancelLongPress}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    cancelLongPress();
                    setManagedTag(st);
                  }}
                  onClick={() => {
                    // Swallow the click that follows a long-press.
                    if (lpFired.current) {
                      lpFired.current = false;
                      return;
                    }
                    if (manageTagsMode) {
                      setManagedTag(st);
                      return;
                    }
                    handleToggle(st);
                  }}
                  className={`relative inline-flex max-w-full select-none items-center justify-center gap-1.5 rounded-2xl border py-2.5 text-[13px] font-black uppercase tracking-wider shadow-sm transition-all [@media(hover:hover)]:hover:opacity-75 active:scale-95 ${
                    isQuestTag ? 'pl-[58px] pr-4' : 'px-4'
                  } ${
                    isSelected && !manageTagsMode
                      ? 'ring-2 ring-offset-1 ring-offset-background'
                      : ''
                  }`}
                  style={{
                    backgroundColor: `${st.color}20`,
                    color: st.color,
                    borderColor: `${st.color}40`,
                    ...(isSelected && !manageTagsMode
                      ? ({ ['--tw-ring-color' as never]: st.color } as object)
                      : {}),
                  }}
                >
                  {isQuestTag && (
                    <span
                      className="pointer-events-none absolute left-1 top-1/2 grid h-12 w-11 -translate-y-1/2 -rotate-3 place-items-center rounded-[10px] border bg-background shadow-sm"
                      style={{ borderColor: `${st.color}40` }}
                    >
                      <Icon name="quests" className="h-7 w-7" />
                    </span>
                  )}
                  {isSelected && !manageTagsMode && (
                    <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3.5} />
                  )}
                  <span className="truncate">{st.name}</span>
                  {manageTagsMode && (
                    <Pencil
                      className="h-3 w-3 shrink-0 opacity-70"
                      strokeWidth={2.75}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {lockedTags.length > 0 && (
            <div className="mt-2">
              <div className="mb-1.5 flex items-center gap-1.5 px-1">
                <Lock
                  className="h-3 w-3 text-muted-foreground/60"
                  strokeWidth={2.75}
                />
                <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground/60">
                  Locked · unlock with Plus
                </span>
              </div>
              <div className="flex flex-wrap gap-2 px-1">
                {lockedTags.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => handleToggle(st)}
                    className="inline-flex max-w-full select-none items-center gap-1.5 rounded-2xl border border-dashed border-border bg-muted px-3.5 py-2 text-[12px] font-black uppercase tracking-wider text-muted-foreground/70 transition-all active:scale-95"
                  >
                    <span className="truncate">{st.name}</span>
                    <Lock className="h-3 w-3 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showSuggestion && (
        <button
          type="button"
          onClick={handleQuickCreate}
          disabled={isCreatingTag}
          className="inline-flex max-w-full items-center gap-1.5 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-[13px] font-extrabold text-primary transition-colors [@media(hover:hover)]:hover:bg-primary/10 active:scale-95 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5 shrink-0 stroke-[3]" />
          <span className="truncate">
            {isCreatingTag ? 'Creating...' : `Create “${trimmedSuggestion}” tag`}
          </span>
        </button>
      )}

      <AnimatePresence>
        {showColorPicker && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                  New tag
                </span>
                <span
                  className="inline-flex max-w-[180px] items-center justify-center rounded-2xl border px-4 py-2.5 text-[13px] font-black uppercase tracking-wider shadow-sm"
                  style={{
                    backgroundColor: `${newTagColor}20`,
                    borderColor: `${newTagColor}40`,
                    color: newTagColor,
                  }}
                >
                  <span className="truncate">{tagInput.trim() || 'Preview'}</span>
                </span>
              </div>
              <div className="mb-3 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                Pick a color
              </div>
              <div className="flex flex-wrap gap-2.5">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => setNewTagColor(c.value)}
                    className={`h-9 w-9 rounded-full ${c.bg} ring-2 ring-offset-2 ring-offset-background transition-transform active:scale-95 ${
                      newTagColor === c.value
                        ? 'scale-110 ring-primary'
                        : 'ring-transparent'
                    }`}
                    title={c.name}
                  />
                ))}
              </div>

              {showFocusConnect && focusAreas.length > 0 && (
                <div className="mt-4 border-t border-border/60 pt-3.5">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                      <Sparkles className="h-3.5 w-3.5" />
                      Connect to focus area
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground/60">
                      Optional
                    </span>
                  </div>
                  <p className="mb-2.5 text-[12px] font-medium leading-snug text-muted-foreground">
                    Tasks with this tag will count toward that area&rsquo;s
                    quest.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {focusAreas.map((area) => {
                      const isPicked = newTagAreaId === area.id;
                      const isActiveFocus =
                        !isPremium && activeFocusCategoryId === area.id;
                      const accent = area.accent || '#22c55e';
                      const occupied =
                        !isPremium &&
                        (categoryTagMap.find(
                          (entry) => entry.categoryId === area.id,
                        )?.tagIds.length ?? 0) > 0;
                      return (
                        <button
                          key={area.id}
                          type="button"
                          onClick={() =>
                            setNewTagAreaId(isPicked ? null : area.id)
                          }
                          className={`inline-flex h-10 items-center gap-1.5 rounded-2xl border px-3 text-[12px] font-black uppercase tracking-wider transition-all active:scale-95 ${
                            isPicked
                              ? 'ring-2 ring-offset-1 ring-offset-background'
                              : ''
                          }`}
                          style={{
                            backgroundColor: `${accent}${isPicked ? '2b' : '14'}`,
                            borderColor: `${accent}40`,
                            color: accent,
                            ...(isPicked
                              ? ({
                                  ['--tw-ring-color' as never]: accent,
                                } as object)
                              : {}),
                          }}
                        >
                          {isPicked ? (
                            <Check className="h-3.5 w-3.5" strokeWidth={3.5} />
                          ) : occupied ? (
                            <Lock
                              className="h-3 w-3 opacity-70"
                              strokeWidth={2.75}
                            />
                          ) : null}
                          <span className="truncate">{area.name}</span>
                          {isActiveFocus && (
                            <span
                              className="rounded-md px-1.5 py-0.5 text-[8px] font-black tracking-[0.14em] text-white"
                              style={{ backgroundColor: accent }}
                            >
                              ACTIVE
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {!isPremium && newTagAreaOccupant && (
                    <button
                      type="button"
                      onClick={onPremiumLimit}
                      className="mt-2.5 inline-flex items-center gap-1.5 rounded-xl bg-amber-400/10 px-3 py-2 text-left text-[11px] font-bold leading-snug text-amber-700 transition-colors hover:bg-amber-400/20 dark:text-amber-300"
                    >
                      <Lock className="h-3.5 w-3.5 shrink-0" strokeWidth={2.75} />
                      <span>
                        Replaces{' '}
                        <span style={{ color: newTagAreaOccupant.color }}>
                          {newTagAreaOccupant.name}
                        </span>{' '}
                        — free plan connects 1 tag per area.{' '}
                        <span className="underline underline-offset-2">
                          Keep both with Plus
                        </span>
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add a tag — kept near the bottom (above Done) so it's within thumb
          reach on mobile, instead of being the top-most element. */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Icon name="filter" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2" />
          <input
            ref={tagInputRef}
            value={tagInput}
            onChange={(e) => {
              const value = e.target.value;
              setTagInput(value);
              // As soon as the text is a brand-new tag (no saved tag matches
              // it), open the colour picker so the bottom button becomes
              // "Create". Close it again while empty or while it matches.
              const trimmed = value.trim().toLowerCase();
              const matchesExisting = savedTags.some((st) =>
                st.name.toLowerCase().includes(trimmed),
              );
              setShowColorPicker(!!trimmed && !matchesExisting);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitTagInput();
              }
            }}
            maxLength={TAG_MAX_LENGTH}
            placeholder={placeholder}
            className="h-12 w-full rounded-2xl border border-border bg-background pl-9 pr-3 text-base font-bold text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <button
          type="button"
          onClick={submitTagInput}
          disabled={!tagInput}
          aria-label={showColorPicker ? 'Pick color' : 'Add tag'}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground transition-all hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:active:scale-100"
        >
          <Plus className="h-5 w-5 stroke-[3]" />
        </button>
      </div>

      <button
        type="button"
        onClick={async () => {
          // Writing a brand-new tag → the button creates + selects it (with the
          // chosen colour, connected to the picked focus area) and stays open
          // so the user can keep going / press Done.
          if (isCreatingNewTag) {
            await handleCreate();
          } else {
            onDone();
          }
        }}
        disabled={isCreatingTag}
        className="h-12 w-full rounded-2xl bg-primary text-[15px] font-extrabold text-primary-foreground transition-transform active:scale-[0.985] disabled:opacity-50"
      >
        {isCreatingTag
          ? 'Saving...'
          : isCreatingNewTag
            ? `Create “${tagInput.trim()}”`
            : `${doneLabel}${
                selectedTagIds.length > 0
                  ? ` (${selectedTagIds.length} tag${selectedTagIds.length === 1 ? '' : 's'})`
                  : ''
              }`}
      </button>

      <TagManagerSheet
        open={!!managedTag}
        tag={managedTag}
        onClose={() => setManagedTag(null)}
        onSave={(updates) => {
          if (managedTag) updateTag(managedTag.id, updates);
          setManagedTag(null);
        }}
        onDelete={() => {
          if (managedTag) {
            deleteSavedTag(
              managedTag.id,
              managedTag.name,
              { stopPropagation() {} } as React.MouseEvent,
            );
          }
          setManagedTag(null);
        }}
      />
    </div>
  );
}
