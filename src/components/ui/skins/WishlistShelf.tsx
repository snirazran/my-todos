'use client';

import { AnimatePresence } from 'framer-motion';
import { Bookmark, ChevronRight } from 'lucide-react';
import { DragScrollRow } from '@/components/ui/DragScrollRow';
import { cn } from '@/lib/utils';
import { wishlistBucket, type WishlistEntry } from '@/lib/skins/wishlist';
import { WishlistTile } from './WishlistTile';

export function WishlistShelf({
  entries,
  slots,
  onOpen,
  onRemove,
  onSeeAll,
  removing,
}: {
  entries: WishlistEntry[];
  slots: { used: number; max: number };
  onOpen: (entry: WishlistEntry) => void;
  onRemove: (entry: WishlistEntry) => void;
  onSeeAll: () => void;
  removing?: boolean;
}) {
  if (!entries.length) return null;
  const readyCount = entries.filter(
    (entry) => wishlistBucket(entry) === 'ready',
  ).length;

  return (
    <div className="mb-3">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-[12px] font-black text-muted-foreground">
          <Bookmark
            className="h-3.5 w-3.5 shrink-0 text-primary"
            strokeWidth={3}
            fill="currentColor"
          />
          <span className="truncate">Your wishlist</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5">
          {readyCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/50 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-black tabular-nums text-emerald-700 dark:text-emerald-400">
              {readyCount} ready
            </span>
          )}
          <button
            type="button"
            onClick={onSeeAll}
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full border border-border/50 bg-card px-2.5 py-1',
              'text-[11px] font-black text-foreground shadow-sm transition-colors hover:bg-accent/50',
            )}
          >
            <span className="tabular-nums">
              {slots.used}
              {slots.max > 0 ? `/${slots.max}` : ''}
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </span>
      </div>

      <DragScrollRow className="-mx-1 px-1 pt-2">
        <AnimatePresence initial={false}>
          {entries.map((entry) => (
            <WishlistTile
              key={entry.key}
              entry={entry}
              onOpen={onOpen}
              onRemove={onRemove}
              removing={removing}
            />
          ))}
        </AnimatePresence>
      </DragScrollRow>
    </div>
  );
}
