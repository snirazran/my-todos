'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/ui/Icon';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  Lock,
  Palette,
  Pencil,
  Plus,
  X,
} from 'lucide-react';
import { TAG_COLORS, TAG_MAX_LENGTH } from './constants';
import type { SavedTag } from './types';
import type { TagManager } from './useTagManager';

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
    toggleTag,
  } = tagManager;

  const placeholder = 'Add a tag';

  const trimmedSuggestion = (suggestedTagName ?? '').trim();
  const suggestionExists = savedTags.some(
    (t) => t.name.toLowerCase() === trimmedSuggestion.toLowerCase(),
  );
  const showSuggestion =
    !!trimmedSuggestion &&
    !suggestionExists &&
    !showColorPicker &&
    !manageTagsMode &&
    !tagInput.trim();

  const handleQuickCreate = () => {
    // The hook enforces the selection cap (and surfaces onMaxSelectedTags).
    quickCreateTag(trimmedSuggestion);
  };

  const [pendingDelete, setPendingDelete] = useState<SavedTag | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => setPortalReady(true), []);

  const confirmDelete = (e: React.MouseEvent | React.PointerEvent) => {
    if (!pendingDelete) return;
    deleteSavedTag(pendingDelete.id, pendingDelete.name, e as React.MouseEvent);
    setPendingDelete(null);
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

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Icon name="filter" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2" />
            <input
              ref={tagInputRef}
              value={tagInput}
              onChange={(e) => {
                setTagInput(e.target.value);
                setShowColorPicker(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAddTag();
                }
              }}
              maxLength={TAG_MAX_LENGTH}
              placeholder={placeholder}
              className="h-12 w-full rounded-2xl border border-border bg-background pl-9 pr-3 text-base font-bold text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <button
            type="button"
            onClick={handleAddTag}
            disabled={!tagInput}
            aria-label={showColorPicker ? 'Pick color' : 'Add tag'}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground transition-all hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:active:scale-100"
          >
            {showColorPicker ? (
              <Palette className="h-5 w-5 stroke-[2.5]" />
            ) : (
              <Plus className="h-5 w-5 stroke-[3]" />
            )}
          </button>
        </div>

        {showSuggestion && (
          <button
            type="button"
            onClick={handleQuickCreate}
            disabled={isCreatingTag}
            className="mb-3 inline-flex max-w-full items-center gap-1.5 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-3 py-1.5 text-[12px] font-extrabold text-primary transition-colors [@media(hover:hover)]:hover:bg-primary/10 active:scale-95 disabled:opacity-50"
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
              <div className="mb-4 rounded-2xl border border-border bg-muted/20 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                    New tag
                  </span>
                  <span
                    className="inline-flex max-w-[180px] items-center justify-center rounded-xl border px-3 py-1.5 text-[11px] font-black uppercase tracking-wider shadow-sm"
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
                <div className="mb-4 flex flex-wrap gap-2.5">
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
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {savedTags.length > 0 && !showColorPicker && (
          <>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                Saved Tags ({savedTags.length}/{tagLimit})
              </span>
              <button
                type="button"
                onClick={() => setManageTagsMode(!manageTagsMode)}
                className={`grid h-7 w-7 place-items-center rounded-lg transition-colors ${
                  manageTagsMode
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
                title={manageTagsMode ? 'Done editing' : 'Manage tags'}
              >
                {manageTagsMode ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Pencil className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            <div className="flex max-h-[220px] flex-wrap content-start items-start gap-2 overflow-y-auto px-1 py-1.5">
              {filteredTags.map((st) => {
                const isSelected = selectedTagIds.includes(st.id);
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={(e) => {
                      if (manageTagsMode) {
                        e.stopPropagation();
                        setPendingDelete(st);
                        return;
                      }
                      handleToggle(st);
                    }}
                    className={`relative inline-flex max-w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-black uppercase tracking-wider shadow-sm transition-all [@media(hover:hover)]:hover:opacity-75 active:scale-95 ${
                      isSelected
                        ? 'ring-2 ring-offset-1 ring-offset-background'
                        : st.disabled
                          ? 'cursor-pointer border-dashed opacity-60 grayscale'
                          : ''
                    } ${manageTagsMode ? 'text-rose-500' : ''}`}
                    style={{
                      backgroundColor: manageTagsMode ? undefined : `${st.color}20`,
                      color: manageTagsMode ? '#ef4444' : st.color,
                      borderColor: manageTagsMode
                        ? '#ef4444'
                        : isSelected
                          ? `${st.color}40`
                          : `${st.color}40`,
                    }}
                  >
                    <span className="truncate">{st.name}</span>
                    {st.disabled && (
                      <Lock className="h-3 w-3 shrink-0" />
                    )}
                    {manageTagsMode && (
                      <span className="absolute -left-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full bg-rose-500 text-white">
                        <X className="h-2.5 w-2.5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={async () => {
          // If the user is mid-creation (color picker open with a name typed),
          // create + select that tag first, then finish.
          if (showColorPicker && tagInput.trim()) {
            const newId = await createAndSaveTag();
            onDone(newId);
          } else {
            onDone();
          }
        }}
        disabled={isCreatingTag}
        className="h-12 w-full rounded-2xl bg-primary text-[15px] font-extrabold text-primary-foreground transition-transform active:scale-[0.985] disabled:opacity-50"
      >
        {isCreatingTag ? 'Saving...' : doneLabel}
        {!isCreatingTag && selectedTagIds.length > 0
          ? ` (${selectedTagIds.length} tag${selectedTagIds.length === 1 ? '' : 's'})`
          : ''}
      </button>

      {portalReady &&
        createPortal(
          <AnimatePresence>
            {pendingDelete && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setPendingDelete(null)}
                  className="fixed inset-0 z-[1510] bg-black/45"
                />
                <div className="fixed inset-0 z-[1511] flex items-center justify-center p-4 pointer-events-none">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.18 }}
                    className="pointer-events-auto w-full max-w-[360px] rounded-2xl bg-background p-5 shadow-xl ring-1 ring-border/70"
                    role="alertdialog"
                    aria-modal="true"
                  >
                    <h3 className="mb-1 text-[16px] font-extrabold text-foreground">
                      Delete tag?
                    </h3>
                    <p className="mb-4 text-[13px] text-muted-foreground">
                      Remove{' '}
                      <span
                        className="font-bold"
                        style={{ color: pendingDelete.color }}
                      >
                        {pendingDelete.name}
                      </span>{' '}
                      from your saved tags. This can't be undone.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPendingDelete(null)}
                        className="h-10 rounded-xl bg-muted text-[13px] font-extrabold text-foreground transition-colors hover:bg-muted/70"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={confirmDelete}
                        className="h-10 rounded-xl bg-rose-500 text-[13px] font-extrabold text-white transition-colors hover:bg-rose-600"
                      >
                        Delete
                      </button>
                    </div>
                  </motion.div>
                </div>
              </>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
