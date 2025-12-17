'use client';

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2 } from 'lucide-react';

interface TaskMenuProps {
  menu: { id: string; top: number; left: number } | null;
  onClose: () => void;
  onDelete: () => void;
}

export default function TaskMenu({ menu, onClose, onDelete }: TaskMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      // Check if the click is outside the menu
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Use capture phase (third argument 'true') to detect clicks even if 
    // propagation is stopped by other elements (like the BacklogTray).
    window.addEventListener('mousedown', handleClickOutside, true);
    window.addEventListener('touchstart', handleClickOutside, true);

    return () => {
      window.removeEventListener('mousedown', handleClickOutside, true);
      window.removeEventListener('touchstart', handleClickOutside, true);
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
