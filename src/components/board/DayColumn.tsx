'use client';

import React, { useState, useRef, useEffect } from 'react';
import { LayoutList, ListTodo, Repeat, EllipsisVertical } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export type FilterType = 'all' | 'tasks' | 'habits';

export default function DayColumn({
  title,
  count,
  listRef,
  children,
  footer,
  maxHeightClass = 'max-h-[65svh] md:max-h-[74svh]', // ⬅ default shorter on mobile
  /** Set true when a composer is open in this column to make it a bit shorter */
  compact = false,
  isToday = false,
  filter = 'all',
  onFilterChange,
}: {
  title: string;
  count?: number;
  listRef: (el: HTMLDivElement | null) => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxHeightClass?: string;
  compact?: boolean;
  isToday?: boolean;
  filter?: FilterType;
  onFilterChange?: (filter: FilterType) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMenu]);

  const appliedMax = compact
    ? 'max-h-[60svh] md:max-h-[70svh]'
    : maxHeightClass;

  // Split "Sunday 7/12" into name and date
  const match = title.match(/^(.*) (\d+\/\d+)$/);
  const displayName = match ? match[1] : title;
  const displayDate = match ? match[2] : null;

  return (
    <section
      className={[
        'group relative flex flex-col overflow-visible',
        'rounded-[20px] bg-card/80 backdrop-blur-2xl',
        'border border-border/50 shadow-sm',
        appliedMax,
        'p-3',
        'min-h-[100px]',
        'transition-colors duration-300 hover:bg-card/90',
      ].join(' ')}
    >
      <div className="flex flex-col gap-2 px-2 mb-4 pt-1">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black tracking-tight text-foreground uppercase flex items-baseline gap-2">
            {isToday ? (
              <span className="relative z-0 px-1.5 py-0.5 rounded-md bg-gradient-to-r from-primary/20 to-emerald-400/20 text-primary">
                {displayName}
              </span>
            ) : (
              displayName
            )}
            {displayDate && (
              <span className="text-sm font-bold text-muted-foreground">
                {displayDate}
              </span>
            )}
          </h2>

          <div className="flex items-center gap-2 relative">
            {count !== undefined && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-secondary px-1.5 text-[11px] font-bold text-muted-foreground">
                {count}
              </span>
            )}

            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowMenu(!showMenu)}
                className={`flex items-center justify-center w-7 h-7 rounded-lg transition-all active:scale-90 ${
                  showMenu || filter !== 'all'
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <EllipsisVertical size={18} />
                {filter !== 'all' && (
                  <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 border-2 border-card shadow-sm" />
                )}
              </button>

              <AnimatePresence>
                {showMenu && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    className="absolute right-0 top-full mt-2 z-50 min-w-[140px] overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-xl ring-1 ring-black/5 backdrop-blur-xl"
                  >
                    <button
                      onClick={() => {
                        onFilterChange?.('all');
                        setShowMenu(false);
                      }}
                      className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-bold transition-all ${
                        filter === 'all'
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-accent text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <LayoutList size={16} />
                      All Items
                    </button>
                    <button
                      onClick={() => {
                        onFilterChange?.('tasks');
                        setShowMenu(false);
                      }}
                      className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-bold transition-all ${
                        filter === 'tasks'
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-accent text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <ListTodo size={16} />
                      Tasks Only
                    </button>
                    <button
                      onClick={() => {
                        onFilterChange?.('habits');
                        setShowMenu(false);
                      }}
                      className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-bold transition-all ${
                        filter === 'habits'
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-accent text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Repeat size={16} />
                      Habits Only
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      <div
        ref={listRef}
        className={[
          'flex-1 px-2 pt-2 overflow-y-auto transition-colors rounded-xl',
          'no-scrollbar touch-auto overscroll-y-contain',
          'pb-[env(safe-area-inset-bottom)]',
        ].join(' ')}
      >
        {children}
      </div>

      {footer ? <div className="mt-4">{footer}</div> : null}
    </section>
  );
}
