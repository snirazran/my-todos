'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Bookmark, ChevronRight, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FlyAmount } from '@/components/ui/FlyAmount';
import Frog from '@/components/ui/frog';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { DragScrollRow } from '@/components/ui/DragScrollRow';
import { RARITY_CONFIG } from '@/components/ui/gift-box/constants';
import { useCountdown } from '@/components/ui/skins/DailyDealsShelf';
import { useInventory } from '@/hooks/useInventory';
import { useAuth } from '@/components/auth/AuthContext';
import { useScrollTapGuard } from '@/hooks/useScrollTapGuard';
import {
  buildWishlistEntries,
  type WishlistEntry,
  type WishlistView,
} from '@/lib/skins/wishlist';
import type { ItemDef } from '@/lib/skins/catalog';
import { hapticTick } from '@/lib/haptics';
import { trackAnalyticsEvent } from '@/lib/analytics/client';

type ShopPick = {
  item: ItemDef;
  price: number;
  wasPrice: number;
  discountPercent: number;
  onSale: boolean;
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
        'flex h-12 w-12 shrink-0 items-end justify-center overflow-hidden rounded-xl bg-gradient-to-br',
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
            width={63}
            height={63}
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
  const tapGuard = useScrollTapGuard<HTMLElement>();
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
    // Same membership rule as the shop's shelf: every slot whose item resolves
    // in the catalog. Filtering owned items out here made the two shelves
    // disagree on how many slots the day has.
    const candidates: ShopPick[] = [];
    for (const deal of deals) {
      const item = byId.get(deal.itemId);
      if (!item) continue;
      candidates.push({
        item,
        price: deal.dealPrice,
        wasPrice: deal.priceFlies,
        discountPercent: deal.discountPercent,
        onSale: !!deal.onSale,
      });
    }
    if (!candidates.length) return [];

    const affordable = candidates
      .filter((c) => c.price <= balance)
      .sort((a, b) => Number(b.onSale) - Number(a.onSale) || b.price - a.price);
    const rest = candidates
      .filter((c) => c.price > balance)
      .sort((a, b) => a.price - b.price);
    return [...affordable, ...rest];
  }, [data?.catalog, deals, balance]);

  React.useEffect(() => {
    if (!picks.length || seenRef.current) return;
    const node = tapGuard.ref.current;
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
  }, [picks, balance, savedCount, tapGuard.ref]);

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
    <section
      ref={tapGuard.ref}
      onPointerDownCapture={tapGuard.onPointerDownCapture}
      onClickCapture={tapGuard.onClickCapture}
      className="mx-1.5 mt-7 md:mx-4 md:mt-10"
    >
      <div className="mb-2 flex min-h-9 items-center justify-between gap-2 pl-3.5 pr-1 md:pl-4">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="text-[19px] font-black tracking-tight text-foreground md:text-[21px]">
            Shop deals
          </h2>
          {countdown && (
            <span className="inline-flex items-center gap-1 text-[13px] font-bold tabular-nums text-muted-foreground">
              <Clock className="h-3.5 w-3.5 self-center" strokeWidth={2.5} />
              {countdown}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => open('header')}
          className="inline-flex h-9 shrink-0 items-center gap-0.5 rounded-full px-2.5 text-[13px] font-black text-primary transition-colors [@media(hover:hover)]:hover:bg-primary/10"
        >
          See all
          <ChevronRight className="h-4 w-4" strokeWidth={2.75} />
        </button>
      </div>

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
          className="mb-2.5 flex w-full items-center gap-3 rounded-[20px] border border-border/60 bg-card py-2 pl-2 pr-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-colors active:bg-muted/50 [@media(hover:hover)]:hover:bg-muted/40"
        >
          <WishlistThumb wishlist={focus.view} />
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="flex min-w-0 items-center gap-1.5">
              <Bookmark
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70"
                strokeWidth={3}
                fill="currentColor"
              />
              <span className="truncate text-[14px] font-bold text-foreground">
                {focus.affordable ? 'Ready to buy' : 'Wishlist'}
              </span>
              {focus.onDeal && (
                <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-px text-[11px] font-black text-amber-700 dark:text-amber-400">
                  -{focus.discountPercent}%
                </span>
              )}
            </span>
            <span className="flex items-center gap-2">
              <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-foreground/[0.07] shadow-[inset_0_1px_2px_rgba(0,0,0,0.10)]">
                <span
                  className={cn(
                    'absolute inset-y-0 left-0 rounded-full bg-gradient-to-b transition-[width] duration-700 ease-out',
                    focus.affordable
                      ? 'from-emerald-400 to-emerald-500'
                      : 'from-amber-300 to-amber-400',
                  )}
                  style={{
                    width: `${Math.max(6, Math.round(focus.ratio * 100))}%`,
                  }}
                >
                  <span className="absolute inset-x-[3px] top-px h-[35%] rounded-full bg-white/50" />
                </span>
              </span>
              {!focus.affordable && (
                <FlyAmount
                  amount={focus.remaining}
                  size={11}
                  className="shrink-0 font-black text-muted-foreground"
                />
              )}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
        </button>
      )}

      <DragScrollRow className="-mx-3 snap-x snap-mandatory scroll-px-3 gap-2.5 px-3 pb-2 md:mx-0 md:px-0 md:scroll-px-0">
        {picks.map(({ item, price, wasPrice, discountPercent, onSale }) => {
          const config = RARITY_CONFIG[item.rarity];
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => open('card', item.id, 'item')}
              className="relative flex w-[136px] shrink-0 snap-start flex-col overflow-hidden rounded-[20px] border border-border/60 bg-card p-1.5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-transform active:scale-[0.97]"
            >
              <span
                className={cn(
                  'relative flex h-[104px] items-end justify-center overflow-hidden rounded-[14px] bg-gradient-to-br',
                  config.gradient,
                )}
              >
                <FrogSnapshot
                  className="h-[120%] w-[120%] object-contain"
                  indices={{ [item.slot]: item.riveIndex }}
                  width={170}
                  height={170}
                />
                <span
                  className={cn(
                    'absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-black leading-none ring-1 ring-inset ring-black/5',
                    config.bg,
                    config.text,
                  )}
                >
                  {config.label}
                </span>
                {onSale && (
                  <span className="absolute right-1.5 top-1.5 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-black leading-none text-amber-950">
                    -{discountPercent}%
                  </span>
                )}
              </span>
              <span className="flex items-center justify-between gap-1 px-1 pb-0.5 pt-1.5">
                <FlyAmount
                  amount={price}
                  size={14}
                  className="pl-0.5 font-black text-foreground"
                />
                {onSale && (
                  <span className="text-[11px] font-bold tabular-nums text-muted-foreground/70 line-through">
                    {wasPrice.toLocaleString()}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </DragScrollRow>
    </section>
  );
}
