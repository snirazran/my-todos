'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutList, ListTodo, Repeat, Check } from 'lucide-react';

export type FilterType = 'all' | 'tasks' | 'habits';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  // Positioning
  triggerRef: React.RefObject<HTMLElement>;
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
              className="fixed overflow-hidden rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-2xl ring-1 ring-black/5 backdrop-blur-xl min-w-[200px]"
              style={{ 
                top: coords.top, 
                left: Math.max(10, Math.min(coords.left, typeof window !== 'undefined' ? window.innerWidth - 210 : coords.left)),
                transformOrigin: align === 'right' ? 'top right' : 'top left' 
              }}
              onPointerDown={(e) => e.stopPropagation()} // Prevent closing when clicking inside the menu
            >
              <div className="flex flex-col gap-1">
                {/* Header / Completed Toggle */}
                <div className="flex items-center justify-between px-2.5 py-2 rounded-xl hover:bg-accent/50 transition-colors">
                  <span className="text-sm font-bold text-foreground">
                    Show Completed
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onShowCompletedChange(!showCompleted);
                    }}
                    className={`w-9 h-5 rounded-full relative transition-all duration-300 ease-in-out ${
                      showCompleted ? 'bg-primary' : 'bg-muted-foreground/30'
                    }`}
                  >
                    <motion.span
                      animate={{ x: showCompleted ? 16 : 0 }}
                      className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-background shadow-sm"
                    />
                  </button>
                </div>

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
                      <LayoutList size={18} />
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
                      <ListTodo size={18} />
                      Tasks Only
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onFilterChange?.('habits');
                      }}
                      className={`group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-bold transition-all ${
                        filter === 'habits'
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-accent text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Repeat size={18} />
                      Habits Only
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
                    <div className="flex flex-wrap gap-1.5 p-1 max-h-[160px] overflow-y-auto no-scrollbar">
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
                            className={`
                              relative inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 border
                              ${
                                isSelected
                                  ? 'ring-1 ring-offset-0 ring-primary border-transparent'
                                  : 'bg-muted/40 border-transparent hover:bg-muted/70 text-muted-foreground'
                              }
                            `}
                            style={
                              isSelected && tag.color
                                ? {
                                    backgroundColor: `${tag.color}15`,
                                    color: tag.color,
                                    borderColor: tag.color,
                                  }
                                : isSelected
                                ? {
                                    backgroundColor: 'rgba(var(--primary), 0.1)',
                                    color: 'hsl(var(--primary))',
                                    borderColor: 'hsl(var(--primary))',
                                  }
                                : {}
                            }
                          >
                            {isSelected && <Check size={10} strokeWidth={3} />}
                            {tag.name}
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
