'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { TagsView } from './quick-add/TagsView';
import { useTagManager } from './quick-add/useTagManager';
import { PremiumLimitDialog } from './PremiumLimitDialog';

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
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showPremiumLimit, setShowPremiumLimit] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null!);

  const tagManager = useTagManager({
    open,
    selectedTags,
    setSelectedTags,
    onPremiumLimit: () => setShowPremiumLimit(true),
  });

  // Cache last good props so the slide-down exit can still render content
  // after the parent clears taskId.
  const lastTitleRef = useRef(title);
  const lastDescriptionRef = useRef(description);
  const lastTaskIdRef = useRef(taskId);
  useEffect(() => {
    if (open) {
      lastTitleRef.current = title;
      lastDescriptionRef.current = description;
      lastTaskIdRef.current = taskId;
    }
  }, [open, title, description, taskId]);
  const displayTitle = open ? title : lastTitleRef.current;
  const displayDescription = open ? description : lastDescriptionRef.current;

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

  const handleDone = async () => {
    const activeTaskId = taskId ?? lastTaskIdRef.current;
    if (!activeTaskId || isSaving) {
      onClose();
      return;
    }
    setIsSaving(true);
    try {
      await onSave(activeTaskId, selectedTags.slice(0, maxSelectedTags));
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  if (!mounted) return null;

  return (
    <>
      {createPortal(
        <AnimatePresence>
          {open && (
            <>
              <motion.div
                key="tags-popup-backdrop"
                initial={{ opacity: 1 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0 } }}
                onClick={onClose}
                className="fixed inset-0 z-[1500] bg-black/80"
              />
              <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[1501] flex justify-center sm:bottom-6">
                <motion.div
                  key="tags-popup-sheet"
                  initial={{ y: '120%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '120%' }}
                  transition={{
                    type: 'tween',
                    ease: [0.32, 0.72, 0, 1],
                    duration: 0.32,
                  }}
                  className="pointer-events-auto min-h-[42dvh] w-full rounded-t-[28px] bg-background px-5 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-6 shadow-[0_-20px_45px_rgba(15,23,42,0.22)] ring-1 ring-border/70 sm:min-h-[360px] sm:max-w-[560px] sm:rounded-[28px] sm:pb-8 sm:shadow-2xl"
                >
                  <div className="mx-auto w-full">
                    {/* Header */}
                    <div className="relative mb-5 flex h-9 items-center justify-center">
                      <button
                        type="button"
                        onClick={onClose}
                        className="absolute left-0 grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground"
                        aria-label="Close picker"
                      >
                        <X className="h-5 w-5 stroke-[3]" />
                      </button>
                      <h2 className="text-[18px] font-extrabold text-muted-foreground">
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
                      doneLabel={isSaving ? 'Saving...' : saveLabel}
                    />
                  </div>
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}

      <PremiumLimitDialog
        open={showPremiumLimit}
        onClose={() => setShowPremiumLimit(false)}
      />
    </>
  );
}
