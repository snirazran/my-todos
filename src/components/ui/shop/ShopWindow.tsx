'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, Heart, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { AdPlayIcon } from '@/components/ui/AdPlayIcon';
import { rewardedAdsAvailable } from '@/lib/ads';
import { FlyAmount } from '@/components/ui/FlyAmount';
import { FlyCounter } from '@/components/ui/FlyCounter';
import { useReducedMotion } from 'framer-motion';
import MerchantFrog, {
  merchantArtHeight,
  type MerchantFrogHandle,
} from '@/components/ui/shop/MerchantFrog';
import { PURCHASE_CELEBRATION_EVENT } from '@/lib/purchaseCelebration';
import { useRiveIdlePause } from '@/lib/riveIdlePause';
import { FrogSpeechBubble } from '@/components/ui/FrogSpeechBubble';
import { ShopGiftTile } from '@/components/ui/shop/ShopGiftPopup';
import {
  BackgroundArt,
  ItemArt,
  ShelfHeader,
  TileArt,
  shelfActionClass,
  useShelfGrid,
} from '@/components/ui/skins/DressingRoom';
import { ROUND_BUTTON } from '@/components/ui/skins/WardrobeMobileChrome';
import { VariantDots } from '@/components/ui/skins/VariantSwatch';
import { useCountdown } from '@/components/ui/skins/DailyDealsShelf';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import {
  isTradeOnlyRarity,
  type ItemDef,
  type Rarity,
} from '@/lib/skins/catalog';
import { DEFAULT_SHOP_SALES } from '@/lib/skins/shopSales';
import { RARITY_CONFIG } from '@/components/ui/gift-box/constants';
import { isEverydayItem, isShopBuyable, type DailyDeal } from '@/lib/skins/dailyDeal';
import type { BackgroundItem } from '@/hooks/useBackgrounds';
import type { ShopGiftStatus } from '@/lib/economy/shopGift';
import { warmFrogStamps, type FrogStampIndices } from '@/lib/frogStampEngine';
import { riveDevicePixelRatio } from '@/lib/riveLoader';
import { backgroundFadeMaskStyle } from '@/lib/backgrounds/fadeMask';

type ShopEntry =
  | { kind: 'item'; key: string; item: ItemDef; rarity: Rarity; price: number }
  | { kind: 'bg'; key: string; bg: BackgroundItem; rarity: Rarity; price: number };

const SELLER_NAME = 'Sir Croaksalot';
const SELLER_GREET_MS = 450;
const SELLER_FIRST_INTERACT_MS = 6000;
const SELLER_INTERACT_GAP_MS = 7000;
const SELLER_INTERACT_JITTER_MS = 6000;

const PICK_GRID = 'grid grid-cols-3 gap-2 md:grid-cols-6 md:gap-2.5';

const SCALLOP = 28;
const AWNING_BAND = 32;
const AWNING_HEIGHT = AWNING_BAND + SCALLOP / 2 + 2;

const STALL = {
  sm: { scallops: 7, merchant: 200, counter: 34, bury: 18, sink: 16, gap: 14 },
  md: { scallops: 9, merchant: 236, counter: 38, bury: 20, sink: 20, gap: 18 },
} as const;

type PickRow = { deal: DailyDeal; item: ItemDef };

function itemTileKey(item: ItemDef) {
  return item.variantGroup
    ? `family:${item.slot}|${item.variantGroup}|${item.rarity}`
    : `item:${item.id}`;
}

function entryTileKey(entry: ShopEntry) {
  return entry.kind === 'item' ? itemTileKey(entry.item) : entry.key;
}

function groupRows<T>(rows: T[], keyOf: (row: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return Array.from(groups.values());
}

function stableRank(id: string, seed = 0) {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function ShopTile({
  entry,
  owned,
  plus,
  discount,
  plusPrice,
  wished,
  affordable,
  variants,
  index,
  onTap,
}: {
  entry: ShopEntry;
  owned: boolean;
  plus?: boolean;
  discount?: number;
  plusPrice?: boolean;
  wished: boolean;
  affordable: boolean;
  variants?: ItemDef[];
  index?: number;
  onTap: () => void;
}) {
  const name = entry.kind === 'item' ? entry.item.name : entry.bg.name;
  const rarity = RARITY_CONFIG[entry.rarity].label;
  const onSale = !owned && !!discount;
  const colors = variants && variants.length > 1 ? `, ${variants.length} colors` : '';
  const status = owned
    ? 'owned'
    : plusPrice
      ? `${entry.price} flies with Plus`
      : plus
        ? `Plus pick, ${entry.price} flies`
        : `${entry.price} flies`;
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`${name}, ${rarity}${colors}, ${status}`}
      style={index == null ? undefined : { animationDelay: `${Math.min(index, 11) * 35}ms` }}
      className={cn(
        'group flex w-full min-w-0 flex-col items-stretch gap-1 text-left outline-none [-webkit-tap-highlight-color:transparent]',
        index != null && 'shop-tile-rise',
      )}
    >
      <TileArt
        rarity={entry.rarity}
        tone="closet"
        className="transition-transform duration-150 group-active:scale-95 group-focus-visible:ring-2 group-focus-visible:ring-primary group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background"
      >
        <span className={cn('absolute inset-0', owned && 'opacity-45')}>
          {entry.kind === 'item' ? <ItemArt item={entry.item} /> : <BackgroundArt bg={entry.bg} />}
        </span>

        {onSale ? (
          <span className="absolute left-1 top-1 rounded-md bg-[#447d3f] px-1 text-[10px] font-black leading-[16px] text-white">
            −{discount}%
          </span>
        ) : wished && plus && !owned ? (
          <span className="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <Heart className="h-2.5 w-2.5" strokeWidth={3.5} fill="currentColor" />
          </span>
        ) : null}

        {plus && !owned ? (
          <Icon name="frogPlus" className="absolute right-0.5 top-0.5 h-7 w-7" />
        ) : wished && !owned ? (
          <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <Heart className="h-2.5 w-2.5" strokeWidth={3.5} fill="currentColor" />
          </span>
        ) : null}

        {variants && variants.length > 1 && <VariantDots items={variants} />}
      </TileArt>

      <span className="flex h-6 items-center justify-center gap-1 text-[12.5px] font-black tabular-nums leading-none">
        {owned ? (
          <span className="flex items-center gap-1 text-muted-foreground/70">
            <Check className="h-3.5 w-3.5" strokeWidth={4} />
            Owned
          </span>
        ) : (
          <>
            <FlyAmount
              amount={entry.price}
              size={15}
              className={
                !affordable
                  ? 'text-muted-foreground'
                  : onSale && !plusPrice
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-foreground'
              }
            />
            {plusPrice && <Icon name="frogPlus" className="-my-1 h-[18px] w-[18px] shrink-0" />}
          </>
        )}
      </span>
    </button>
  );
}

function GridSkeleton({ gridClass, count }: { gridClass: string; count: number }) {
  return (
    <div className={gridClass}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="flex flex-col gap-1">
          <span className="skeleton block aspect-square w-full rounded-2xl" />
          <span className="h-6" />
        </span>
      ))}
    </div>
  );
}

function Awning({ scallops }: { scallops: number }) {
  const id = useId();
  const width = scallops * SCALLOP;
  const r = SCALLOP / 2;
  let d = `M0 ${AWNING_BAND} V9 Q0 0 9 0 H${width - 9} Q${width} 0 ${width} 9 V${AWNING_BAND}`;
  for (let i = scallops - 1; i >= 0; i--) d += ` A${r} ${r} 0 0 1 ${i * SCALLOP} ${AWNING_BAND}`;
  d += ' Z';
  return (
    <svg
      aria-hidden
      width={width + 4}
      height={AWNING_HEIGHT + 4}
      viewBox={`-2 -2 ${width + 4} ${AWNING_HEIGHT + 4}`}
      className="block overflow-visible drop-shadow-[0_4px_6px_rgba(0,0,0,0.18)]"
    >
      <defs>
        <pattern id={`${id}-stripes`} width={SCALLOP * 2} height="8" patternUnits="userSpaceOnUse">
          <rect width={SCALLOP} height="8" fill="var(--shop-awning-a)" />
          <rect x={SCALLOP} width={SCALLOP} height="8" fill="var(--shop-awning-b)" />
        </pattern>
        <linearGradient id={`${id}-shade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.1" />
          <stop offset="0.45" stopColor="#000" stopOpacity="0" />
          <stop offset="0.7" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.08" />
        </linearGradient>
      </defs>
      <path d={d} fill={`url(#${id}-stripes)`} />
      <path d={d} fill={`url(#${id}-shade)`} />
      <path
        d={`M0 9 Q0 0 9 0 H${width - 9} Q${width} 0 ${width} 9`}
        fill="none"
        stroke="var(--shop-wood-shine)"
        strokeWidth="3"
        transform="translate(0 3)"
      />
      <path d={d} fill="none" stroke="var(--shop-ink)" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}

function MarketStall({
  size,
  merchant,
  bubble,
}: {
  size: (typeof STALL)['sm' | 'md'];
  merchant: React.ReactNode;
  bubble: (pos: { left: number; top: number }) => React.ReactNode;
}) {
  const width = size.scallops * SCALLOP;
  const artHeight = merchantArtHeight(size.merchant);
  const artBottom = size.counter - size.bury;
  const artTop = artBottom + artHeight;
  const height = artTop + size.gap + AWNING_HEIGHT;
  return (
    <div className="shop-surface relative" style={{ width, height }}>
      <span
        aria-hidden
        className="absolute left-[7px] w-[9px] rounded-[3px] border-2 border-[color:var(--shop-ink)] bg-[color:var(--shop-wood-edge)]"
        style={{ top: AWNING_HEIGHT - 12, bottom: size.counter - 4 }}
      />
      <span
        aria-hidden
        className="absolute right-[7px] w-[9px] rounded-[3px] border-2 border-[color:var(--shop-ink)] bg-[color:var(--shop-wood-edge)]"
        style={{ top: AWNING_HEIGHT - 12, bottom: size.counter - 4 }}
      />
      <div
        className="pointer-events-none absolute"
        style={{ bottom: artBottom, left: (width - size.merchant) / 2 }}
      >
        {merchant}
      </div>
      <div className="absolute -left-0.5 top-0">
        <Awning scallops={size.scallops} />
      </div>
      <div
        aria-hidden
        className="absolute inset-x-[3px]"
        style={{ bottom: -size.sink, height: size.counter + size.sink }}
      >
        <div className="absolute inset-x-0 top-0 z-[1] h-[14px] rounded-t-[7px] border-2 border-[color:var(--shop-ink)] bg-[color:var(--shop-wood)] shadow-[inset_0_3px_0_0_var(--shop-wood-shine)]" />
        <div className="absolute inset-x-[3px] bottom-0 top-[12px] border-x-2 border-[color:var(--shop-ink)] bg-[color:var(--shop-wood-face)] shadow-[inset_0_6px_6px_-4px_rgba(0,0,0,0.25)]" />
      </div>
      {bubble({ left: width + 6, top: height - artBottom - Math.round(artHeight * 0.52) })}
    </div>
  );
}

type RefreshState = 'free' | 'ad' | 'plus' | 'spent';

const REFRESH_LABEL: Record<RefreshState, string> = {
  free: "Refresh today's picks for free",
  ad: "Watch a short ad to refresh today's picks",
  plus: "Get more refreshes of today's picks with Plus",
  spent: 'No refreshes left today',
};

function RefreshButton({
  state,
  busy,
  onClick,
}: {
  state: RefreshState;
  busy: boolean;
  onClick: () => void;
}) {
  const spent = state === 'spent';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || spent}
      aria-label={REFRESH_LABEL[state]}
      className={cn('group', shelfActionClass(spent ? 'quiet' : 'primary'), spent && 'opacity-60')}
    >
      <RefreshCw
        className={cn(
          'h-3.5 w-3.5 transition-transform duration-300 ease-out group-active:rotate-90',
          busy && 'animate-spin',
        )}
        strokeWidth={3}
      />
      {spent ? 'Refreshed' : 'Refresh'}
      {state === 'free' && (
        <span className="text-[10px] uppercase tracking-[0.06em] opacity-70">Free</span>
      )}
      {state === 'ad' && <AdPlayIcon className="h-3.5 w-3.5" strokeWidth={2.75} />}
      {state === 'plus' && <Icon name="frogPlus" className="-my-1 -mr-1 h-5 w-5" />}
    </button>
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
  scene,
  onOpenItem,
  onOpenBackground,
  onReroll,
  onPlus,
  onClaimGift,
  onOpenCatalog,
  onGetFlies,
}: {
  loading: boolean;
  balance: number | undefined;
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
  scene?: React.ReactNode;
  onOpenItem: (
    item: ItemDef,
    dealPrice: number | null,
    variants?: { item: ItemDef; dealPrice: number | null }[],
  ) => void;
  onOpenBackground: (bg: BackgroundItem) => void;
  onReroll: () => void;
  onPlus: (placement: string, item?: ItemDef) => void;
  onClaimGift: () => void;
  onOpenCatalog: () => void;
  onGetFlies: () => void;
}) {
  const byId = useMemo(() => new Map(catalog.map((item) => [item.id, item])), [catalog]);
  const isMd = useMediaQuery('(min-width: 768px)');
  const { cols, gridClass } = useShelfGrid();
  const pickCols = isMd ? 6 : 3;
  const stall = isMd ? STALL.md : STALL.sm;

  const sale = deals.find((deal) => deal.sale);
  const saleItem = sale ? byId.get(sale.itemId) : undefined;
  const special = useMemo(
    () =>
      deals
        .map((deal) => ({ deal, item: byId.get(deal.itemId) }))
        .filter((row): row is { deal: DailyDeal; item: ItemDef } => !!row.item),
    [deals, byId],
  );
  const freePicks = useMemo(
    () => groupRows(special.filter(({ deal }) => !deal.plusOnly), ({ item }) => itemTileKey(item)),
    [special],
  );
  const plusPicks = useMemo(
    () => groupRows(special.filter(({ deal }) => deal.plusOnly), ({ item }) => itemTileKey(item)),
    [special],
  );
  const endsAt = deals[0]?.endsAt;
  const countdown = useCountdown(endsAt);
  const sellerRef = useRef<MerchantFrogHandle>(null);
  const [sellerLive, setSellerLive] = useState(false);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (!sellerLive) return;
    const greet = window.setTimeout(() => sellerRef.current?.interact(), SELLER_GREET_MS);
    if (reduceMotion) return () => window.clearTimeout(greet);
    let timer = 0;
    const schedule = (wait: number) => {
      timer = window.setTimeout(() => {
        if (document.visibilityState === 'visible' && !useRiveIdlePause.getState().idle) {
          sellerRef.current?.interact({ soft: true });
        }
        schedule(SELLER_INTERACT_GAP_MS + Math.random() * SELLER_INTERACT_JITTER_MS);
      }, wait);
    };
    schedule(SELLER_FIRST_INTERACT_MS);
    return () => {
      window.clearTimeout(greet);
      window.clearTimeout(timer);
    };
  }, [sellerLive, reduceMotion]);
  useEffect(() => {
    const onPurchase = () => sellerRef.current?.purchase();
    window.addEventListener(PURCHASE_CELEBRATION_EVENT, onPurchase);
    return () => window.removeEventListener(PURCHASE_CELEBRATION_EVENT, onPurchase);
  }, []);
  const dealsKey = deals.map((deal) => deal.itemId).join(',');
  const shownDealsRef = useRef<string | null>(null);
  useEffect(() => {
    if (loading || !dealsKey) return;
    const previous = shownDealsRef.current;
    shownDealsRef.current = dealsKey;
    if (previous && previous !== dealsKey) sellerRef.current?.interact();
  }, [loading, dealsKey]);
  const refreshState: RefreshState | null =
    isGuest || special.length === 0
      ? null
      : isPremium
        ? rerollsLeft > 0
          ? 'free'
          : 'spent'
        : rerollsLeft <= 0
          ? 'plus'
          : rerollFree
            ? 'free'
            : rewardedAdsAvailable()
              ? 'ad'
              : 'plus';

  const frozenEveryday = useRef<Set<string> | null>(null);
  const [shuffleSeed] = useState(() => Math.floor(Math.random() * 0x7fffffff));
  const everyday = useMemo<ShopEntry[][]>(() => {
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
      if (!ids.has(item.id) || item.rarity === 'legendary') continue;
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
      if (rarity === 'legendary' || isTradeOnlyRarity(rarity) || !((bg.priceFlies ?? 0) > 0)) continue;
      entries.push({ kind: 'bg', key: `bg:${bg.id}`, bg, rarity, price: bg.priceFlies ?? 0 });
    }
    const tiles = groupRows(entries, entryTileKey);
    const unowned = (entry: ShopEntry) =>
      entry.kind === 'item'
        ? (inventory[entry.item.id] ?? 0) <= 0
        : (bgInventory[entry.bg.id] ?? 0) <= 0;
    if (!frozenEveryday.current) {
      frozenEveryday.current = new Set(
        tiles.filter((tile) => tile.some(unowned)).map((tile) => entryTileKey(tile[0])),
      );
    }
    const keep = frozenEveryday.current;
    return tiles
      .filter((tile) => keep.has(entryTileKey(tile[0])))
      .sort(
        (a, b) =>
          stableRank(entryTileKey(a[0]), shuffleSeed) - stableRank(entryTileKey(b[0]), shuffleSeed),
      );
  }, [loading, everydayIds, catalog, backgrounds, inventory, bgInventory, shuffleSeed]);

  const pickWarmList = useMemo<FrogStampIndices[]>(
    () => special.map(({ item }) => ({ [item.slot]: item.riveIndex })),
    [special],
  );
  const everydayWarmList = useMemo(() => {
    const list: FrogStampIndices[] = [];
    for (const entry of everyday.flat()) {
      if (entry.kind === 'item') list.push({ [entry.item.slot]: entry.item.riveIndex });
    }
    return list;
  }, [everyday]);

  useEffect(() => {
    if (pickWarmList.length === 0 && everydayWarmList.length === 0) return;
    const cancels: (() => void)[] = [];
    const timer = window.setTimeout(() => {
      const width = Math.min(window.innerWidth, 768) - 48;
      const stampSize = (columns: number) =>
        Math.round(Math.min(150, width / columns) * 1.24 * riveDevicePixelRatio());
      cancels.push(warmFrogStamps(pickWarmList, stampSize(pickCols)));
      cancels.push(warmFrogStamps(everydayWarmList, stampSize(cols)));
    }, 250);
    return () => {
      window.clearTimeout(timer);
      cancels.forEach((cancel) => cancel());
    };
  }, [pickWarmList, everydayWarmList, pickCols, cols]);

  const owns = (item: ItemDef) => (inventory[item.id] ?? 0) > 0;
  const canAfford = (price: number) => balance === undefined || balance >= price;
  const saleOwned = saleItem ? owns(saleItem) : false;
  const sellerLine =
    sale && saleItem && !saleOwned
      ? isPremium
        ? `${sale.discountPercent}% off today!`
        : `${sale.discountPercent}% off with Plus!`
      : 'New stock every day!';

  const tapPick = (deal: DailyDeal, item: ItemDef) => {
    const owned = owns(item);
    if (owned) onOpenItem(item, deal.onSale ? deal.dealPrice : null);
    else if (deal.plusOnly && !isPremium) onPlus('shop_plus_slot', item);
    else if (deal.sale && !isPremium) onPlus('shop_plus_sale', item);
    else onOpenItem(item, deal.onSale ? deal.dealPrice : null);
  };

  const gated = (deal: DailyDeal) => !isPremium && (deal.plusOnly || deal.sale);
  const pickDealPrice = (deal: DailyDeal) => (deal.onSale ? deal.dealPrice : null);

  const pickTile = (group: PickRow[], index: number) => {
    const rep = group.find(({ item }) => !owns(item)) ?? group[0];
    const { deal, item } = rep;
    const price = deal.sale ? deal.dealPrice : deal.priceFlies;
    const multi = group.length > 1;
    const tapFamily = () => {
      const options = group.filter((row) => owns(row.item) || !gated(row.deal));
      if (options.length > 1 && (owns(item) || !gated(deal))) {
        onOpenItem(
          item,
          pickDealPrice(deal),
          options.map((row) => ({ item: row.item, dealPrice: pickDealPrice(row.deal) })),
        );
      } else {
        tapPick(deal, item);
      }
    };
    return (
      <ShopTile
        key={itemTileKey(group[0].item)}
        index={index}
        entry={{ kind: 'item', key: item.id, item, rarity: item.rarity, price }}
        owned={group.every((row) => owns(row.item))}
        plus={deal.plusOnly}
        discount={deal.sale ? deal.discountPercent : undefined}
        plusPrice={deal.sale && !isPremium}
        wished={group.some((row) => wishlistedIds.has(row.item.id) || row.deal.wishlistSlot)}
        affordable={canAfford(price)}
        variants={multi ? group.map((row) => row.item) : undefined}
        onTap={multi ? tapFamily : () => tapPick(deal, item)}
      />
    );
  };

  const everydayTile = (group: ShopEntry[]) => {
    const isOwned = (entry: ShopEntry) =>
      entry.kind === 'item' ? owns(entry.item) : (bgInventory[entry.bg.id] ?? 0) > 0;
    const entry = group.find((member) => !isOwned(member)) ?? group[0];
    const items = group.flatMap((member) => (member.kind === 'item' ? [member.item] : []));
    const multi = items.length > 1;
    return (
      <ShopTile
        key={entryTileKey(group[0])}
        entry={entry}
        owned={group.every(isOwned)}
        wished={items.some((item) => wishlistedIds.has(item.id))}
        affordable={canAfford(entry.price)}
        variants={multi ? items : undefined}
        onTap={() =>
          entry.kind === 'item'
            ? onOpenItem(
                entry.item,
                null,
                multi ? items.map((item) => ({ item, dealPrice: null })) : undefined,
              )
            : onOpenBackground(entry.bg)
        }
      />
    );
  };

  return (
    <div role="region" aria-label="Shop" className="relative flex flex-1 flex-col">
      <h1 className="sr-only">Shop</h1>
      <div
        aria-hidden
        style={backgroundFadeMaskStyle}
        className="pointer-events-none absolute left-[calc(50%-50vw)] top-0 z-0 h-[calc(372px+env(safe-area-inset-top))] w-screen overflow-hidden md:h-[540px]"
      >
        {scene}
      </div>

      <div className="relative z-[1] h-[calc(312px+env(safe-area-inset-top))] shrink-0 md:h-[438px]">
        {!isGuest && (
          <div className="absolute left-0 top-[calc(env(safe-area-inset-top)+0.5rem)] z-20 md:hidden">
            <FlyCounter
              key={balance === undefined ? 'pending' : 'ready'}
              balance={balance ?? 0}
              variant="mobile"
              onClick={onGetFlies}
              flyTarget
            />
          </div>
        )}
        <button
          type="button"
          onClick={onOpenCatalog}
          className="group absolute right-0 top-[calc(env(safe-area-inset-top)+0.5rem)] z-20 flex flex-col items-center gap-0.5 focus-visible:outline-none md:top-[5.5rem]"
        >
          <span
            className={cn(
              'group-focus-visible:ring-2 group-focus-visible:ring-primary group-focus-visible:ring-offset-2',
              ROUND_BUTTON,
            )}
          >
            <Icon name="closetAlbum" className="h-7 w-7" />
          </span>
          <span className="text-[11px] font-black leading-none text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.55)]">
            Catalog
          </span>
        </button>

        <div className="absolute bottom-0 left-0 md:left-1/2 md:-translate-x-1/2">
          <MarketStall
            size={stall}
            merchant={
              <MerchantFrog
                ref={sellerRef}
                width={stall.merchant}
                onReady={() => setSellerLive(true)}
              />
            }
            bubble={({ left, top }) => (
              <div className="absolute z-[26] h-0 w-0" style={{ left, top }}>
                <FrogSpeechBubble
                  rate={0}
                  done={0}
                  total={0}
                  side
                  name={SELLER_NAME}
                  fixedMessage={sellerLine}
                  className="!left-0 !top-0 [--bubble-max:min(calc(100vw-246px),15rem)]"
                />
              </div>
            )}
          />
        </div>
      </div>

      <div className="relative z-10 -mx-4 flex-1 rounded-t-[24px] bg-background px-4 pb-10 pt-5 md:-mx-6 md:px-6 md:pb-16 md:pt-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-px left-1/2 top-0 -z-10 hidden w-screen -translate-x-1/2 rounded-t-[32px] bg-background shadow-[0_-10px_24px_-16px_rgba(15,23,42,0.4)] dark:shadow-[0_-10px_24px_-14px_rgba(0,0,0,0.8)] md:block"
        />
        {!isGuest && shopGift?.available && (
          <div className="mb-5">
            <ShopGiftTile gift={shopGift} onClaim={onClaimGift} />
          </div>
        )}

        <section aria-label="Today's picks" data-hint="shop-deals">
          <ShelfHeader
            label="Today's picks"
            meta={countdown ? <>New in {countdown}</> : null}
            action={
              refreshState ? (
                <RefreshButton
                  state={refreshState}
                  busy={rerolling}
                  onClick={rerollsLeft > 0 ? onReroll : () => onPlus('shop_reroll')}
                />
              ) : undefined
            }
          />
          {loading ? (
            <GridSkeleton gridClass={PICK_GRID} count={pickCols} />
          ) : special.length === 0 ? (
            <p className="rounded-2xl bg-muted/50 px-4 py-6 text-center text-[14px] font-bold text-muted-foreground">
              {isGuest
                ? 'Sign in to see today’s picks.'
                : 'You own everything that could show up here. Nice!'}
            </p>
          ) : (
            <div key={dealsKey}>
              {freePicks.length > 0 && <div className={PICK_GRID}>{freePicks.map(pickTile)}</div>}
              {plusPicks.length > 0 && (
                <>
                  <ShelfHeader
                    label="Plus picks"
                    icon={<Icon name="frogPlus" className="-my-1 h-5 w-5" />}
                    tone="text-[#5b34c2] dark:text-[#c9b6ff]"
                    className={cn(freePicks.length > 0 && 'mt-4')}
                  />
                  <div className={PICK_GRID}>
                    {plusPicks.map((pick, i) => pickTile(pick, freePicks.length + i))}
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        <section aria-label="Everyday collection" className="mt-6 md:mt-8">
          <ShelfHeader label="Everyday" />
          {loading ? (
            <GridSkeleton gridClass={gridClass} count={cols * 2} />
          ) : (
            <div className={gridClass}>{everyday.map(everydayTile)}</div>
          )}
        </section>
      </div>
    </div>
  );
}
