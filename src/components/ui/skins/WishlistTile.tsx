'use client';

import { motion } from 'framer-motion';
import { Check, Repeat, X } from 'lucide-react';
import Fly from '@/components/ui/fly';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { RARITY_CONFIG } from '@/components/ui/gift-box/constants';
import { cn } from '@/lib/utils';
import { wishlistBucket, type WishlistEntry } from '@/lib/skins/wishlist';

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
  const config = RARITY_CONFIG[view.rarity];
  const bucket = wishlistBucket(entry);
  const row = variant === 'row';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      className={cn('relative', row ? 'w-[148px] shrink-0' : 'w-full')}
    >
      <button
        type="button"
        onClick={() => onOpen(entry)}
        className={cn(
          'relative flex h-full w-full flex-col items-stretch overflow-hidden rounded-xl border-2 bg-gradient-to-br p-2 text-left shadow-sm transition-transform active:scale-[0.97]',
          config.border,
          config.gradient,
          bucket === 'ready' &&
            'ring-2 ring-emerald-500/60 ring-offset-1 ring-offset-background',
        )}
      >
        <div className="absolute left-0 top-0 z-20 overflow-hidden rounded-br-2xl bg-background">
          <div
            className={cn(
              'rounded-br-2xl border-b border-r px-2 py-1 text-[9px] font-black uppercase tracking-wider',
              config.bg,
              config.text,
              config.border,
            )}
          >
            {config.label}
          </div>
        </div>

        <div
          className={cn(
            'relative flex items-end justify-center overflow-hidden rounded-lg bg-background/50',
            row ? 'h-24' : 'aspect-[1/1]',
          )}
        >
          {view.kind === 'background' && view.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={view.imageUrl}
              alt={view.name}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <FrogSnapshot
              className="h-[120%] w-[120%] object-contain"
              indices={{ [view.slot ?? 'hat']: view.riveIndex }}
              width={170}
              height={170}
            />
          )}
          {entry.onDeal && (
            <span className="absolute bottom-0 left-0 z-20 rounded-tr-xl bg-emerald-500 px-1.5 py-0.5 text-[9px] font-black text-white shadow-sm">
              −{entry.discountPercent}%
            </span>
          )}
          {view.owned && (
            <span className="absolute right-1 top-1 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white shadow-sm">
              <Check className="h-3 w-3 stroke-[4]" />
            </span>
          )}
        </div>

        <p className="mt-1.5 truncate text-center text-[11px] font-black text-foreground">
          {view.name}
        </p>

        <div className="mt-0.5 flex h-5 items-center justify-center gap-1.5">
          {entry.tradeOnly ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">
              <Repeat className="h-3 w-3" strokeWidth={3.5} />
              Trade for it
            </span>
          ) : (
            <>
              {entry.onDeal && (
                <span className="text-[11px] font-bold tabular-nums text-muted-foreground line-through decoration-2 opacity-70">
                  {entry.fullPrice.toLocaleString()}
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-sm font-black tabular-nums text-foreground">
                <Fly size={26} paused y={-2} />
                {entry.price.toLocaleString()}
              </span>
            </>
          )}
        </div>

        <div className="mt-1 flex h-7 flex-col justify-center">
          <WishlistTileFooter entry={entry} bucket={bucket} />
        </div>
      </button>

      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${view.name} from your wishlist`}
          disabled={removing}
          onClick={() => onRemove(entry)}
          className="absolute -right-1.5 -top-1.5 z-30 flex h-6 w-6 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" strokeWidth={3} />
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
      <span className="text-center text-[10px] font-black uppercase tracking-wider text-muted-foreground">
        Steers your trade-ups
      </span>
    );
  }
  if (bucket === 'owned') {
    return (
      <span className="text-center text-[10px] font-black uppercase tracking-wider text-muted-foreground">
        In your wardrobe
      </span>
    );
  }
  if (bucket === 'deal') {
    return (
      <span className="text-center text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
        {entry.discountPercent}% off today
      </span>
    );
  }
  if (bucket === 'ready') {
    return (
      <span className="text-center text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
        Tap to buy
      </span>
    );
  }
  return (
    <>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
        <div
          className="h-full rounded-full bg-emerald-500 transition-[width] duration-500"
          style={{ width: `${Math.min(100, Math.max(4, entry.ratio * 100))}%` }}
        />
      </div>
      <span className="mt-0.5 flex items-center justify-center gap-0.5 text-[10px] font-black tabular-nums text-muted-foreground">
        <Fly size={18} paused y={-2} />
        {entry.remaining.toLocaleString()} to go
      </span>
    </>
  );
}
