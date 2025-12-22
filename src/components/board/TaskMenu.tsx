'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Clock, Tag, RotateCcw } from 'lucide-react';
import TagManager from '@/components/ui/TagManager';

interface TaskMenuProps {
  menu: { id: string; top: number; left: number } | null;
  onClose: () => void;
  onDelete: () => void;
  onDoLater?: () => void;
  isDone?: boolean;
  onAddTags?: (taskId: string) => void;
  addTagsPosition?: 'first' | 'second'; 
  onToggleRepeat?: () => void;
  isWeekly?: boolean;
}

export default function TaskMenu({ menu, onClose, onDelete, onDoLater, isDone, onAddTags, addTagsPosition = 'second', onToggleRepeat, isWeekly }: TaskMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // We portal to document.body
  // Ensure document is available (client-side)
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {menu && (
        <>
          {/* Transparent backdrop to catch outside clicks */}
          <div 
            className="fixed inset-0 z-[9998] bg-transparent touch-none" 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            onPointerDown={(e) => {
               // Capture pointer events to ensure we get the click even on touch devices
               // that might be handling gestures
               e.stopPropagation(); 
            }}
          />
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
              className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <Tag className="h-4 w-4 text-muted-foreground" />
              Add Tags
            </button>
          )}

          {addTagsPosition === 'second' && onAddTags && (
             <button
              onClick={() => {
                  onAddTags(menu.id);
                  onClose();
              }}
              className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <Tag className="h-4 w-4 text-muted-foreground" />
              Add Tags
            </button>
          )}

          {onDoLater && !isDone && (
            <button
              onClick={() => {
                onDoLater();
                onClose();
              }}
              className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <Clock className="h-4 w-4 text-primary" />
              Do Later
            </button>
          )}

          {onToggleRepeat && (
             <button
              onClick={() => {
                  onToggleRepeat();
                  onClose();
              }}
              className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <RotateCcw className="h-4 w-4 text-primary" />
              {isWeekly ? 'Make Regular' : 'Make Weekly'}
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
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}