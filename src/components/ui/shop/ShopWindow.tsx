'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Heart, RefreshCw, Sparkle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
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
  compact,
  saleTag,
  wasPrice,
  onTap,
}: {
  entry: ShopEntry;
  owned: boolean;
  locked: boolean;
  wished: boolean;
  compact?: boolean;
  saleTag?: boolean;
  wasPrice?: number;
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
        compact ? 'rounded-[18px] p-1' : 'rounded-[22px] p-1.5',
      )}
    >
      <TileArt
        rarity={entry.rarity}
        tone="closet"
        className={cn(compact ? 'rounded-[14px]' : 'rounded-[16px]', owned && 'opacity-60')}
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
            compact ? '-right-1 -top-1.5 h-8 w-8' : '-right-1.5 -top-2 h-10 w-10',
          )}
        />
      )}
      {saleTag && !owned && (
        <Icon
          name="discount"
          className={cn(
            'absolute z-10 rotate-[12deg] drop-shadow-[0_2px_0_rgba(31,98,28,0.25)]',
            compact ? '-right-1 -top-1.5 h-8 w-8' : '-right-1.5 -top-2 h-9 w-9',
          )}
        />
      )}
      <span
        className={cn(
          'flex items-center justify-center gap-1 font-black leading-none',
          compact ? 'h-6 pt-1 text-[12px]' : 'h-7 pt-1.5 text-[13.5px]',
        )}
      >
        {owned ? (
          <span className="text-primary">Owned</span>
        ) : (
          <>
            <FlyAmount amount={entry.price} size={compact ? 12 : 14} className="text-foreground" />
            {wasPrice != null && wasPrice > entry.price && (
              <span className="text-[11px] font-bold tabular-nums text-muted-foreground line-through">
                {wasPrice.toLocaleString()}
              </span>
            )}
          </>
        )}
      </span>
    </button>
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
  frogName,
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
  frogName: string | null;
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

  const previewSale = () => {
    if (!sale || !saleItem) return;
    onOpenItem(saleItem, sale.onSale ? sale.dealPrice : null);
  };
  const buySale = () => {
    if (!sale || !saleItem) return;
    onOpenItem(saleItem, sale.dealPrice);
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
          <div className="px-4 md:px-6">
            <div className="relative rounded-[26px] border border-[color:var(--pond-line)] bg-[color:var(--pond-well)] p-3.5 shadow-[0_3px_0_0_var(--pond-line)]">
              {catalogButton('absolute right-3 top-2.5 hidden md:flex')}
              <h1 className="sr-only">{frogName ? `${frogName}'s Shop` : 'Shop'}</h1>
              {loading ? (
                <div className="mx-auto flex w-full max-w-[420px] gap-3.5">
                  <div className="aspect-square w-[108px] shrink-0 animate-pulse rounded-[20px] bg-muted" />
                  <div className="flex flex-1 flex-col justify-center gap-2">
                    <div className="h-3 w-24 animate-pulse rounded-full bg-muted" />
                    <div className="h-4 w-32 animate-pulse rounded-full bg-muted" />
                    <div className="h-10 w-full animate-pulse rounded-2xl bg-muted" />
                  </div>
                </div>
              ) : sale && saleItem ? (
                <div className="mx-auto flex w-full max-w-[420px] items-center gap-3.5 pb-1.5 pt-1">
                  <button
                    type="button"
                    onClick={previewSale}
                    aria-label={`Try on ${saleItem.name}`}
                    className="relative w-[108px] shrink-0 transition-transform active:scale-95"
                  >
                    <TileArt rarity={saleItem.rarity} tone="closet" className="rounded-[20px]">
                      <ItemArt item={saleItem} />
                    </TileArt>
                    <Icon
                      name="discount"
                      className="absolute -left-2.5 -top-2.5 h-10 w-10 -rotate-12 drop-shadow-[0_2px_0_rgba(31,98,28,0.25)]"
                    />
                    {countdown && (
                      <span className="absolute -bottom-2.5 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-[color:var(--pond-well)] py-0.5 pl-1 pr-2 text-[11.5px] font-black tabular-nums text-[color:var(--pond-ink)] shadow-[0_2px_0_0_var(--pond-line)] ring-1 ring-[color:var(--pond-line)]">
                        <Icon name="clock" className="h-[18px] w-[18px] shrink-0" />
                        {countdown}
                      </span>
                    )}
                  </button>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[11.5px] font-black uppercase tracking-[0.06em] text-[color:var(--pond-eyebrow)]">
                      {sale.discountPercent}% off today
                    </span>
                    <p className="mt-0.5 truncate text-[16px] font-black leading-tight text-[color:var(--pond-ink)]">
                      {saleItem.name}
                    </p>
                    <p className="mt-1.5 flex items-center gap-2 leading-none">
                      <FlyAmount
                        amount={sale.dealPrice}
                        size={20}
                        className="text-[22px] font-black leading-none text-[color:var(--pond-ink)]"
                      />
                      <del className="text-[14px] font-bold leading-none tabular-nums text-[color:var(--pond-ink-faint)] decoration-2">
                        {sale.priceFlies.toLocaleString()}
                      </del>
                    </p>
                    {saleOwned ? (
                      <button
                        type="button"
                        onClick={previewSale}
                        className="mt-2 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-2xl bg-primary/10 text-[14px] font-black text-primary"
                      >
                        <Check className="h-4 w-4" strokeWidth={3.5} />
                        In your closet
                      </button>
                    ) : isPremium ? (
                      <button
                        type="button"
                        onClick={buySale}
                        className="mt-2 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-2xl bg-[#447d3f] text-[14px] font-black text-white shadow-[0_3px_0_0_#2c511a] transition-[transform,box-shadow] active:translate-y-0.5 active:shadow-none"
                      >
                        Buy for
                        <FlyAmount amount={sale.dealPrice} size={14} className="text-white" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onPlus('shop_plus_sale', saleItem)}
                        className="relative mt-3 flex h-10 w-full items-center justify-center rounded-2xl border border-amber-200 bg-gradient-to-b from-[#ffdf83] to-[#f3bd48] px-10 text-[13.5px] font-black text-[#49320f] shadow-[0_3px_0_#c58c31] transition-[transform,box-shadow] active:translate-y-0.5 active:shadow-none"
                      >
                        <Icon
                          name="frogPlus"
                          label="Plus"
                          className="absolute -right-2 -top-3.5 h-11 w-11 rotate-[12deg] drop-shadow-[0_2px_0_rgba(31,98,28,0.3)]"
                        />
                        <span className="truncate">{sale.discountPercent}% off with Plus</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
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
            <SectionHeader
              icon={
                <span className="relative block h-8 w-8">
                  <Sparkle
                    className="absolute bottom-0 left-0 h-[22px] w-[22px] fill-amber-400 text-amber-500"
                    strokeWidth={2.25}
                  />
                  <Sparkle
                    className="absolute right-0 top-0 h-[14px] w-[14px] fill-amber-300 text-amber-500"
                    strokeWidth={2.5}
                  />
                  <Sparkle
                    className="absolute bottom-0.5 right-0 h-[10px] w-[10px] fill-amber-300 text-amber-500"
                    strokeWidth={2.75}
                  />
                </span>
              }
              tone="gold"
              title="Special collection"
              sub={
                countdown ? (
                  <>
                    <Icon name="clock" className="-my-1 h-[22px] w-[22px] shrink-0" />
                    New in {countdown}
                  </>
                ) : (
                  'New items every day'
                )
              }
              action={
                !isGuest && rerollsLeft > 0 && special.length > 0 ? (
                  <button
                    type="button"
                    onClick={onReroll}
                    disabled={rerolling}
                    className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[#447d3f] px-3.5 text-[13px] font-black text-white shadow-[0_3px_0_0_#2c511a] transition-[transform,box-shadow] active:translate-y-0.5 active:shadow-none disabled:opacity-70"
                  >
                    <RefreshCw
                      className={cn('h-4 w-4', rerolling && 'animate-spin')}
                      strokeWidth={3}
                    />
                    {isPremium ? 'Free' : 'Refresh'}
                    {!isPremium && (
                      <span className="rounded-md bg-white/20 px-1 py-px text-[10px] leading-none">
                        AD
                      </span>
                    )}
                  </button>
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
              <div className="grid grid-cols-4 gap-2 md:grid-cols-6">
                {Array.from({ length: 12 }, (_, i) => (
                  <div key={i} className="aspect-[4/5] animate-pulse rounded-[18px] bg-muted" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2 md:grid-cols-6">
                {everyday.map((entry) => (
                  <ShopTile
                    key={entry.key}
                    compact
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
