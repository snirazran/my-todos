'use client';

import { useMemo } from 'react';
import { Check, Loader2, Lock, Sparkles, X } from 'lucide-react';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import Fly from '@/components/ui/fly';
import { RARITY_CONFIG } from '@/components/ui/gift-box/constants';
import {
  RARITY_ORDER,
  isTradeOnlyRarity,
  type ItemDef,
  type Rarity,
  type WardrobeSlot,
} from '@/lib/skins/catalog';
import { backgroundPreview } from '@/hooks/useBackgroundActions';
import type { BackgroundItem } from '@/hooks/useBackgrounds';
import { cn } from '@/lib/utils';

export type ClosetSlot =
  | 'all'
  | 'skin'
  | 'hat'
  | 'body'
  | 'hand_item'
  | 'background';

const SHELF_ORDER: Rarity[] = [...RARITY_ORDER] as Rarity[];

const TILE_TONE: Record<Rarity, string> = {
  common: 'bg-slate-50 ring-slate-200 dark:bg-slate-500/10 dark:ring-slate-500/30',
  uncommon:
    'bg-emerald-50 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-500/30',
  rare: 'bg-sky-50 ring-sky-200 dark:bg-sky-500/10 dark:ring-sky-500/30',
  epic: 'bg-gradient-to-b from-violet-50 to-violet-100 ring-violet-300 dark:from-violet-500/10 dark:to-violet-500/20 dark:ring-violet-400/40',
  legendary:
    'bg-gradient-to-b from-amber-50 via-amber-100 to-orange-100 ring-amber-300 shadow-[0_0_0_1px_rgba(251,191,36,0.35),0_6px_16px_-8px_rgba(245,158,11,0.65)] dark:from-amber-500/15 dark:via-amber-500/20 dark:to-orange-500/20 dark:ring-amber-400/50',
};

const BAR_TONE: Record<Rarity, string> = {
  common: 'bg-slate-400',
  uncommon: 'bg-emerald-500',
  rare: 'bg-sky-500',
  epic: 'bg-violet-500',
  legendary: 'bg-gradient-to-r from-amber-400 to-orange-500',
};

type ClosetEntry =
  | { kind: 'item'; item: ItemDef; owned: number; locked: boolean; price: number; dealPrice: number | null }
  | { kind: 'bg'; bg: BackgroundItem; owned: number; locked: boolean; price: number; dealPrice: null };

function entryId(entry: ClosetEntry) {
  return entry.kind === 'item' ? entry.item.id : entry.bg.id;
}

function entryRarity(entry: ClosetEntry): Rarity {
  return entry.kind === 'item' ? entry.item.rarity : (entry.bg.rarity as Rarity);
}

function FlyGlyph({ size = 20 }: { size?: number }) {
  return (
    <span aria-hidden className="relative flex shrink-0 items-center">
      <Fly size={size} y={-3} paused interactive={false} />
    </span>
  );
}

function ClosetTile({
  entry,
  equipped,
  trying,
  isNew,
  onTap,
}: {
  entry: ClosetEntry;
  equipped: boolean;
  trying: boolean;
  isNew: boolean;
  onTap: () => void;
}) {
  const rarity = entryRarity(entry);
  const owned = entry.owned > 0;
  const name = entry.kind === 'item' ? entry.item.name : entry.bg.name;
  const showPrice = !owned && !entry.locked && entry.price > 0;
  const onSale = showPrice && entry.dealPrice != null && entry.dealPrice < entry.price;

  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`${name}, ${RARITY_CONFIG[rarity].label}${owned ? (equipped ? ', wearing' : ', owned') : entry.locked ? ', not found yet' : `, ${entry.dealPrice ?? entry.price} flies`}`}
      aria-pressed={equipped || trying}
      className="group flex w-full flex-col items-stretch gap-1 text-left"
    >
      <span
        className={cn(
          'closet-tile relative block aspect-square w-full overflow-hidden rounded-2xl ring-1 transition-transform duration-150 group-active:scale-95',
          TILE_TONE[rarity],
          (rarity === 'epic' || rarity === 'legendary') && 'closet-foil',
          rarity === 'legendary' && 'closet-foil-gold',
          equipped && 'ring-2 ring-primary',
          trying && !equipped && 'ring-2 ring-foreground/80',
        )}
      >
        <span className="absolute inset-0 flex items-end justify-center">
          {entry.kind === 'item' ? (
            <FrogSnapshot
              className="pointer-events-none shrink-0"
              indices={{ [entry.item.slot as WardrobeSlot]: entry.item.riveIndex }}
              width="124%"
              height="124%"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={backgroundPreview(entry.bg)}
              alt=""
              draggable={false}
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.visibility = 'hidden';
              }}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
        </span>

        {entry.locked && !owned && (
          <span className="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-white/90 text-amber-600 shadow-sm dark:bg-black/50 dark:text-amber-300">
            <Lock className="h-3 w-3" strokeWidth={3} />
          </span>
        )}

        {equipped && (
          <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <Check className="h-3 w-3" strokeWidth={4} />
          </span>
        )}
        {!equipped && isNew && (
          <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-card" />
        )}
        {owned && entry.owned > 1 && (
          <span className="absolute left-1 top-1 rounded-md bg-black/55 px-1 text-[10px] font-black leading-[16px] text-white">
            ×{entry.owned}
          </span>
        )}
        {onSale && (
          <span className="absolute left-1 top-1 rounded-md bg-emerald-500 px-1 text-[10px] font-black leading-[16px] text-white">
            −{Math.round((1 - entry.dealPrice! / entry.price) * 100)}%
          </span>
        )}
      </span>

      <span className="flex h-5 items-center justify-center gap-0.5 text-[12.5px] font-black tabular-nums leading-none">
        {owned ? (
          <span className={equipped ? 'text-primary' : 'text-muted-foreground/70'}>
            {equipped ? 'Wearing' : 'Owned'}
          </span>
        ) : entry.locked ? (
          <span className="text-amber-600 dark:text-amber-400">Gift or trade</span>
        ) : showPrice ? (
          <>
            <FlyGlyph size={20} />
            <span className={onSale ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}>
              {(entry.dealPrice ?? entry.price).toLocaleString()}
            </span>
          </>
        ) : null}
      </span>
    </button>
  );
}

function buildClosetEntries(
  slot: ClosetSlot,
  catalog: ItemDef[],
  backgrounds: BackgroundItem[],
  inventory: Record<string, number>,
  bgInventory: Record<string, number>,
  dealPrices: Map<string, number>,
): ClosetEntry[] {
    const bgEntries: ClosetEntry[] =
      slot === 'background' || slot === 'all'
        ? backgrounds
            .filter((bg) => !bg.hidden || (bgInventory[bg.id] ?? 0) > 0)
            .map((bg) => ({
              kind: 'bg' as const,
              bg,
              owned: bgInventory[bg.id] ?? 0,
              locked: isTradeOnlyRarity(bg.rarity as Rarity) || !(bg.priceFlies > 0),
              price: bg.priceFlies ?? 0,
              dealPrice: null,
            }))
        : [];
    const itemEntries: ClosetEntry[] =
      slot === 'background'
        ? []
        : catalog
            .filter((item) =>
              slot === 'all' ? item.slot !== 'container' : item.slot === slot,
            )
            .map((item) => ({
              kind: 'item' as const,
              item,
              owned: inventory[item.id] ?? 0,
              locked: isTradeOnlyRarity(item.rarity) || !((item.priceFlies ?? 0) > 0),
              price: item.priceFlies ?? 0,
              dealPrice: dealPrices.get(item.id) ?? null,
            }));
    return [...itemEntries, ...bgEntries];
}

export type RaritySummary = { rarity: Rarity; owned: number; total: number };

export function summarizeCloset(
  slot: ClosetSlot,
  catalog: ItemDef[],
  backgrounds: BackgroundItem[],
  inventory: Record<string, number>,
  bgInventory: Record<string, number>,
): RaritySummary[] {
  const entries = buildClosetEntries(
    slot,
    catalog,
    backgrounds,
    inventory,
    bgInventory,
    new Map(),
  );
  return SHELF_ORDER.map((rarity) => {
    const list = entries.filter((entry) => entryRarity(entry) === rarity);
    return {
      rarity,
      total: list.length,
      owned: list.filter((entry) => entry.owned > 0).length,
    };
  }).filter((row) => row.total > 0);
}

const RAIL_DOT: Record<Rarity, string> = {
  common: 'bg-slate-400',
  uncommon: 'bg-emerald-500',
  rare: 'bg-sky-500',
  epic: 'bg-violet-500',
  legendary: 'bg-amber-500',
};

export function RarityRail({
  rows,
  active,
  onJump,
}: {
  rows: RaritySummary[];
  active: Rarity | null;
  onJump: (rarity: Rarity) => void;
}) {
  if (rows.length < 2) return null;
  return (
    <div className="-mx-4 flex gap-1 overflow-x-auto px-3 [mask-image:linear-gradient(to_right,transparent,#000_0.75rem,#000_calc(100%-1.25rem),transparent)] [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
      {rows.map((row) => {
        const isActive = active === row.rarity;
        return (
          <button
            key={row.rarity}
            type="button"
            onClick={() => onJump(row.rarity)}
            aria-current={isActive || undefined}
            className={cn(
              'flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2 text-[12px] font-black transition-colors duration-150',
              isActive
                ? cn('bg-foreground/[0.06]', RARITY_CONFIG[row.rarity].text)
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span className={cn('h-2 w-2 shrink-0 rounded-full', RAIL_DOT[row.rarity])} />
            {RARITY_CONFIG[row.rarity].label}
            <span className="font-bold tabular-nums opacity-70">
              {row.owned}/{row.total}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function DealTileRow({
  deals,
  inventory,
  equipped,
  tryOnId,
  onTapItem,
}: {
  deals: { item: ItemDef; dealPrice: number; onSale: boolean }[];
  inventory: Record<string, number>;
  equipped: Partial<Record<WardrobeSlot, string | null>>;
  tryOnId: string | null;
  onTapItem: (item: ItemDef, dealPrice: number | null) => void;
}) {
  return (
    <div className="-mx-4 -my-1 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] md:-mx-6 md:scroll-px-6 md:px-6 [&::-webkit-scrollbar]:hidden">
      {deals.map(({ item, dealPrice, onSale }) => (
        <div
          key={item.id}
          className="w-[calc((100%-1.5rem)/4)] shrink-0 snap-start md:w-[calc((100%-3.125rem)/6)]"
        >
          <ClosetTile
            entry={{
              kind: 'item',
              item,
              owned: inventory[item.id] ?? 0,
              locked: false,
              price: item.priceFlies ?? 0,
              dealPrice: onSale ? dealPrice : null,
            }}
            equipped={equipped[item.slot] === item.id}
            trying={tryOnId === item.id}
            isNew={false}
            onTap={() => onTapItem(item, onSale ? dealPrice : null)}
          />
        </div>
      ))}
    </div>
  );
}

export function CollectionBook({
  slot,
  catalog,
  backgrounds,
  inventory,
  bgInventory,
  equipped,
  equippedBgId,
  dealPrices,
  tryOnId,
  unseen,
  onTapItem,
  onTapBackground,
}: {
  slot: ClosetSlot;
  catalog: ItemDef[];
  backgrounds: BackgroundItem[];
  inventory: Record<string, number>;
  bgInventory: Record<string, number>;
  equipped: Partial<Record<WardrobeSlot, string | null>>;
  equippedBgId: string | null;
  dealPrices: Map<string, number>;
  tryOnId: string | null;
  unseen: Set<string>;
  onTapItem: (item: ItemDef, dealPrice: number | null) => void;
  onTapBackground: (bg: BackgroundItem) => void;
}) {
  const shelves = useMemo(() => {
    const entries = buildClosetEntries(
      slot,
      catalog,
      backgrounds,
      inventory,
      bgInventory,
      dealPrices,
    );

    const isEquipped = (entry: ClosetEntry) =>
      entry.kind === 'item'
        ? equipped[entry.item.slot] === entry.item.id
        : equippedBgId === entry.bg.id;
    const weight = (entry: ClosetEntry) =>
      isEquipped(entry) ? 0 : entry.owned > 0 ? 1 : entry.locked ? 3 : 2;

    return SHELF_ORDER.map((rarity) => {
      const list = entries
        .filter((entry) => entryRarity(entry) === rarity)
        .sort(
          (a, b) =>
            weight(a) - weight(b) ||
            (a.dealPrice ?? a.price) - (b.dealPrice ?? b.price),
        );
      return {
        rarity,
        list,
        owned: list.filter((entry) => entry.owned > 0).length,
        isEquipped,
      };
    }).filter((shelf) => shelf.list.length > 0);
  }, [slot, catalog, backgrounds, inventory, bgInventory, equipped, equippedBgId, dealPrices]);

  return (
    <div className="flex flex-col gap-5 pb-4">
      {shelves.map((shelf) => {
        const pct = shelf.list.length
          ? Math.round((shelf.owned / shelf.list.length) * 100)
          : 0;
        const premium = shelf.rarity === 'legendary' || shelf.rarity === 'epic';
        return (
          <section
            key={shelf.rarity}
            data-shelf={shelf.rarity}
            aria-label={RARITY_CONFIG[shelf.rarity].label}
          >
            <div className="mb-2 flex items-center gap-2 px-0.5">
              <span
                className={cn(
                  'flex items-center gap-1 text-[13px] font-black uppercase tracking-wide',
                  RARITY_CONFIG[shelf.rarity].text,
                )}
              >
                {premium && <Sparkles className="h-3.5 w-3.5" strokeWidth={2.75} />}
                {RARITY_CONFIG[shelf.rarity].label}
              </span>
              <span className="text-[12px] font-black tabular-nums text-muted-foreground">
                {shelf.owned}/{shelf.list.length}
              </span>
              <span className="relative h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-foreground/[0.07]">
                <span
                  className={cn('absolute inset-y-0 left-0 rounded-full', BAR_TONE[shelf.rarity])}
                  style={{ width: `${pct}%` }}
                />
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2 [@media(max-width:359px)]:grid-cols-3 md:grid-cols-6 md:gap-2.5">
              {shelf.list.map((entry) => {
                const id = entryId(entry);
                return (
                  <ClosetTile
                    key={`${entry.kind}-${id}`}
                    entry={entry}
                    equipped={shelf.isEquipped(entry)}
                    trying={tryOnId === id}
                    isNew={unseen.has(id)}
                    onTap={() =>
                      entry.kind === 'item'
                        ? onTapItem(entry.item, entry.dealPrice)
                        : onTapBackground(entry.bg)
                    }
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function TryOnBar({
  name,
  rarity,
  price,
  originalPrice,
  locked,
  balance,
  busy = false,
  onBuy,
  onGetFlies,
  onTradeUp,
  onClose,
}: {
  name: string;
  rarity: Rarity;
  price: number;
  originalPrice?: number | null;
  locked: boolean;
  balance: number;
  busy?: boolean;
  onBuy: () => void;
  onGetFlies: (shortBy: number) => void;
  onTradeUp: () => void;
  onClose: () => void;
}) {
  const short = Math.max(0, price - balance);
  return (
    <div className="tryon-bar-enter fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+88px)] z-[45] mx-auto max-w-md md:bottom-6">
      <div className="flex items-center gap-3 rounded-[22px] bg-card py-2.5 pl-2.5 pr-2.5 shadow-[0_10px_30px_-12px_rgba(15,23,42,0.45),0_2px_6px_-2px_rgba(15,23,42,0.12)] ring-1 ring-border/70">
        <button
          type="button"
          onClick={onClose}
          aria-label="Stop trying on"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" strokeWidth={2.75} />
        </button>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-black leading-tight text-foreground">
            {name}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[12px] font-bold leading-none">
            <span className={RARITY_CONFIG[rarity].text}>{RARITY_CONFIG[rarity].label}</span>
            {locked && (
              <span className="truncate text-muted-foreground">
                · Find it in gifts or trade up
              </span>
            )}
            {!locked && originalPrice != null && originalPrice > price && (
              <span className="text-emerald-600 dark:text-emerald-400">
                · {Math.round((1 - price / originalPrice) * 100)}% off today
              </span>
            )}
          </span>
        </span>
        {locked ? (
          <button
            type="button"
            onClick={onTradeUp}
            className="flex h-11 shrink-0 items-center rounded-2xl bg-amber-500 px-4 text-[14px] font-black text-white shadow-[0_3px_0_0_#b45309] transition-[transform,box-shadow] active:translate-y-0.5 active:shadow-none"
          >
            Trade up
          </button>
        ) : short > 0 ? (
          <button
            type="button"
            onClick={() => onGetFlies(short)}
            className="flex h-11 shrink-0 flex-col items-center justify-center rounded-2xl bg-amber-500 px-3.5 text-white shadow-[0_3px_0_0_#b45309] transition-[transform,box-shadow] active:translate-y-0.5 active:shadow-none"
          >
            <span className="text-[13px] font-black leading-none">Get flies</span>
            <span className="mt-0.5 text-[10.5px] font-bold leading-none opacity-90">
              {short.toLocaleString()} more
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onBuy}
            disabled={busy}
            className="flex h-11 min-w-[104px] shrink-0 items-center justify-center gap-1 rounded-2xl bg-primary px-4 text-[14px] font-black text-primary-foreground shadow-[0_3px_0_0_#34631f] transition-[transform,box-shadow] active:translate-y-0.5 active:shadow-none disabled:opacity-80"
          >
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                Buy
                <FlyGlyph size={24} />
                <span className="tabular-nums">{price.toLocaleString()}</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
