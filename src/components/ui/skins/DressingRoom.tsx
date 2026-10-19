'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Bookmark, Check, Crown, Loader2, Lock, Sparkles, X } from 'lucide-react';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { FlyAmount, FlyPriceChip } from '@/components/ui/FlyAmount';
import { DragScrollRow } from '@/components/ui/DragScrollRow';
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
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { hapticTick } from '@/lib/haptics';
import { cn } from '@/lib/utils';

export type ClosetSlot =
  | 'all'
  | 'skin'
  | 'hat'
  | 'body'
  | 'hand_item'
  | 'background';

const SHELF_ORDER: Rarity[] = [...RARITY_ORDER] as Rarity[];

export const TILE_TONE: Record<Rarity, string> = {
  common: 'bg-slate-50 ring-slate-200 dark:bg-slate-500/10 dark:ring-slate-500/30',
  uncommon:
    'bg-emerald-50 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-500/30',
  rare: 'bg-sky-50 ring-sky-200 dark:bg-sky-500/10 dark:ring-sky-500/30',
  epic: 'bg-gradient-to-b from-violet-50 to-violet-100 ring-violet-300 dark:from-violet-500/10 dark:to-violet-500/20 dark:ring-violet-400/40',
  legendary:
    'bg-gradient-to-b from-amber-50 via-amber-100 to-orange-100 ring-amber-300 shadow-[0_0_0_1px_rgba(251,191,36,0.35),0_6px_16px_-8px_rgba(245,158,11,0.65)] dark:from-amber-500/15 dark:via-amber-500/20 dark:to-orange-500/20 dark:ring-amber-400/50',
};

export const BAR_TONE: Record<Rarity, string> = {
  common: 'bg-slate-400',
  uncommon: 'bg-emerald-500',
  rare: 'bg-sky-500',
  epic: 'bg-violet-500',
  legendary: 'bg-gradient-to-r from-amber-400 to-orange-500',
};

export const RAIL_ITEM_CLASS =
  'w-[calc((100%-1rem)/3.3)] shrink-0 snap-start md:w-[calc((100%-2.5rem)/6)]';

export function useShelfGrid() {
  const tiny = useMediaQuery('(max-width: 359px)');
  const wide = useMediaQuery('(min-width: 768px)');
  return {
    cols: wide ? 6 : tiny ? 3 : 4,
    gridClass: cn(
      'grid gap-2 md:grid-cols-6 md:gap-2.5',
      tiny ? 'grid-cols-3' : 'grid-cols-4',
    ),
  };
}

function seededRank(seed: string, key: string) {
  const s = `${seed}|${key}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function shelfActionClass(tone: 'quiet' | 'primary' | 'amber' = 'quiet') {
  return cn(
    'inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] font-black transition-colors disabled:pointer-events-none',
    tone === 'quiet' &&
      '-mr-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground',
    tone === 'primary' &&
      'bg-primary/10 text-primary hover:bg-primary/15 active:scale-[0.97]',
    tone === 'amber' &&
      'bg-amber-100 text-amber-800 hover:bg-amber-200/70 active:scale-[0.97] dark:bg-amber-500/15 dark:text-amber-300',
  );
}

export function ShelfHeader({
  label,
  icon,
  tone = 'text-foreground',
  meta,
  progress,
  barTone = 'bg-primary',
  action,
  className,
}: {
  label: ReactNode;
  icon?: ReactNode;
  tone?: string;
  meta?: ReactNode;
  progress?: number | null;
  barTone?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-2 flex min-h-7 items-center gap-2 px-0.5', className)}>
      <span
        className={cn(
          'flex shrink-0 items-center gap-1 text-[13px] font-black uppercase tracking-wide',
          tone,
        )}
      >
        {icon}
        {label}
      </span>
      {meta != null && (
        <span className="flex shrink-0 items-center gap-1 text-[12px] font-black tabular-nums text-muted-foreground">
          {meta}
        </span>
      )}
      {progress != null ? (
        <span className="relative h-1.5 min-w-6 flex-1 overflow-hidden rounded-full bg-foreground/[0.07]">
          <span
            className={cn(
              'absolute inset-y-0 left-0 rounded-full transition-[width] duration-500',
              barTone,
            )}
            style={{ width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%` }}
          />
        </span>
      ) : (
        <span className="flex-1" />
      )}
      {action}
    </div>
  );
}

export function TileArt({
  rarity,
  className,
  children,
}: {
  rarity: Rarity;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'closet-tile relative block aspect-square w-full overflow-hidden rounded-2xl ring-1',
        TILE_TONE[rarity],
        (rarity === 'epic' || rarity === 'legendary') && 'closet-foil',
        rarity === 'legendary' && 'closet-foil-gold',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ItemArt({ item }: { item: Pick<ItemDef, 'slot' | 'riveIndex'> }) {
  return (
    <span className="absolute inset-0 flex items-end justify-center">
      <FrogSnapshot
        className="pointer-events-none shrink-0"
        indices={{ [item.slot as WardrobeSlot]: item.riveIndex }}
        width="124%"
        height="124%"
      />
    </span>
  );
}

export function BackgroundArt({ bg }: { bg: BackgroundItem }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={backgroundPreview(bg)}
      alt=""
      draggable={false}
      loading="lazy"
      onError={(e) => {
        e.currentTarget.style.visibility = 'hidden';
      }}
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}

export function TileRail({ children }: { children: ReactNode }) {
  return (
    <DragScrollRow className="-mx-4 -my-1 snap-x scroll-px-4 gap-2 px-4 py-1 md:-mx-6 md:scroll-px-6 md:px-6">
      {children}
    </DragScrollRow>
  );
}

type ClosetEntry =
  | { kind: 'item'; item: ItemDef; owned: number; locked: boolean; price: number; dealPrice: number | null }
  | { kind: 'bg'; bg: BackgroundItem; owned: number; locked: boolean; price: number; dealPrice: null };

function entryId(entry: ClosetEntry) {
  return entry.kind === 'item' ? entry.item.id : entry.bg.id;
}

function entryRarity(entry: ClosetEntry): Rarity {
  return entry.kind === 'item' ? entry.item.rarity : (entry.bg.rarity as Rarity);
}

function isEntryEquipped(
  entry: ClosetEntry,
  equipped: Partial<Record<WardrobeSlot, string | null>>,
  equippedBgId: string | null,
) {
  return entry.kind === 'item'
    ? equipped[entry.item.slot] === entry.item.id
    : equippedBgId === entry.bg.id;
}

function ClosetTile({
  entry,
  equipped,
  trying,
  isNew,
  wishlisted = false,
  balance = Number.POSITIVE_INFINITY,
  showWas = false,
  onTap,
}: {
  entry: ClosetEntry;
  equipped: boolean;
  trying: boolean;
  isNew: boolean;
  wishlisted?: boolean;
  balance?: number;
  showWas?: boolean;
  onTap: () => void;
}) {
  const rarity = entryRarity(entry);
  const owned = entry.owned > 0;
  const name = entry.kind === 'item' ? entry.item.name : entry.bg.name;
  const showPrice = !owned && !entry.locked && entry.price > 0;
  const onSale = showPrice && entry.dealPrice != null && entry.dealPrice < entry.price;
  const price = entry.dealPrice ?? entry.price;
  const affordable = balance >= price;

  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`${name}, ${RARITY_CONFIG[rarity].label}${owned ? (equipped ? ', wearing' : ', owned') : entry.locked ? ', not found yet' : `, ${price} flies`}`}
      aria-pressed={equipped || trying}
      className="group flex w-full flex-col items-stretch gap-1 text-left"
    >
      <TileArt
        rarity={rarity}
        className={cn(
          'transition-transform duration-150 group-active:scale-95',
          equipped && 'ring-2 ring-primary',
          trying && !equipped && 'ring-2 ring-foreground/80',
        )}
      >
        {entry.kind === 'item' ? <ItemArt item={entry.item} /> : <BackgroundArt bg={entry.bg} />}

        {onSale ? (
          <span className="absolute left-1 top-1 rounded-md bg-[#447d3f] px-1 text-[10px] font-black leading-[16px] text-white">
            −{Math.round((1 - price / entry.price) * 100)}%
          </span>
        ) : entry.locked && !owned ? (
          <span className="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-white/90 text-amber-600 shadow-sm dark:bg-black/50 dark:text-amber-300">
            <Lock className="h-3 w-3" strokeWidth={3} />
          </span>
        ) : owned && entry.owned > 1 ? (
          <span className="absolute left-1 top-1 rounded-md bg-black/55 px-1 text-[10px] font-black leading-[16px] text-white">
            ×{entry.owned}
          </span>
        ) : null}

        {equipped ? (
          <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <Check className="h-3 w-3" strokeWidth={4} />
          </span>
        ) : isNew ? (
          <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-card" />
        ) : wishlisted && !owned ? (
          <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <Bookmark className="h-2.5 w-2.5" strokeWidth={3.5} fill="currentColor" />
          </span>
        ) : null}
      </TileArt>

      <span className="flex h-6 items-center justify-center gap-1 text-[12.5px] font-black tabular-nums leading-none">
        {owned ? (
          <span className={equipped ? 'text-primary' : 'text-muted-foreground/70'}>
            {equipped ? 'Wearing' : 'Wear'}
          </span>
        ) : entry.locked ? (
          <span className="text-amber-700 dark:text-amber-400">Gift or trade</span>
        ) : showPrice ? (
          <>
            {showWas && onSale && (
              <span className="text-[12px] font-bold text-muted-foreground line-through decoration-2 opacity-70">
                {entry.price.toLocaleString()}
              </span>
            )}
            <FlyAmount
              amount={price}
              size={15}
              className={
                !affordable
                  ? 'text-muted-foreground'
                  : onSale
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-foreground'
              }
            />
          </>
        ) : null}
      </span>
    </button>
  );
}

function VaultTwinkle({ className, delay }: { className: string; delay: number }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 10 10"
      style={{ animationDelay: `${delay}s` }}
      className={cn(
        'vault-twinkle pointer-events-none absolute fill-[color:var(--vault-star)]',
        className,
      )}
    >
      <path d="M5 0C5.4 3.2 6.8 4.6 10 5 6.8 5.4 5.4 6.8 5 10 4.6 6.8 3.2 5.4 0 5 3.2 4.6 4.6 3.2 5 0Z" />
    </svg>
  );
}

function VaultTile({
  entry,
  index,
  trying,
  wishlisted,
  onTap,
}: {
  entry: ClosetEntry;
  index: number;
  trying: boolean;
  wishlisted: boolean;
  onTap: () => void;
}) {
  const name = entryName(entry);
  const delay = (index * 0.9) % 3.2;
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`${name}, ${RARITY_CONFIG.legendary.label}, not for sale`}
      aria-pressed={trying}
      className="group flex w-full flex-col items-stretch gap-1.5 text-left"
    >
      <span
        className={cn(
          'vault-case closet-foil closet-foil-gold relative block aspect-square w-full overflow-hidden rounded-[20px] bg-[color:var(--vault-well)] ring-1 ring-[color:var(--vault-well-line)] shadow-[0_3px_0_0_var(--vault-line)] transition-transform duration-150 group-active:scale-95',
          trying && 'ring-2 ring-foreground/80',
        )}
      >
        {entry.kind === 'item' ? <ItemArt item={entry.item} /> : <BackgroundArt bg={entry.bg} />}
        <VaultTwinkle className="left-[18%] top-[20%] h-3 w-3" delay={delay} />
        <VaultTwinkle className="right-[16%] top-[38%] h-2 w-2" delay={delay + 1.5} />
        <span className="absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950 shadow-[0_2px_0_0_#b45309]">
          <Crown className="h-3.5 w-3.5" strokeWidth={2.5} fill="currentColor" />
        </span>
        {wishlisted && (
          <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <Bookmark className="h-3 w-3" strokeWidth={3.5} fill="currentColor" />
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-col items-center gap-1 px-1">
        <span className="w-full truncate text-center text-[13.5px] font-black leading-tight text-[color:var(--vault-ink)]">
          {name}
        </span>
        <span className="flex items-center gap-1 whitespace-nowrap text-[10.5px] font-black uppercase leading-none tracking-[0.08em] text-[color:var(--vault-eyebrow)]">
          <Lock className="h-2.5 w-2.5" strokeWidth={3.25} />
          Not for sale
        </span>
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

export function DealTileRow({
  deals,
  inventory,
  equipped,
  tryOnId,
  wishlistedIds,
  balance,
  onTapItem,
}: {
  deals: { item: ItemDef; dealPrice: number; onSale: boolean }[];
  inventory: Record<string, number>;
  equipped: Partial<Record<WardrobeSlot, string | null>>;
  tryOnId: string | null;
  wishlistedIds: Set<string>;
  balance: number;
  onTapItem: (item: ItemDef, dealPrice: number | null) => void;
}) {
  return (
    <TileRail>
      {deals.map(({ item, dealPrice, onSale }) => (
        <div key={item.id} className={RAIL_ITEM_CLASS}>
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
            wishlisted={wishlistedIds.has(item.id)}
            balance={balance}
            showWas
            onTap={() => onTapItem(item, onSale ? dealPrice : null)}
          />
        </div>
      ))}
    </TileRail>
  );
}

function useStuckHeaderTop() {
  const [top, setTop] = useState<number | null>(null);
  useEffect(() => {
    const group = document.querySelector<HTMLElement>('[data-wardrobe-sticky]');
    if (!group || getComputedStyle(group).position !== 'sticky') return;
    const wide = window.matchMedia('(min-width: 768px)');
    const update = () =>
      setTop(Math.max(0, group.offsetHeight + (wide.matches ? -96 : -90)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(group);
    wide.addEventListener('change', update);
    return () => {
      observer.disconnect();
      wide.removeEventListener('change', update);
    };
  }, []);
  return top;
}

const TIER_DOT: Record<Rarity, string> = {
  common: 'bg-slate-400',
  uncommon: 'bg-emerald-500',
  rare: 'bg-sky-500',
  epic: 'bg-violet-500',
  legendary: 'bg-amber-500',
};

const TIER_TONE: Record<Rarity, string> = {
  common: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-500/40 dark:bg-slate-500/15 dark:text-slate-200',
  uncommon: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300',
  rare: 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-300',
  epic: 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-300',
  legendary: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300',
};

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
  wishlistedIds,
  balance,
  shuffleSeed,
  show,
  empty = null,
  onTapItem,
  onTapBackground,
  onTradeUp,
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
  wishlistedIds: Set<string>;
  balance: number;
  shuffleSeed: string;
  show: 'owned' | 'unowned';
  empty?: ReactNode;
  onTapItem: (item: ItemDef, dealPrice: number | null) => void;
  onTapBackground: (bg: BackgroundItem) => void;
  onTradeUp?: () => void;
}) {
  const { gridClass } = useShelfGrid();
  const stuckTop = useStuckHeaderTop();
  const barRef = useRef<HTMLDivElement>(null);
  const pillRowRef = useRef<HTMLElement>(null);
  const shelfRefs = useRef(new Map<Rarity, HTMLElement>());
  const spyLockRef = useRef(0);
  const [activeTier, setActiveTier] = useState<Rarity | null>(null);

  const shelves = useMemo(() => {
    const entries = buildClosetEntries(
      slot,
      catalog,
      backgrounds,
      inventory,
      bgInventory,
      dealPrices,
    );
    return SHELF_ORDER.map((rarity) => {
      const tier = entries.filter((entry) => entryRarity(entry) === rarity);
      const list =
        show === 'owned'
          ? tier
              .filter((entry) => entry.owned > 0)
              .sort(
                (a, b) =>
                  entrySlotRank(a) - entrySlotRank(b) ||
                  entryName(a).localeCompare(entryName(b)),
              )
          : tier
              .filter((entry) => entry.owned === 0)
              .map((entry) => ({
                entry,
                rank: seededRank(shuffleSeed, `${entry.kind}:${entryId(entry)}`),
              }))
              .sort((a, b) => a.rank - b.rank)
              .map(({ entry }) => entry);
      return {
        rarity,
        list,
        total: tier.length,
        owned: tier.filter((entry) => entry.owned > 0).length,
      };
    }).filter((shelf) => shelf.list.length > 0);
  }, [slot, catalog, backgrounds, inventory, bgInventory, dealPrices, shuffleSeed, show]);

  const showTierBar = shelves.length > 1;

  useEffect(() => {
    if (!showTierBar) return;
    const root = document.getElementById('main-scroll');
    if (!root) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (Date.now() < spyLockRef.current) return;
      const line =
        root.getBoundingClientRect().top +
        (stuckTop ?? 0) +
        (barRef.current?.offsetHeight ?? 0) +
        24;
      let current: Rarity | null = null;
      shelves.forEach((shelf) => {
        const el = shelfRefs.current.get(shelf.rarity);
        if (el && el.getBoundingClientRect().top <= line) current = shelf.rarity;
      });
      setActiveTier((prev) => (prev === current ? prev : current));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      root.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [showTierBar, shelves, stuckTop]);

  useEffect(() => {
    const row = pillRowRef.current;
    if (!row || !activeTier) return;
    const pill = row.querySelector<HTMLElement>(`[data-tier="${activeTier}"]`);
    if (!pill) return;
    row.scrollTo({
      left: pill.offsetLeft - (row.clientWidth - pill.offsetWidth) / 2,
      behavior: 'smooth',
    });
  }, [activeTier]);

  const jumpToTier = (rarity: Rarity) => {
    const root = document.getElementById('main-scroll');
    const shelf = shelfRefs.current.get(rarity);
    if (!root || !shelf) return;
    hapticTick();
    setActiveTier(rarity);
    spyLockRef.current = Date.now() + 800;
    const offset = (stuckTop ?? 0) + (barRef.current?.offsetHeight ?? 0) + 8;
    const top =
      root.scrollTop +
      shelf.getBoundingClientRect().top -
      root.getBoundingClientRect().top -
      offset;
    root.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  };

  if (!shelves.length) return <>{empty}</>;

  return (
    <div className="flex flex-col gap-5 pb-4">
      {showTierBar && (
        <div
          ref={barRef}
          style={stuckTop != null ? { top: stuckTop } : undefined}
          className={cn(
            '-mx-4 -mb-3 bg-background py-2 md:-mx-6',
            stuckTop != null && 'sticky z-30',
          )}
        >
          <nav
            ref={pillRowRef}
            aria-label="Jump to a rarity"
            className="relative flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] md:px-6 [&::-webkit-scrollbar]:hidden"
          >
            {shelves.map((shelf) => {
              const isActive = activeTier === shelf.rarity;
              return (
                <button
                  key={shelf.rarity}
                  type="button"
                  data-tier={shelf.rarity}
                  onClick={() => jumpToTier(shelf.rarity)}
                  aria-current={isActive || undefined}
                  className={cn(
                    'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-black transition-colors duration-150',
                    isActive
                      ? TIER_TONE[shelf.rarity]
                      : 'border-border/60 bg-card text-muted-foreground hover:text-foreground',
                  )}
                >
                  {shelf.rarity === 'legendary' ? (
                    <Crown className="h-3 w-3 shrink-0 text-amber-500" strokeWidth={2.5} fill="currentColor" />
                  ) : (
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', TIER_DOT[shelf.rarity])} />
                  )}
                  {RARITY_CONFIG[shelf.rarity].label}
                </button>
              );
            })}
          </nav>
        </div>
      )}
      {shelves.map((shelf) => {
        const premium = shelf.rarity === 'legendary' || shelf.rarity === 'epic';
        const vault = show === 'unowned' && isTradeOnlyRarity(shelf.rarity);
        return (
          <section
            key={shelf.rarity}
            ref={(el) => {
              if (el) shelfRefs.current.set(shelf.rarity, el);
              else shelfRefs.current.delete(shelf.rarity);
            }}
            data-shelf={shelf.rarity}
            aria-label={RARITY_CONFIG[shelf.rarity].label}
            className={vault ? 'vault-panel rounded-[24px] p-3 md:p-4' : undefined}
          >
            <ShelfHeader
              icon={
                vault ? (
                  <Crown className="h-3.5 w-3.5" strokeWidth={2.5} fill="currentColor" />
                ) : premium ? (
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={2.75} />
                ) : undefined
              }
              label={RARITY_CONFIG[shelf.rarity].label}
              tone={vault ? 'text-[color:var(--vault-eyebrow)]' : RARITY_CONFIG[shelf.rarity].text}
              meta={
                <span>
                  {shelf.owned}
                  <span className="opacity-60">/{shelf.total}</span>
                </span>
              }
              progress={shelf.owned / shelf.total}
              barTone={BAR_TONE[shelf.rarity]}
              action={
                vault && onTradeUp ? (
                  <button
                    type="button"
                    onClick={onTradeUp}
                    className="inline-flex h-7 shrink-0 items-center rounded-full bg-amber-400 px-3 text-[12px] font-black text-amber-950 shadow-[0_2px_0_0_#b45309] transition-[transform,box-shadow] active:translate-y-0.5 active:shadow-none"
                  >
                    Trade up
                  </button>
                ) : undefined
              }
            />
            {vault && (
              <p className="-mt-1 mb-3 px-0.5 text-[12.5px] font-bold leading-snug text-[color:var(--vault-ink-muted)]">
                Never sold. Found only in gifts and trade-ups.
              </p>
            )}
            <div className={vault ? 'grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3' : gridClass}>
              {shelf.list.map((entry, index) => {
                const id = entryId(entry);
                if (vault) {
                  return (
                    <VaultTile
                      key={`${entry.kind}-${id}`}
                      entry={entry}
                      index={index}
                      trying={tryOnId === id}
                      wishlisted={entry.kind === 'item' && wishlistedIds.has(id)}
                      onTap={() =>
                        entry.kind === 'item'
                          ? onTapItem(entry.item, entry.dealPrice)
                          : onTapBackground(entry.bg)
                      }
                    />
                  );
                }
                return (
                  <ClosetTile
                    key={`${entry.kind}-${id}`}
                    entry={entry}
                    equipped={isEntryEquipped(entry, equipped, equippedBgId)}
                    trying={tryOnId === id}
                    isNew={unseen.has(id)}
                    wishlisted={entry.kind === 'item' && wishlistedIds.has(id)}
                    balance={balance}
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

const SLOT_ORDER: ClosetSlot[] = ['skin', 'hat', 'body', 'hand_item', 'background'];

function entrySlotRank(entry: ClosetEntry) {
  return SLOT_ORDER.indexOf(
    entry.kind === 'item' ? (entry.item.slot as ClosetSlot) : 'background',
  );
}

function entryName(entry: ClosetEntry) {
  return entry.kind === 'item' ? entry.item.name : entry.bg.name;
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
  const balanceAtBuy = useRef(balance);
  if (!busy) balanceAtBuy.current = balance;
  const short = Math.max(0, price - balanceAtBuy.current);
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
            <span className={cn('flex shrink-0 items-center gap-1', RARITY_CONFIG[rarity].text)}>
              {rarity === 'legendary' && (
                <Crown className="h-3 w-3" strokeWidth={2.5} fill="currentColor" />
              )}
              {RARITY_CONFIG[rarity].label}
            </span>
            {locked && (
              <span className="truncate text-muted-foreground">
                · Find it in gifts or trade up
              </span>
            )}
            {!locked && originalPrice != null && originalPrice > price && (
              <span className="text-emerald-700 dark:text-emerald-400">
                · {Math.round((1 - price / originalPrice) * 100)}% off today
              </span>
            )}
          </span>
        </span>
        {locked ? (
          <button
            type="button"
            onClick={onTradeUp}
            className="flex h-11 shrink-0 items-center rounded-2xl bg-amber-400 px-4 text-[14px] font-black text-amber-950 shadow-[0_3px_0_0_#b45309] transition-[transform,box-shadow] active:translate-y-0.5 active:shadow-none"
          >
            Trade up
          </button>
        ) : short > 0 ? (
          <button
            type="button"
            onClick={() => onGetFlies(short)}
            className="flex h-11 shrink-0 items-center justify-center gap-1 rounded-2xl bg-amber-400 px-3.5 text-[14px] font-black text-amber-950 shadow-[0_3px_0_0_#b45309] transition-[transform,box-shadow] active:translate-y-0.5 active:shadow-none"
          >
            Get
            <FlyAmount amount={short} size={14} />
            more
          </button>
        ) : (
          <button
            type="button"
            onClick={onBuy}
            disabled={busy}
            className="flex h-11 min-w-[104px] shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#447d3f] pl-4 pr-1.5 text-[14px] font-black text-white shadow-[0_3px_0_0_#2c511a] transition-[transform,box-shadow] active:translate-y-0.5 active:shadow-none disabled:opacity-80"
          >
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                Buy
                <FlyPriceChip amount={price} size={14} />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export function YoursCard({
  name,
  rarity,
  thumb,
  collected,
  onDone,
}: {
  name: string;
  rarity: Rarity;
  thumb: ReactNode;
  collected?: { owned: number; total: number } | null;
  onDone: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 2800);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="tryon-bar-enter fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+88px)] z-[45] mx-auto max-w-md md:bottom-6">
      <button
        type="button"
        onClick={onDone}
        aria-live="polite"
        className="flex w-full items-center gap-3 rounded-[22px] bg-card py-2.5 pl-2.5 pr-3 text-left shadow-[0_10px_30px_-12px_rgba(15,23,42,0.45),0_2px_6px_-2px_rgba(15,23,42,0.12)] ring-1 ring-border/70"
      >
        <span
          className={cn(
            'relative flex h-12 w-12 shrink-0 items-end justify-center overflow-hidden rounded-2xl ring-1',
            TILE_TONE[rarity],
            (rarity === 'epic' || rarity === 'legendary') && 'closet-foil',
            rarity === 'legendary' && 'closet-foil-gold',
          )}
        >
          {thumb}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-black leading-tight text-foreground">
            It&apos;s yours!
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] font-bold leading-none">
            <span className="truncate text-muted-foreground">{name}</span>
            {collected && (
              <span className={cn('shrink-0 tabular-nums', RARITY_CONFIG[rarity].text)}>
                · {RARITY_CONFIG[rarity].label} {collected.owned}/{collected.total}
              </span>
            )}
          </span>
        </span>
        <span className="yours-seal grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#447d3f] text-white shadow-[0_2px_0_0_#2c511a]">
          <Check className="h-5 w-5" strokeWidth={3.5} />
        </span>
      </button>
    </div>
  );
}
