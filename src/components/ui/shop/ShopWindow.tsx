'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronRight, Heart, Sparkle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { AdPlayIcon } from '@/components/ui/AdPlayIcon';
import { FlyAmount } from '@/components/ui/FlyAmount';
import { FlyCounter } from '@/components/ui/FlyCounter';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { FrogSpeechBubble } from '@/components/ui/FrogSpeechBubble';
import { ShopGiftTile } from '@/components/ui/shop/ShopGiftPopup';
import { BackgroundArt, ItemArt, TileArt } from '@/components/ui/skins/DressingRoom';
import { useCountdown } from '@/components/ui/skins/DailyDealsShelf';
import { previousRoute } from '@/components/ui/skins/WardrobeMobileChrome';
import {
  byId as staticById,
  isTradeOnlyRarity,
  type ItemDef,
  type Rarity,
} from '@/lib/skins/catalog';
import { DEFAULT_SHOP_SALES } from '@/lib/skins/shopSales';
import { isEverydayItem, isShopBuyable, type DailyDeal } from '@/lib/skins/dailyDeal';
import type { BackgroundItem } from '@/hooks/useBackgrounds';
import type { ShopGiftStatus } from '@/lib/economy/shopGift';
import { warmFrogStamps, type FrogStampIndices } from '@/lib/frogStampEngine';
import { riveDevicePixelRatio } from '@/lib/riveLoader';
import { hapticTick } from '@/lib/haptics';

type ShopEntry =
  | { kind: 'item'; key: string; item: ItemDef; rarity: Rarity; price: number }
  | { kind: 'bg'; key: string; bg: BackgroundItem; rarity: Rarity; price: number };

const SELLER_OUTFIT = { hat: '3002', body: '2002', hand_item: '4003' } as const;

function stableRank(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function ShopTile({
  entry,
  owned,
  locked,
  wished,
  saleTag,
  wasPrice,
  small,
  onTap,
}: {
  entry: ShopEntry;
  owned: boolean;
  locked: boolean;
  wished: boolean;
  saleTag?: boolean;
  wasPrice?: number;
  small?: boolean;
  onTap: () => void;
}) {
  const name = entry.kind === 'item' ? entry.item.name : entry.bg.name;
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`${name}${owned ? ', owned' : locked ? ', Plus only today' : `, ${entry.price} flies`}`}
      className={cn(
        'group relative flex w-full flex-col bg-card text-left shadow-[0_3px_0_0_hsl(var(--border))] ring-1 ring-border/70 transition-[transform,box-shadow] active:translate-y-0.5 active:shadow-none',
        small ? 'rounded-[20px] p-1.5' : 'rounded-[22px] p-1.5',
      )}
    >
      <TileArt
        rarity={entry.rarity}
        tone="closet"
        className={cn(
          'rounded-[16px]',
          small && 'aspect-[6/5] md:aspect-square',
          owned && 'opacity-60',
        )}
      >
        {entry.kind === 'item' ? <ItemArt item={entry.item} /> : <BackgroundArt bg={entry.bg} />}
        {wished && !owned && (
          <span className="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-background/95 text-rose-500 shadow-sm">
            <Heart className="h-3 w-3" strokeWidth={3} fill="currentColor" />
          </span>
        )}
        {owned && (
          <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <Check className="h-3 w-3" strokeWidth={4} />
          </span>
        )}
      </TileArt>
      {locked && !owned && (
        <Icon
          name="frogPlus"
          label="Plus"
          className={cn(
            'absolute z-10 rotate-[12deg] drop-shadow-[0_2px_0_rgba(31,98,28,0.3)]',
            '-right-1.5 -top-2 h-10 w-10',
          )}
        />
      )}
      {saleTag && !owned && (
        <Icon
          name="discount"
          className={cn(
            'absolute z-10 rotate-[12deg] drop-shadow-[0_2px_0_rgba(31,98,28,0.25)]',
            '-right-1.5 -top-2 h-9 w-9',
          )}
        />
      )}
      <span
        className={cn(
          'flex items-center justify-center gap-1 font-black leading-none',
          small ? 'h-8 pt-1 text-[15px]' : 'h-9 pt-1.5 text-[16px]',
        )}
      >
        {owned ? (
          <span className="text-primary">Owned</span>
        ) : (
          <>
            <FlyAmount amount={entry.price} size={small ? 16 : 17} className="text-foreground" />
            {wasPrice != null && wasPrice > entry.price && (
              <span className="text-[13px] font-bold tabular-nums text-muted-foreground line-through">
                {wasPrice.toLocaleString()}
              </span>
            )}
          </>
        )}
      </span>
    </button>
  );
}

function RefreshButton({
  free,
  plus,
  busy,
  onClick,
}: {
  free: boolean;
  plus: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  const label = !free
    ? 'Watch a short ad to refresh the Special collection'
    : plus
      ? 'Refresh the Special collection, free with Plus'
      : 'Refresh the Special collection, free once a day';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      className="group flex h-12 shrink-0 items-center transition-transform active:translate-y-0.5 disabled:opacity-70"
    >
      <span className="flex h-7 items-center gap-1 rounded-full border border-amber-200 bg-gradient-to-b from-[#ffdf83] to-[#f3bd48] pl-3 pr-6 text-[12px] font-black uppercase leading-none tracking-[0.06em] text-[#49320f] shadow-[0_2px_0_#c58c31]">
        {free ? (
          'Free'
        ) : (
          <>
            <AdPlayIcon className="h-3.5 w-3.5" strokeWidth={3} />
            Ad
          </>
        )}
      </span>
      <span className="relative -ml-4 grid h-12 w-12 place-items-center rounded-full bg-gradient-to-b from-[#fff4c9] to-[#fcd264] shadow-[0_3px_0_0_#c58c31] ring-[3px] ring-inset ring-[#f3bd48] group-active:shadow-[0_1px_0_0_#c58c31]">
        <Icon
          name="repeat"
          className={cn('h-10 w-10', busy && 'animate-spin')}
          style={
            {
              '--repeat-icon-grey': '#b06d0c',
              '--repeat-icon-green': '#447d3f',
            } as React.CSSProperties
          }
        />
      </span>
    </button>
  );
}

function SpecialBanner({
  countdown,
  action,
}: {
  countdown: string | null;
  action?: React.ReactNode;
}) {
  return (
    <div className="relative mb-3 flex min-h-[64px] items-center gap-3 overflow-hidden rounded-[20px] bg-gradient-to-b from-[#56984d] to-[#3d7437] py-2 pl-3 pr-2 shadow-[0_3px_0_0_#2c511a] ring-1 ring-inset ring-white/10">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent"
      />
      <span aria-hidden className="relative block h-9 w-9 shrink-0">
        <Sparkle
          className="absolute bottom-0 left-0 h-[24px] w-[24px] fill-[#ffd54f] text-[#f3bd48]"
          strokeWidth={2}
        />
        <Sparkle
          className="absolute right-0.5 top-0 h-[15px] w-[15px] fill-[#ffe58a] text-[#f3bd48]"
          strokeWidth={2.25}
        />
        <Sparkle
          className="absolute bottom-1 right-0 h-[10px] w-[10px] fill-[#ffe58a] text-[#f3bd48]"
          strokeWidth={2.5}
        />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block truncate text-[18px] font-black leading-tight tracking-tight text-white">
          Special collection
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] font-bold tabular-nums text-white/80">
          {countdown ? `Items refresh in ${countdown}` : 'New items every day'}
        </span>
      </span>
      {action ? <span className="relative">{action}</span> : null}
    </div>
  );
}

const HEADER_TONE = {
  gold: 'bg-[#fff1c7] ring-[#f1d27f] shadow-[0_3px_0_0_#e3b94f] dark:bg-amber-400/15 dark:ring-amber-300/25 dark:shadow-[0_3px_0_0_rgba(0,0,0,0.35)]',
  green:
    'bg-[#e4f3de] ring-[#bfe0b5] shadow-[0_3px_0_0_#9fcd92] dark:bg-[#447d3f]/25 dark:ring-[#6cbb5f]/25 dark:shadow-[0_3px_0_0_rgba(0,0,0,0.35)]',
};

function SectionHeader({
  icon,
  tone,
  title,
  sub,
  action,
}: {
  icon: React.ReactNode;
  tone: keyof typeof HEADER_TONE;
  title: string;
  sub: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3.5 flex items-center gap-3">
      <span
        className={cn(
          'grid h-12 w-12 shrink-0 -rotate-3 place-items-center rounded-[16px] ring-1',
          HEADER_TONE[tone],
        )}
      >
        <span className="rotate-3">{icon}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[19px] font-black leading-tight tracking-tight text-foreground">
          {title}
        </span>
        <span className="mt-0.5 flex items-center gap-1 text-[12.5px] font-bold tabular-nums text-muted-foreground">
          {sub}
        </span>
      </span>
      {action}
    </div>
  );
}

export function ShopWindow({
  loading,
  balance,
  catalog,
  backgrounds,
  inventory,
  bgInventory,
  deals,
  everydayIds,
  isPremium,
  isGuest,
  rerollsLeft,
  rerollFree,
  rerolling,
  wishlistedIds,
  shopGift,
  onOpenItem,
  onOpenBackground,
  onReroll,
  onPlus,
  onClaimGift,
  onOpenCatalog,
  onGetFlies,
}: {
  loading: boolean;
  balance: number;
  catalog: ItemDef[];
  backgrounds: BackgroundItem[];
  inventory: Record<string, number>;
  bgInventory: Record<string, number>;
  deals: DailyDeal[];
  everydayIds?: string[];
  isPremium: boolean;
  isGuest: boolean;
  rerollsLeft: number;
  rerollFree: boolean;
  rerolling: boolean;
  wishlistedIds: ReadonlySet<string>;
  shopGift?: ShopGiftStatus;
  onOpenItem: (item: ItemDef, dealPrice: number | null) => void;
  onOpenBackground: (bg: BackgroundItem) => void;
  onReroll: () => void;
  onPlus: (placement: string, item?: ItemDef) => void;
  onClaimGift: () => void;
  onOpenCatalog: () => void;
  onGetFlies: () => void;
}) {
  const router = useRouter();
  const byId = useMemo(() => new Map(catalog.map((item) => [item.id, item])), [catalog]);

  const close = () => {
    hapticTick();
    const previous = previousRoute();
    if (previous && previous !== '/shop') router.back();
    else router.push('/');
  };

  const sellerIndices = useMemo<FrogStampIndices>(() => {
    const index = (id: string) => (byId.get(id) ?? staticById[id])?.riveIndex ?? 0;
    return {
      skin: 0,
      mood: 0,
      hat: index(SELLER_OUTFIT.hat),
      body: index(SELLER_OUTFIT.body),
      hand_item: index(SELLER_OUTFIT.hand_item),
    };
  }, [byId]);

  const sale = deals.find((deal) => deal.sale);
  const saleItem = sale ? byId.get(sale.itemId) : undefined;
  const special = useMemo(
    () =>
      deals
        .map((deal) => ({ deal, item: byId.get(deal.itemId) }))
        .filter((row): row is { deal: DailyDeal; item: ItemDef } => !!row.item),
    [deals, byId],
  );
  const endsAt = deals[0]?.endsAt;
  const countdown = useCountdown(endsAt);

  const frozenEveryday = useRef<Set<string> | null>(null);
  const everyday = useMemo<ShopEntry[]>(() => {
    if (loading) return [];
    const ids = everydayIds
      ? new Set(everydayIds)
      : new Set(
          catalog
            .filter((item) => isShopBuyable(item) && isEverydayItem(item, DEFAULT_SHOP_SALES))
            .map((item) => item.id),
        );
    const entries: ShopEntry[] = [];
    for (const item of catalog) {
      if (!ids.has(item.id)) continue;
      entries.push({
        kind: 'item',
        key: `item:${item.id}`,
        item,
        rarity: item.rarity,
        price: item.priceFlies ?? 0,
      });
    }
    for (const bg of backgrounds) {
      const rarity = bg.rarity as Rarity;
      if (isTradeOnlyRarity(rarity) || !((bg.priceFlies ?? 0) > 0)) continue;
      entries.push({ kind: 'bg', key: `bg:${bg.id}`, bg, rarity, price: bg.priceFlies ?? 0 });
    }
    if (!frozenEveryday.current) {
      frozenEveryday.current = new Set(
        entries
          .filter((entry) =>
            entry.kind === 'item'
              ? (inventory[entry.item.id] ?? 0) <= 0
              : (bgInventory[entry.bg.id] ?? 0) <= 0,
          )
          .map((entry) => entry.key),
      );
    }
    const keep = frozenEveryday.current;
    return entries
      .filter((entry) => keep.has(entry.key))
      .sort((a, b) => stableRank(a.key) - stableRank(b.key));
  }, [loading, everydayIds, catalog, backgrounds, inventory, bgInventory]);

  const warmList = useMemo(() => {
    const list: FrogStampIndices[] = [sellerIndices];
    if (saleItem) list.push({ [saleItem.slot]: saleItem.riveIndex });
    for (const { item } of special) list.push({ [item.slot]: item.riveIndex });
    for (const entry of everyday) {
      if (entry.kind === 'item') list.push({ [entry.item.slot]: entry.item.riveIndex });
    }
    return list;
  }, [sellerIndices, saleItem, special, everyday]);

  useEffect(() => {
    if (warmList.length <= 1) return;
    let cancel: (() => void) | null = null;
    const timer = window.setTimeout(() => {
      const tile = Math.min(150, (Math.min(window.innerWidth, 760) - 48) / 3);
      cancel = warmFrogStamps(
        warmList as Record<string, number>[],
        Math.round(tile * 1.3 * riveDevicePixelRatio()),
      );
    }, 250);
    return () => {
      window.clearTimeout(timer);
      cancel?.();
    };
  }, [warmList]);

  const owns = (item: ItemDef) => (inventory[item.id] ?? 0) > 0;
  const saleOwned = saleItem ? owns(saleItem) : false;

  const tapSale = () => {
    if (!sale || !saleItem) return;
    if (saleOwned) onOpenItem(saleItem, sale.onSale ? sale.dealPrice : null);
    else if (isPremium) onOpenItem(saleItem, sale.dealPrice);
    else onPlus('shop_plus_sale', saleItem);
  };

  const catalogButton = (className: string) => (
    <button
      type="button"
      onClick={onOpenCatalog}
      className={cn(
        'flex h-12 flex-col items-center justify-center rounded-2xl px-2 text-[11px] font-black text-[color:var(--pond-ink)] transition-transform active:scale-95',
        className,
      )}
    >
      <Icon name="closetAlbum" className="h-7 w-7" />
      Catalog
    </button>
  );

  return (
    <div
      role="region"
      aria-label="Shop"
      className="relative -mx-4 flex min-h-[100dvh] flex-1 flex-col bg-background md:mx-0 md:min-h-0 md:bg-transparent"
    >
      <div className="pond-panel sticky top-0 z-30 flex shrink-0 items-center gap-2 bg-[color:var(--pond-surface-top)] px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] md:hidden">
        <button
          type="button"
          aria-label="Close shop"
          onClick={close}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border/60 bg-background/90 text-foreground shadow-sm backdrop-blur-md transition-transform active:scale-95"
        >
          <X className="h-5 w-5" strokeWidth={3} />
        </button>
        {!isGuest && <FlyCounter balance={balance} variant="mobile" onClick={onGetFlies} />}
        {catalogButton('ml-auto')}
      </div>
      <div className="relative flex flex-1 flex-col">
        <div className="pond-panel relative bg-[linear-gradient(to_bottom,var(--pond-surface-top),var(--pond-surface-bottom))] pb-10 pt-1 md:bg-none md:pt-[88px]">
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-28 left-1/2 top-0 -z-10 hidden w-screen -translate-x-1/2 bg-[linear-gradient(to_bottom,var(--pond-surface-top),var(--pond-surface-bottom)_72%,hsl(var(--background)))] md:block"
          />
          <div className="relative px-4 md:px-6">
            {catalogButton('absolute right-6 top-0 hidden md:flex')}
            <h1 className="sr-only">Shop</h1>
            {loading ? (
              <div className="mx-auto mt-3 h-[118px] w-full max-w-[340px] animate-pulse rounded-[26px] bg-[color:var(--pond-well)]" />
            ) : sale && saleItem ? (
              <button
                type="button"
                onClick={tapSale}
                aria-label={`${saleItem.name}, ${sale.discountPercent}% off sale`}
                className="relative mx-auto mt-8 flex w-full max-w-[340px] items-center gap-4 rounded-[26px] border border-[color:var(--pond-line)] bg-[color:var(--pond-well)] py-3 pl-3 pr-3.5 text-left shadow-[0_3px_0_0_var(--pond-line)] transition-[transform,box-shadow] active:translate-y-0.5 active:shadow-none"
              >
                <span className="relative -mt-9 w-[104px] shrink-0 self-end">
                  <TileArt
                    rarity={saleItem.rarity}
                    tone="closet"
                    className="rounded-[20px] shadow-[0_3px_0_0_var(--pond-line)] ring-[3px] ring-[color:var(--pond-well)]"
                  >
                    <ItemArt item={saleItem} />
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/70 to-transparent opacity-0 motion-safe:animate-[shop-sale-glint_5s_ease-in-out_infinite]"
                    />
                  </TileArt>
                  <Icon
                    name="discount"
                    className="absolute -left-2 -top-2 h-9 w-9 -rotate-12 drop-shadow-[0_2px_0_rgba(31,98,28,0.25)]"
                  />
                </span>
                <span className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
                  <span className="inline-flex items-center gap-1 text-[12px] font-black uppercase tracking-[0.08em] text-[color:var(--pond-eyebrow)]">
                    {!isPremium && !saleOwned && (
                      <Icon name="frogPlus" label="Plus" className="-my-1 h-6 w-6 shrink-0" />
                    )}
                    {sale.discountPercent}% off sale
                  </span>
                  {saleOwned ? (
                    <span className="inline-flex items-center gap-1.5 text-[20px] font-black leading-none text-primary">
                      <Check className="h-5 w-5" strokeWidth={3.5} />
                      Owned
                    </span>
                  ) : (
                    <FlyAmount
                      amount={sale.dealPrice}
                      size={24}
                      className="text-[28px] font-black leading-none text-[color:var(--pond-ink)]"
                    />
                  )}
                </span>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color:var(--pond-accent)] text-[color:var(--pond-accent-ink)] shadow-[0_2px_0_0_var(--pond-accent-shadow)]">
                  <ChevronRight className="h-5 w-5" strokeWidth={3.5} />
                </span>
              </button>
            ) : null}
          </div>

          <div className="relative h-[128px]">
            <div className="pointer-events-none absolute bottom-[-24px] left-1 z-[25] md:left-5">
              <FrogSnapshot indices={sellerIndices} width={204} height={228} />
            </div>
            <FrogSpeechBubble
              rate={0}
              done={0}
              total={0}
              side
              fixedMessage="I've got new things every day!"
              className="!left-[178px] !top-[70px] md:!left-[198px] [--bubble-max:min(calc(100vw-210px),15rem)]"
            />
          </div>
        </div>

        <div className="relative z-20 -mt-6 flex-1 rounded-t-[28px] bg-background px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-6 md:mb-10 md:flex-none md:rounded-[32px] md:px-6 md:pb-8 md:shadow-sm md:ring-1 md:ring-border/50">
          {!isGuest && shopGift?.available && (
            <div className="mb-5">
              <ShopGiftTile gift={shopGift} onClaim={onClaimGift} />
            </div>
          )}

          <section
            aria-label="Special collection"
            data-hint="shop-deals"
            className="-mx-1.5 rounded-[28px] bg-[#fff8e3] p-2.5 pb-3 ring-1 ring-[#f6e3ae] dark:bg-amber-400/[0.06] dark:ring-amber-300/15"
          >
            <SpecialBanner
              countdown={countdown}
              action={
                !isGuest && rerollsLeft > 0 && special.length > 0 ? (
                  <RefreshButton
                    free={isPremium || rerollFree}
                    plus={isPremium}
                    busy={rerolling}
                    onClick={onReroll}
                  />
                ) : undefined
              }
            />
            {loading ? (
              <div className="grid grid-cols-3 gap-2.5 md:grid-cols-4">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="aspect-[4/5] animate-pulse rounded-[22px] bg-muted" />
                ))}
              </div>
            ) : special.length === 0 ? (
              <p className="rounded-[22px] bg-muted/60 px-4 py-6 text-center text-[14px] font-bold text-muted-foreground">
                {isGuest
                  ? 'Sign in to see what’s in the Special collection today.'
                  : 'You own everything that could show up here. Nice!'}
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2.5 md:grid-cols-4">
                {special.map(({ deal, item }) => {
                  const locked = deal.plusOnly && !isPremium;
                  const owned = owns(item);
                  return (
                    <ShopTile
                      key={item.id}
                      entry={{
                        kind: 'item',
                        key: item.id,
                        item,
                        rarity: item.rarity,
                        price: deal.onSale ? deal.dealPrice : deal.priceFlies,
                      }}
                      saleTag={deal.sale}
                      wasPrice={deal.onSale ? deal.priceFlies : undefined}
                      owned={owned}
                      locked={locked}
                      wished={wishlistedIds.has(item.id) || deal.wishlistSlot}
                      onTap={() => {
                        if (locked && !owned) onPlus('shop_plus_slot', item);
                        else onOpenItem(item, deal.onSale ? deal.dealPrice : null);
                      }}
                    />
                  );
                })}
              </div>
            )}
          </section>

          <section aria-label="Everyday collection" className="mt-8">
            <SectionHeader
              icon={<Icon name="wardrobe" className="h-8 w-8" />}
              tone="green"
              title="Everyday collection"
              sub="Always in the shop"
            />
            {loading ? (
              <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
                {Array.from({ length: 9 }, (_, i) => (
                  <div
                    key={i}
                    className="aspect-square animate-pulse rounded-[20px] bg-muted md:aspect-[4/5]"
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
                {everyday.map((entry) => (
                  <ShopTile
                    key={entry.key}
                    small
                    entry={entry}
                    owned={
                      entry.kind === 'item' ? owns(entry.item) : (bgInventory[entry.bg.id] ?? 0) > 0
                    }
                    locked={false}
                    wished={entry.kind === 'item' && wishlistedIds.has(entry.item.id)}
                    onTap={() =>
                      entry.kind === 'item'
                        ? onOpenItem(entry.item, null)
                        : onOpenBackground(entry.bg)
                    }
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
