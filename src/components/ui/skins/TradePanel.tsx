'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  AlertCircle,
  ArrowRight,
  Bookmark,
  ArrowUp,
  Check,
  ChevronDown,
  Crosshair,
  Dices,
  Play,
  Repeat,
  ShoppingBag,
} from 'lucide-react';
import { hapticTick, hapticSelect, hapticCelebrate } from '@/lib/haptics';
import {
  rewardedAdsAvailable,
  showRewardedAd,
  takePlusOfferAfterAd,
} from '@/lib/ads';
import { PlusUpgradeModal } from '@/components/ui/PlusUpgradeModal';
import { cn } from '@/lib/utils';
import {
  ItemDef,
  Rarity,
  rarityRank,
  TRADE_MIN_ITEM_COUNT,
} from '@/lib/skins/catalog';
import { useTradeConfig } from '@/hooks/useTradeConfig';
import { useWishlist } from '@/hooks/useWishlist';
import {
  quoteAimPrice,
  quoteTradeFuel,
  recipeFor,
} from '@/lib/skins/tradeModifiers';
import Fly from '@/components/ui/fly';
import { Button } from '@/components/ui/button';
import confetti from 'canvas-confetti';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { ItemCard } from './ItemCard';

// Import from gift-box for the reward UI
import {
  GoldenRewardButton,
  RewardCard,
} from '@/components/ui/gift-box/RewardCard';
import { RotatingRays } from '@/components/ui/gift-box/RotatingRays';
import { RARITY_CONFIG as GIFT_RARITY_CONFIG } from '@/components/ui/gift-box/constants';

/* ---------------- Visual Helpers ---------------- */
const RARITY_CONFIG: Record<
  ItemDef['rarity'],
  {
    border: string;
    bg: string;
    text: string;
    glow: string;
    label: string;
    gradient: string;
    shadow: string;
    hoverGlow: string;
  }
> = {
  common: {
    border: 'border-border',
    bg: 'bg-card',
    text: 'text-muted-foreground',
    glow: 'shadow-none',
    label: 'Common',
    gradient: 'from-muted/50 to-muted/20',
    shadow: 'shadow-sm',
    hoverGlow: 'hover:shadow-[0_0_20px_rgba(148,163,184,0.1)]',
  },
  uncommon: {
    border: 'border-emerald-500',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    text: 'text-emerald-700 dark:text-emerald-400',
    glow: 'shadow-emerald-500/10',
    label: 'Uncommon',
    gradient:
      'from-emerald-100 to-emerald-50 dark:from-emerald-900/40 dark:to-emerald-950/40',
    shadow: 'shadow-emerald-500/15',
    hoverGlow: 'hover:shadow-[0_0_20px_rgba(16,185,129,0.5)]',
  },
  rare: {
    border: 'border-sky-500',
    bg: 'bg-sky-50 dark:bg-sky-950/30',
    text: 'text-sky-700 dark:text-sky-400',
    glow: 'shadow-sky-500/10',
    label: 'Rare',
    gradient: 'from-sky-100 to-sky-50 dark:from-sky-900/40 dark:to-sky-950/40',
    shadow: 'shadow-sky-500/15',
    hoverGlow: 'hover:shadow-[0_0_20px_rgba(14,165,233,0.5)]',
  },
  epic: {
    border: 'border-violet-500',
    bg: 'bg-violet-50 dark:bg-violet-950/30',
    text: 'text-violet-700 dark:text-violet-400',
    glow: 'shadow-violet-500/15',
    label: 'Epic',
    gradient:
      'from-violet-100 to-violet-50 dark:from-violet-900/40 dark:to-violet-950/40',
    shadow: 'shadow-violet-500/20',
    hoverGlow: 'hover:shadow-[0_0_20px_rgba(139,92,246,0.5)]',
  },
  legendary: {
    border: 'border-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    text: 'text-amber-700 dark:text-amber-400',
    glow: 'shadow-amber-500/20',
    label: 'Legendary',
    gradient:
      'from-amber-100 to-amber-50 dark:from-amber-900/40 dark:to-amber-950/40',
    shadow: 'shadow-amber-500/25',
    hoverGlow: 'hover:shadow-[0_0_20px_rgba(245,158,11,0.5)]',
  },
};

import { FilterCategory } from './FilterBar';
import { SortOrder } from './SortMenu';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { BackgroundCard } from './BackgroundCard';
import { backgroundPreview } from '@/hooks/useBackgroundActions';
import { DEFAULT_BACKGROUND_ID } from '@/lib/backgrounds/constants';
import { WardrobeEmptyState } from './WardrobeEmptyState';
import type { BackgroundItem } from '@/hooks/useBackgrounds';


type TradeEntry = {
  uid: string;
  id: string;
  kind: 'item' | 'background';
  rarity: Rarity;
  owned: number;
  item?: ItemDef;
  bg?: BackgroundItem;
};

type TradePanelProps = {
  inventory: Record<string, number>;
  catalog: ItemDef[];
  backgrounds?: BackgroundItem[];
  backgroundInventory?: Record<string, number>;
  unseenItems: string[];
  onTradeSuccess?: () => void;
  activeFilter?: FilterCategory;
  sortBy?: SortOrder;
  paused?: boolean;
  pageScroll?: boolean;
  isPremium?: boolean;
  balance?: number;
  onGoToShop?: () => void;
  onGetFlies?: (shortBy: number) => void;
};

type TradePrize = ItemDef & { kind?: 'item' | 'background'; imageUrl?: string };

export function TradePanel({
  inventory,
  catalog,
  backgrounds = [],
  backgroundInventory = {},
  unseenItems,
  onTradeSuccess,
  activeFilter = 'all',
  sortBy = 'rarity_asc',
  paused = false,
  pageScroll = false,
  isPremium = false,
  balance = 0,
  onGoToShop,
  onGetFlies,
}: TradePanelProps) {
  // --- State ---
  const modifiers = useTradeConfig();
  const { items: wishlistItems } = useWishlist(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [fuelIds, setFuelIds] = useState<string[]>([]);
  const [aimOn, setAimOn] = useState(false);
  const [isTrading, setIsTrading] = useState(false);
  const [rewardQueue, setRewardQueue] = useState<TradePrize[]>([]);
  const [wasGolden, setWasGolden] = useState(false);
  const tradeResult = rewardQueue[0] ?? null;
  const [rerollClaimId, setRerollClaimId] = useState<string | null>(null);
  const [rerollBusy, setRerollBusy] = useState(false);
  const [rerollError, setRerollError] = useState<string | null>(null);
  const [showPlusOffer, setShowPlusOffer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [inventoryHasScrolled, setInventoryHasScrolled] = useState(false);
  const [gridInitialSize, setGridInitialSize] = useState(4);
  const [gridBatchSize, setGridBatchSize] = useState(6);
  const inventoryScrollRef = useRef<HTMLDivElement | null>(null);
  const threeCol = useMediaQuery('(min-width: 380px)');
  const cardGridClass = cn(
    'grid md:grid-cols-4 md:gap-4',
    threeCol ? 'grid-cols-3 gap-2' : 'grid-cols-2 gap-3',
  );
  // Mobile-only collapse for the contract slot grid. Auto-expands when items are added,
  // auto-collapses when cleared. Desktop (lg+) ignores this and always shows the grid.
  const [isContractExpanded, setIsContractExpanded] = useState(false);
  const prevSelectedCountRef = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  // --- Derived ---
  // Unified pool of tradeable entries (items + backgrounds), keyed by `kind:id`.
  const entryMap = useMemo(() => {
    const map = new Map<string, TradeEntry>();
    catalog.forEach((item) => {
      const owned = inventory[item.id] ?? 0;
      if (owned <= 0) return;
      if (item.slot === 'container') return;
      if (!recipeFor(modifiers, item.rarity)) return;
      const uid = `item:${item.id}`;
      map.set(uid, { uid, id: item.id, kind: 'item', rarity: item.rarity, owned, item });
    });
    backgrounds.forEach((bgItem) => {
      const owned = backgroundInventory[bgItem.id] ?? 0;
      if (owned <= 0) return;
      if (!recipeFor(modifiers, bgItem.rarity)) return;
      // Granted to everyone, so there's nothing to spend — the server rejects
      // it too.
      if (bgItem.id === DEFAULT_BACKGROUND_ID) return;
      const uid = `background:${bgItem.id}`;
      map.set(uid, {
        uid,
        id: bgItem.id,
        kind: 'background',
        rarity: bgItem.rarity,
        owned,
        bg: bgItem,
      });
    });
    return map;
  }, [catalog, inventory, backgrounds, backgroundInventory, modifiers]);

  // Unfiltered, so the empty state can tell "a filter is hiding them" apart
  // from "you own none".
  const hasAnySpares = entryMap.size > 0;

  const targetRarity = useMemo(() => {
    if (selectedIds.length === 0) return null;
    return entryMap.get(selectedIds[0])?.rarity ?? null;
  }, [selectedIds, entryMap]);

  useEffect(() => {
    setInventoryHasScrolled(false);
  }, [activeFilter, sortBy, targetRarity]);

  useEffect(() => {
    const prev = prevSelectedCountRef.current;
    const curr = selectedIds.length;
    if (prev === 0 && curr > 0) setIsContractExpanded(true);
    else if (prev > 0 && curr === 0) setIsContractExpanded(false);
    prevSelectedCountRef.current = curr;
  }, [selectedIds.length]);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    const update = () => {
      setGridInitialSize(query.matches ? 10 : 4);
      setGridBatchSize(query.matches ? 10 : 6);
    };
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const availableItems = useMemo(() => {
    const matchesFilter = (entry: TradeEntry) => {
      if (activeFilter === 'all') return true;
      if (activeFilter === 'background') return entry.kind === 'background';
      if (entry.kind !== 'item' || !entry.item) return false;
      if (activeFilter === 'skin') return entry.item.slot === 'skin';
      if (activeFilter === 'body') return entry.item.slot === 'body';
      if (activeFilter === 'held') return entry.item.slot === 'hand_item';
      return entry.item.slot === activeFilter;
    };

    const price = (entry: TradeEntry) =>
      entry.kind === 'item'
        ? entry.item?.priceFlies ?? 0
        : entry.bg?.priceFlies ?? 0;

    const result = Array.from(entryMap.values()).filter((entry) =>
      matchesFilter(entry),
    );

    return result.sort((a, b) => {
      switch (sortBy) {
        case 'rarity_asc':
          return rarityRank[a.rarity] - rarityRank[b.rarity];
        case 'rarity_desc':
          return rarityRank[b.rarity] - rarityRank[a.rarity];
        case 'price_asc':
          return price(a) - price(b);
        case 'price_desc':
          return price(b) - price(a);
        default:
          return 0;
      }
    });
  }, [entryMap, targetRarity, activeFilter, sortBy]);

  const availableGrid = useInfiniteScroll(availableItems, {
    initial: availableItems.length,
    batch: availableItems.length || 1,
    resetKey: `${activeFilter}|${sortBy}|${availableItems.length}`,
    rootRef: inventoryScrollRef,
    enabled: false,
  });

  useEffect(() => {
    if (gridInitialSize >= gridBatchSize || !availableGrid.hasMore) return;

    let cancelIdleLoad: (() => void) | undefined;
    const loadTimer = window.setTimeout(() => {
      if ('requestIdleCallback' in window) {
        const idleId = window.requestIdleCallback(
          () => availableGrid.loadMore(),
          { timeout: 700 },
        );
        cancelIdleLoad = () => window.cancelIdleCallback(idleId);
      } else {
        const fallbackTimer = globalThis.setTimeout(
          availableGrid.loadMore,
          0,
        );
        cancelIdleLoad = () => globalThis.clearTimeout(fallbackTimer);
      }
    }, 900);

    return () => {
      window.clearTimeout(loadTimer);
      cancelIdleLoad?.();
    };
  }, [
    activeFilter,
    availableGrid.hasMore,
    availableGrid.loadMore,
    gridBatchSize,
    gridInitialSize,
    sortBy,
    targetRarity,
  ]);

  const isNearScrollEnd = (node: HTMLElement) =>
    node.scrollTop + node.clientHeight >= node.scrollHeight - 160;
  const shouldLoadMoreFromWheel = (node: HTMLElement, deltaY: number) =>
    deltaY > 0 && node.scrollTop + node.clientHeight >= node.scrollHeight - 160;

  const selectedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    [...selectedIds, ...fuelIds].forEach(
      (id) => (counts[id] = (counts[id] || 0) + 1),
    );
    return counts;
  }, [selectedIds, fuelIds]);

  const recipe = targetRarity ? recipeFor(modifiers, targetRarity) : null;
  const slotCount = recipe?.itemCount ?? TRADE_MIN_ITEM_COUNT;

  // Every main input has to be a spare — one-of-a-kind items you would regret
  // burning don't earn the waiver.
  const allSpares =
    selectedIds.length > 0 &&
    Array.from(new Set(selectedIds)).every(
      (uid) => (entryMap.get(uid)?.owned ?? 0) >= 2,
    );
  const fuelQuote = quoteTradeFuel({
    modifiers,
    recipe,
    allSpares,
    isPlus: isPremium,
  });
  const fuelRarity = fuelQuote.count > 0 ? recipe?.fuelRarity ?? null : null;
  const aimQuote = quoteAimPrice({ modifiers, recipe, isPlus: isPremium });
  const wishlistHits = recipe
    ? wishlistItems.filter(
        (entry) => entry.rarity === recipe.to && !entry.owned,
      ).length
    : 0;
  const canAim = wishlistHits > 0 && aimQuote.price > 0;
  const aimActive = aimOn && canAim;
  const canAffordAim = balance >= aimQuote.price;

  const fuelOwned = useMemo(() => {
    if (!fuelRarity) return 0;
    let total = 0;
    entryMap.forEach((entry) => {
      if (entry.rarity === fuelRarity) total += entry.owned;
    });
    return total;
  }, [entryMap, fuelRarity]);

  // Trimming a waiver mid-build can ask for fuel the player already dropped,
  // so the surplus is released rather than silently counted.
  useEffect(() => {
    setFuelIds((prev) =>
      prev.length > fuelQuote.count ? prev.slice(0, fuelQuote.count) : prev,
    );
  }, [fuelQuote.count]);

  useEffect(() => {
    if (!canAim && aimOn) setAimOn(false);
  }, [canAim, aimOn]);

  // --- Actions ---
  // Main inputs fill first, then fuel — so the same tap on the same card means
  // different things at different stages of the contract.
  const canTakeAsFuel = (entry: TradeEntry) =>
    !!fuelRarity &&
    entry.rarity === fuelRarity &&
    selectedIds.length === slotCount &&
    fuelIds.length < fuelQuote.count;

  const canSelect = (entry: TradeEntry) => {
    if (canTakeAsFuel(entry)) return true;
    if (selectedIds.length >= slotCount) return false;
    return !targetRarity || entry.rarity === targetRarity;
  };

  const handleSelect = (entry: TradeEntry) => {
    const currentlySelected = selectedCounts[entry.uid] || 0;
    if (currentlySelected >= entry.owned) return;

    if (canTakeAsFuel(entry)) {
      if (fuelIds.length + 1 === fuelQuote.count) hapticTick();
      else hapticSelect();
      setFuelIds((prev) => [...prev, entry.uid]);
      return;
    }

    if (selectedIds.length >= slotCount) return;
    if (targetRarity && entry.rarity !== targetRarity) return;
    if (selectedIds.length + 1 === slotCount) hapticTick();
    else hapticSelect();
    setSelectedIds((prev) => [...prev, entry.uid]);
  };

  const handleRemove = (index: number) => {
    hapticSelect();
    setSelectedIds((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveFuel = (index: number) => {
    hapticSelect();
    setFuelIds((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClear = () => {
    setSelectedIds([]);
    setFuelIds([]);
    setAimOn(false);
    setError(null);
  };

  const toPick = (uid: string) => {
    const [kind, ...rest] = uid.split(':');
    return {
      id: rest.join(':'),
      kind: kind === 'background' ? 'background' : 'item',
    };
  };

  const handleConfirmTrade = async () => {
    if (selectedIds.length !== slotCount) return;
    if (fuelIds.length !== fuelQuote.count) return;
    if (aimActive && !canAffordAim) {
      onGetFlies?.(aimQuote.price - balance);
      return;
    }
    setIsTrading(true);
    setError(null);
    try {
      const res = await fetch('/api/skins/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          picks: selectedIds.map(toPick),
          fuel: fuelIds.map(toPick),
          aim: aimActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Trade failed');

      setRewardQueue(
        Array.isArray(data.rewards) && data.rewards.length > 0
          ? data.rewards
          : [data.reward],
      );
      setWasGolden(!!data.golden);
      setRerollClaimId(data.rerollClaimId ?? null);
      setRerollError(null);
      setSelectedIds([]);
      setFuelIds([]);
      setAimOn(false);
      hapticCelebrate();
      if (onTradeSuccess) onTradeSuccess();

      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#FFD700', '#FFA500', '#FF4500'],
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsTrading(false);
    }
  };

  const handleClaimReward = () => {
    setRewardQueue((prev) => prev.slice(1));
    setRerollClaimId(null);
    setRerollError(null);
  };

  const handleReroll = async () => {
    if (rerollBusy || !rerollClaimId) return;
    setRerollBusy(true);
    setRerollError(null);
    try {
      if (!isPremium) {
        const adResult = await showRewardedAd('trade_reroll');
        if (adResult !== 'rewarded') {
          if (adResult === 'failed') {
            setRerollError('Ad not available right now — try again in a moment.');
          }
          return;
        }
      }
      const claimId = rerollClaimId;
      const res = await fetch('/api/skins/trade/reroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.granted || !data.reward) {
        setRerollError(data.error ?? 'Could not reroll — try again.');
        return;
      }
      setRerollClaimId(null);
      setRewardQueue([data.reward]);
      hapticCelebrate();
      if (onTradeSuccess) onTradeSuccess();
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#FFD700', '#FFA500', '#FF4500'],
      });
      if (!isPremium && takePlusOfferAfterAd()) {
        setTimeout(() => setShowPlusOffer(true), 1600);
      }
    } finally {
      setRerollBusy(false);
    }
  };


  const mainFilled = selectedIds.length === slotCount;
  const fuelFilled = fuelIds.length === fuelQuote.count;
  const isReady = mainFilled && fuelFilled;
  const nextRarity: Rarity | null = recipe?.to ?? null;
  const needsFlies = aimActive && !canAffordAim;

  let contractHint = 'Combine same-rarity items to upgrade.';
  if (isReady && nextRarity) {
    contractHint = needsFlies
      ? `You need ${(aimQuote.price - balance).toLocaleString()} more flies to aim this trade.`
      : aimActive
        ? `Ready! Aimed at your wishlisted ${nextRarity} items.`
        : `Ready! Combine into 1 ${nextRarity} reward.`;
  } else if (mainFilled && fuelRarity) {
    const left = fuelQuote.count - fuelIds.length;
    contractHint =
      fuelOwned - fuelIds.length >= left
        ? `Add ${left} more ${fuelRarity} ${left === 1 ? 'item' : 'items'} as fuel.`
        : `You need ${left} spare ${fuelRarity} ${left === 1 ? 'item' : 'items'} to fuel this trade.`;
  } else if (targetRarity) {
    const left = slotCount - selectedIds.length;
    contractHint = `Add ${left} more ${targetRarity} ${left === 1 ? 'item' : 'items'}.`;
  }

  const renderContract = (desktopMode: boolean) => {
    const expanded = desktopMode || isContractExpanded;
    const totalSlots = slotCount + fuelQuote.count;
    const totalPicked = selectedIds.length + fuelIds.length;

    const renderSlotGrid = (
      uids: string[],
      count: number,
      onRemove: (index: number) => void,
      keyPrefix: string,
    ) => (
      <div
        className="grid gap-1.5 lg:gap-2"
        style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: count }).map((_, i) => {
          const uid = uids[i];
          const entry = uid ? entryMap.get(uid) : null;
          const config = entry ? RARITY_CONFIG[entry.rarity] : null;

          return (
            <button
              key={`${keyPrefix}-${i}`}
              type="button"
              onClick={() => entry && onRemove(i)}
              className={cn(
                'h-12 lg:h-auto lg:aspect-square rounded-lg border-2 flex items-center justify-center relative overflow-hidden transition-colors duration-200',
                !entry && 'border-dashed border-border bg-muted/50',
                entry && config && cn(config.border, config.bg, 'shadow-sm'),
              )}
            >
              <AnimatePresence>
                {entry && (
                  <motion.div
                    key={`${uid}-${i}`}
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.4, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 480, damping: 26 }}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    {entry.kind === 'background' && entry.bg ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={backgroundPreview(entry.bg)}
                        alt={entry.bg.name}
                        className="absolute inset-0 object-cover w-full h-full"
                      />
                    ) : entry.item ? (
                      <FrogSnapshot
                        indices={{
                          skin: 0,
                          hat: 0,
                          body: 0,
                          hand_item: 0,
                          [entry.item.slot]: entry.item.riveIndex,
                        }}
                        width={44}
                        height={44}
                        visualOffsetY={3}
                        className="pointer-events-none"
                      />
                    ) : null}
                  </motion.div>
                )}
              </AnimatePresence>
              {!entry && (
                <span className="text-[10px] font-bold text-muted-foreground/40">
                  {i + 1}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );

    const headerInfo = (
      <div className="flex items-center gap-2 min-w-0">
        {!desktopMode && (
          <ChevronDown
            size={16}
            className={cn(
              'transition-transform duration-200 text-muted-foreground shrink-0',
              expanded ? '' : '-rotate-180',
            )}
          />
        )}
        <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-black uppercase text-foreground min-w-0">
          Contract
          {targetRarity && nextRarity && (
            <span className="flex items-center gap-1 min-w-0">
              <span
                className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold ${getRarityBg(targetRarity)}`}
              >
                {targetRarity}
              </span>
              <ArrowRight size={12} className="shrink-0 text-muted-foreground/60" />
              <span
                className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold ${getRarityBg(nextRarity)}`}
              >
                {nextRarity}
              </span>
            </span>
          )}
        </h3>
      </div>
    );

    const headerCount = (
      <motion.div
        key={totalPicked}
        initial={{ scale: 1.35 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 22 }}
        className={cn(
          'text-base font-black',
          isReady ? 'text-green-500' : 'text-primary',
        )}
      >
        {totalPicked}
        <span className="text-muted-foreground/40">/{totalSlots}</span>
      </motion.div>
    );

    return (
      <>
        {desktopMode ? (
          <div className="flex items-center justify-between w-full gap-3 px-4 py-3 border-b border-border bg-muted/30 shrink-0">
            {headerInfo}
            <div className="text-right shrink-0">{headerCount}</div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsContractExpanded((v) => !v)}
            aria-expanded={isContractExpanded}
            className="flex items-center justify-between w-full gap-3 px-4 py-2.5 text-left border-b border-border bg-muted/30 shrink-0"
          >
            {headerInfo}
            <div className="text-right shrink-0">{headerCount}</div>
          </button>
        )}

        <div className="w-full h-1 overflow-hidden bg-muted shrink-0">
          <motion.div
            initial={false}
            animate={{ scaleX: totalPicked / totalSlots }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className={cn(
              'h-full w-full origin-left',
              isReady ? 'bg-green-500' : 'bg-primary',
            )}
          />
        </div>

        <motion.div
          initial={false}
          animate={{ height: expanded ? 'auto' : 0, opacity: expanded ? 1 : 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 34 }}
          className="w-full overflow-hidden"
        >
          <div className="w-full max-w-md mx-auto p-2.5 lg:p-4">
            <div className="mb-2 lg:mb-4">
              {renderSlotGrid(selectedIds, slotCount, handleRemove, 'main')}
            </div>

            {fuelRarity && (
              <div className="mb-2 lg:mb-4">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Fuel · {fuelRarity}
                  </span>
                  {fuelQuote.waived > 0 && (
                    <span className="flex flex-wrap items-center justify-end gap-1">
                      {fuelQuote.allSparesWaived > 0 && (
                        <WaiverChip>All spares −{fuelQuote.allSparesWaived}</WaiverChip>
                      )}
                      {fuelQuote.plusWaived > 0 && (
                        <WaiverChip>Plus −{fuelQuote.plusWaived}</WaiverChip>
                      )}
                    </span>
                  )}
                </div>
                {renderSlotGrid(
                  fuelIds,
                  fuelQuote.count,
                  handleRemoveFuel,
                  'fuel',
                )}
              </div>
            )}

            {recipe && wishlistHits > 0 && (
              <div className="mb-2 overflow-hidden rounded-lg bg-muted/60">
                <button
                  type="button"
                  onClick={() => {
                    hapticSelect();
                    setAimOn((v) => !v);
                  }}
                  className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors',
                      aimActive
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border',
                    )}
                  >
                    {aimActive && <Check className="h-3 w-3" strokeWidth={4} />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-foreground">
                      <Crosshair className="h-3 w-3 shrink-0" strokeWidth={3} />
                      Aim
                    </span>
                    <span className="text-[10px] font-bold text-muted-foreground">
                      Guarantee one of your {wishlistHits} wishlisted{' '}
                      {nextRarity}
                      {wishlistHits === 1 ? ' item' : ' items'}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {aimQuote.discountPercent > 0 && (
                      <span className="text-[11px] font-bold tabular-nums text-muted-foreground line-through opacity-60">
                        {aimQuote.basePrice.toLocaleString()}
                      </span>
                    )}
                    <Fly size={22} paused y={-5} />
                    <span
                      className={cn(
                        'text-sm font-black tabular-nums',
                        !aimActive || canAffordAim
                          ? 'text-foreground'
                          : 'text-amber-600 dark:text-amber-400',
                      )}
                    >
                      {aimQuote.price.toLocaleString()}
                    </span>
                  </span>
                </button>
                {!aimActive && (
                  <p className="flex items-center gap-1 px-2.5 pb-2 text-[10px] font-bold text-muted-foreground">
                    <Bookmark className="h-3 w-3 shrink-0" strokeWidth={3} />
                    Free trades already have a{' '}
                    {modifiers.wishlistRedirectPercent}% chance of landing one.
                  </p>
                )}
              </div>
            )}

            {error && (
              <div className="flex items-center justify-center gap-2 mb-2 text-xs font-bold text-destructive">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <div className="flex gap-2">
              {selectedIds.length > 0 && (
                <Button
                  variant="outline"
                  onClick={handleClear}
                  className="h-10 px-3 lg:h-12 shrink-0 border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  Clear
                </Button>
              )}
              <Button
                disabled={!isReady || isTrading}
                onClick={handleConfirmTrade}
                className={cn(
                  'group relative flex-1 h-10 lg:h-14 font-black uppercase tracking-wider transition-all overflow-hidden text-sm',
                  isReady && !needsFlies
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/40'
                    : isReady
                      ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                {isReady && !needsFlies && !isTrading && (
                  <>
                    <span className="absolute inset-0 pointer-events-none animate-pulse bg-primary-foreground/10" />
                    <span className="absolute top-0 left-0 z-10 block w-1/2 h-full pointer-events-none bg-gradient-to-r from-transparent via-white to-transparent opacity-25 animate-shine" />
                  </>
                )}
                {isTrading ? (
                  <Sparkles className="w-5 h-5 mr-2 animate-spin" />
                ) : isReady && needsFlies ? (
                  <span className="inline-flex items-center gap-1.5">
                    Get
                    <Fly size={26} paused y={-4} />
                    <span className="tabular-nums">
                      {(aimQuote.price - balance).toLocaleString()}
                    </span>
                    flies
                  </span>
                ) : (
                  <>
                    Trade Up <ArrowUp size={18} className="ml-2" />
                  </>
                )}
              </Button>
            </div>
            <p className="text-[10px] text-center text-muted-foreground mt-1.5">
              {contractHint}
            </p>
          </div>
        </motion.div>
      </>
    );
  };

  // --- Render ---
  return (
    <div
      className={cn(
        'relative flex flex-col w-full bg-background',
        pageScroll ? '' : 'h-full overflow-y-auto lg:overflow-hidden',
      )}
    >
      {/* --- RESULT OVERLAY --- */}
      {mounted && tradeResult && 
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden pointer-events-auto">
            {/* Background Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm"
            />

            {/* Dynamic God Rays for Reveal */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-0 flex items-center justify-center"
            >
              <RotatingRays colorClass={GIFT_RARITY_CONFIG[tradeResult.rarity].rays} />
              <div
                className={cn(
                  'absolute inset-0 bg-radial-gradient from-transparent to-slate-950/80'
                )}
              />
            </motion.div>

            {/* Main Content */}
            <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-md p-6">
              {wasGolden && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                  className="mb-3 flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 px-3.5 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-amber-950 shadow-lg shadow-amber-500/30"
                >
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={3} />
                  Golden trade — two items
                  {rewardQueue.length > 1 && <span>· 1 of 2</span>}
                </motion.div>
              )}
              <RewardCard
                key={`card-${tradeResult.id}-${rerollClaimId ?? 'rerolled'}`}
                prize={tradeResult}
                claiming={false}
                onClaim={handleClaimReward}
                paused={paused}
              />
              {rerollClaimId && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.9 }}
                  className="mt-4 flex w-full max-w-[280px] flex-col items-center gap-1.5"
                >
                  <GoldenRewardButton
                    onClick={() => {
                      if (isPremium || rewardedAdsAvailable()) {
                        void handleReroll();
                      } else {
                        setShowPlusOffer(true);
                      }
                    }}
                    disabled={rerollBusy}
                    className="py-4 text-lg"
                  >
                    {isPremium ? (
                      <>
                        <Dices className="h-4 w-4" />
                        {rerollBusy ? 'Rerolling...' : 'Reroll Reward'}
                      </>
                    ) : rerollBusy ? (
                      'Loading ad...'
                    ) : (
                      <>
                        <Dices className="h-5 w-5" strokeWidth={2.75} />
                        <span className="flex flex-col items-start leading-tight">
                          <span>Reroll Reward</span>
                          <span className="text-[10px] font-bold normal-case tracking-normal text-white/80">
                            {rewardedAdsAvailable()
                              ? 'watch a short ad'
                              : 'with Plus'}
                          </span>
                        </span>
                        {rewardedAdsAvailable() && (
                          <Play className="w-4 h-4 fill-current" />
                        )}
                      </>
                    )}
                  </GoldenRewardButton>
                  {rerollError && (
                    <p className="text-center text-xs font-bold text-red-300">
                      {rerollError}
                    </p>
                  )}
                </motion.div>
              )}
            </div>
          </div>,
          document.body
        )
      }

      <PlusUpgradeModal
        open={showPlusOffer}
        placement="trade_reroll"
        onClose={() => setShowPlusOffer(false)}
      />

      {/* --- INVENTORY + CONTRACT SIDEBAR (lg+) --- */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-4 lg:items-start">
      <div
        ref={inventoryScrollRef}
        onScroll={(event) => {
          setInventoryHasScrolled(true);
          if (
            availableGrid.hasMore &&
            isNearScrollEnd(event.currentTarget)
          ) {
            availableGrid.loadMore();
          }
        }}
        onWheel={(event) => {
          setInventoryHasScrolled(true);
          if (
            availableGrid.hasMore &&
            shouldLoadMoreFromWheel(event.currentTarget, event.deltaY)
          ) {
            availableGrid.loadMore();
          }
        }}
        className={cn(
          'flex-1 flex flex-col bg-background lg:bg-muted/40 lg:rounded-[20px] lg:border lg:border-border/40',
          pageScroll
            ? 'pb-[150px] lg:pb-4'
            : 'lg:min-h-0 lg:overflow-y-auto lg:overscroll-none',
        )}
      >

        <div
          className={cn(
            pageScroll
              ? '-mx-4 rounded-none border border-x-0 border-border/40 bg-muted/40 p-3 pb-52 md:mx-0 md:rounded-[20px] md:border-x md:px-4 md:pt-4 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-4'
              : 'px-4 pb-52 lg:p-4',
          )}
        >
          {availableItems.length === 0 ? (
            // Two different causes, two different answers: a filter is hiding
            // the spares, or there are no spares to begin with. Saying
            // "empty (or filtered out)" made the player guess which.
            <WardrobeEmptyState
              icon={<Repeat className="h-8 w-8" strokeWidth={2.25} />}
              title={hasAnySpares ? 'Nothing in this filter' : 'No spares yet'}
              description={
                hasAnySpares
                  ? undefined
                  : `Collect ${TRADE_MIN_ITEM_COUNT} of one rarity to trade up.`
              }
              action={
                hasAnySpares || !onGoToShop
                  ? undefined
                  : {
                      label: 'Browse the shop',
                      icon: <ShoppingBag className="h-4 w-4" />,
                      onClick: onGoToShop,
                    }
              }
            />
          ) : (
            <>
              {(() => {
                const renderTradeEntry = (
                  entry: (typeof availableGrid.visibleItems)[number],
                  index: number,
                ) => {
                  const selected = selectedCounts[entry.uid] || 0;
                  const remaining = entry.owned - selected;
                  const isDimmed = remaining === 0 || !canSelect(entry);

                  return (
                    <div
                      key={entry.uid}
                      className={cn(
                        'transition-[opacity,filter] duration-300',
                        isDimmed && 'opacity-40 grayscale pointer-events-none',
                      )}
                    >
                      {entry.kind === 'item' && entry.item ? (
                        <ItemCard
                          item={entry.item}
                          mode="trade"
                          ownedCount={entry.owned}
                          isEquipped={false}
                          canAfford={true}
                          actionLoading={false}
                          selectedCount={selected}
                          onAction={() => handleSelect(entry)}
                          actionLabel={null}
                          isNew={unseenItems.includes(entry.id)}
                          deferPreview
                          centerFrogPreview
                          compact
                          pausePreview={true}
                          previewDelayMs={index * 20}
                        />
                      ) : entry.bg ? (
                        <BackgroundCard
                          item={entry.bg}
                          owned
                          ownedCount={entry.owned}
                          isEquipped={false}
                          canAfford
                          mode="trade"
                          compact
                          actionLoading={false}
                          selectedCount={selected}
                          onAction={() => handleSelect(entry)}
                        />
                      ) : null}
                    </div>
                  );
                };

                if (sortBy !== 'rarity_asc' && sortBy !== 'rarity_desc') {
                  return (
                    <div className={cn(cardGridClass, 'pb-4')}>
                      {availableGrid.visibleItems.map((entry, index) =>
                        renderTradeEntry(entry, index),
                      )}
                    </div>
                  );
                }

                const groups: {
                  rarity: Rarity;
                  entries: typeof availableGrid.visibleItems;
                }[] = [];
                for (const entry of availableGrid.visibleItems) {
                  const last = groups[groups.length - 1];
                  if (last && last.rarity === entry.rarity)
                    last.entries.push(entry);
                  else groups.push({ rarity: entry.rarity, entries: [entry] });
                }
                let entryIndex = 0;
                return groups.map((group) => (
                  <div key={group.rarity} className="pb-2 last:pb-4">
                    <p
                      className={cn(
                        'mb-2 px-1 text-[10px] font-black uppercase tracking-[0.18em]',
                        RARITY_CONFIG[group.rarity].text,
                      )}
                    >
                      {RARITY_CONFIG[group.rarity].label}
                    </p>
                    <div className={cardGridClass}>
                      {group.entries.map((entry) =>
                        renderTradeEntry(entry, entryIndex++),
                      )}
                    </div>
                  </div>
                ));
              })()}
              {availableGrid.hasMore && (
                <div
                  ref={availableGrid.sentinelRef}
                  className="h-8"
                  aria-hidden="true"
                />
              )}
              {availableGrid.hasMore && <ScrollMoreCue />}
            </>
          )}
        </div>
      </div>

        <aside className="hidden lg:flex lg:flex-col lg:sticky lg:top-36 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-lg">
          {renderContract(true)}
        </aside>
      </div>

      {/* --- CONTRACT DOCK (mobile/tablet) --- */}
      <div className="lg:hidden fixed bottom-[calc(76px+env(safe-area-inset-bottom))] md:bottom-0 left-0 w-full z-[60] bg-card border-t border-border shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.1)] flex flex-col">
        {renderContract(false)}
      </div>
    </div>
  );
}

function WaiverChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-green-700 dark:text-green-400">
      {children}
    </span>
  );
}

function ScrollMoreCue() {
  return (
    <div className="pointer-events-none sticky bottom-3 z-30 flex justify-center">
      <div className="flex items-center gap-1.5 rounded-full border border-border/50 bg-background/85 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground shadow-sm backdrop-blur">
        <ChevronDown className="h-3.5 w-3.5 animate-bounce text-primary" />
        <span>Scroll for more</span>
      </div>
    </div>
  );
}

// --- Helpers ---
function getRarityColor(rarity: Rarity) {
  switch (rarity) {
    case 'common':
      return 'text-muted-foreground';
    case 'uncommon':
      return 'text-emerald-500';
    case 'rare':
      return 'text-sky-500';
    case 'epic':
      return 'text-violet-500';
    case 'legendary':
      return 'text-amber-500';
    default:
      return 'text-muted-foreground';
  }
}

function getRarityBg(rarity: Rarity) {
  switch (rarity) {
    case 'common':
      return 'bg-muted text-muted-foreground';
    case 'uncommon':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
    case 'rare':
      return 'bg-sky-500/10 text-sky-600 dark:text-sky-400';
    case 'epic':
      return 'bg-violet-500/10 text-violet-600 dark:text-violet-400';
    case 'legendary':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
    default:
      return 'bg-muted';
  }
}
