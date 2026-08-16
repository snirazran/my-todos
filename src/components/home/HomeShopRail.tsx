'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Bookmark, ChevronRight, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import Fly from '@/components/ui/fly';
import Frog from '@/components/ui/frog';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { DragScrollRow } from '@/components/ui/DragScrollRow';
import { RARITY_CONFIG } from '@/components/ui/gift-box/constants';
import { useCountdown } from '@/components/ui/skins/DailyDealsShelf';
import { useInventory } from '@/hooks/useInventory';
import { useAuth } from '@/components/auth/AuthContext';
import {
  buildWishlistEntries,
  type WishlistEntry,
  type WishlistView,
} from '@/lib/skins/wishlist';
import { rarityRank, type ItemDef } from '@/lib/skins/catalog';
import { hapticTick } from '@/lib/haptics';
import { trackAnalyticsEvent } from '@/lib/analytics/client';

type ShopPick = {
  item: ItemDef;
  price: number;
  wasPrice: number;
  discountPercent: number;
};

/**
 * The pinned item's preview. `shrink-0` is load-bearing — without it flex
 * squeezes the frog's width while its height stays, and Rive's fit then
 * letterboxes the art into the wrong place. visualOffsetY=0 rests the art on
 * the box floor; the default offset assumes an unclipped box and pushes it out
 * the bottom. The frog art spans only ~58% of its box width, hence 84 for a
 * 64px well.
 */
function WishlistThumb({ wishlist }: { wishlist: WishlistView }) {
  return (
    <span
      className={cn(
        'flex h-16 w-16 shrink-0 items-end justify-center overflow-hidden rounded-xl bg-gradient-to-br',
        RARITY_CONFIG[wishlist.rarity].gradient,
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
            width={84}
            height={84}
            visualOffsetY={0}
            paused
            indices={{ [wishlist.slot ?? 'hat']: wishlist.riveIndex }}
          />
        </span>
      )}
    </span>
  );
}

function pickWishlistFocus(entries: WishlistEntry[]) {
  return (
    entries
      .filter((entry) => !entry.tradeOnly && !entry.view.owned)
      .sort(
        (a, b) =>
          b.ratio - a.ratio ||
          Number(b.onDeal) - Number(a.onDeal) ||
          b.price - a.price,
      )[0] ?? null
  );
}

/**
 * Today's shop, brought to the home page instead of waiting behind the
 * wardrobe tab. It sits below the task list on purpose: the work zone above it
 * never moves, and the rail is only reached once the day's list is done with.
 */
export function HomeShopRail() {
  const { user } = useAuth();
  const router = useRouter();
  const { data } = useInventory(!!user, true);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const seenRef = React.useRef(false);

  const balance = data?.wardrobe?.flies ?? 0;
  const deals = data?.dailyDeals ?? [];
  const countdown = useCountdown(deals[0]?.endsAt);
  const wishlistEntries = React.useMemo(
    () => buildWishlistEntries(data?.wishlistItems, deals, balance),
    [data?.wishlistItems, deals, balance],
  );
  const focus = pickWishlistFocus(wishlistEntries);
  const savedCount = wishlistEntries.length;

  const picks = React.useMemo<ShopPick[]>(() => {
    const byId = new Map((data?.catalog ?? []).map((i) => [i.id, i]));
    // Same membership rule as the shop's daily-deals shelf: every deal whose
    // item resolves in the catalog. Filtering owned items out here made the
    // two shelves disagree on how many deals the day has.
    const candidates: ShopPick[] = [];
    for (const deal of deals) {
      const item = byId.get(deal.itemId);
      if (!item) continue;
      candidates.push({
        item,
        price: deal.dealPrice,
        wasPrice: deal.priceFlies,
        discountPercent: deal.discountPercent,
      });
    }
    if (!candidates.length) return [];

    // The whole shelf is here (it scrolls), but one you can afford leads so the
    // rail opens on something attainable rather than a wall of locked prices.
    const affordable = candidates
      .filter((c) => c.price <= balance)
      .sort((a, b) => rarityRank[b.item.rarity] - rarityRank[a.item.rarity]);
    const rest = candidates
      .filter((c) => c.price > balance)
      .sort((a, b) => rarityRank[b.item.rarity] - rarityRank[a.item.rarity]);
    return [...affordable, ...rest];
  }, [data?.catalog, deals, balance]);

  React.useEffect(() => {
    if (!picks.length || seenRef.current) return;
    const node = rootRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || seenRef.current) return;
        seenRef.current = true;
        observer.disconnect();
        trackAnalyticsEvent('home_shop_rail_viewed', {
          pick_count: picks.length,
          affordable: picks.filter((p) => p.price <= balance).length,
          has_wishlist: savedCount > 0,
        });
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [picks, balance, savedCount]);

  if (!user || !picks.length) return null;

  const open = (
    source: string,
    itemId?: string,
    kind: 'item' | 'background' = 'item',
  ) => {
    hapticTick();
    trackAnalyticsEvent('home_shop_rail_tapped', { source, item_id: itemId });
    router.push(
      itemId
        ? `/wardrobe?tab=shop&item=${encodeURIComponent(itemId)}&kind=${kind}`
        : '/wardrobe?tab=shop',
    );
  };

  return (
    <div ref={rootRef} className="mx-1.5 mt-4 md:mx-4 md:mt-8">
      {focus && (
        <button
          type="button"
          onClick={() =>
            open(
              focus.affordable ? 'goal_reached' : 'goal',
              focus.view.itemId,
              focus.view.kind,
            )
          }
          className={cn(
            'mb-3 flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors',
            focus.affordable
              ? 'border-emerald-500/40 bg-emerald-500/[0.06] hover:bg-emerald-500/10'
              : 'border-border/40 bg-card/60 hover:bg-muted/40',
          )}
        >
          <WishlistThumb wishlist={focus.view} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <Bookmark
                  className="h-3 w-3 shrink-0 text-muted-foreground/70"
                  strokeWidth={3}
                  fill="currentColor"
                />
                <span className="text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                  Wishlist
                  {savedCount > 1 ? ` · ${savedCount} saved` : ''}
                </span>
                {focus.onDeal && (
                  <span className="rounded-full bg-amber-500/15 px-1.5 py-px text-[9px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">
                    {focus.discountPercent}% off
                  </span>
                )}
              </span>
              {focus.affordable ? (
                <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Ready to buy
                </span>
              ) : (
                <span className="flex shrink-0 items-center gap-1 text-[11px] font-black tabular-nums text-muted-foreground">
                  <Fly size={26} paused y={-5} x={3} />
                  {focus.remaining.toLocaleString()} to go
                </span>
              )}
            </span>
            <span className="mt-2 block h-1 overflow-hidden rounded-full bg-muted">
              <span
                className={cn(
                  'block h-full rounded-full transition-[width] duration-700 ease-out',
                  focus.affordable
                    ? 'bg-emerald-500'
                    : focus.onDeal
                      ? 'bg-amber-500'
                      : 'bg-primary',
                )}
                style={{
                  width: `${Math.max(3, Math.round(focus.ratio * 100))}%`,
                }}
              />
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
        </button>
      )}

      <button
        type="button"
        onClick={() => open('header')}
        className="mb-2 flex w-full items-center gap-2 px-1 text-left"
      >
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          Today at the shop
        </span>
        {countdown && (
          <span className="inline-flex items-center gap-1 text-[11px] font-black tabular-nums text-muted-foreground">
            <Clock className="h-3 w-3" />
            {countdown}
          </span>
        )}
        <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
      </button>

      {/* Same card as the shop's daily-deals shelf — corner rarity ribbon,
          rarity gradient, struck original, effective discount. */}
      <DragScrollRow>
        {picks.map(({ item, price, wasPrice, discountPercent }) => {
          const config = RARITY_CONFIG[item.rarity];
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => open('card', item.id, 'item')}
              className={cn(
                'relative flex w-[148px] shrink-0 flex-col items-stretch overflow-hidden rounded-xl border-2 bg-gradient-to-br p-2 text-left shadow-sm transition-transform active:scale-[0.97]',
                config.border,
                config.gradient,
              )}
            >
              <span className="absolute left-0 top-0 z-20 overflow-hidden rounded-br-2xl bg-background">
                <span
                  className={cn(
                    'block rounded-br-2xl border-b border-r px-2 py-1 text-[9px] font-black uppercase tracking-wider',
                    config.bg,
                    config.text,
                    config.border,
                  )}
                >
                  {config.label}
                </span>
              </span>

              <span className="relative flex h-24 items-end justify-center overflow-hidden rounded-lg bg-background/50">
                <FrogSnapshot
                  className="h-[120%] w-[120%] object-contain"
                  indices={{ [item.slot]: item.riveIndex }}
                  width={170}
                  height={170}
                />
              </span>

              <span className="mt-1.5 flex items-center justify-center gap-1.5">
                {wasPrice > price && (
                  <span className="text-[11px] font-bold tabular-nums text-muted-foreground line-through decoration-2 opacity-70">
                    {wasPrice.toLocaleString()}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-sm font-black tabular-nums text-foreground">
                  <Fly size={26} paused y={-2} />
                  {price.toLocaleString()}
                </span>
              </span>

              <span className="mt-0.5 text-center text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                {discountPercent}% off today
              </span>
            </button>
          );
        })}
      </DragScrollRow>

    </div>
  );
}
