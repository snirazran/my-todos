'use client';

import { motion } from 'framer-motion';
import { Repeat, X } from 'lucide-react';
import { FlyAmount } from '@/components/ui/FlyAmount';
import { cn } from '@/lib/utils';
import { wishlistBucket, type WishlistEntry } from '@/lib/skins/wishlist';
import { ItemArt, RAIL_ITEM_CLASS, TileArt } from './DressingRoom';

export function WishlistTile({
  entry,
  variant = 'row',
  onOpen,
  onRemove,
  removing,
}: {
  entry: WishlistEntry;
  variant?: 'row' | 'grid';
  onOpen: (entry: WishlistEntry) => void;
  onRemove?: (entry: WishlistEntry) => void;
  removing?: boolean;
}) {
  const view = entry.view;
  const bucket = wishlistBucket(entry);
  const row = variant === 'row';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      className={cn('relative', row ? RAIL_ITEM_CLASS : 'w-full')}
    >
      <button
        type="button"
        onClick={() => onOpen(entry)}
        aria-label={view.name}
        className="group flex w-full flex-col items-stretch gap-1 text-left"
      >
        <TileArt
          rarity={view.rarity}
          className={cn(
            'transition-transform duration-150 group-active:scale-95',
            bucket === 'ready' && 'ring-2 ring-emerald-500',
          )}
        >
          {view.kind === 'background' && view.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={view.imageUrl}
              alt=""
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <ItemArt item={{ slot: view.slot ?? 'hat', riveIndex: view.riveIndex }} />
          )}
          {entry.onDeal && (
            <span className="absolute left-1 top-1 rounded-md bg-[#447d3f] px-1 text-[10px] font-black leading-[16px] text-white">
              −{entry.discountPercent}%
            </span>
          )}
        </TileArt>

        <span className="flex h-6 items-center justify-center gap-1 text-[12.5px] font-black tabular-nums leading-none">
          {entry.tradeOnly ? (
            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
              <Repeat className="h-3 w-3" strokeWidth={3.5} />
              Trade for it
            </span>
          ) : (
            <>
              {entry.onDeal && (
                <span className="text-[12px] font-bold text-muted-foreground line-through decoration-2 opacity-70">
                  {entry.fullPrice.toLocaleString()}
                </span>
              )}
              <FlyAmount
                amount={entry.price}
                size={15}
                className={entry.affordable ? 'text-foreground' : 'text-muted-foreground'}
              />
            </>
          )}
        </span>

        <span className="flex h-6 flex-col justify-center px-1">
          <WishlistTileFooter entry={entry} bucket={bucket} />
        </span>
      </button>

      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${view.name} from your wishlist`}
          disabled={removing}
          onClick={() => onRemove(entry)}
          className="absolute right-1 top-1 z-10 grid h-5 w-5 place-items-center rounded-full bg-background/90 text-muted-foreground shadow-sm ring-1 ring-border/60 transition-colors hover:text-foreground disabled:opacity-50"
        >
          <X className="h-3 w-3" strokeWidth={3} />
        </button>
      )}
    </motion.div>
  );
}

function WishlistTileFooter({
  entry,
  bucket,
}: {
  entry: WishlistEntry;
  bucket: ReturnType<typeof wishlistBucket>;
}) {
  if (bucket === 'trade') {
    return (
      <span className="truncate text-center text-[11px] font-black text-muted-foreground">
        Steers trades
      </span>
    );
  }
  if (bucket === 'owned') {
    return (
      <span className="truncate text-center text-[11px] font-black text-muted-foreground">
        Owned
      </span>
    );
  }
  if (bucket === 'deal') {
    return (
      <span className="truncate text-center text-[11px] font-black text-emerald-600 dark:text-emerald-400">
        On sale today
      </span>
    );
  }
  if (bucket === 'ready') {
    return (
      <span className="truncate text-center text-[11px] font-black text-emerald-600 dark:text-emerald-400">
        Tap to buy
      </span>
    );
  }
  return (
    <>
      <span className="block h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
        <span
          className="block h-full rounded-full bg-emerald-500 transition-[width] duration-500"
          style={{ width: `${Math.min(100, Math.max(4, entry.ratio * 100))}%` }}
        />
      </span>
      <span className="mt-0.5 flex items-center justify-center gap-1 text-[10px] font-black tabular-nums text-muted-foreground">
        <FlyAmount amount={entry.remaining} size={10} />
        to go
      </span>
    </>
  );
}
