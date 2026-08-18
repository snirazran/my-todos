'use client';

import React from 'react';
import {
  Bookmark,
  ChevronRight,
  Clock,
  RefreshCw,
  Sparkles,
  SquarePlay,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import Fly from '@/components/ui/fly';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { DragScrollRow } from '@/components/ui/DragScrollRow';
import { RARITY_CONFIG } from '@/components/ui/gift-box/constants';
import { rewardedAdsAvailable } from '@/lib/ads';
import type { ItemDef } from '@/lib/skins/catalog';
import type { DailyDeal } from '@/lib/skins/dailyDeal';

export function useCountdown(endsAt: string | undefined) {
  const [label, setLabel] = React.useState('');
  React.useEffect(() => {
    if (!endsAt) return;
    const update = () => {
      const ms = new Date(endsAt).getTime() - Date.now();
      if (ms <= 0) {
        setLabel('0:00:00');
        return;
      }
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1000);
      setLabel(
        `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
      );
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  return label;
}

export function DailyDealsTeaser({
  endsAt,
  saleCount = 0,
  onClick,
}: {
  endsAt?: string;
  saleCount?: number;
  onClick: () => void;
}) {
  const countdown = useCountdown(endsAt);
  if (!endsAt) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1 mb-1 flex w-full items-center gap-2 rounded-xl border border-amber-400/40 bg-gradient-to-r from-amber-100/70 to-amber-50/40 px-3 py-2 text-left shadow-sm transition-transform active:scale-[0.99] dark:from-amber-900/30 dark:to-amber-950/20"
    >
      <Sparkles className="h-4 w-4 shrink-0 text-amber-500" />
      <span className="min-w-0 flex-1 truncate text-xs font-black uppercase tracking-wide text-foreground">
        {saleCount > 0
          ? `${saleCount} on sale at the shop`
          : "Today's shop is up"}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-black tabular-nums text-amber-600 dark:text-amber-400">
        <Clock className="h-3.5 w-3.5" />
        {countdown}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

export function DailyDealsShelf({
  deals,
  catalog,
  isPremium,
  rerollsLeft = 0,
  rerolling = false,
  wishlistedIds,
  onBuy,
  onReroll,
  onUpgrade,
}: {
  deals: DailyDeal[];
  catalog: ItemDef[];
  isPremium: boolean;
  rerollsLeft?: number;
  rerolling?: boolean;
  wishlistedIds?: Set<string>;
  onBuy: (item: ItemDef, dealPrice: number) => void;
  onReroll: () => void;
  onUpgrade: () => void;
}) {
  const countdown = useCountdown(deals[0]?.endsAt);
  const byId = React.useMemo(
    () => new Map(catalog.map((i) => [i.id, i])),
    [catalog],
  );
  const isWishlisted = (id: string) => !!wishlistedIds?.has(id);
  // Sales lead, then pins, then the rest — the shelf keeps its six slots either
  // way, so the ordering is what carries "there is something for you today".
  const entries = deals
    .map((deal) => ({ deal, item: byId.get(deal.itemId) }))
    .filter((e): e is { deal: DailyDeal; item: ItemDef } => !!e.item)
    .sort(
      (a, b) =>
        Number(b.deal.onSale) - Number(a.deal.onSale) ||
        Number(isWishlisted(b.item.id)) - Number(isWishlisted(a.item.id)),
    );
  const wishlistHits = entries.filter(
    (entry) => isWishlisted(entry.item.id) && entry.deal.onSale,
  ).length;

  if (!entries.length) return null;

  const canReroll = rerollsLeft > 0 && !rerolling;
  const adReroll = !isPremium && rewardedAdsAvailable();
  const rerollUnavailable = !isPremium && !adReroll;

  return (
    <div className="mb-3">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          Today at the shop
        </span>
        <span className="inline-flex items-center gap-1.5">
          {/* Plus rerolls the shelf for free; everyone else pays for it with a
              rewarded ad. On a platform with no ads the control becomes the
              upgrade pitch, so the perk is concrete rather than abstract. */}
          <button
            type="button"
            onClick={
              rerollUnavailable ? onUpgrade : canReroll ? onReroll : undefined
            }
            disabled={!rerollUnavailable && !canReroll}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-black shadow-sm transition-colors',
              !rerollUnavailable && !canReroll
                ? 'border-border/50 bg-muted/50 text-muted-foreground'
                : 'border-amber-400/60 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-400',
            )}
          >
            <RefreshCw
              className={cn('h-3.5 w-3.5', rerolling && 'animate-spin')}
            />
            {rerollUnavailable ? (
              <>
                Reroll
                <Icon name="frogPlus" label="Plus" className="h-5 w-5" />
              </>
            ) : !canReroll ? (
              'Rerolled today'
            ) : adReroll ? (
              <>
                Reroll
                <SquarePlay className="h-3.5 w-3.5" strokeWidth={2.5} />
              </>
            ) : (
              'Reroll'
            )}
          </button>
          <span className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-card px-2.5 py-1 text-[11px] font-black tabular-nums text-foreground shadow-sm">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            {countdown}
          </span>
        </span>
      </div>

      <DragScrollRow>
        {entries.map(({ deal, item }) => {
          const config = RARITY_CONFIG[item.rarity];
          const wishlisted = isWishlisted(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onBuy(item, deal.dealPrice)}
              className={cn(
                'relative flex w-[148px] shrink-0 flex-col items-stretch overflow-hidden rounded-xl border-2 bg-gradient-to-br p-2 text-left shadow-sm transition-transform active:scale-[0.97]',
                config.border,
                config.gradient,
              )}
            >
              <div className="absolute top-0 left-0 z-20 overflow-hidden rounded-br-2xl bg-background">
                <div
                  className={cn(
                    'px-2 py-1 rounded-br-2xl text-[9px] font-black uppercase tracking-wider border-b border-r',
                    config.bg,
                    config.text,
                    config.border,
                  )}
                >
                  {config.label}
                </div>
              </div>
              {wishlisted && (
                <span className="absolute right-1.5 top-1.5 z-20 inline-flex items-center gap-1 rounded-full bg-primary px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-primary-foreground shadow-sm">
                  <Bookmark
                    className="h-2.5 w-2.5"
                    strokeWidth={3.5}
                    fill="currentColor"
                  />
                  Wishlist
                </span>
              )}
              <div className="relative flex h-24 items-end justify-center overflow-hidden rounded-lg bg-background/50">
                <FrogSnapshot
                  className="h-[120%] w-[120%] object-contain"
                  indices={{ [item.slot]: item.riveIndex }}
                  width={170}
                  height={170}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-center gap-1.5">
                {deal.onSale && (
                  <span className="text-[11px] font-bold tabular-nums text-muted-foreground line-through decoration-2 opacity-70">
                    {deal.priceFlies.toLocaleString()}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-sm font-black tabular-nums text-foreground">
                  <Fly size={26} paused y={-2} />
                  {deal.dealPrice.toLocaleString()}
                </span>
              </div>
              {/* Held even when there is no sale, so the cards in a row keep
                  one baseline instead of jumping by a line. */}
              <span className="mt-0.5 text-center text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                {deal.onSale ? `${deal.discountPercent}% off today` : ' '}
              </span>
            </button>
          );
        })}
      </DragScrollRow>

      {wishlistHits > 0 && (
        <p className="mt-1.5 flex items-center gap-1.5 px-1 text-[11px] font-black text-emerald-600 dark:text-emerald-400">
          <Bookmark className="h-3 w-3 shrink-0" strokeWidth={3.5} fill="currentColor" />
          {wishlistHits === 1
            ? 'Something from your wishlist is on sale today.'
            : `${wishlistHits} of your wishlist picks are on sale today.`}
        </p>
      )}
    </div>
  );
}
