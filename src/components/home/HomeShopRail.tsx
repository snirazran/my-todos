'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import Fly from '@/components/ui/fly';
import Frog from '@/components/ui/frog';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { DragScrollRow } from '@/components/ui/DragScrollRow';
import { RARITY_CONFIG } from '@/components/ui/gift-box/constants';
import { useCountdown } from '@/components/ui/skins/DailyDealsShelf';
import { useInventory } from '@/hooks/useInventory';
import { useAuth } from '@/components/auth/AuthContext';
import { wishlistProgress } from '@/lib/skins/wishlist';
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
function WishlistThumb({
  wishlist,
  tone = 'muted',
}: {
  wishlist: NonNullable<ReturnType<typeof useInventory>['data']>['wishlist'];
  tone?: 'muted' | 'emerald';
}) {
  if (!wishlist) return null;
  return (
    <span
      className={cn(
        'flex h-16 w-16 shrink-0 items-end justify-center overflow-hidden rounded-xl',
        tone === 'emerald' ? 'bg-emerald-500/10' : 'bg-muted/50',
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
  const inventory = data?.wardrobe?.inventory ?? {};
  const deals = data?.dailyDeals ?? [];
  const countdown = useCountdown(deals[0]?.endsAt);
  const wishlist = data?.wishlist ?? null;
  const goal = wishlist ? wishlistProgress(wishlist.price, balance) : null;

  const picks = React.useMemo<ShopPick[]>(() => {
    const byId = new Map((data?.catalog ?? []).map((i) => [i.id, i]));
    const candidates: ShopPick[] = [];
    for (const deal of deals) {
      const item = byId.get(deal.itemId);
      if (!item || item.slot === 'container') continue;
      if ((inventory[item.id] ?? 0) > 0) continue;
      const full = deal.priceFlies || (item.priceFlies ?? 0);
      if (full <= 0) continue;
      candidates.push({
        item,
        price: deal.dealPrice,
        wasPrice: full,
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
  }, [data?.catalog, deals, inventory, balance]);

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
          has_wishlist: !!wishlist,
        });
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [picks, balance, wishlist]);

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

  const affordableCount = picks.filter((p) => p.price <= balance).length;

  return (
    <div ref={rootRef} className="mx-1.5 mt-4 md:mx-4 md:mt-8">
      {goal && wishlist && !goal.reached && (
        <button
          type="button"
          onClick={() => open('goal', wishlist.itemId, wishlist.kind)}
          className="mb-3 flex w-full items-center gap-3 rounded-2xl border border-border/50 bg-card px-3 py-2.5 text-left shadow-sm transition-colors hover:bg-muted/40"
        >
          <WishlistThumb wishlist={wishlist} />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[13px] font-black tracking-tight text-foreground">
                Saving for {wishlist.name}
              </span>
              <span className="flex shrink-0 items-center gap-1 text-[11px] font-black tabular-nums text-muted-foreground">
                <Fly size={28} paused y={-5} x={4} />
                {goal.remaining.toLocaleString()} to go
              </span>
            </span>
            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
                style={{ width: `${Math.round(goal.ratio * 100)}%` }}
              />
            </span>
          </span>
        </button>
      )}

      {goal && wishlist && goal.reached && (
        <button
          type="button"
          onClick={() => open('goal_reached', wishlist.itemId, wishlist.kind)}
          className="mb-3 flex w-full items-center gap-3 rounded-2xl border border-emerald-400/50 bg-emerald-50 px-3 py-2.5 text-left shadow-sm dark:bg-emerald-950/30"
        >
          <WishlistThumb wishlist={wishlist} tone="emerald" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-black tracking-tight text-emerald-700 dark:text-emerald-300">
            {wishlist.name} is yours — you saved enough!
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
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

      {affordableCount > 0 && (
        <p className="mt-2 px-1 text-[11px] font-semibold text-muted-foreground">
          You can afford {affordableCount} of {picks.length} right now.
        </p>
      )}
    </div>
  );
}
