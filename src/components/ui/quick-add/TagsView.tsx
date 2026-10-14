'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { Icon } from '@/components/ui/Icon';
import { AnimatePresence, motion } from 'framer-motion';
import { Lock, Pencil, Plus, Sparkles, Tag } from 'lucide-react';
import { TAG_MAX_LENGTH } from './constants';
import {
  AreaOption,
  FIELD_TILE,
  KitSection,
  PRIMARY_BUTTON,
  Squircle,
  SwatchGrid,
  TagPillContent,
  tagPillProps,
} from './kit';
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
  /** Show the "connect to focus area" chips when creating a new tag. */
  showFocusConnect?: boolean;
  /**
   * Multi-task editing: tags carried by only *some* of the tasks. They render
   * selected-but-dashed instead of checked, so "on all of them" and "on a few
   * of them" never look the same.
   */
  partialTagIds?: ReadonlySet<string>;
  /** Replaces the Done button's default " (N tags)" suffix. */
  doneCountLabel?: string;
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
  showFocusConnect = true,
  partialTagIds,
  doneCountLabel,
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
          <div className="mb-2 flex h-9 items-center gap-2">
            <Squircle tint="violet" size="sm">
              <Tag className="h-3.5 w-3.5" strokeWidth={2.75} />
            </Squircle>
            <span className="text-[14px] font-black text-foreground">Your tags</span>
            <span className="text-[12px] font-bold tabular-nums text-muted-foreground">
              {counterLabel}
            </span>
            <button
              type="button"
              onClick={() => setManageTagsMode(!manageTagsMode)}
              aria-pressed={manageTagsMode}
              className={`ml-auto inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-black transition-colors ${
                manageTagsMode
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted/60 text-muted-foreground [@media(hover:hover)]:hover:bg-muted [@media(hover:hover)]:hover:text-foreground'
              }`}
            >
              <Pencil className="h-3 w-3" strokeWidth={2.75} />
              {manageTagsMode ? 'Done' : 'Edit'}
            </button>
          </div>

          <div className="flex max-h-[46vh] flex-wrap content-start items-start gap-2 overflow-y-auto py-0.5">
            {unlockedTags.map((st) => {
              const isSelected = selectedTagIds.includes(st.id) && !manageTagsMode;
              const isPartial = isSelected && !!partialTagIds?.has(st.id);
              const pill = tagPillProps({
                color: st.color,
                selected: isSelected && !isPartial,
                partial: isPartial,
              });
              return (
                <button
                  key={st.id}
                  type="button"
                  data-hint="tags-popup-tag"
                  data-tag-id={st.id}
                  aria-pressed={isSelected}
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
                  className={pill.className}
                  style={pill.style}
                >
                  <TagPillContent
                    name={st.name}
                    color={st.color}
                    selected={isSelected && !isPartial}
                    partial={isPartial}
                    maxWidth="max-w-[200px]"
                    trailing={
                      manageTagsMode ? (
                        <Pencil className="h-3 w-3 shrink-0 opacity-60" strokeWidth={2.75} />
                      ) : undefined
                    }
                  />
                </button>
              );
            })}
          </div>

          {lockedTags.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                onClick={onPremiumLimit}
                className="mb-2 inline-flex items-center gap-1.5 rounded-full text-[12.5px] font-black text-muted-foreground transition-colors [@media(hover:hover)]:hover:text-foreground"
              >
                <Lock className="h-3 w-3" strokeWidth={2.75} />
                Unlock with
                <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                  <Icon name="frogPlus" className="-my-1.5 h-7 w-7 shrink-0" />
                  Plus
                </span>
              </button>
              <div className="flex flex-wrap gap-2">
                {lockedTags.map((st) => {
                  const pill = tagPillProps({ color: st.color, locked: true });
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => handleToggle(st)}
                      className={pill.className}
                      style={pill.style}
                    >
                      <TagPillContent name={st.name} color={st.color} locked />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {showSuggestion && (() => {
        const pill = tagPillProps({ color: '#447d3f', suggest: true });
        return (
          <button
            type="button"
            onClick={handleQuickCreate}
            disabled={isCreatingTag}
            className={`${pill.className} disabled:opacity-50`}
            style={pill.style}
          >
            <TagPillContent
              name={isCreatingTag ? 'Creating…' : `Create “${trimmedSuggestion}”`}
              color="#447d3f"
              suggest
              maxWidth="max-w-[240px]"
            />
          </button>
        );
      })()}

      <AnimatePresence>
        {showColorPicker && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <KitSection
              tint="violet"
              icon={<Plus className="h-3.5 w-3.5" strokeWidth={3} />}
              title="New tag"
              aside={(() => {
                const pill = tagPillProps({ color: newTagColor, selected: true, size: 'sm' });
                return (
                  <span className={pill.className} style={pill.style}>
                    <TagPillContent
                      name={tagInput.trim() || 'Preview'}
                      color={newTagColor}
                      selected
                      maxWidth="max-w-[150px]"
                    />
                  </span>
                );
              })()}
            >
              <SwatchGrid value={newTagColor} onChange={setNewTagColor} />

              {showFocusConnect && focusAreas.length > 0 && (
                <div className="px-1 pb-1 pt-3">
                  <div className="mb-1 flex items-center gap-1.5 text-[13px] font-black text-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" strokeWidth={2.75} />
                    Count toward a focus area
                    <span className="ml-auto text-[12px] font-bold text-muted-foreground">
                      Optional
                    </span>
                  </div>
                  <p className="mb-2.5 text-[12px] font-semibold leading-snug text-muted-foreground">
                    Tasks with this tag will count toward that area&rsquo;s quest.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {focusAreas.map((area) => {
                      const isPicked = newTagAreaId === area.id;
                      const occupied =
                        !isPremium &&
                        (categoryTagMap.find((entry) => entry.categoryId === area.id)
                          ?.tagIds.length ?? 0) > 0;
                      return (
                        <AreaOption
                          key={area.id}
                          label={area.name}
                          accent={area.accent}
                          picked={isPicked}
                          locked={occupied}
                          badge={
                            !isPremium && activeFocusCategoryId === area.id
                              ? 'ACTIVE'
                              : undefined
                          }
                          onClick={() => setNewTagAreaId(isPicked ? null : area.id)}
                        />
                      );
                    })}
                  </div>
                  {!isPremium && newTagAreaOccupant && (
                    <button
                      type="button"
                      onClick={onPremiumLimit}
                      className="mt-2.5 inline-flex items-center gap-1.5 rounded-xl bg-amber-400/10 px-3 py-2 text-left text-[11.5px] font-bold leading-snug text-amber-700 transition-colors hover:bg-amber-400/20 dark:text-amber-300"
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
            </KitSection>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`flex h-14 items-center gap-2 pl-2 pr-1.5 ${FIELD_TILE}`}>
        <Squircle tint="violet" size="lg">
          <Tag className="h-4 w-4" strokeWidth={2.5} />
        </Squircle>
        <input
          ref={tagInputRef}
          value={tagInput}
          onChange={(e) => {
            const value = e.target.value;
            setTagInput(value);
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
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] font-bold text-foreground outline-none placeholder:text-muted-foreground/70"
        />
        <button
          type="button"
          onClick={submitTagInput}
          disabled={!tagInput}
          aria-label={showColorPicker ? 'Create tag' : 'Add tag'}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#447d3f] text-white shadow-[0_3px_0_0_#2c511a] transition-all active:translate-y-[2px] active:shadow-none disabled:bg-muted disabled:text-muted-foreground/50 disabled:shadow-none"
        >
          <Plus className="h-5 w-5" strokeWidth={3} />
        </button>
      </div>

      <button
        type="button"
        onClick={async () => {
          if (isCreatingNewTag) {
            await handleCreate();
          } else {
            onDone();
          }
        }}
        disabled={isCreatingTag}
        className={PRIMARY_BUTTON}
      >
        {isCreatingTag
          ? 'Saving…'
          : isCreatingNewTag
            ? `Create “${tagInput.trim()}”`
            : `${doneLabel}${
                doneCountLabel !== undefined
                  ? doneCountLabel
                  : selectedTagIds.length > 0
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
