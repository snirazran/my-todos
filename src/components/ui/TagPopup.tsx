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

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="fixed inset-0 z-[1000] bg-black/20 backdrop-blur-[2px]"
            />
            <motion.div
                 initial={{ opacity: 0, scale: 0.95, x: '-50%', y: '-50%' }}
                 animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
                 exit={{ opacity: 0, scale: 0.95, x: '-50%', y: '-50%' }}
                 className="fixed z-[1001] w-[90%] max-w-[400px] bg-white dark:bg-slate-900 rounded-2xl shadow-xl ring-1 ring-slate-200 dark:ring-slate-800 p-4"
                 style={{
                     left: '50%',
                     top: '50%',
                 }}
            >
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Manage Tags</h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="max-h-[60vh] overflow-y-auto">
                    <TagManager
                        open={true}
                        onOpenChange={() => {}}
                        selectedTags={tags}
                        onTagsChange={setTags}
                    />
                </div>

                <div className="flex gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <button
                        onClick={onClose}
                         className="flex-1 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex-1 py-2.5 text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
                    >
                        {isSaving ? 'Saving...' : (
                            <>
                                <Check className="w-4 h-4" />
                                Save
                            </>
                        )}
                    </button>
                </div>
            </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
