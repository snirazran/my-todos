'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';
import TagManager from '@/components/ui/TagManager';

interface TagPopupProps {
  open: boolean;
  onClose: () => void;
  taskId: string | null;
  initialTags?: string[];
  onSave: (taskId: string, newTags: string[]) => Promise<void> | void;
}

export default function TagPopup({ open, onClose, taskId, initialTags = [], onSave }: TagPopupProps) {
  const [tags, setTags] = useState<string[]>(initialTags);
  const [isSaving, setIsSaving] = useState(false);

  React.useEffect(() => {
    if (open) {
        setTags(initialTags);
    }
  }, [open, initialTags]);

  const handleSave = async () => {
    if (!taskId) return;
    setIsSaving(true);
    try {
        await onSave(taskId, tags);
        onClose();
    } finally {
        setIsSaving(false);
    }
  };

  if (!open) return null;

  const dialogContent = (
    <div
      className="fixed inset-0 z-[10001] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4 pb-6 sm:pb-0"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3">
          <div className="flex-1 min-w-0 pr-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
              Organization
            </p>
            <h4 className="text-base font-bold text-slate-900 dark:text-white leading-snug truncate">
              Manage Tags
            </h4>
          </div>
          <button
            className="flex-shrink-0 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-2">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Select or create tags to organize your items
          </p>
          <div className="max-h-[60vh] overflow-y-auto no-scrollbar">
            <TagManager
              open={true}
              onOpenChange={() => {}}
              selectedTags={tags}
              onTagsChange={setTags}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 pb-4 pt-3 flex flex-col gap-2">
          <button
            className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-50 shadow-sm flex items-center justify-center gap-2"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              'Saving...'
            ) : (
              <>
                <Check className="w-4 h-4" />
                Save tags
              </>
            )}
          </button>
          <button
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialogContent, document.body);
}
