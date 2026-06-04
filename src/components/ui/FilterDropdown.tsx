'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarCheck, Check, Eye, EyeOff } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';

export type FilterType = 'all' | 'tasks';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  // Positioning
  triggerRef: React.RefObject<HTMLElement | null>;
  align?: 'left' | 'right';
  // Type Filter
  filter?: FilterType;
  onFilterChange?: (filter: FilterType) => void;
  showTypeFilters?: boolean;
  // Completed Filter
  showCompleted: boolean;
  onShowCompletedChange: (show: boolean) => void;
  // Tag Filter
  availableTags?: { id: string; name: string; color: string }[];
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
}

export function FilterDropdown({
  isOpen,
  onClose,
  triggerRef,
  align = 'right',
  filter = 'all',
  onFilterChange,
  showTypeFilters = true,
  showCompleted,
  onShowCompletedChange,
  availableTags = [],
  selectedTags = [],
  onTagsChange,
}: Props) {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.matchMedia('(max-width: 640px)').matches);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const updatePosition = () => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();

        setCoords({
          top: rect.bottom + 8,
          left: align === 'right'
            ? rect.right - 200
            : rect.left
        });
      };

      updatePosition();
      // Use capture for scroll to catch it anywhere
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isOpen, triggerRef, align]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999]">
          {/* Backdrop - catches clicks to close */}
          <div 
            className="fixed inset-0 bg-transparent" 
            onPointerDown={(e) => {
              e.stopPropagation();
              onClose();
            }}
          />
          
          {coords && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="fixed overflow-hidden rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-2xl ring-1 ring-black/5 backdrop-blur-xl min-w-[200px] max-w-[280px]"
              style={{
                top: coords.top,
                left: isMobile
                  ? 12
                  : Math.max(10, Math.min(coords.left, typeof window !== 'undefined' ? window.innerWidth - 210 : coords.left)),
                width: isMobile ? 'calc(100vw - 24px)' : undefined,
                maxWidth: isMobile ? 'none' : undefined,
                transformOrigin: isMobile ? 'top center' : align === 'right' ? 'top right' : 'top left',
              }}
              onPointerDown={(e) => e.stopPropagation()} // Prevent closing when clicking inside the menu
            >
              <div className="flex flex-col gap-1">
                {/* Completed toggle — whole row is tappable, state shown as a pill */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onShowCompletedChange(!showCompleted);
                  }}
                  className="group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-accent/50"
                >
                  <span className="text-sm font-bold text-foreground">
                    Show Completed
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-wider shadow-sm transition-all group-active:scale-95 ${
                      showCompleted
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-muted-foreground group-hover:border-foreground/30 group-hover:text-foreground'
                    }`}
                  >
                    {showCompleted ? (
                      <Eye className="h-3.5 w-3.5" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5" />
                    )}
                    {showCompleted ? 'On' : 'Off'}
                  </span>
                </button>

                {showTypeFilters && (
                  <>
                    <div className="h-[1px] bg-border/40 mx-2 my-1" />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onFilterChange?.('all');
                      }}
                      className={`group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-bold transition-all ${
                        filter === 'all'
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-accent text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Icon name="planner" label="All Items" className="w-[18px] h-[18px]" />
                      All Items
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onFilterChange?.('tasks');
                      }}
                      className={`group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-bold transition-all ${
                        filter === 'tasks'
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-accent text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <CalendarCheck size={18} />
                      Tasks Only
                    </button>
                  </>
                )}

                {availableTags.length > 0 && (
                  <>
                    <div className="h-[1px] bg-border/40 mx-2 my-1" />
                    <div className="px-2.5 py-1.5 flex items-center justify-between">
                      <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                        Filter Tags
                      </span>
                      {selectedTags.length > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onTagsChange([]);
                          }}
                          className="text-[10px] font-bold text-primary hover:text-primary/80 transition-colors uppercase tracking-widest"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 p-1 max-h-[200px] overflow-y-auto no-scrollbar">
                      {availableTags.map((tag) => {
                        const isSelected = selectedTags.includes(tag.id);
                        return (
                          <button
                            key={tag.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              const next = isSelected
                                ? selectedTags.filter((id) => id !== tag.id)
                                : [...selectedTags, tag.id];
                              onTagsChange(next);
                            }}
                            className={`relative inline-flex max-w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-black uppercase tracking-wider shadow-sm transition-all [@media(hover:hover)]:hover:opacity-75 active:scale-95 ${
                              isSelected
                                ? 'ring-2 ring-offset-1 ring-offset-popover'
                                : ''
                            }`}
                            style={{
                              backgroundColor: `${tag.color}20`,
                              color: tag.color,
                              borderColor: `${tag.color}40`,
                              ...(isSelected
                                ? ({ ['--tw-ring-color' as string]: tag.color } as React.CSSProperties)
                                : {}),
                            }}
                          >
                            {isSelected && <Check size={10} strokeWidth={3} className="shrink-0" />}
                            <span className="truncate">{tag.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
