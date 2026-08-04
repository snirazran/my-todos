'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Plus, CalendarCheck, ListChecks } from 'lucide-react';

export default function DayColumn({
  title,
  count,
  totalCount,
  listRef,
  children,
  footer,
  maxHeightClass = 'max-h-[65svh] md:max-h-[74svh]', // ⬅ default shorter on mobile
  /** Set true when a composer is open in this column to make it a bit shorter */
  compact = false,
  isToday = false,
  isPast = false,
  onAddClick,
  onSelectClick,
  selectActive = false,
  disableVerticalScroll = false,
}: {
  title: string;
  count?: number;
  totalCount?: number;
  listRef: (el: HTMLDivElement | null) => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxHeightClass?: string;
  compact?: boolean;
  isToday?: boolean;
  isPast?: boolean;
  /** When provided, renders a + button in the header that triggers add-task for this column. */
  onAddClick?: () => void;
  /**
   * When provided, renders the multi-select toggle beside +. This is the only
   * touch entry into bulk mode — long-press is the drag gesture and cards have
   * no visible ⋯ trigger, so the column header carries it.
   */
  onSelectClick?: () => void;
  selectActive?: boolean;
  /** Keep the task surface fully expanded instead of making it its own scroller. */
  disableVerticalScroll?: boolean;
}) {
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
        'rounded-[20px]',
        // Recessed list surface, distinct from the cards sitting on top of
        // it (Trello-style layering) — a soft grey in light mode, dropping
        // to the page's own near-black in dark mode so the (lighter) cards
        // clearly pop off it instead of blending in.
        isPast ? 'bg-muted/40 dark:bg-background/60' : 'bg-muted/70 dark:bg-background',
        'border border-border/50 shadow-sm',
        appliedMax,
        'p-2',
        'min-h-[100px]',
        'transition-colors duration-300',
      ].join(' ')}
    >
      <div className="flex flex-col gap-2 px-1 mb-2 pt-1">
        <div className="flex items-center justify-between">
          <h2 className="flex items-baseline gap-2">
            {displayDate && (
              <span
                className={`text-2xl font-black tracking-tight leading-none ${
                  isToday
                    ? 'text-primary'
                    : isPast
                      ? 'text-muted-foreground/70'
                      : 'text-foreground'
                }`}
              >
                {displayDate}
              </span>
            )}
            {isToday ? (
              <span className="relative z-0 px-1.5 py-0.5 rounded-md text-xs font-bold uppercase tracking-wide bg-gradient-to-r from-primary/20 to-emerald-400/20 text-primary">
                {displayName}
              </span>
            ) : (
              <span
                className={`text-xs font-bold uppercase tracking-wide ${
                  isPast ? 'text-muted-foreground/60' : 'text-muted-foreground'
                }`}
              >
                {displayName}
              </span>
            )}
          </h2>

          <div className="flex items-center gap-2.5 relative">
            {onSelectClick && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectClick();
                }}
                title={selectActive ? 'Done selecting' : 'Select tasks'}
                aria-label={selectActive ? 'Done selecting' : 'Select tasks'}
                aria-pressed={selectActive}
                className={`flex h-6 w-6 items-center justify-center rounded-full transition-all active:scale-90 ${
                  selectActive
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground/70 [@media(hover:hover)]:hover:bg-muted [@media(hover:hover)]:hover:text-foreground'
                }`}
              >
                <ListChecks size={15} strokeWidth={2.75} />
              </button>
            )}

            {onAddClick && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddClick();
                }}
                title="Add task"
                aria-label="Add task"
                className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 active:scale-90 transition-all"
              >
                <Plus size={14} strokeWidth={3} />
              </button>
            )}

          </div>
        </div>

        {count !== undefined && (
          <div className="flex items-center gap-1.5 -mt-1">
            <CalendarCheck className="w-3.5 h-3.5 text-primary" />
            <span
              className={`text-xs font-bold ${
                isPast ? 'text-muted-foreground/60' : 'text-muted-foreground'
              }`}
            >
              {totalCount !== undefined && count !== totalCount
                ? `${count} left · ${totalCount} total`
                : `${count} ${count === 1 ? 'task' : 'tasks'}`}
            </span>
          </div>
        )}
      </div>

      <motion.div
        layoutScroll
        ref={listRef}
        className={[
          'flex-1 px-0.5 pt-1 overflow-x-hidden transition-colors rounded-xl',
          disableVerticalScroll
            ? 'overflow-y-visible touch-pan-x'
            : 'overflow-y-auto no-scrollbar touch-auto overscroll-y-contain',
          'pb-[env(safe-area-inset-bottom)]',
        ].join(' ')}
      >
        {children}
      </motion.div>

      {footer ? <div className="mt-4">{footer}</div> : null}
    </section>
  );
}
