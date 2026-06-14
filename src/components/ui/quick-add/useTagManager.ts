'use client';

import { useMemo, useState } from 'react';
import useSWR, { mutate } from 'swr';
import {
  DEFAULT_TAG_COLOR,
  FREE_TAG_LIMIT,
  PREMIUM_TAG_LIMIT,
} from './constants';
import { fetcher } from './utils';
import type { SavedTag } from './types';

type Options = {
  open: boolean;
  selectedTags: string[];
  setSelectedTags: React.Dispatch<React.SetStateAction<string[]>>;
  onPremiumLimit: () => void;
  /** Cap on how many tags can be selected at once (e.g. focus-area limit). */
  maxSelectedTags?: number;
  /** Called when a selection is blocked because the cap is reached. */
  onMaxSelectedTags?: () => void;
};

export function useTagManager({
  open,
  selectedTags,
  setSelectedTags,
  onPremiumLimit,
  maxSelectedTags,
  onMaxSelectedTags,
}: Options) {
  const { data: tagsData } = useSWR(open ? '/api/tags' : null, fetcher);
  const savedTags: SavedTag[] = tagsData?.tags || [];
  const isPremium: boolean = !!tagsData?.isPremium;
  const tagLimit = isPremium ? PREMIUM_TAG_LIMIT : FREE_TAG_LIMIT;

  // True when adding another selection would exceed the cap. Creating tags is
  // still allowed (governed by tagLimit) — only auto-selecting is blocked.
  const atSelectionLimit = () =>
    maxSelectedTags !== undefined && selectedTags.length >= maxSelectedTags;

  const [tagInput, setTagInput] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [newTagColor, setNewTagColor] = useState<string>(DEFAULT_TAG_COLOR);
  const [manageTagsMode, setManageTagsMode] = useState(false);
  const [isCreatingTag, setIsCreatingTag] = useState(false);

  const filteredTags = useMemo(() => {
    if (!tagInput) return savedTags;
    const lower = tagInput.toLowerCase();
    return savedTags.filter((st) => st.name.toLowerCase().includes(lower));
  }, [savedTags, tagInput]);

  const reset = () => {
    setTagInput('');
    setShowColorPicker(false);
    setManageTagsMode(false);
    setIsCreatingTag(false);
  };

  const getTagDetails = (tagId: string) =>
    savedTags.find((t) => t.id === tagId);

  const removeTag = (tagId: string) => {
    setSelectedTags((prev) => prev.filter((t) => t !== tagId));
  };

  const toggleTag = (tag: SavedTag) => {
    if (tag.disabled) {
      onPremiumLimit();
      return;
    }
    setSelectedTags((prev) =>
      prev.includes(tag.id) ? prev.filter((t) => t !== tag.id) : [...prev, tag.id],
    );
  };

  const createAndSaveTag = async (): Promise<string | undefined> => {
    if (isCreatingTag) return undefined;
    const trimmed = tagInput.trim();
    if (!trimmed) return undefined;

    if (savedTags.length >= tagLimit) {
      onPremiumLimit();
      return undefined;
    }

    setIsCreatingTag(true);
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, color: newTagColor }),
      });
      const data = await res.json();

      mutate('/api/tags');

      let selectedId: string | undefined;
      if (data.tag && !selectedTags.includes(data.tag.id)) {
        if (atSelectionLimit()) {
          onMaxSelectedTags?.();
        } else {
          setSelectedTags((prev) => [...prev, data.tag.id]);
          selectedId = data.tag.id;
        }
      }
      setShowColorPicker(false);
      setTagInput('');
      return selectedId;
    } catch (e) {
      console.error('Failed to save tag', e);
      return undefined;
    } finally {
      setIsCreatingTag(false);
    }
  };

  // One-tap create (used by the focus-category suggestion). Creates the tag with
  // the default color and selects it — or just selects it if it already exists.
  const quickCreateTag = async (name: string, color?: string) => {
    if (isCreatingTag) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    const existing = savedTags.find(
      (t) => t.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) {
      if (!selectedTags.includes(existing.id)) {
        if (atSelectionLimit()) {
          onMaxSelectedTags?.();
          return;
        }
        setSelectedTags((prev) => [...prev, existing.id]);
      }
      return;
    }

    if (atSelectionLimit()) {
      onMaxSelectedTags?.();
      return;
    }

    if (savedTags.length >= tagLimit) {
      onPremiumLimit();
      return;
    }

    setIsCreatingTag(true);
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, color: color ?? newTagColor }),
      });
      const data = await res.json();
      mutate('/api/tags');
      if (data.tag && !selectedTags.includes(data.tag.id)) {
        if (atSelectionLimit()) {
          onMaxSelectedTags?.();
        } else {
          setSelectedTags((prev) => [...prev, data.tag.id]);
        }
      }
      setShowColorPicker(false);
      setTagInput('');
    } catch (e) {
      console.error('Failed to save tag', e);
    } finally {
      setIsCreatingTag(false);
    }
  };

  const handleAddTag = () => {
    if (isCreatingTag) return;
    const trimmed = tagInput.trim();
    if (!trimmed) return;

    const existing = savedTags.find(
      (t) => t.name.toLowerCase() === trimmed.toLowerCase(),
    );

    if (existing) {
      if (!selectedTags.includes(existing.id)) {
        if (atSelectionLimit()) {
          onMaxSelectedTags?.();
          return;
        }
        setSelectedTags((prev) => [...prev, existing.id]);
      }
      setTagInput('');
      setShowColorPicker(false);
      return;
    }

    if (savedTags.length >= tagLimit) {
      onPremiumLimit();
      return;
    }

    if (showColorPicker) {
      createAndSaveTag();
    } else {
      setShowColorPicker(true);
    }
  };

  const updateTag = async (
    id: string,
    patch: { color?: string; name?: string },
  ) => {
    // Optimistic: apply to the cached tag list right away.
    const updatedTags = savedTags.map((t) =>
      t.id === id ? { ...t, ...patch } : t,
    );
    mutate('/api/tags', { ...tagsData, tags: updatedTags }, false);
    window.dispatchEvent(new Event('tags-updated'));
    try {
      await fetch('/api/tags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      });
      mutate('/api/tags');
    } catch (error) {
      console.error('Failed to update tag', error);
      mutate('/api/tags');
    }
  };

  const deleteSavedTag = async (id: string, _name: string, e: React.MouseEvent) => {
    e.stopPropagation();

    const updatedTags = savedTags.filter((t) => t.id !== id);
    mutate('/api/tags', { ...tagsData, tags: updatedTags }, false);
    setSelectedTags((prev) => prev.filter((tId) => tId !== id));
    window.dispatchEvent(new Event('tags-updated'));

    try {
      await fetch(`/api/tags?id=${id}`, { method: 'DELETE' });
      mutate('/api/tags');
    } catch (error) {
      console.error('Failed to delete tag', error);
      mutate('/api/tags');
    }
  };

  return {
    savedTags,
    filteredTags,
    isPremium,
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
    removeTag,
    toggleTag,
    getTagDetails,
    reset,
  };
}

export type TagManager = ReturnType<typeof useTagManager>;
