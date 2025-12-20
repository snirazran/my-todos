'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Clock, Tag } from 'lucide-react';
import TagManager from '@/components/ui/TagManager';

interface TaskMenuProps {
  menu: { id: string; top: number; left: number } | null;
  onClose: () => void;
  onDelete: () => void;
  onDoLater?: () => void;
  isDone?: boolean;
  onAddTags?: (taskId: string) => void;
  // Controls order of Add Tags button
  addTagsPosition?: 'first' | 'second'; 
}

export default function TaskMenu({ menu, onClose, onDelete, onDoLater, isDone, onAddTags, addTagsPosition = 'second' }: TaskMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      // Check if the click is outside the menu
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleScroll = () => {
      onClose();
    };

    // Use capture phase (third argument 'true') to detect clicks even if 
    // propagation is stopped by other elements (like the BacklogTray).
    window.addEventListener('mousedown', handleClickOutside, true);
    window.addEventListener('touchstart', handleClickOutside, true);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('mousedown', handleClickOutside, true);
      window.removeEventListener('touchstart', handleClickOutside, true);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [menu, onClose]);

  // We portal to document.body
  // Ensure document is available (client-side)
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {menu && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, scale: 0.95, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -4 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="fixed z-[9999] min-w-[160px] overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg shadow-black/5 ring-1 ring-black/5 backdrop-blur-sm"
          style={{ top: menu.top, left: menu.left }}
          onClick={(e) => e.stopPropagation()}
        >
          {addTagsPosition === 'first' && onAddTags && (
             <button
              onClick={() => {
                  onAddTags(menu.id);
                  onClose();
              }}
              className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Tag className="h-4 w-4 text-slate-500" />
              Add Tags
            </button>
          )}

          {onDoLater && !isDone && (
            <button
              onClick={() => {
                onDoLater();
                onClose();
              }}
              className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Clock className="h-4 w-4 text-violet-500" />
              Do Later
            </button>
          )}

          {addTagsPosition === 'second' && onAddTags && (
             <button
              onClick={() => {
                  onAddTags(menu.id);
                  onClose();
              }}
              className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Tag className="h-4 w-4 text-slate-500" />
              Add Tags
            </button>
          )}

          <button
            onClick={() => {
              onDelete();
            }}
            className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            <Trash2 className="h-4 w-4" />
            Delete Task
          </button>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}