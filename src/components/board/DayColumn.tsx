'use client';

import React, { useState, useRef, useEffect } from 'react';
import { EllipsisVertical } from 'lucide-react';
import { FilterDropdown, FilterType } from '../ui/FilterDropdown';

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
  availableTags = [],
  selectedTags = [],
  onTagsChange,
  showCompleted = true,
  onShowCompletedChange,
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
  availableTags?: { id: string; name: string; color: string }[];
  selectedTags?: string[];
  onTagsChange?: (tags: string[]) => void;
  showCompleted?: boolean;
  onShowCompletedChange?: (show: boolean) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const appliedMax = compact
    ? 'max-h-[60svh] md:max-h-[70svh]'
    : maxHeightClass;

  const isFiltered = filter !== 'all' || selectedTags.length > 0 || !showCompleted;

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
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(!showMenu);
                }}
                className={`flex items-center justify-center w-7 h-7 rounded-lg transition-all active:scale-90 ${
                  showMenu || isFiltered
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <EllipsisVertical size={18} />
                {isFiltered && (
                  <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 border-2 border-card shadow-sm" />
                )}
              </button>

              <FilterDropdown
                isOpen={showMenu}
                onClose={() => setShowMenu(false)}
                triggerRef={menuRef}
                filter={filter}
                onFilterChange={onFilterChange}
                showTypeFilters={false}
                hideHabitFilter={true}
                availableTags={availableTags}
                selectedTags={selectedTags}
                onTagsChange={(tags) => onTagsChange?.(tags)}
                showCompleted={showCompleted}
                onShowCompletedChange={(show) => onShowCompletedChange?.(show)}
              />
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
