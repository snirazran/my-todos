'use client';

import { AnimatePresence } from 'framer-motion';
import { Bookmark, ChevronRight } from 'lucide-react';
import { wishlistBucket, type WishlistEntry } from '@/lib/skins/wishlist';
import { ShelfHeader, TileRail, shelfActionClass } from './DressingRoom';
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
    <section aria-label="Your wishlist">
      <ShelfHeader
        icon={<Bookmark className="h-3.5 w-3.5" strokeWidth={3} fill="currentColor" />}
        label="Wishlist"
        tone="text-primary"
        meta={
          <>
            <span>
              {slots.used}
              {slots.max > 0 && <span className="opacity-60">/{slots.max}</span>}
            </span>
            {readyCount > 0 && (
              <span className="text-emerald-600 dark:text-emerald-400">
                · {readyCount} ready
              </span>
            )}
          </>
        }
        action={
          <button type="button" onClick={onSeeAll} className={shelfActionClass()}>
            See all
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={3} />
          </button>
        }
      />

      <TileRail>
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
      </TileRail>
    </section>
  );
}
