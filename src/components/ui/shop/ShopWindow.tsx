'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, Heart, Lock, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { AdPlayIcon } from '@/components/ui/AdPlayIcon';
import { rewardedAdsAvailable } from '@/lib/ads';
import { FlyAmount } from '@/components/ui/FlyAmount';
import { FlyCounter } from '@/components/ui/FlyCounter';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { EMOTE_MS, onFrogReact, pickEmote, type FrogEmote } from '@/lib/frogEmotes';
import { useRiveIdlePause } from '@/lib/riveIdlePause';
import { FrogSpeechBubble } from '@/components/ui/FrogSpeechBubble';
import { ShopGiftTile } from '@/components/ui/shop/ShopGiftPopup';
import { BackgroundArt, ItemArt } from '@/components/ui/skins/DressingRoom';
import { useCountdown } from '@/components/ui/skins/DailyDealsShelf';
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

const QUIET_TILE: Record<Rarity, string> = {
  common: 'bg-[#f3f4f6] dark:bg-white/[0.06]',
  uncommon: 'bg-[#f3f4f6] dark:bg-white/[0.06]',
  rare: 'bg-[#f3f4f6] dark:bg-white/[0.06]',
  epic: 'bg-[#f4f0fe] dark:bg-violet-400/[0.12]',
  legendary: 'closet-foil closet-foil-gold bg-[#fff5dc] dark:bg-amber-400/[0.14]',
};

function QuietTile({ rarity, className, children }: { rarity: Rarity; className?: string; children: React.ReactNode }) {
  return <span className={cn('relative block aspect-square w-full overflow-hidden', QUIET_TILE[rarity], className)}>{children}</span>;
}

function ShopTile({
  entry,
  owned,
  locked,
  wished,
  saleTag,
  index,
  onTap,
}: {
  entry: ShopEntry;
  owned: boolean;
  locked: boolean;
  wished: boolean;
  saleTag?: boolean;
  index?: number;
  onTap: () => void;
}) {
  const name = entry.kind === 'item' ? entry.item.name : entry.bg.name;
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`${name}, ${RARITY_CONFIG[entry.rarity].label}${owned ? ', owned' : locked ? `, Plus only, ${entry.price} flies` : `, ${entry.price} flies`}`}
      style={index == null ? undefined : { animationDelay: `${Math.min(index, 11) * 35}ms` }}
      className={cn(
        'group relative block w-full rounded-[22px] pb-3 text-left outline-none',
        index != null && 'shop-tile-rise',
        '[--tile-edge:#e1e4e9] dark:[--tile-edge:rgba(0,0,0,0.45)]',
      )}
    >
      <span className={cn('relative block rounded-[22px] ring-1 ring-black/[0.04] dark:ring-white/10', 'shadow-[0_3px_0_0_var(--tile-edge)] transition-[transform,box-shadow] duration-150 ease-out group-hover:-translate-y-0.5 group-active:translate-y-[3px] group-active:shadow-[0_1px_0_0_var(--tile-edge)] group-focus-visible:ring-2 group-focus-visible:ring-[color:var(--pond-accent)] group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background')}>
        <QuietTile rarity={entry.rarity} className={cn('rounded-[22px]', owned && 'opacity-55')}>
          {entry.kind === 'item' ? (
            <span className="absolute inset-x-0 bottom-3 top-0">
              <ItemArt item={entry.item} />
            </span>
          ) : (
            <BackgroundArt bg={entry.bg} />
          )}
          {wished && !owned && (
            <span className="absolute left-1.5 top-2.5 grid h-6 w-6 place-items-center rounded-full bg-white/95 text-rose-500 shadow-[0_1px_0_rgba(0,0,0,0.12)]">
              <Heart className="h-3.5 w-3.5" strokeWidth={3} fill="currentColor" />
            </span>
          )}
          {saleTag && !owned && (
            <Icon name="discount" className="absolute right-1 top-2 h-8 w-8" />
          )}
        </QuietTile>
        <span
          className={cn(
            'absolute -top-[10px] left-1/2 z-20 inline-flex h-5 -translate-x-1/2 items-center whitespace-nowrap rounded-[7px] border-[1.5px] bg-card px-1.5 text-[9.5px] font-black uppercase leading-none tracking-[0.08em] shadow-[0_1px_0_rgba(15,23,42,0.08)]',
            RARITY_CONFIG[entry.rarity].border,
            RARITY_CONFIG[entry.rarity].text,
          )}
        >
          {RARITY_CONFIG[entry.rarity].label}
        </span>
        {locked && !owned && (
          <span className="absolute -right-1.5 -top-1.5 z-20 grid h-7 w-7 place-items-center rounded-full bg-gradient-to-b from-[#ffe28d] to-[#f2b83d] shadow-[0_2px_0_#b7791f] ring-[3px] ring-white">
            <Lock className="h-3.5 w-3.5 text-[#6b4a12]" strokeWidth={3} />
          </span>
        )}
      </span>
      <span
        className={cn(
          'absolute bottom-0 left-1/2 flex h-[26px] -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[14px] font-black leading-none shadow-[0_2px_0_0_rgba(15,23,42,0.12)] ring-1 transition-transform duration-150 ease-out group-active:translate-y-[2px]',
          owned
            ? 'bg-[color:var(--pond-accent)] text-[color:var(--pond-accent-ink)] ring-black/5'
            : 'bg-card text-foreground ring-border',
        )}
      >
        {owned ? (
          <>
            <Check className="h-3.5 w-3.5" strokeWidth={4} />
            Owned
          </>
        ) : (
          <>
            <FlyAmount amount={entry.price} size={15} />
          </>
        )}
      </span>
    </button>
  );
}

type RefreshState = 'free' | 'ad' | 'plus' | 'spent';

const REFRESH_LABEL: Record<RefreshState, string> = {
  free: 'Refresh the Special collection for free',
  ad: 'Watch a short ad to refresh the Special collection',
  plus: 'Get more Special collection refreshes with Plus',
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
      className="group inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-card pl-1 pr-2.5 text-[13px] font-black text-foreground shadow-[0_3px_0_0_hsl(var(--border))] ring-1 ring-border transition-[transform,box-shadow] duration-150 ease-out active:translate-y-0.5 active:shadow-[0_1px_0_0_hsl(var(--border))] disabled:opacity-60 disabled:active:translate-y-0"
    >
      <span
        className={cn(
          'grid h-8 w-8 place-items-center rounded-full',
          spent ? 'bg-muted text-muted-foreground' : 'bg-[#4f9149] text-white shadow-[inset_0_-2px_0_rgba(0,0,0,0.18)]',
        )}
      >
        <RefreshCw
          className={cn('h-4 w-4 transition-transform duration-300 ease-out group-active:rotate-90', busy && 'animate-spin')}
          strokeWidth={3}
        />
      </span>
      {spent ? 'Refreshed' : 'Refresh'}
      {state === 'free' && (
        <span className="rounded-md bg-[#e4f3de] px-1.5 py-[3px] text-[10px] uppercase leading-none tracking-[0.06em] text-[#2c511a] dark:bg-[#447d3f]/30 dark:text-[#c6ecb6]">
          Free
        </span>
      )}
      {state === 'ad' && <AdPlayIcon className="h-4 w-4 text-muted-foreground" strokeWidth={2.75} />}
      {state === 'plus' && <Icon name="frogPlus" className="-my-2 -mr-1 h-7 w-7" />}
    </button>
  );
}

const SHOP_GRID = 'grid grid-cols-3 gap-x-2.5 gap-y-5 pt-2.5 md:grid-cols-6 md:gap-x-3';

function SectionHeader({
  icon,
  title,
  sub,
  action,
  onDark = false,
}: {
  icon?: React.ReactNode;
  title: string;
  sub: React.ReactNode;
  action?: React.ReactNode;
  onDark?: boolean;
}) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      {icon ? <span className="grid h-11 w-11 shrink-0 place-items-center">{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-[20px] font-black leading-tight tracking-[-0.01em]',
            onDark ? 'text-white [text-shadow:0_1px_2px_rgba(35,13,82,0.35)]' : 'text-foreground',
          )}
        >
          {title}
        </span>
        <span
          className={cn(
            'mt-0.5 flex items-center gap-1 text-[13px] font-bold tabular-nums',
            onDark ? 'plus-club-sub' : 'text-muted-foreground',
          )}
        >
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
  const todaysPicks = useMemo(
    () => [...special.filter(({ deal }) => !deal.plusOnly), ...special.filter(({ deal }) => deal.plusOnly)],
    [special],
  );
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
        'flex h-12 flex-col items-center justify-center rounded-2xl bg-card/90 px-2.5 text-[11px] font-black text-foreground shadow-[0_2px_0_0_rgba(15,23,42,0.12)] ring-1 ring-border/60 backdrop-blur-md transition-transform active:scale-95',
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
      className="shop-surface relative -mx-4 flex min-h-[100dvh] flex-1 flex-col bg-[color:var(--shop-top)] md:mx-0 md:min-h-0 md:bg-transparent"
    >
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
        <div className="pond-panel relative pb-10 pt-1 md:pt-[140px]">
          <div aria-hidden className="pointer-events-none absolute -bottom-28 left-1/2 top-[-140px] -z-10 hidden w-screen -translate-x-1/2 bg-[color:var(--shop-top)] md:block" />
          
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
                <span className="relative -mt-9 w-[104px] shrink-0 self-end rounded-[20px] bg-background">
                  <QuietTile
                    rarity={saleItem.rarity}
                    className="rounded-[20px] shadow-[0_3px_0_0_#e1e4e9] ring-[3px] ring-[color:var(--pond-well)] dark:shadow-[0_3px_0_0_rgba(0,0,0,0.45)]"
                  >
                    <ItemArt item={saleItem} />
                  </QuietTile>
                  <Icon name="discount" className="absolute -left-2 -top-2 h-9 w-9" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                  <span className="text-balance text-[17px] font-black leading-tight tracking-[-0.01em] text-[color:var(--pond-ink)]">
                    {sale.discountPercent}% off {isPremium || saleOwned ? 'today' : 'with Plus'}
                  </span>
                  {saleOwned ? (
                    <span className="inline-flex items-center gap-1.5 text-[20px] font-black leading-none text-primary">
                      <Check className="h-5 w-5" strokeWidth={3.5} />
                      Owned
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <FlyAmount
                        amount={sale.dealPrice}
                        size={22}
                        className="text-[24px] font-black leading-none text-[color:var(--pond-ink)]"
                      />
                    </span>
                  )}
                </span>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color:var(--pond-accent)] text-[color:var(--pond-accent-ink)] shadow-[0_2px_0_0_var(--pond-accent-shadow)]">
                  <ChevronRight className="h-5 w-5" strokeWidth={3.5} />
                </span>
              </button>
            ) : null}
          </div>

          <div className="relative h-[128px]">
            <div className="pointer-events-none absolute bottom-[-24px] left-1 z-[25] h-[228px] w-[204px] md:left-5">
              {sellerIndices && !sellerLive && (
                <div className="absolute inset-0">
                  <FrogSnapshot indices={sellerIndices} width={204} height={228} />
                </div>
              )}
              {sellerIndices && (
                <div className="absolute inset-0">
                  <Frog
                    ref={sellerRef}
                    width={204}
                    height={228}
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
              fixedMessage="I've got new things every day!"
              className="!z-[26] !left-[178px] !top-[70px] md:!left-[198px] [--bubble-max:min(calc(100vw-210px),15rem)]"
            />
          </div>
        </div>

        <div className="relative z-20 -mt-6 flex-1 rounded-t-[28px] bg-[color:var(--shop-body)] px-4 pb-8 pt-6 md:flex-none md:rounded-none md:bg-transparent md:px-6 md:pb-12 md:pt-8">
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 bottom-0 -z-10 hidden w-screen -translate-x-1/2 rounded-t-[32px] bg-[color:var(--shop-body)] shadow-[0_-10px_24px_-16px_rgba(15,23,42,0.4)] dark:shadow-[0_-10px_24px_-14px_rgba(0,0,0,0.8)] md:block" />
          {!isGuest && shopGift?.available && (
            <div className="mb-5">
              <ShopGiftTile gift={shopGift} onClaim={onClaimGift} />
            </div>
          )}

          <section aria-label="Today's picks" data-hint="shop-deals">
            <SectionHeader
              title="Today's picks"
              sub={
                countdown ? (
<>New picks in {countdown}</>
                ) : (
                  'New items every day'
                )
              }
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
              <div className={SHOP_GRID}>
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="mb-3 aspect-square animate-pulse rounded-[22px] bg-muted" />
                ))}
              </div>
            ) : special.length === 0 ? (
              <p className="rounded-[22px] bg-muted/60 px-4 py-6 text-center text-[14px] font-bold text-muted-foreground">
                {isGuest
                  ? 'Sign in to see today’s picks.'
                  : 'You own everything that could show up here. Nice!'}
              </p>
            ) : (
              <div key={dealsKey} className={SHOP_GRID}>
                {todaysPicks.map(({ deal, item }, index) => {
                  const locked = deal.plusOnly && !isPremium;
                  const owned = owns(item);
                  return (
                    <ShopTile
                      key={item.id}
                      index={index}
                      entry={{
                        kind: 'item',
                        key: item.id,
                        item,
                        rarity: item.rarity,
                        price: deal.onSale ? deal.dealPrice : deal.priceFlies,
                      }}
                      saleTag={deal.sale}
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

          <section aria-label="Everyday collection" className="mt-9">
            <SectionHeader
              title="Everyday collection"
              sub="Always in the shop"
            />
            {loading ? (
              <div className={SHOP_GRID}>
                {Array.from({ length: 9 }, (_, i) => (
                  <div key={i} className="mb-3 aspect-square animate-pulse rounded-[22px] bg-muted" />
                ))}
              </div>
            ) : (
              <div className={SHOP_GRID}>
                {everyday.map((entry) => (
                  <ShopTile
                    key={entry.key}
                    entry={entry}
                    owned={entry.kind === 'item' ? owns(entry.item) : (bgInventory[entry.bg.id] ?? 0) > 0}
                    locked={false}
                    wished={entry.kind === 'item' && wishlistedIds.has(entry.item.id)}
                    onTap={() =>
                      entry.kind === 'item' ? onOpenItem(entry.item, null) : onOpenBackground(entry.bg)
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
