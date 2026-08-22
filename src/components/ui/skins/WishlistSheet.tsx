'use client';

import React from 'react';
import { AnimatePresence } from 'framer-motion';
import { Bookmark, Repeat, ShoppingBag } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import Fly from '@/components/ui/fly';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useTradeConfig } from '@/hooks/useTradeConfig';
import { Icon } from '@/components/ui/Icon';
import {
  wishlistBucket,
  type WishlistBucket,
  type WishlistEntry,
} from '@/lib/skins/wishlist';
import { WishlistTile } from './WishlistTile';

const SECTIONS: {
  bucket: WishlistBucket;
  label: string;
  tone: string;
}[] = [
  {
    bucket: 'deal',
    label: 'On sale today',
    tone: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    bucket: 'ready',
    label: 'Ready to buy',
    tone: 'text-emerald-600 dark:text-emerald-400',
  },
  { bucket: 'saving', label: 'Saving up', tone: 'text-muted-foreground' },
  {
    bucket: 'trade',
    label: 'Trade only',
    tone: 'text-amber-600 dark:text-amber-400',
  },
  { bucket: 'owned', label: 'Already yours', tone: 'text-muted-foreground' },
];

export function WishlistSheet({
  open,
  onClose,
  entries,
  slots,
  balance,
  onOpen,
  onRemove,
  onGoToShop,
  onGoToTrade,
  onUpgrade,
  isPremium = false,
  removing,
}: {
  open: boolean;
  onClose: () => void;
  entries: WishlistEntry[];
  slots: { used: number; max: number };
  balance: number;
  onOpen: (entry: WishlistEntry) => void;
  onRemove: (entry: WishlistEntry) => void;
  onGoToShop: () => void;
  onGoToTrade: () => void;
  onUpgrade: () => void;
  isPremium?: boolean;
  removing?: boolean;
}) {
  const threeCol = useMediaQuery('(min-width: 380px)');
  const modifiers = useTradeConfig(open);
  const isFull = slots.max > 0 && slots.used >= slots.max;
  const showUpsell = isFull && !isPremium;
  const gridClass = cn(
    'grid pt-2 md:grid-cols-4 md:gap-4',
    threeCol ? 'grid-cols-3 gap-2' : 'grid-cols-2 gap-3',
  );

  const readyCount = entries.filter((entry) => {
    const bucket = wishlistBucket(entry);
    return bucket === 'ready' || bucket === 'deal';
  }).length;

  const subtitle = !entries.length
    ? 'Save the looks you want and we’ll track them for you.'
    : readyCount > 0
      ? `${readyCount} of these ${readyCount === 1 ? 'is' : 'are'} within reach right now.`
      : 'Keep earning — we’ll tell you the moment one goes on sale.';

  return (
    <BaseSheet
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      className="max-h-[88dvh] select-none sm:max-h-[84dvh] sm:max-w-[560px]"
      zIndex={1150}
      closeAriaLabel="Close wishlist"
    >
      {({ bindScroll }) => (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 px-5 pb-3 pt-3 sm:px-6 sm:pt-6">
            <div className="flex items-center gap-2 pr-12 sm:pr-14">
              <Bookmark
                className="h-5 w-5 shrink-0 text-primary"
                strokeWidth={2.75}
                fill="currentColor"
              />
              <h2 className="text-xl font-black tracking-tight text-foreground">
                Wishlist
              </h2>
              {slots.max > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-black tabular-nums text-muted-foreground">
                  {slots.used}/{slots.max}
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="min-w-0 text-sm font-medium text-muted-foreground">
                {subtitle}
              </p>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/50 bg-card px-2.5 py-1 text-sm font-black tabular-nums text-foreground shadow-sm">
                <Fly size={26} paused y={-2} />
                {balance.toLocaleString()}
              </span>
            </div>
          </div>

          <div
            ref={bindScroll}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:px-6 sm:pb-6"
          >
            {!entries.length ? (
              <div className="flex flex-col items-center rounded-[24px] border border-dashed border-border/60 bg-muted/30 px-6 py-10 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Bookmark className="h-7 w-7" strokeWidth={2.5} />
                </span>
                <p className="mt-3 text-base font-black text-foreground">
                  Nothing saved yet
                </p>
                <p className="mt-1 max-w-[36ch] text-sm font-medium text-muted-foreground">
                  Tap the bookmark on anything in the shop and it lands here,
                  with a countdown to the flies you still need.
                </p>
                <button
                  type="button"
                  onClick={onGoToShop}
                  className="mt-5 inline-flex h-11 items-center gap-2 rounded-2xl bg-green-500 px-5 text-sm font-black text-white shadow-lg shadow-green-500/25 transition-colors hover:bg-green-600"
                >
                  <ShoppingBag className="h-4 w-4" strokeWidth={3} />
                  Browse the shop
                </button>
              </div>
            ) : (
              <>
                {SECTIONS.map((section) => {
                  const group = entries.filter(
                    (entry) => wishlistBucket(entry) === section.bucket,
                  );
                  if (!group.length) return null;
                  return (
                    <div key={section.bucket} className="pb-3 last:pb-1">
                      <p
                        className={cn(
                          'px-1 text-[12px] font-black',
                          section.tone,
                        )}
                      >
                        {section.label}
                        <span className="ml-1.5 tabular-nums opacity-60">
                          {group.length}
                        </span>
                      </p>
                      <div className={gridClass}>
                        <AnimatePresence initial={false}>
                          {group.map((entry) => (
                            <WishlistTile
                              key={entry.key}
                              entry={entry}
                              variant="grid"
                              onOpen={onOpen}
                              onRemove={onRemove}
                              removing={removing}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    </div>
                  );
                })}

                {showUpsell ? (
                  <button
                    type="button"
                    onClick={onUpgrade}
                    className="mt-2 flex w-full items-center gap-2 rounded-2xl border border-amber-400/60 bg-amber-50 px-4 py-3 text-left transition-colors hover:bg-amber-100 dark:bg-amber-950/30"
                  >
                    <Icon
                      name="frogPlus"
                      label="Plus"
                      className="h-6 w-6 shrink-0"
                    />
                    <span className="min-w-0 text-xs font-bold text-amber-700 dark:text-amber-400">
                      Wishlist full — Plus gives you{' '}
                      {modifiers.wishlistSlotsPlus} slots.
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onGoToTrade}
                    className="mt-2 flex w-full items-center gap-2 rounded-2xl border border-border/50 bg-muted/40 px-4 py-3 text-left transition-colors hover:bg-muted/70"
                  >
                    <Repeat
                      className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                      strokeWidth={3}
                    />
                    <span className="min-w-0 text-xs font-bold text-muted-foreground">
                      Trade-ups lean toward what’s on this list.
                    </span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </BaseSheet>
  );
}
