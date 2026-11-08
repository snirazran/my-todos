'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Heart, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { AdPlayIcon } from '@/components/ui/AdPlayIcon';
import { rewardedAdsAvailable } from '@/lib/ads';
import { FlyAmount } from '@/components/ui/FlyAmount';
import { FlyCounter } from '@/components/ui/FlyCounter';
import { HEADER_CONTROL_SURFACE } from '@/components/ui/MobileHeaderActions';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { EMOTE_MS, onFrogReact, pickEmote, type FrogEmote } from '@/lib/frogEmotes';
import { useRiveIdlePause } from '@/lib/riveIdlePause';
import { FrogSpeechBubble } from '@/components/ui/FrogSpeechBubble';
import { ShopGiftTile } from '@/components/ui/shop/ShopGiftPopup';
import { BackgroundArt, ItemArt } from '@/components/ui/skins/DressingRoom';
import { useCountdown } from '@/components/ui/skins/DailyDealsShelf';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import {
  byId as staticById,
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
import { SHOP_CUBBY, SHOP_GEM, SHOP_PLANK } from '@/components/ui/shop/shopKit';

type ShopEntry =
  | { kind: 'item'; key: string; item: ItemDef; rarity: Rarity; price: number }
  | { kind: 'bg'; key: string; bg: BackgroundItem; rarity: Rarity; price: number };

const SELLER_OUTFIT = { hat: '3002', body: '2002', hand_item: '4003' } as const;
const SELLER_NAME = 'Sir Croaksalot';
const SELLER_EMOTES: readonly FrogEmote[] = [
  'hop',
  'love',
  'loveShy',
  'hop',
  'love',
  'loveShy',
  'celebrate',
  'loveBurst',
  'tada',
  'loveHeartbeat',
];
const SELLER_HAPPY: ReadonlySet<FrogEmote> = new Set(SELLER_EMOTES);
const SELLER_FIRST_EMOTE_MS = 4500;
const SELLER_EMOTE_GAP_MS = 5000;
const SELLER_EMOTE_JITTER_MS = 4000;
const SELLER_FADE_MS = 200;

function stableRank(id: string, seed = 0) {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const TAG_ROW = 'h-[36px]';

function PriceTag({
  rarity,
  owned,
  price,
  plusPrice,
}: {
  rarity: Rarity;
  owned: boolean;
  price: number;
  plusPrice?: boolean;
}) {
  return (
    <span
      className={cn(
        'relative inline-flex h-[25px] max-w-full items-center gap-[5px] whitespace-nowrap rounded-[8px] pl-[7px] pr-2 text-[13.5px] font-black leading-none tabular-nums',
        'shadow-[0_2px_0_0_var(--shop-tag-edge)] ring-1 ring-[color:var(--shop-tag-edge)]',
        owned
          ? 'bg-[color:var(--pond-accent)] text-[color:var(--pond-accent-ink)]'
          : 'bg-[color:var(--shop-tag)] text-foreground',
      )}
    >
      <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', SHOP_GEM[rarity])} />
      {owned ? (
        <>
          <Check className="h-3.5 w-3.5" strokeWidth={4} />
          Owned
        </>
      ) : (
        <>
          <FlyAmount amount={price} size={14} />
          {plusPrice && <Icon name="frogPlus" className="-my-1 -mr-1 h-[18px] w-[18px] shrink-0" />}
        </>
      )}
    </span>
  );
}

function ShopTile({
  entry,
  owned,
  plus,
  sale,
  plusPrice,
  wished,
  index,
  onTap,
}: {
  entry: ShopEntry;
  owned: boolean;
  plus?: boolean;
  sale?: boolean;
  plusPrice?: boolean;
  wished: boolean;
  index?: number;
  onTap: () => void;
}) {
  const name = entry.kind === 'item' ? entry.item.name : entry.bg.name;
  const rarity = RARITY_CONFIG[entry.rarity].label;
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
      aria-label={`${name}, ${rarity}, ${status}`}
      style={index == null ? undefined : { animationDelay: `${Math.min(index, 11) * 35}ms` }}
      className={cn(
        'shop-item group relative z-[1] flex w-full min-w-0 flex-col items-center outline-none [-webkit-tap-highlight-color:transparent]',
        index != null && 'shop-tile-rise',
      )}
    >
      <span
        className={cn(
          'shop-item-art relative block aspect-square w-full overflow-hidden rounded-b-[5px] rounded-t-[20px] md:rounded-t-[24px]',
          'group-focus-visible:ring-2 group-focus-visible:ring-[color:var(--pond-accent)] group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background',
          SHOP_CUBBY[entry.rarity],
        )}
      >
        <span className={cn('absolute inset-0', owned && 'opacity-50')}>
          {entry.kind === 'item' ? (
            <span className="absolute inset-x-0 bottom-0 top-[6%]">
              <ItemArt item={entry.item} />
            </span>
          ) : (
            <BackgroundArt bg={entry.bg} />
          )}
        </span>
        {wished && !owned && (
          <span className="absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-white/95 text-rose-500 shadow-[0_1px_0_rgba(0,0,0,0.12)] md:left-2 md:top-2">
            <Heart className="h-3.5 w-3.5" strokeWidth={3} fill="currentColor" />
          </span>
        )}
        {sale && !owned ? (
          <Icon name="discount" className="absolute right-1 top-1 h-8 w-8 md:right-1.5 md:top-1.5 md:h-9 md:w-9" />
        ) : plus && !owned ? (
          <span className="absolute right-1 top-1 md:right-1.5 md:top-1.5">
            <Icon name="frogPlus" className="h-8 w-8 md:h-9 md:w-9" />
          </span>
        ) : null}
      </span>
      <span className={cn('flex w-full justify-center px-0.5 pt-[2px]', TAG_ROW)}>
        <PriceTag rarity={entry.rarity} owned={owned} price={entry.price} plusPrice={plusPrice} />
      </span>
    </button>
  );
}

function Shelves({
  cols,
  children,
  className,
}: {
  cols: number;
  children: React.ReactNode[];
  className?: string;
}) {
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < children.length; i += cols) rows.push(children.slice(i, i + cols));
  return (
    <div className={cn('flex flex-col gap-4 md:gap-6', className)}>
      {rows.map((row, r) => (
        <div key={r} className="relative">
          <span
            aria-hidden
            className={cn(SHOP_PLANK, '-inset-x-2 bottom-[26px] md:-inset-x-3')}
          />
          <div
            className="grid gap-x-2.5 md:gap-x-4"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {row}
          </div>
        </div>
      ))}
    </div>
  );
}

function ShelfSkeleton({ cols, count }: { cols: number; count: number }) {
  return (
    <Shelves cols={cols}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="flex flex-col">
          <span className="aspect-square w-full animate-pulse rounded-b-[5px] rounded-t-[20px] bg-[color:var(--shop-cubby)] md:rounded-t-[24px]" />
          <span className={TAG_ROW} />
        </span>
      ))}
    </Shelves>
  );
}

function ShopWall() {
  return (
    <svg aria-hidden className="absolute inset-x-0 bottom-0 h-[184px] w-full">
      <defs>
        <linearGradient id="shop-wall-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--shop-wainscot)" stopOpacity="0" />
          <stop offset="1" stopColor="var(--shop-wainscot)" />
        </linearGradient>
        <pattern id="shop-wall-paper" width="28" height="184" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="12" height="184" fill="var(--shop-wall-stripe)" />
        </pattern>
        <pattern id="shop-wall-stock" width="312" height="184" patternUnits="userSpaceOnUse" x="-40">
          <g fill="var(--shop-prop)" stroke="var(--shop-prop-line)" strokeWidth="2" strokeLinejoin="round">
            <rect x="20" y="47" width="24" height="31" rx="7" />
            <rect x="23" y="41" width="18" height="7" rx="2.5" />
            <rect x="66" y="64" width="40" height="14" rx="4" />
            <rect x="70" y="51" width="32" height="13" rx="4" />
            <path d="M136 60h28l-4 18h-20z" />
            <path d="M150 60c-2-10-10-16-18-15 1 9 8 15 18 15z" />
            <path d="M150 60c2-12 9-19 18-19 0 10-8 18-18 19z" />
            <path d="M194 78c0-14 9-24 21-24s21 10 21 24z" />
            <rect x="188" y="74" width="54" height="5" rx="2.5" />
            <rect x="262" y="56" width="30" height="22" rx="4" />
            <path d="M277 56v22" fill="none" />
          </g>
          <rect x="0" y="78" width="312" height="8" fill="var(--shop-prop)" />
          <rect x="0" y="86" width="312" height="3" fill="var(--shop-prop-line)" />
          <path d="M52 89h12l-6 9z M248 89h12l-6 9z" fill="var(--shop-prop-line)" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="100%" height="184" fill="url(#shop-wall-paper)" />
      <rect x="0" y="0" width="100%" height="184" fill="url(#shop-wall-stock)" />
      <rect x="0" y="104" width="100%" height="80" fill="url(#shop-wall-fade)" />
    </svg>
  );
}

function ShopCounter() {
  return (
    <div aria-hidden className="relative z-20 -mx-px h-[52px] md:h-[60px]">
      <div className="absolute inset-y-0 left-0 right-0 md:left-1/2 md:right-auto md:w-screen md:-translate-x-1/2">
        <div className="absolute inset-x-0 top-0 h-[17px] border-y-2 border-[color:var(--shop-ink)] bg-[color:var(--shop-wood)] shadow-[inset_0_3px_0_0_var(--shop-wood-shine)] md:h-[19px]" />
        <div className="shop-counter-face absolute inset-x-0 bottom-0 top-[17px] border-b-2 border-[color:var(--shop-ink)] md:top-[19px]" />
      </div>
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
      className="group inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[color:var(--shop-tag)] pl-1 pr-2.5 text-[13px] font-black text-foreground shadow-[0_3px_0_0_var(--shop-tag-edge)] ring-1 ring-[color:var(--shop-tag-edge)] transition-[transform,box-shadow] duration-150 ease-out active:translate-y-0.5 active:shadow-[0_1px_0_0_var(--shop-tag-edge)] disabled:opacity-60 disabled:active:translate-y-0"
    >
      <span
        className={cn(
          'grid h-8 w-8 place-items-center rounded-full',
          spent ? 'bg-muted text-muted-foreground' : 'bg-[#5e4537] text-white shadow-[inset_0_-2px_0_rgba(0,0,0,0.25)]',
        )}
      >
        <RefreshCw
          className={cn('h-4 w-4 transition-transform duration-300 ease-out group-active:rotate-90', busy && 'animate-spin')}
          strokeWidth={3}
        />
      </span>
      {spent ? 'Refreshed' : 'Refresh'}
      {state === 'free' && (
        <span className="rounded-md bg-[color:var(--shop-cubby)] px-1.5 py-[3px] text-[10px] uppercase leading-none tracking-[0.06em] text-[#5e4537] ring-1 ring-[color:var(--shop-tag-edge)] dark:text-[#e8cfbd]">
          Free
        </span>
      )}
      {state === 'ad' && <AdPlayIcon className="h-4 w-4 text-muted-foreground" strokeWidth={2.75} />}
      {state === 'plus' && <Icon name="frogPlus" className="-my-2 -mr-1 h-7 w-7" />}
    </button>
  );
}

function SectionHeader({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center gap-3 md:mb-5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[20px] font-black leading-tight tracking-[-0.01em] text-foreground md:text-[24px]">
          {title}
        </span>
        {sub ? (
          <span className="mt-0.5 block text-[13px] font-bold tabular-nums text-muted-foreground md:text-[14px]">
            {sub}
          </span>
        ) : null}
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
  onOpenItem: (item: ItemDef, dealPrice: number | null) => void;
  onOpenBackground: (bg: BackgroundItem) => void;
  onReroll: () => void;
  onPlus: (placement: string, item?: ItemDef) => void;
  onClaimGift: () => void;
  onOpenCatalog: () => void;
  onGetFlies: () => void;
}) {
  const byId = useMemo(() => new Map(catalog.map((item) => [item.id, item])), [catalog]);
  const isMd = useMediaQuery('(min-width: 768px)');
  const isLg = useMediaQuery('(min-width: 1024px)');
  const cols = isLg ? 6 : isMd ? 4 : 3;

  const sellerIndices = useMemo<FrogStampIndices | null>(() => {
    if (byId.size === 0) return null;
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
  const freePicks = useMemo(() => special.filter(({ deal }) => !deal.plusOnly), [special]);
  const plusPicks = useMemo(() => special.filter(({ deal }) => deal.plusOnly), [special]);
  const endsAt = deals[0]?.endsAt;
  const countdown = useCountdown(endsAt);
  const sellerRef = useRef<FrogHandle>(null);
  const [sellerGreet] = useState(() => pickEmote('greet'));
  const [sellerLive, setSellerLive] = useState(false);
  const sellerFadeTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(sellerFadeTimer.current), []);
  useEffect(() => {
    if (!sellerLive) return;
    let timer = 0;
    let last: FrogEmote | null = null;
    const schedule = (wait: number) => {
      timer = window.setTimeout(() => {
        if (document.visibilityState !== 'visible' || useRiveIdlePause.getState().idle) {
          schedule(SELLER_EMOTE_GAP_MS);
          return;
        }
        const options = SELLER_EMOTES.filter((name) => name !== last);
        const name = options[Math.floor(Math.random() * options.length)];
        last = name;
        sellerRef.current?.fireEmote(name, { soft: true });
        schedule(EMOTE_MS[name] + SELLER_EMOTE_GAP_MS + Math.random() * SELLER_EMOTE_JITTER_MS);
      }, wait);
    };
    schedule(SELLER_FIRST_EMOTE_MS);
    return () => window.clearTimeout(timer);
  }, [sellerLive]);
  useEffect(
    () =>
      onFrogReact((name) => {
        if (SELLER_HAPPY.has(name)) sellerRef.current?.fireEmote(name);
      }),
    [],
  );
  const dealsKey = deals.map((deal) => deal.itemId).join(',');
  const shownDealsRef = useRef<string | null>(null);
  useEffect(() => {
    if (loading || !dealsKey) return;
    const previous = shownDealsRef.current;
    shownDealsRef.current = dealsKey;
    if (previous && previous !== dealsKey) sellerRef.current?.fireEmote('tada');
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
      .sort((a, b) => stableRank(a.key, shuffleSeed) - stableRank(b.key, shuffleSeed));
  }, [loading, everydayIds, catalog, backgrounds, inventory, bgInventory, shuffleSeed]);

  const warmList = useMemo(() => {
    const list: FrogStampIndices[] = sellerIndices ? [sellerIndices] : [];
    for (const { item } of special) list.push({ [item.slot]: item.riveIndex });
    for (const entry of everyday) {
      if (entry.kind === 'item') list.push({ [entry.item.slot]: entry.item.riveIndex });
    }
    return list;
  }, [sellerIndices, special, everyday]);

  useEffect(() => {
    if (warmList.length <= 1) return;
    let cancel: (() => void) | null = null;
    const timer = window.setTimeout(() => {
      const tile = Math.min(190, (Math.min(window.innerWidth, 1152) - 48) / cols);
      cancel = warmFrogStamps(
        warmList as Record<string, number>[],
        Math.round(tile * 1.3 * riveDevicePixelRatio()),
      );
    }, 250);
    return () => {
      window.clearTimeout(timer);
      cancel?.();
    };
  }, [warmList, cols]);

  const owns = (item: ItemDef) => (inventory[item.id] ?? 0) > 0;
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

  const pickTile = ({ deal, item }: { deal: DailyDeal; item: ItemDef }, index: number) => (
    <ShopTile
      key={item.id}
      index={index}
      entry={{
        kind: 'item',
        key: item.id,
        item,
        rarity: item.rarity,
        price: deal.sale ? deal.dealPrice : deal.priceFlies,
      }}
      owned={owns(item)}
      plus={deal.plusOnly}
      sale={deal.sale}
      plusPrice={deal.sale && !isPremium}
      wished={wishlistedIds.has(item.id) || deal.wishlistSlot}
      onTap={() => tapPick(deal, item)}
    />
  );

  const catalogButton = (className: string) => (
    <button
      type="button"
      onClick={onOpenCatalog}
      className={cn(
        'flex h-10 shrink-0 items-center gap-1.5 pl-1.5 pr-3.5 text-[13px] font-black text-foreground transition-transform duration-150 ease-out active:scale-[0.97]',
        HEADER_CONTROL_SURFACE,
        className,
      )}
    >
      <Icon name="closetAlbum" className="h-7 w-7 shrink-0" />
      Catalog
    </button>
  );

  return (
    <div
      role="region"
      aria-label="Shop"
      className="shop-surface relative -mx-4 flex min-h-[100dvh] flex-1 flex-col bg-[color:var(--shop-top)] md:mx-0 md:min-h-0 md:bg-transparent"
    >
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-[29] md:hidden">
        <div className="shop-awning h-[calc(env(safe-area-inset-top)+56px)]" />
        <div className="shop-awning-edge" />
      </div>
      <div className="pond-panel relative z-30 flex shrink-0 items-center gap-2 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] md:hidden">
        {!isGuest && (
          <FlyCounter
            key={balance === undefined ? 'pending' : 'ready'}
            balance={balance ?? 0}
            variant="mobile"
            onClick={onGetFlies}
            flyTarget
          />
        )}
        {catalogButton('ml-auto')}
      </div>
      <div className="relative flex flex-1 flex-col">
        <div className="pond-panel relative md:pt-[100px]">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 top-[-140px] overflow-hidden md:left-1/2 md:right-auto md:w-screen md:-translate-x-1/2">
            <div className="absolute inset-0 hidden bg-[color:var(--shop-top)] md:block" />
            <ShopWall />
          </div>
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 z-[1] hidden w-screen -translate-x-1/2 md:block">
            <div className="shop-awning h-[96px]" />
            <div className="shop-awning-edge" />
          </div>
          <h1 className="sr-only">Shop</h1>
          <div className="relative h-[150px] md:h-[176px]">
            {catalogButton('absolute right-6 top-4 hidden md:flex')}
            <div className="pointer-events-none absolute bottom-[-24px] left-1 z-[25] h-[228px] w-[204px] md:bottom-[-30px] md:left-2 md:h-[284px] md:w-[254px]">
              {sellerIndices && !sellerLive && (
                <div className="absolute inset-0">
                  <FrogSnapshot indices={sellerIndices} width={isMd ? 254 : 204} height={isMd ? 284 : 228} />
                </div>
              )}
              {sellerIndices && (
                <div className="absolute inset-0">
                  <Frog
                    ref={sellerRef}
                    width={isMd ? 254 : 204}
                    height={isMd ? 284 : 228}
                    indices={sellerIndices}
                    greet={sellerGreet}
                    pokeable={false}
                    onDressed={() => {
                      sellerFadeTimer.current = window.setTimeout(
                        () => setSellerLive(true),
                        SELLER_FADE_MS,
                      );
                    }}
                  />
                </div>
              )}
            </div>
            <FrogSpeechBubble
              rate={0}
              done={0}
              total={0}
              side
              name={SELLER_NAME}
              fixedMessage={sellerLine}
              className="!z-[26] !left-[176px] !top-[102px] md:!left-[236px] md:!top-[136px] [--bubble-max:min(calc(100vw-190px),15rem)]"
            />
          </div>
          <ShopCounter />
        </div>

        <div className="relative z-10 flex-1 bg-[color:var(--shop-body)] px-4 pb-10 pt-6 md:flex-none md:bg-transparent md:px-6 md:pb-16 md:pt-10">
          <div aria-hidden className="pointer-events-none absolute bottom-0 left-1/2 top-0 -z-10 hidden w-screen -translate-x-1/2 bg-[color:var(--shop-body)] md:block" />
          {!isGuest && shopGift?.available && (
            <div className="mb-6">
              <ShopGiftTile gift={shopGift} onClaim={onClaimGift} />
            </div>
          )}

          <section aria-label="Today's picks" data-hint="shop-deals">
            <SectionHeader
              title="Today's picks"
              sub={countdown ? <>New picks in {countdown}</> : 'New items every day'}
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
              <ShelfSkeleton cols={cols} count={cols === 4 ? 4 : 6} />
            ) : special.length === 0 ? (
              <p className="rounded-[22px] bg-[color:var(--shop-cubby)] px-4 py-6 text-center text-[14px] font-bold text-muted-foreground">
                {isGuest
                  ? 'Sign in to see today’s picks.'
                  : 'You own everything that could show up here. Nice!'}
              </p>
            ) : (
              <div key={dealsKey}>
                {freePicks.length > 0 && <Shelves cols={cols}>{freePicks.map(pickTile)}</Shelves>}
                {plusPicks.length > 0 && (
                  <>
                    <div className={cn('mb-3 flex items-center gap-1.5', freePicks.length > 0 && 'mt-7 md:mt-9')}>
                      <Icon name="frogPlus" className="h-7 w-7 shrink-0" />
                      <span className="text-[15px] font-black text-[color:var(--shop-plus-ink)] md:text-[17px]">
                        Plus picks
                      </span>
                    </div>
                    <Shelves cols={cols}>
                      {plusPicks.map((pick, i) => pickTile(pick, freePicks.length + i))}
                    </Shelves>
                  </>
                )}
              </div>
            )}
          </section>

          <section aria-label="Everyday collection" className="mt-10 md:mt-14">
            <SectionHeader title="Everyday collection" />
            {loading ? (
              <ShelfSkeleton cols={cols} count={cols * 2} />
            ) : (
              <Shelves cols={cols}>
                {everyday.map((entry) => (
                  <ShopTile
                    key={entry.key}
                    entry={entry}
                    owned={entry.kind === 'item' ? owns(entry.item) : (bgInventory[entry.bg.id] ?? 0) > 0}
                    wished={entry.kind === 'item' && wishlistedIds.has(entry.item.id)}
                    onTap={() =>
                      entry.kind === 'item' ? onOpenItem(entry.item, null) : onOpenBackground(entry.bg)
                    }
                  />
                ))}
              </Shelves>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
