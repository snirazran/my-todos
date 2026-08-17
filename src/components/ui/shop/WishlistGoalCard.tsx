'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import Fly from '@/components/ui/fly';
import Frog from '@/components/ui/frog';
import { useWishlist } from '@/hooks/useWishlist';
import { hapticTick } from '@/lib/haptics';
import { RARITY_CONFIG } from '@/components/ui/gift-box/constants';

/**
 * The goal, at the top of the fly shop.
 *
 * Opening a currency store on a wall of price tiers asks "how much do you want
 * to spend?" — a question with a natural answer of nothing. Leading with the
 * item they already chose asks "how do you want to close this gap?", which is
 * the goal-gradient framing: motivation rises as the remaining distance
 * shrinks, so the number worth showing is what's *left*, not what's banked.
 */
export function WishlistGoalCard({
  open,
  onNavigate,
}: {
  open: boolean;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const { wishlist, pricing, progress } = useWishlist(open);

  const go = (path: string) => {
    hapticTick();
    onNavigate();
    router.push(path);
  };

  if (!wishlist || !pricing || !progress) return null;

  const config = RARITY_CONFIG[wishlist.rarity];
  const itemPath = `/wardrobe?tab=shop&item=${encodeURIComponent(wishlist.itemId)}&kind=${wishlist.kind}`;
  // A hair of fill even at the very start: they do have flies, and a bar
  // pinned at literal zero reads as "hopeless" rather than "begun".
  const fill = Math.max(progress.ratio, 0.03);

  return (
    <div
      className={cn(
        'mt-1 overflow-hidden rounded-[20px] border-2 bg-card',
        progress.reached ? 'border-emerald-400' : config.border,
      )}
    >
      <button
        type="button"
        onClick={() => go(itemPath)}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <span
          className={cn(
            'flex h-16 w-16 shrink-0 items-end justify-center overflow-hidden rounded-2xl bg-gradient-to-br',
            config.gradient,
          )}
        >
          {wishlist.kind === 'background' && wishlist.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={wishlist.imageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="shrink-0">
              <Frog
                width={80}
                height={80}
                visualOffsetY={0}
                paused
                indices={{ [wishlist.slot ?? 'hat']: wishlist.riveIndex }}
              />
            </span>
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block text-[10px] font-black uppercase tracking-[0.16em]',
              config.text,
            )}
          >
            {config.label}
          </span>
          <span className="mt-1 flex items-center gap-1.5">
            {pricing.onDeal && (
              <>
                <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  {pricing.discountPercent}% off
                </span>
                <span className="text-[11px] font-bold tabular-nums text-muted-foreground line-through decoration-2 opacity-70">
                  {pricing.fullPrice.toLocaleString()}
                </span>
              </>
            )}
            <span className="inline-flex items-center gap-1 text-sm font-black tabular-nums text-foreground">
              <Fly size={22} paused y={-3} />
              {pricing.price.toLocaleString()}
            </span>
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      <div className="px-3 pb-3">
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-700 ease-out',
              progress.reached
                ? 'bg-emerald-500'
                : pricing.onDeal
                  ? 'bg-amber-500'
                  : 'bg-primary',
            )}
            style={{ width: `${Math.round(fill * 100)}%` }}
          />
        </div>

        {progress.reached ? (
          <button
            type="button"
            onClick={() => go(itemPath)}
            className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[#4f9149] text-sm font-black tracking-wide text-white shadow-[0_4px_0_0_#34631f] transition-all active:translate-y-0.5 active:shadow-none"
          >
            You can afford it — get it now
          </button>
        ) : (
          <p className="mt-2 flex items-center justify-center gap-1.5 text-xs font-bold text-muted-foreground">
            <Fly size={26} paused y={-3} oversample={1.25} />
            <span className="tabular-nums text-foreground">
              {progress.remaining.toLocaleString()}
            </span>
            to go
          </p>
        )}
      </div>
    </div>
  );
}
