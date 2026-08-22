'use client';

import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
  useDeferredValue,
} from 'react';
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
  SquarePlay,
  Repeat,
  ShoppingBag,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { hapticTick, hapticSelect, hapticCelebrate } from '@/lib/haptics';
import {
  rewardedAdsAvailable,
  showRewardedAd,
  takePlusOfferAfterAd,
} from '@/lib/ads';
import { PlusUpgradeModal } from '@/components/ui/PlusUpgradeModal';
import { BaseSheet } from '@/components/ui/BaseSheet';
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
import { isAvailableAt } from '@/lib/skins/availability';
import Fly from '@/components/ui/fly';
import { Button } from '@/components/ui/button';
import confetti from 'canvas-confetti';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { Icon as AppIcon } from '@/components/ui/Icon';
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


const FLIGHT_MS = 300;

type TradeEntry = {
  uid: string;
  id: string;
  kind: 'item' | 'background';
  rarity: Rarity;
  owned: number;
  item?: ItemDef;
  bg?: BackgroundItem;
};

type Flight = {
  id: number;
  slotKey: string;
  rarity: Rarity;
  /** Pixels lifted off the card that was tapped, so the ghost needs no render. */
  image: string | null;
  cover: boolean;
  from: DOMRect;
  to: DOMRect;
};

type RewardPreview = {
  key: string;
  name: string;
  owned: boolean;
  wishlisted: boolean;
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
  onUpgrade?: () => void;
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
  onUpgrade,
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
  const isLarge = useMediaQuery('(min-width: 1024px)');
  const cardGridClass = cn(
    'grid md:grid-cols-4 md:gap-4',
    threeCol ? 'grid-cols-3 gap-2' : 'grid-cols-2 gap-3',
  );
  // The mobile dock rests as a peek bar so the grid keeps the screen; expanding
  // raises the full contract stage. Desktop (lg+) is always expanded.
  const [isContractExpanded, setIsContractExpanded] = useState(false);
  const [poolOpen, setPoolOpen] = useState(false);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const gridTopRef = useRef<HTMLDivElement | null>(null);
  const groupRefs = useRef(new Map<Rarity, HTMLElement>());
  const slotRefs = useRef(new Map<string, HTMLElement>());
  const dockAnchorRef = useRef<HTMLDivElement | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const [dockHeight, setDockHeight] = useState(0);
  const [flights, setFlights] = useState<Flight[]>([]);
  const flightSeq = useRef(0);

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

  const recipe = targetRarity ? recipeFor(modifiers, targetRarity) : null;
  const slotCount = recipe?.itemCount ?? TRADE_MIN_ITEM_COUNT;
  const nextRarity: Rarity | null = recipe?.to ?? null;

  // Picking a rarity locks the contract to it, so the grid narrows to what can
  // still go in rather than leaving the player to scroll past greyed-out cards.
  const scopeRarities = useMemo(() => {
    if (!targetRarity) return null;
    const set = new Set<Rarity>([targetRarity]);
    if (recipe?.fuelRarity) set.add(recipe.fuelRarity);
    return set;
  }, [targetRarity, recipe?.fuelRarity]);

  // Narrowing the grid tears down every off-rarity card (and its canvas) in one
  // go. Deferred, so the first pick's slot fill and flight render immediately
  // and the regrid lands a frame later instead of stalling the animation.
  const gridScope = useDeferredValue(scopeRarities);

  useEffect(() => {
    setInventoryHasScrolled(false);
  }, [activeFilter, sortBy, targetRarity]);

  useEffect(() => {
    if (selectedIds.length === 0) {
      setIsContractExpanded(false);
      setPoolOpen(false);
    }
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

    const result = Array.from(entryMap.values()).filter(
      (entry) =>
        matchesFilter(entry) && (!gridScope || gridScope.has(entry.rarity)),
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
  }, [entryMap, gridScope, activeFilter, sortBy]);

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

  // The pool the reward is drawn from, mirrored off `pickTradeReward` so the
  // preview can't promise something the server would never hand back.
  const rewardPool = useMemo<RewardPreview[]>(() => {
    if (!nextRarity) return [];
    const wishKeys = new Set(
      wishlistItems.map((entry) => `${entry.kind}:${entry.itemId}`),
    );
    const out: RewardPreview[] = [];

    catalog.forEach((item) => {
      if (item.rarity !== nextRarity) return;
      if (item.slot === 'container') return;
      if (!isAvailableAt(item)) return;
      out.push({
        key: `item:${item.id}`,
        name: item.name,
        item,
        owned: (inventory[item.id] ?? 0) > 0,
        wishlisted: wishKeys.has(`item:${item.id}`),
      });
    });

    backgrounds.forEach((background) => {
      if (background.rarity !== nextRarity) return;
      if (background.hidden) return;
      out.push({
        key: `background:${background.id}`,
        name: background.name,
        bg: background,
        owned: (backgroundInventory[background.id] ?? 0) > 0,
        wishlisted: wishKeys.has(`background:${background.id}`),
      });
    });

    return out.sort((a, b) => {
      if (a.wishlisted !== b.wishlisted) return a.wishlisted ? -1 : 1;
      if (a.owned !== b.owned) return a.owned ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
  }, [
    nextRarity,
    catalog,
    backgrounds,
    inventory,
    backgroundInventory,
    wishlistItems,
  ]);

  const newInPool = rewardPool.filter((prize) => !prize.owned).length;

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

  // The tapped card visibly travels into its slot — without it, items teleport
  // and the tap reads as "did that register?". While the stage is collapsed the
  // slots still occupy layout below the fold, so the peek bar's orb stands in
  // for them; aiming at the hidden slot threw the ghost off-screen.
  const launchFlight = (entry: TradeEntry, slotKey: string) => {
    const source = cardRefs.current.get(entry.uid);
    if (!source) return;
    const stageOpen = isLarge || isContractExpanded;
    const to =
      (stageOpen ? slotRefs.current.get(slotKey)?.getBoundingClientRect() : null) ??
      dockAnchorRef.current?.getBoundingClientRect();
    if (!to || to.width === 0) return;

    const id = (flightSeq.current += 1);
    setFlights((prev) => [
      ...prev,
      {
        id,
        slotKey,
        rarity: entry.rarity,
        image: captureCardPixels(source),
        cover: entry.kind === 'background',
        from: source.getBoundingClientRect(),
        to,
      },
    ]);
    window.setTimeout(
      () => setFlights((prev) => prev.filter((flight) => flight.id !== id)),
      FLIGHT_MS + 40,
    );
  };

  const handleSelect = (entry: TradeEntry) => {
    const currentlySelected = selectedCounts[entry.uid] || 0;
    if (currentlySelected >= entry.owned) return;

    if (canTakeAsFuel(entry)) {
      if (fuelIds.length + 1 === fuelQuote.count) hapticTick();
      else hapticSelect();
      launchFlight(entry, `fuel-${fuelIds.length}`);
      setFuelIds((prev) => [...prev, entry.uid]);
      return;
    }

    if (selectedIds.length >= slotCount) return;
    if (targetRarity && entry.rarity !== targetRarity) return;
    if (selectedIds.length + 1 === slotCount) hapticTick();
    else hapticSelect();
    launchFlight(entry, `main-${selectedIds.length}`);
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
    hapticSelect();
    setSelectedIds([]);
    setFuelIds([]);
    setAimOn(false);
    setError(null);
  };

  // One tap from "a pile of spares" to "a signed contract". Deep stacks are
  // spent first so a one-of-a-kind item is only ever burned as a last resort.
  const quickFillPlan = useMemo(() => {
    const remaining = new Map<string, number>();
    entryMap.forEach((entry) => remaining.set(entry.uid, entry.owned));
    [...selectedIds, ...fuelIds].forEach((uid) =>
      remaining.set(uid, (remaining.get(uid) ?? 0) - 1),
    );

    const take = (rarity: Rarity, need: number) => {
      if (need <= 0) return [];
      const pool = Array.from(entryMap.values())
        .filter(
          (entry) =>
            entry.rarity === rarity && (remaining.get(entry.uid) ?? 0) > 0,
        )
        .sort(
          (a, b) =>
            (remaining.get(b.uid) ?? 0) - (remaining.get(a.uid) ?? 0),
        );
      const picked: string[] = [];
      for (const entry of pool) {
        while (
          picked.length < need &&
          (remaining.get(entry.uid) ?? 0) > 0
        ) {
          picked.push(entry.uid);
          remaining.set(entry.uid, (remaining.get(entry.uid) ?? 0) - 1);
        }
        if (picked.length >= need) break;
      }
      return picked;
    };

    const startRarity =
      targetRarity ??
      (() => {
        const copies = new Map<Rarity, number>();
        entryMap.forEach((entry) =>
          copies.set(entry.rarity, (copies.get(entry.rarity) ?? 0) + entry.owned),
        );
        const ladder = [...modifiers.recipes].sort(
          (a, b) => rarityRank[a.from] - rarityRank[b.from],
        );
        const completable = ladder.find(
          (candidate) => (copies.get(candidate.from) ?? 0) >= candidate.itemCount,
        );
        if (completable) return completable.from;
        let best: Rarity | null = null;
        copies.forEach((count, rarity) => {
          if (count > 0 && (!best || count > (copies.get(best) ?? 0))) best = rarity;
        });
        return best;
      })();

    if (!startRarity) return null;
    const plannedRecipe = recipeFor(modifiers, startRarity);
    if (!plannedRecipe) return null;

    const keptMain = targetRarity === startRarity ? selectedIds : [];
    const mainAdds = take(startRarity, plannedRecipe.itemCount - keptMain.length);
    const nextSelected = [...keptMain, ...mainAdds];
    if (mainAdds.length === 0 && nextSelected.length < plannedRecipe.itemCount) {
      return null;
    }

    const complete = nextSelected.length === plannedRecipe.itemCount;
    const spares =
      complete &&
      Array.from(new Set(nextSelected)).every(
        (uid) => (entryMap.get(uid)?.owned ?? 0) >= 2,
      );
    const plannedFuel = quoteTradeFuel({
      modifiers,
      recipe: plannedRecipe,
      allSpares: spares,
      isPlus: isPremium,
    });
    const keptFuel = targetRarity === startRarity ? fuelIds : [];
    const fuelAdds =
      complete && plannedRecipe.fuelRarity
        ? take(plannedRecipe.fuelRarity, plannedFuel.count - keptFuel.length)
        : [];

    const nextFuel = [...keptFuel, ...fuelAdds];
    const adds = mainAdds.length + fuelAdds.length;
    if (adds === 0) return null;

    return {
      selected: nextSelected,
      fuel: nextFuel,
      adds,
      completes: complete && nextFuel.length === plannedFuel.count,
    };
  }, [entryMap, selectedIds, fuelIds, targetRarity, modifiers, isPremium]);

  const handleQuickFill = () => {
    if (!quickFillPlan) return;
    hapticTick();
    setSelectedIds(quickFillPlan.selected);
    setFuelIds(quickFillPlan.fuel);
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

  const handleReroll = async (viaPlus = false) => {
    if (rerollBusy || !rerollClaimId) return;
    setRerollBusy(true);
    setRerollError(null);
    try {
      if (!isPremium && !viaPlus) {
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
  const needsFlies = aimActive && !canAffordAim;

  const totalSlots = slotCount + fuelQuote.count;
  const totalPicked = selectedIds.length + fuelIds.length;
  const progress = totalSlots > 0 ? totalPicked / totalSlots : 0;
  const mainLeft = slotCount - selectedIds.length;
  const fuelLeft = fuelQuote.count - fuelIds.length;
  const fuelStage = mainFilled && !!fuelRarity && !fuelFilled;

  const primaryCta = (() => {
    if (isTrading)
      return {
        tone: 'trade' as const,
        disabled: true,
        onClick: undefined,
        label: (
          <span className="inline-flex items-center gap-2">
            <Sparkles className="w-5 h-5 animate-spin" />
            Trading
          </span>
        ),
      };
    if (isReady && needsFlies)
      return {
        tone: 'flies' as const,
        disabled: false,
        onClick: handleConfirmTrade,
        label: (
          <span className="relative inline-flex items-center justify-center">
            Get&nbsp;
            <span className="tabular-nums">
              {(aimQuote.price - balance).toLocaleString()}
            </span>
            &nbsp;flies
            <Fly
              size={36}
              paused
              x={2}
              y={-5}
              className="absolute inset-y-0 left-full my-auto"
            />
          </span>
        ),
      };
    if (isReady)
      return {
        tone: 'trade' as const,
        disabled: false,
        onClick: handleConfirmTrade,
        label: (
          <span className="inline-flex items-center gap-2">
            Trade up
            <ArrowUp size={18} strokeWidth={3} />
          </span>
        ),
      };
    if (quickFillPlan)
      return {
        tone: 'fill' as const,
        disabled: false,
        onClick: handleQuickFill,
        label: (
          <span className="inline-flex items-center gap-2">
            <Zap className="w-4 h-4" strokeWidth={3} />
            Quick fill
            <span className="tabular-nums opacity-70">
              +{quickFillPlan.adds}
            </span>
          </span>
        ),
      };
    return {
      tone: 'idle' as const,
      disabled: true,
      onClick: undefined,
      label: !hasAnySpares
        ? 'Nothing to trade yet'
        : fuelStage
          ? `Need ${countOf(fuelLeft, fuelRarity)} more`
          : targetRarity
            ? `Need ${countOf(mainLeft, targetRarity)} more`
            : 'Pick an item to start',
    };
  })();

  // What Plus would change about *this* contract, quoted from the same helpers
  // the trade itself uses — so the pitch can never promise a perk the recipe
  // doesn't actually grant.
  const plusPerk = useMemo(() => {
    if (isPremium || !recipe || !onUpgrade) return null;
    const withPlus = quoteTradeFuel({
      modifiers,
      recipe,
      allSpares,
      isPlus: true,
    });
    const saved = fuelQuote.count - withPlus.count;
    if (saved > 0 && recipe.fuelRarity) {
      return `Plus skips ${countOf(saved, recipe.fuelRarity)} here`;
    }
    const plusAim = quoteAimPrice({ modifiers, recipe, isPlus: true });
    if (canAim && plusAim.price < aimQuote.price) {
      return `Plus takes ${modifiers.aimPlusDiscountPercent}% off Aim`;
    }
    if (modifiers.wishlistSlotsPlus > modifiers.wishlistSlotsFree) {
      return `Plus aims at ${modifiers.wishlistSlotsPlus} wishlist picks, not ${modifiers.wishlistSlotsFree}`;
    }
    return null;
  }, [
    isPremium,
    recipe,
    onUpgrade,
    modifiers,
    allSpares,
    fuelQuote.count,
    canAim,
    aimQuote.price,
  ]);

  const aimTarget = !nextRarity
    ? ''
    : wishlistHits === 1
      ? `your wishlisted ${nextRarity}`
      : `1 of your ${wishlistHits} wishlisted ${nextRarity}s`;

  const contractHint =
    isReady && aimActive && nextRarity
      ? `The reward is locked to your wishlist.`
      : fuelStage && fuelOwned - fuelIds.length < fuelLeft
        ? `You're out of spare ${fuelRarity} items for this contract.`
        : !targetRarity && hasAnySpares
          ? `Combine ${slotCount} items of one rarity into the tier above.`
          : null;

  // Narrowing to one rarity shortens the list under the player's feet, so the
  // old offset can leave them parked past the end of it. Both times the grid
  // changes what it's asking for, it takes them to the top of that section.
  const scrollGridTo = (el: HTMLElement | null) => {
    if (!el) return;
    const root =
      scrollableAncestor(el) ?? document.getElementById('main-scroll');
    if (!root) return;
    const sticky = document.querySelector<HTMLElement>('[data-wardrobe-sticky]');
    const offset = (sticky?.getBoundingClientRect().height ?? 0) + 12;
    const top =
      root.scrollTop +
      el.getBoundingClientRect().top -
      root.getBoundingClientRect().top -
      offset;
    root.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  };

  // Always the tier the contract is asking for right now — never the top of
  // the grid, which sorts the lower-rarity extras *above* the target tier and
  // so would jump straight past the items still being collected.
  const scrollToRarity = (rarity: Rarity | null) => {
    if (!rarity) return;
    requestAnimationFrame(() =>
      scrollGridTo(groupRefs.current.get(rarity) ?? gridTopRef.current),
    );
  };

  const prevScopeKey = useRef('');
  useEffect(() => {
    const key = gridScope ? Array.from(gridScope).join(',') : '';
    if (key && key !== prevScopeKey.current && !mainFilled) {
      scrollToRarity(targetRarity);
    }
    prevScopeKey.current = key;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridScope]);

  // Only once the main slots are done does the extras tier become the thing to
  // find, so the jump waits for that edge rather than firing on the first pick.
  const needsExtras = mainFilled && !!fuelRarity && !fuelFilled;
  const prevNeedsExtras = useRef(false);
  useEffect(() => {
    if (needsExtras && !prevNeedsExtras.current) scrollToRarity(fuelRarity);
    prevNeedsExtras.current = needsExtras;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsExtras, fuelRarity]);

  // Scrolling means the player has gone back to browsing, and the open stage
  // leaves them reading the grid through a slit. Collapsing to the peek bar
  // hands the screen back — the bar still carries progress, count and the CTA,
  // and picks keep landing in it.
  useEffect(() => {
    if (isLarge || !isContractExpanded) return;
    const root =
      (gridTopRef.current && scrollableAncestor(gridTopRef.current)) ??
      document.getElementById('main-scroll');
    if (!root) return;

    // `scroll` was the wrong signal: opening the stage repads the grid, and at
    // the bottom of the list the browser re-clamps scrollTop and fires one —
    // closing the sheet on the very tap that opened it. Wheel and touch are
    // real gestures that no reflow can produce.
    const collapse = () => setIsContractExpanded(false);
    let touchY = 0;
    const onTouchStart = (event: TouchEvent) => {
      touchY = event.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY ?? 0;
      if (Math.abs(y - touchY) > 24) collapse();
    };

    root.addEventListener('wheel', collapse, { passive: true });
    root.addEventListener('touchstart', onTouchStart, { passive: true });
    root.addEventListener('touchmove', onTouchMove, { passive: true });
    return () => {
      root.removeEventListener('wheel', collapse);
      root.removeEventListener('touchstart', onTouchStart);
      root.removeEventListener('touchmove', onTouchMove);
    };
  }, [isLarge, isContractExpanded]);

  // The dock grows a lot when the stage opens, so a fixed bottom padding left
  // the last rows permanently trapped beneath it. The grid reserves exactly as
  // much room as the dock currently occupies.
  useEffect(() => {
    const node = dockRef.current;
    if (!node || isLarge) {
      setDockHeight(0);
      return;
    }
    const observer = new ResizeObserver(([entry]) =>
      setDockHeight(entry.contentRect.height),
    );
    observer.observe(node);
    setDockHeight(node.getBoundingClientRect().height);
    return () => observer.disconnect();
  }, [isLarge, mounted, isContractExpanded]);

  const inFlightSlots = new Set(flights.map((flight) => flight.slotKey));

  const renderContract = (desktopMode: boolean) => {
    const expanded = desktopMode || isContractExpanded;
    const liveRefs = desktopMode === isLarge;

    const bindSlot = (key: string) => (el: HTMLButtonElement | null) => {
      if (!liveRefs) return;
      if (el) slotRefs.current.set(key, el);
      else slotRefs.current.delete(key);
    };

    // Fuel shares the main row's column width — sizing each row by its own
    // slot count made two fuel slots twice the size of four contract slots.
    const renderSlotGrid = (
      uids: string[],
      count: number,
      onRemove: (index: number) => void,
      keyPrefix: string,
      // What still has to go in here. An empty slot that only shows its index
      // makes the player read the sentence above to learn what it wants.
      expects?: Rarity | null,
    ) => (
      <div
        className="grid gap-1.5 lg:gap-2"
        style={{
          gridTemplateColumns: `repeat(${Math.max(slotCount, count)}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: count }).map((_, i) => {
          const uid = uids[i];
          const entry = uid ? entryMap.get(uid) : null;
          const config = entry ? RARITY_CONFIG[entry.rarity] : null;
          const slotKey = `${keyPrefix}-${i}`;
          const arriving = inFlightSlots.has(slotKey);
          const name =
            entry?.item?.name ?? entry?.bg?.name ?? `slot ${i + 1}`;
          const expectConfig = expects ? RARITY_CONFIG[expects] : null;

          return (
            <button
              key={`${keyPrefix}-${i}`}
              ref={bindSlot(`${keyPrefix}-${i}`)}
              type="button"
              disabled={!entry}
              onClick={() => entry && onRemove(i)}
              aria-label={
                entry
                  ? `Remove ${name}`
                  : expects
                    ? `Empty slot ${i + 1}, needs a ${expects} item`
                    : `Empty slot ${i + 1}`
              }
              className={cn(
                'aspect-square rounded-xl border-2 flex items-center justify-center relative overflow-hidden transition-colors duration-200',
                !entry && 'border-dashed',
                !entry &&
                  (expectConfig
                    ? cn(expectConfig.border, expectConfig.bg, 'opacity-60')
                    : 'border-border bg-muted/40'),
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
                    transition={{
                      type: 'spring',
                      stiffness: 480,
                      damping: 26,
                      delay: arriving ? FLIGHT_MS / 1000 - 0.06 : 0,
                    }}
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
                        width="100%"
                        height="100%"
                        visualOffsetY={0}
                        className="pointer-events-none translate-y-[6%]"
                      />
                    ) : null}
                    <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-background/80 text-muted-foreground shadow-sm">
                      <X className="h-2.5 w-2.5" strokeWidth={3.5} />
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
              {!entry &&
                (expects ? (
                  <span
                    className={cn(
                      'rounded px-1 py-0.5 text-[11px] font-black tracking-wide',
                      RARITY_CONFIG[expects].text,
                    )}
                  >
                    {expects}
                  </span>
                ) : (
                  <span className="text-[11px] font-black text-muted-foreground/40">
                    {i + 1}
                  </span>
                ))}
            </button>
          );
        })}
      </div>
    );

    const ladder = targetRarity && nextRarity && (
      <span className="flex items-center gap-1 min-w-0">
        <span
          className={`text-[12px] px-2 py-0.5 rounded font-bold ${getRarityBg(targetRarity)}`}
        >
          {countOf(slotCount, targetRarity)}
        </span>
        {/* Fuel is part of the price, so the ladder says so — reading
            "epic → legendary" and then being asked for rares is a surprise. */}
        {fuelRarity && (
          <>
            <span className="shrink-0 text-[10px] font-black text-muted-foreground/60">
              +
            </span>
            <span
              className={`text-[12px] px-2 py-0.5 rounded font-bold ${getRarityBg(fuelRarity)}`}
            >
              {countOf(fuelQuote.count, fuelRarity)}
            </span>
          </>
        )}
        <ArrowRight size={12} className="shrink-0 text-muted-foreground/60" />
        <span
          className={`text-[12px] px-2 py-0.5 rounded font-bold ${getRarityBg(nextRarity)}`}
        >
          {nextRarity}
        </span>
      </span>
    );

    const primaryButton = (
      <Button
        disabled={primaryCta.disabled}
        onClick={primaryCta.onClick}
        className={cn(
          'relative w-full h-12 lg:h-14 font-black transition-all overflow-hidden text-sm rounded-xl',
          primaryCta.tone === 'trade' &&
            !primaryCta.disabled &&
            'bg-primary text-primary-foreground shadow-[0_4px_0_0_hsl(var(--primary)/0.55)] active:translate-y-0.5 active:shadow-[0_2px_0_0_hsl(var(--primary)/0.55)]',
          primaryCta.tone === 'flies' &&
            'bg-amber-500 text-white shadow-[0_4px_0_0_#b45309] active:translate-y-0.5',
          primaryCta.tone === 'fill' &&
            'bg-foreground/90 text-background shadow-[0_4px_0_0_hsl(var(--foreground)/0.45)] active:translate-y-0.5',
          primaryCta.tone === 'idle' && 'bg-muted text-muted-foreground/70',
        )}
      >
        {primaryCta.tone === 'trade' && !primaryCta.disabled && (
          <span className="absolute top-0 left-0 z-10 block w-1/2 h-full pointer-events-none bg-gradient-to-r from-transparent via-white to-transparent opacity-25 animate-shine" />
        )}
        {primaryCta.label}
      </Button>
    );

    return (
      <>
        {desktopMode ? (
          <div className="flex items-center justify-between w-full gap-3 px-4 py-3 border-b border-border bg-muted/30 shrink-0">
            <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-black text-foreground min-w-0">
              Contract
              {ladder}
            </h3>
            <div className="flex items-center gap-2 shrink-0">
              {totalPicked > 0 && (
                <button
                  type="button"
                  onClick={handleClear}
                  aria-label="Clear contract"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={2.5} />
                </button>
              )}
              <SlotCounter picked={totalPicked} total={totalSlots} ready={isReady} />
            </div>
          </div>
        ) : (
          <div className="flex w-full items-center gap-3 px-3 pt-2.5 pb-2">
            <button
              type="button"
              onClick={() => {
                hapticSelect();
                setIsContractExpanded((v) => !v);
              }}
              aria-expanded={isContractExpanded}
              aria-label={expanded ? 'Hide contract' : 'Show contract'}
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
            >
              <div ref={liveRefs ? dockAnchorRef : undefined} className="shrink-0">
                <PrizeOrb
                  rarity={nextRarity}
                  progress={progress}
                  ready={isReady}
                  size={40}
                />
              </div>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center gap-2 min-w-0">
                  {ladder ?? (
                    <span className="text-[13px] font-black text-muted-foreground">
                      Contract
                    </span>
                  )}
                </span>
                <ProgressTrack value={progress} ready={isReady} />
              </span>
              <SlotCounter picked={totalPicked} total={totalSlots} ready={isReady} />
              <ChevronDown
                size={16}
                className={cn(
                  'shrink-0 text-muted-foreground transition-transform duration-200',
                  expanded ? '' : '-rotate-180',
                )}
              />
            </button>
          </div>
        )}

        {desktopMode && (
          <div className="w-full px-4 pt-3 shrink-0">
            <ProgressTrack value={progress} ready={isReady} />
          </div>
        )}

        <motion.div
          initial={false}
          animate={{ height: expanded ? 'auto' : 0, opacity: expanded ? 1 : 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 34 }}
          className="w-full overflow-hidden"
        >
          <div className="w-full max-w-md mx-auto px-3 pt-1 pb-2 lg:px-4 lg:pt-4">
            {nextRarity && (
              <button
                type="button"
                onClick={() => {
                  hapticSelect();
                  setPoolOpen(true);
                }}
                disabled={rewardPool.length === 0}
                className={cn(
                  'mb-3 flex w-full items-center gap-3 rounded-xl border border-border/60 bg-muted/40 p-2 text-left transition-colors active:bg-muted lg:mb-4 lg:flex-col lg:gap-2 lg:p-3',
                )}
              >
                <PrizeOrb
                  rarity={nextRarity}
                  progress={progress}
                  ready={isReady}
                  size={desktopMode ? 88 : 60}
                />
                <RewardSummary
                  rarity={nextRarity}
                  total={rewardPool.length}
                  fresh={newInPool}
                  wishlisted={wishlistHits}
                  centered={desktopMode}
                />
                {rewardPool.length > 0 && (
                  <ChevronDown
                    size={16}
                    className="-rotate-90 shrink-0 text-muted-foreground lg:hidden"
                  />
                )}
              </button>
            )}

            {recipe?.fuelRarity && targetRarity && (
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[12px] font-black text-muted-foreground">
                  Needs{' '}
                  <span className="text-foreground">
                    {countOf(slotCount, targetRarity)}
                  </span>
                  {(fuelQuote.count || fuelQuote.baseCount) > 0 && (
                    <>
                      {' + '}
                      <span className="text-foreground">
                        {countOf(
                          fuelQuote.count || fuelQuote.baseCount,
                          recipe.fuelRarity,
                        )}
                      </span>
                    </>
                  )}
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
            )}

            <div className="mb-2 lg:mb-3">
              {renderSlotGrid(
              selectedIds,
              slotCount,
              handleRemove,
              'main',
              targetRarity,
            )}
            </div>

            {recipe?.fuelRarity && (
              <div className="mb-2 lg:mb-3">
                {fuelQuote.count > 0 ? (
                  renderSlotGrid(
                    fuelIds,
                    fuelQuote.count,
                    handleRemoveFuel,
                    'fuel',
                    recipe.fuelRarity,
                  )
                ) : (
                  <p className="rounded-lg bg-green-500/10 px-2.5 py-1.5 text-[10px] font-bold text-green-700 dark:text-green-400">
                    All {fuelQuote.baseCount} waived — no extras on this one.
                  </p>
                )}
              </div>
            )}

            {recipe && wishlistHits > 0 && (
              <button
                type="button"
                onClick={() => {
                  hapticSelect();
                  setAimOn((v) => !v);
                }}
                aria-pressed={aimActive}
                className={cn(
                  'mb-2 flex w-full items-center gap-2.5 rounded-xl border-2 px-2.5 py-2 text-left transition-colors',
                  aimActive
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-muted/50',
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                    aimActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground',
                  )}
                >
                  <Crosshair className="h-4 w-4" strokeWidth={3} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="text-[13px] font-black text-foreground">
                    Aim
                  </span>
                  <span className="text-[10px] font-bold text-muted-foreground">
                    {aimActive
                      ? `Guaranteed — you'll get ${aimTarget}`
                      : `Guarantee ${aimTarget}, instead of a ${modifiers.wishlistRedirectPercent}% chance`}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {aimQuote.discountPercent > 0 && (
                    <span className="text-[11px] font-bold tabular-nums text-muted-foreground line-through opacity-60">
                      {aimQuote.basePrice.toLocaleString()}
                    </span>
                  )}
                  <Fly size={30} paused y={-4} />
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
            )}

            {plusPerk && (
              <button
                type="button"
                onClick={() => {
                  hapticSelect();
                  onUpgrade?.();
                }}
                className="group mb-2 flex w-full items-center gap-2 rounded-xl px-1.5 py-1.5 text-left transition-colors hover:bg-amber-500/10"
              >
                <AppIcon
                  name="frogPlus"
                  label="Plus"
                  className="h-6 w-6 shrink-0"
                />
                <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-muted-foreground transition-colors group-hover:text-amber-700 dark:group-hover:text-amber-400">
                  {plusPerk}
                </span>
                <ChevronDown
                  size={14}
                  className="-rotate-90 shrink-0 text-muted-foreground/50"
                />
              </button>
            )}

            {error && (
              <div className="flex items-center justify-center gap-2 mb-2 text-xs font-bold text-destructive">
                <AlertCircle size={14} /> {error}
              </div>
            )}

          </div>
        </motion.div>

        <div className="sticky bottom-0 z-10 w-full max-w-md mx-auto shrink-0 bg-card px-3 pb-3 pt-1 lg:px-4 lg:pb-4">
          {/* Inside the sticky footer, not at the end of the scrolling body: a
              contract with a fuel row is tall enough that the body's last child
              sits behind this bar, which is how Clear disappeared exactly when
              a stuck contract needed it most. */}
          {!desktopMode && totalPicked > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="mb-2 flex w-full items-center justify-center gap-1.5 text-[12px] font-black text-muted-foreground transition-colors active:text-destructive"
            >
              <Trash2 className="h-3 w-3" strokeWidth={3} />
              Clear contract
            </button>
          )}
          {primaryButton}
          {contractHint && (
            <p className="mt-1.5 text-center text-[10px] font-bold text-muted-foreground">
              {contractHint}
            </p>
          )}
        </div>
      </>
    );
  };

  // On the wardrobe page the dock lives inside a section that sits *below* the
  // frog hero in the page's stacking order, so no local z-index can lift it
  // over the frog. Portalling it to the body puts it in the root context.
  const dockNode = (
    <div
      ref={dockRef}
      className="lg:hidden fixed bottom-[calc(76px+env(safe-area-inset-bottom))] md:bottom-0 left-0 w-full z-[60] max-h-[72svh] overflow-y-auto bg-card border-t border-border shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.1)] flex flex-col"
    >
      {renderContract(false)}
    </div>
  );
  const contractDock =
    pageScroll && mounted ? createPortal(dockNode, document.body) : dockNode;

  // --- Render ---
  return (
    <div
      className={cn(
        'relative flex flex-col w-full bg-background',
        pageScroll ? '' : 'h-full overflow-y-auto lg:overflow-hidden',
      )}
    >
      {mounted &&
        flights.length > 0 &&
        createPortal(
          <div className="pointer-events-none fixed inset-0 z-[9998]">
            {flights.map((flight) => (
              <FlightGhost key={flight.id} flight={flight} />
            ))}
          </div>,
          document.body,
        )}

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
                  className="mb-3 flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 px-3.5 py-1.5 text-[13px] font-black text-amber-950 shadow-lg shadow-amber-500/30"
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
                          {!rewardedAdsAvailable() && (
                            <span className="text-[10px] font-bold normal-case tracking-normal text-white/80">
                              with Plus
                            </span>
                          )}
                        </span>
                        {rewardedAdsAvailable() && (
                          <SquarePlay className="w-[18px] h-[18px]" strokeWidth={2.5} />
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
        onStartTrial={async () => {
          if (rerollClaimId) await handleReroll(true);
        }}
        onClose={() => setShowPlusOffer(false)}
      />

      <RewardPoolSheet
        open={poolOpen}
        onClose={() => setPoolOpen(false)}
        rarity={nextRarity}
        prizes={rewardPool}
        wishlisted={wishlistHits}
        redirectPercent={modifiers.wishlistRedirectPercent}
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
          ref={gridTopRef}
          style={
            dockHeight > 0 ? { paddingBottom: dockHeight + 24 } : undefined
          }
          className={cn(
            pageScroll
              ? '-mx-4 rounded-none border border-x-0 border-border/40 bg-muted/40 p-3 pb-52 md:mx-0 md:rounded-[20px] md:border-x md:px-4 md:pt-4 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-4'
              : 'px-4 pb-52 lg:p-4',
          )}
        >
          {targetRarity && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleClear}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-black transition-colors',
                  getRarityBg(targetRarity),
                  'border-transparent',
                )}
              >
                {targetRarity} contract
                <X className="h-3 w-3" strokeWidth={3.5} />
              </button>
              {fuelRarity && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-black',
                    getRarityBg(fuelRarity),
                  )}
                >
                  + {countOf(fuelQuote.count, fuelRarity)}
                </span>
              )}
            </div>
          )}
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
                      ref={(el) => {
                        if (el) cardRefs.current.set(entry.uid, el);
                        else cardRefs.current.delete(entry.uid);
                      }}
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
                  <div
                    key={group.rarity}
                    ref={(el) => {
                      if (el) groupRefs.current.set(group.rarity, el);
                      else groupRefs.current.delete(group.rarity);
                    }}
                    className="pb-2 last:pb-4"
                  >
                    <p
                      className={cn(
                        'mb-2 px-1 text-[12px] font-black',
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

        <aside className="hidden lg:flex lg:flex-col lg:sticky lg:top-36 lg:max-h-[calc(100svh-11rem)] overflow-y-auto rounded-2xl border border-border/60 bg-card shadow-lg">
          {renderContract(true)}
        </aside>
      </div>

      {/* --- CONTRACT DOCK (mobile/tablet) --- */}
      {contractDock}
    </div>
  );
}

const ORB_RING: Record<Rarity, string> = {
  common: 'stroke-slate-400',
  uncommon: 'stroke-emerald-500',
  rare: 'stroke-sky-500',
  epic: 'stroke-violet-500',
  legendary: 'stroke-amber-500',
};

/**
 * Lifts the already-drawn pixels off the tapped card. Re-rendering the item in
 * the ghost meant waiting on a Rive stamp, so the very first pick appeared only
 * after its flight had finished and looked like a stuck sprite.
 */
function captureCardPixels(source: HTMLElement): string | null {
  const canvas = source.querySelector('canvas');
  if (canvas && canvas.width > 0 && canvas.height > 0) {
    try {
      return canvas.toDataURL();
    } catch {
      return null;
    }
  }
  const img = source.querySelector('img');
  return img?.currentSrc || img?.src || null;
}

function FlightGhost({ flight }: { flight: Flight }) {
  const { from, to, image, rarity, cover } = flight;
  const size = Math.min(from.width, from.height, 88);
  const config = RARITY_CONFIG[rarity];
  const at = (rect: DOMRect) => ({
    x: rect.left + rect.width / 2 - size / 2,
    y: rect.top + rect.height / 2 - size / 2,
  });

  return (
    <motion.div
      initial={{ ...at(from), scale: 1, opacity: 1 }}
      animate={{ ...at(to), scale: 0.5, opacity: 0.9 }}
      transition={{ duration: FLIGHT_MS / 1000, ease: [0.32, 0.72, 0.3, 1] }}
      style={{ position: 'absolute', left: 0, top: 0, width: size, height: size }}
      className={cn(
        'flex items-center justify-center overflow-hidden rounded-xl border-2 bg-gradient-to-b shadow-lg',
        config.border,
        config.gradient,
      )}
    >
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          className={cn(
            'h-full w-full',
            cover ? 'object-cover' : 'object-contain',
          )}
        />
      )}
    </motion.div>
  );
}

function PrizeOrb({
  rarity,
  progress,
  ready,
  size,
}: {
  rarity: Rarity | null;
  progress: number;
  ready: boolean;
  size: number;
}) {
  const stroke = Math.max(3, Math.round(size / 14));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const config = rarity ? RARITY_CONFIG[rarity] : null;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <motion.div
        animate={ready ? { scale: [1, 1.07, 1] } : { scale: 1 }}
        transition={
          ready
            ? { duration: 1.7, repeat: Infinity, ease: 'easeInOut' }
            : { type: 'spring', stiffness: 400, damping: 26 }
        }
        style={{ inset: stroke + 1 }}
        className={cn(
          'absolute flex items-center justify-center rounded-full bg-gradient-to-b',
          config ? config.gradient : 'from-muted to-muted/40',
        )}
      >
        <span
          className={cn(
            'font-black leading-none',
            config ? config.text : 'text-muted-foreground/50',
          )}
          style={{ fontSize: Math.round(size * 0.4) }}
        >
          ?
        </span>
      </motion.div>
      <svg
        width={size}
        height={size}
        className="absolute inset-0 -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-border"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={cn(
            ready ? 'stroke-green-500' : rarity ? ORB_RING[rarity] : 'stroke-primary',
          )}
          style={{ strokeDasharray: circumference }}
          initial={false}
          animate={{
            strokeDashoffset:
              circumference * (1 - Math.max(0, Math.min(1, progress))),
          }}
          transition={{ type: 'spring', stiffness: 260, damping: 30 }}
        />
      </svg>
    </div>
  );
}

function ProgressTrack({ value, ready }: { value: number; ready: boolean }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <motion.span
        initial={false}
        animate={{ scaleX: Math.max(0, Math.min(1, value)) }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className={cn(
          'block h-full w-full origin-left rounded-full',
          ready ? 'bg-green-500' : 'bg-primary',
        )}
      />
    </span>
  );
}

function SlotCounter({
  picked,
  total,
  ready,
}: {
  picked: number;
  total: number;
  ready: boolean;
}) {
  return (
    <motion.div
      key={picked}
      initial={{ scale: 1.35 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 22 }}
      className={cn(
        'shrink-0 text-base font-black tabular-nums',
        ready ? 'text-green-500' : 'text-primary',
      )}
    >
      {picked}
      <span className="text-muted-foreground/40">/{total}</span>
    </motion.div>
  );
}

function RewardSummary({
  rarity,
  total,
  fresh,
  wishlisted,
  centered = false,
}: {
  rarity: Rarity;
  total: number;
  fresh: number;
  wishlisted: number;
  centered?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-0.5',
        centered && 'items-center text-center',
      )}
    >
      <span
        className={cn(
          'text-[13px] font-black',
          RARITY_CONFIG[rarity].text,
        )}
      >
        1 {rarity} reward
      </span>
      <span className="text-[10px] font-bold text-muted-foreground">
        {total} possible
        {fresh > 0 && ` · ${fresh} you don't own`}
      </span>
      <span
        className={cn(
          'flex items-center gap-1.5',
          centered && 'justify-center',
        )}
      >
        <span className="text-[12px] font-black text-primary underline underline-offset-2">
          See them all
        </span>
        {wishlisted > 0 && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[11px] font-black text-primary">
            <Bookmark className="h-2.5 w-2.5" strokeWidth={3.5} fill="currentColor" />
            {wishlisted}
          </span>
        )}
      </span>
    </div>
  );
}

function RewardPoolTile({ prize }: { prize: RewardPreview }) {
  const config = RARITY_CONFIG[prize.item?.rarity ?? prize.bg?.rarity ?? 'common'];

  return (
    <div
      className={cn(
        'relative flex flex-col overflow-hidden rounded-xl border-2 bg-gradient-to-br p-1.5 shadow-sm',
        config.border,
        config.gradient,
        prize.owned && 'opacity-55',
      )}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-background/50">
        {prize.bg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={backgroundPreview(prize.bg)}
            alt={prize.name}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : prize.item ? (
          <FrogSnapshot
            indices={{
              skin: 0,
              hat: 0,
              body: 0,
              hand_item: 0,
              [prize.item.slot]: prize.item.riveIndex,
            }}
            width="100%"
            height="100%"
            visualOffsetY={0}
            className="pointer-events-none translate-y-[6%]"
          />
        ) : null}
        {prize.wishlisted && (
          <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <Bookmark className="h-3 w-3" strokeWidth={3.5} fill="currentColor" />
          </span>
        )}
      </div>
      <p className="mt-1 truncate px-0.5 text-[11px] font-bold leading-tight text-foreground">
        {prize.name}
      </p>
      <p
        className={cn(
          'px-0.5 text-[11px] font-black',
          prize.owned ? 'text-muted-foreground' : 'text-primary',
        )}
      >
        {prize.owned ? 'Owned' : 'New'}
      </p>
    </div>
  );
}

function RewardPoolSheet({
  open,
  onClose,
  rarity,
  prizes,
  wishlisted,
  redirectPercent,
}: {
  open: boolean;
  onClose: () => void;
  rarity: Rarity | null;
  prizes: RewardPreview[];
  wishlisted: number;
  redirectPercent: number;
}) {
  const fresh = prizes.filter((prize) => !prize.owned).length;

  return (
    <BaseSheet
      open={open && !!rarity}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      className="max-h-[88dvh] select-none sm:max-h-[84dvh] sm:max-w-[560px]"
      zIndex={1150}
      closeAriaLabel="Close possible rewards"
    >
      {({ bindScroll }) => (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 px-5 pb-3 pt-3 sm:px-6 sm:pt-6">
            <div className="flex items-center gap-2 pr-12 sm:pr-14">
              <h2 className="text-lg font-black text-foreground">
                Possible rewards
              </h2>
              {rarity && (
                <span
                  className={cn(
                    'rounded px-2 py-0.5 text-[12px] font-bold',
                    getRarityBg(rarity),
                  )}
                >
                  {rarity}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs font-bold text-muted-foreground">
              {prizes.length} in the pool · {fresh} you don&apos;t own
            </p>
            {wishlisted > 0 && (
              <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5 text-[11px] font-bold text-primary">
                <Bookmark
                  className="mt-px h-3 w-3 shrink-0"
                  strokeWidth={3}
                  fill="currentColor"
                />
                <span>
                  {wishlisted} wishlisted — a free trade lands one{' '}
                  {redirectPercent}% of the time, or Aim makes it certain.
                </span>
              </p>
            )}
          </div>

          <div
            ref={bindScroll}
            className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 sm:px-6"
          >
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {prizes.map((prize) => (
                <RewardPoolTile key={prize.key} prize={prize} />
              ))}
            </div>
          </div>
        </div>
      )}
    </BaseSheet>
  );
}

function WaiverChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-black text-green-700 dark:text-green-400">
      {children}
    </span>
  );
}

function ScrollMoreCue() {
  return (
    <div className="pointer-events-none sticky bottom-3 z-30 flex justify-center">
      <div className="flex items-center gap-1.5 rounded-full border border-border/50 bg-background/85 px-3 py-1.5 text-[12px] font-black text-muted-foreground shadow-sm backdrop-blur">
        <ChevronDown className="h-3.5 w-3.5 animate-bounce text-primary" />
        <span>Scroll for more</span>
      </div>
    </div>
  );
}

// --- Helpers ---
function scrollableAncestor(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function countOf(count: number, rarity: Rarity) {
  return `${count} ${rarity}${count === 1 ? '' : 's'}`;
}

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
