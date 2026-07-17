'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { Lock } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { TagsView } from './quick-add/TagsView';
import { useTagManager } from './quick-add/useTagManager';
import { PlusUpgradeModal } from './PlusUpgradeModal';
import type { SavedTag } from './quick-add/types';

interface Props {
  open: boolean;
  taskId: string | null;
  initialTags?: string[];
  onClose: () => void;
  onSave: (taskId: string, newTags: string[]) => Promise<void> | void;
  title?: string;
  description?: string;
  maxSelectedTags?: number;
  saveLabel?: string;
  currentFocusCategoryId?: string;
  tagAssignments?: Record<string, { categoryId: string; categoryName: string }>;
  focusTagLimitTitle?: string;
  focusTagLimitDescription?: string;
  /** Offer a one-tap chip to create/select a tag with this name. */
  suggestedTagName?: string;
}

export default function TagsPopup({
  open,
  taskId,
  initialTags,
  onClose,
  onSave,
  title = 'Tags',
  description,
  maxSelectedTags,
  saveLabel = 'Done',
  currentFocusCategoryId,
  tagAssignments,
  focusTagLimitTitle = 'Tag limit reached',
  focusTagLimitDescription = 'You can connect only one tag per focus area.',
  suggestedTagName,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showPremiumLimit, setShowPremiumLimit] = useState(false);
  const [showFocusTagLimit, setShowFocusTagLimit] = useState(false);
  const [pendingTagSwitch, setPendingTagSwitch] = useState<{
    tag: SavedTag;
    fromCategoryName: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null!);

  const tagManager = useTagManager({
    open,
    selectedTags,
    setSelectedTags,
    onPremiumLimit: () => setShowPremiumLimit(true),
    maxSelectedTags,
    onMaxSelectedTags: () => setShowFocusTagLimit(true),
  });

  const { data: questContext } = useSWR<{
    activeFocusCategoryId?: string | null;
    onboarding?: {
      selectedCategoryIds?: string[];
      categoryTagMap?: { categoryId: string; tagIds: string[] }[];
    };
  }>(
    open
      ? `/api/quests?view=home&timezone=${encodeURIComponent(
          Intl.DateTimeFormat().resolvedOptions().timeZone,
        )}`
      : null,
    (url: string) => fetch(url).then((res) => res.json()),
    { revalidateOnFocus: false },
  );

  const questTagIds = useMemo(() => {
    const tagMap = questContext?.onboarding?.categoryTagMap;
    const focusIds = questContext?.onboarding?.selectedCategoryIds;
    const activeFocusCategoryId = questContext?.activeFocusCategoryId ?? null;
    const ids = new Set<string>();
    for (const entry of tagMap ?? []) {
      if (focusIds && !focusIds.includes(entry.categoryId)) continue;
      if (activeFocusCategoryId && entry.categoryId !== activeFocusCategoryId) {
        continue;
      }
      for (const id of entry.tagIds) ids.add(id);
    }
    return ids;
  }, [questContext]);

  // Cache last good props so the slide-down exit can still render content
  // after the parent clears taskId.
  const lastTitleRef = useRef(title);
  const lastDescriptionRef = useRef(description);
  const lastTaskIdRef = useRef(taskId);
  const lastSuggestedRef = useRef(suggestedTagName);
  useEffect(() => {
    if (open) {
      lastTitleRef.current = title;
      lastDescriptionRef.current = description;
      lastTaskIdRef.current = taskId;
      lastSuggestedRef.current = suggestedTagName;
    }
  }, [open, title, description, taskId, suggestedTagName]);
  const displayTitle = open ? title : lastTitleRef.current;
  const displayDescription = open ? description : lastDescriptionRef.current;
  const displaySuggested = open ? suggestedTagName : lastSuggestedRef.current;

  useEffect(() => {
    setMounted(true);
  }, []);

  const initialKey = (initialTags ?? []).join(',');
  useEffect(() => {
    if (!open) return;
    const initial = (initialTags ?? []).slice(0, maxSelectedTags);
    setSelectedTags(initial);
    tagManager.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialKey, maxSelectedTags]);

  const handleDone = async (extraTagId?: string) => {
    // A tag created via the Done button arrives as extraTagId — merge it so the
    // save uses the new selection without waiting on the async state update.
    const merged =
      extraTagId && !selectedTags.includes(extraTagId)
        ? [...selectedTags, extraTagId]
        : selectedTags;
    const activeTaskId = taskId ?? lastTaskIdRef.current;
    if (!activeTaskId || isSaving) {
      onClose();
      return;
    }
    setIsSaving(true);
    try {
      await onSave(activeTaskId, merged.slice(0, maxSelectedTags));
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleBlockedTagToggle = (tag: SavedTag) => {
    const assignment = tagAssignments?.[tag.id];
    if (
      !assignment ||
      !currentFocusCategoryId ||
      assignment.categoryId === currentFocusCategoryId
    ) {
      return false;
    }

    setPendingTagSwitch({
      tag,
      fromCategoryName: assignment.categoryName,
    });
    return true;
  };

  const confirmTagSwitch = () => {
    if (!pendingTagSwitch) return;
    const tagId = pendingTagSwitch.tag.id;
    setSelectedTags((prev) => {
      if (prev.includes(tagId)) return prev;
      if (maxSelectedTags !== undefined && prev.length >= maxSelectedTags) {
        setShowFocusTagLimit(true);
        return prev;
      }
      return [...prev, tagId];
    });
    setPendingTagSwitch(null);
  };

  if (!mounted) return null;

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
            {/* Header */}
            <div className="relative mb-5 flex h-9 items-center justify-center">
              <h2 className="text-[17px] font-black text-foreground">
                {displayTitle}
              </h2>
            </div>

            {displayDescription && (
              <p className="mb-3 text-center text-[13px] font-semibold text-muted-foreground">
                {displayDescription}
              </p>
            )}

            <TagsView
              tagManager={tagManager}
              selectedTagIds={selectedTags}
              setSelectedTagIds={setSelectedTags}
              onPremiumLimit={() => setShowPremiumLimit(true)}
              onDone={handleDone}
              tagInputRef={tagInputRef}
              maxSelectedTags={maxSelectedTags}
              onMaxSelectedTags={() => setShowFocusTagLimit(true)}
              onBlockedTagToggle={handleBlockedTagToggle}
              doneLabel={isSaving ? 'Saving...' : saveLabel}
              suggestedTagName={displaySuggested}
              questTagIds={questTagIds}
              showFocusConnect={!currentFocusCategoryId}
            />
          </div>
        )}
      </BaseSheet>

      <PlusUpgradeModal
        open={showPremiumLimit}
        placement="focus_tag_limit"
        onClose={() => setShowPremiumLimit(false)}
      />
      <FocusTagLimitDialog
        open={showFocusTagLimit}
        title={focusTagLimitTitle}
        description={focusTagLimitDescription}
        onClose={() => setShowFocusTagLimit(false)}
        onUpgrade={() => {
          setShowFocusTagLimit(false);
          setShowPremiumLimit(true);
        }}
      />
      <SwitchTagFocusDialog
        open={!!pendingTagSwitch}
        tag={pendingTagSwitch?.tag}
        fromCategoryName={pendingTagSwitch?.fromCategoryName}
        onClose={() => setPendingTagSwitch(null)}
        onConfirm={confirmTagSwitch}
      />
    </>
  );
}

function FocusTagLimitDialog({
  open,
  title,
  description,
  onClose,
  onUpgrade,
}: {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  onUpgrade: () => void;
}) {
  return (
    <BaseSheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      zIndex={1600}
      className="sm:max-w-[400px] max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-3rem)]"
    >
      {({ bindScroll }) => (
        <div
          ref={bindScroll}
          className="relative overflow-y-auto overscroll-none px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-1 text-card-foreground sm:px-6 sm:pb-6 sm:pt-3"
        >
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-500">
            <Lock className="h-7 w-7" strokeWidth={2.5} />
          </div>
          <h3 className="text-center text-xl font-black text-foreground">
            {title}
          </h3>
          <p className="mx-auto mt-1.5 max-w-[20rem] text-center text-[14px] leading-snug text-muted-foreground">
            {description}
          </p>
          <div className="mt-5 flex flex-col gap-4">
            <button
              type="button"
              onClick={onClose}
              className="h-12 w-full rounded-2xl bg-primary text-[14px] font-black uppercase tracking-wide text-primary-foreground transition active:translate-y-[2px]"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={onUpgrade}
              aria-label="Unlock multiple focus tags with Frog Plus"
              className="group relative isolate flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl px-4 ring-2 ring-amber-200/80 transition-transform active:scale-[0.98]"
            >
              <span
                aria-hidden
                className="absolute inset-0 -z-10 rounded-2xl bg-[linear-gradient(125deg,#fde68a_0%,#fbbf24_45%,#f59e0b_75%,#d97706_100%)]"
              />
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 -z-10 h-1/2 rounded-t-2xl bg-gradient-to-b from-white/45 to-transparent"
              />
              <Icon
                name="frogPlus"
                className="-my-8 -ml-1 h-20 w-20 drop-shadow-[0_3px_0_rgba(31,98,28,0.4)]"
              />
              <span className="text-sm font-black uppercase tracking-[0.08em] text-emerald-900 drop-shadow-[0_1px_0_rgba(255,255,255,0.5)]">
                Connect more with
              </span>
              <span className="inline-flex items-center rounded-lg bg-gradient-to-b from-emerald-600 to-emerald-800 px-2 py-1.5 text-[11px] font-black uppercase leading-none tracking-[0.18em] text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_4px_rgba(0,0,0,0.25)] ring-1 ring-emerald-900/40">
                Plus
              </span>
            </button>
          </div>
        </div>
      )}
    </BaseSheet>
  );
}

function SwitchTagFocusDialog({
  open,
  tag,
  fromCategoryName,
  onClose,
  onConfirm,
}: {
  open: boolean;
  tag?: SavedTag;
  fromCategoryName?: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!tag) return null;

  return (
    <BaseSheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      zIndex={1610}
      className="sm:max-w-[400px] max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-3rem)]"
    >
      {({ bindScroll }) => (
        <div
          ref={bindScroll}
          className="relative overflow-y-auto overscroll-none px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-1 text-card-foreground sm:px-6 sm:pb-6 sm:pt-3"
        >
          <div
            className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-sm"
            style={{ backgroundColor: tag.color }}
          >
            <span className="text-xl font-black">#</span>
          </div>
          <h3 className="text-center text-xl font-black text-foreground">
            Switch this tag?
          </h3>
          <p className="mx-auto mt-1.5 max-w-[20rem] text-center text-[14px] leading-snug text-muted-foreground">
            <span className="font-bold text-foreground">{tag.name}</span> is
            already associated with{' '}
            <span className="font-bold text-foreground">
              {fromCategoryName ?? 'another focus area'}
            </span>
            .
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-12 rounded-2xl bg-muted text-[14px] font-black text-foreground transition hover:bg-muted/80"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="h-12 rounded-2xl bg-primary text-[14px] font-black uppercase tracking-wide text-primary-foreground transition active:translate-y-[2px]"
            >
              Switch
            </button>
          </div>
        </div>
      )}
    </BaseSheet>
  );
}
