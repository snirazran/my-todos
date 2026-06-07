'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Pencil, CalendarCheck, Check, Bell } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';

interface TaskMenuProps {
  menu: { id: string; top: number; left: number } | null;
  onClose: () => void;
  onDelete?: () => void;
  onDoLater?: () => void;
  addTagsPosition?: 'first' | 'second';
  onToggleRepeat?: () => void;
  isWeekly?: boolean;
  onEdit?: (taskId: string) => void;
  onDoToday?: () => void;
  isDone?: boolean;
  onAddTags?: (taskId: string) => void;
  onSchedule?: (taskId: string) => void;
  onStartTimer?: () => void;
}

// Shared styling. Scales up on `sm:` (web/desktop) for a more comfortable,
// web-friendly menu with larger, more visible icons; stays compact on mobile.
const itemBase =
  'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors sm:gap-3 sm:rounded-lg sm:px-3 sm:py-2.5 sm:text-[15px]';
const itemDefault = `${itemBase} text-foreground hover:bg-accent`;
const iconCls = 'h-4 w-4 shrink-0 sm:h-[22px] sm:w-[22px]';

export default function TaskMenu({ menu, onClose, onDelete, onDoLater, isDone, onAddTags, addTagsPosition = 'second', onToggleRepeat, isWeekly, onEdit, onDoToday, onSchedule, onStartTimer }: TaskMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  // Clamped position so the menu always stays fully within the viewport.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // We portal to document.body
  // Ensure document is available (client-side)
  if (typeof document === 'undefined') return null;

  // Close on scroll
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!menu) return;
    const handleScroll = () => {
       onClose();
    };
    // Capture scroll events on window (including scrolling within elements if they bubble/capture)
    // 'scroll' doesn't bubble, so we need capture to catch scroll on any element, or just listen on window for main scroll.
    // Usually sticking to window 'scroll' with capture: true is best for "close on any scroll"
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, [menu, onClose]);

  // Keep the menu within the viewport: measure after it mounts and nudge it
  // back from any edge it would overflow. Runs before paint to avoid a flash.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useLayoutEffect(() => {
    if (!menu) {
      setPos(null);
      return;
    }
    const el = menuRef.current;
    if (!el) return;
    const margin = 8;
    // offsetWidth/Height ignore the entry scale transform, giving true size.
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.max(margin, Math.min(menu.left, vw - w - margin));
    const top = Math.max(margin, Math.min(menu.top, vh - h - margin));
    setPos({ top, left });
  }, [menu]);

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
            className="fixed z-[9999] min-w-[160px] overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg shadow-black/5 ring-1 ring-black/5 backdrop-blur-sm sm:min-w-[220px] sm:rounded-2xl sm:p-1.5"
            style={{ top: pos?.top ?? menu.top, left: pos?.left ?? menu.left, maxHeight: 'calc(100vh - 16px)', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >

          {onEdit && (
            <button
               onClick={() => {
                   onEdit(menu.id);
                   onClose();
               }}
               className={itemDefault}
             >
               <Pencil className={`${iconCls} text-muted-foreground group-hover:text-primary transition-colors`} />
               Edit Task
             </button>
          )}

          {addTagsPosition === 'first' && onAddTags && (
             <button
              onClick={() => {
                  onAddTags(menu.id);
                  onClose();
              }}
              className={itemDefault}
            >
              <Icon name="filter" className={iconCls} />
              Add Tags
            </button>
          )}

          {addTagsPosition === 'second' && onAddTags && (
             <button
              onClick={() => {
                  onAddTags(menu.id);
                  onClose();
              }}
              className={itemDefault}
            >
              <Icon name="filter" className={iconCls} />
              Add Tags
            </button>
          )}

          {onSchedule && (
            <button
              onClick={() => {
                onSchedule(menu.id);
                onClose();
              }}
              className={itemDefault}
            >
              <Bell className={`${iconCls} text-amber-500`} />
              Notify
            </button>
          )}

          {onStartTimer && !isDone && (
            <button
              onClick={() => {
                onStartTimer();
                onClose();
              }}
              className={itemDefault}
            >
              <Icon name="clock" className={iconCls} />
              Focus
            </button>
          )}

          {onToggleRepeat && (
             <button
              onClick={() => {
                  onToggleRepeat();
                  onClose();
              }}
              className={`${itemBase} justify-between ${
                isWeekly
                  ? 'bg-primary/10 text-primary hover:bg-primary/20'
                  : 'text-foreground hover:bg-accent'
              }`}
            >
              <div className="flex items-center gap-2 sm:gap-3">
                <Icon name="repeat" label="Repeat" className={iconCls} />
                <span>Repeat Weekly</span>
              </div>
              {isWeekly && <Check className="h-3.5 w-3.5 shrink-0 text-primary sm:h-4 sm:w-4" />}
            </button>
          )}

          {onDoLater && !isDone && (
            <button
              onClick={() => {
                onDoLater();
                onClose();
              }}
              className={itemDefault}
            >
              <Icon name="saved" className={iconCls} />
              Save for Later
            </button>
          )}

          {onDoToday && (
             <button
              onClick={() => {
                  onDoToday();
                  onClose();
              }}
              className={itemDefault}
            >
              <CalendarCheck className={`${iconCls} text-muted-foreground group-hover:text-green-600 transition-colors`} />
              Do Today
            </button>
          )}

          {onDelete && (
             <button
              onClick={() => {
                  onDelete();
                  onClose();
              }}
              className={`${itemBase} text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20`}
            >
              <Trash2 className={`${iconCls} text-red-500 group-hover:text-red-600 transition-colors`} />
              Delete Task
            </button>
          )}

        </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
