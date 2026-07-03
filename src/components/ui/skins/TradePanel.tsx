'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, AlertCircle, ArrowRight, ArrowUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ItemDef,
  Rarity,
  rarityRank,
  RARITY_ORDER,
  TRADE_ITEM_COUNT,
} from '@/lib/skins/catalog';
import { Button } from '@/components/ui/button';
import confetti from 'canvas-confetti';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { ItemCard } from './ItemCard';

// Import from gift-box for the reward UI
import { RewardCard } from '@/components/ui/gift-box/RewardCard';
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
import { BackgroundCard } from './BackgroundCard';
import { backgroundPreview } from '@/hooks/useBackgroundActions';
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
};

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
}: TradePanelProps) {
  // --- State ---
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isTrading, setIsTrading] = useState(false);
  const [tradeResult, setTradeResult] = useState<
    (ItemDef & { kind?: 'item' | 'background'; imageUrl?: string }) | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [inventoryHasScrolled, setInventoryHasScrolled] = useState(false);
  const [gridInitialSize, setGridInitialSize] = useState(4);
  const [gridBatchSize, setGridBatchSize] = useState(6);
  const inventoryScrollRef = useRef<HTMLDivElement | null>(null);
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
      if (item.rarity === 'legendary') return;
      const uid = `item:${item.id}`;
      map.set(uid, { uid, id: item.id, kind: 'item', rarity: item.rarity, owned, item });
    });
    backgrounds.forEach((bgItem) => {
      const owned = backgroundInventory[bgItem.id] ?? 0;
      if (owned <= 0) return;
      if (bgItem.rarity === 'legendary') return;
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
  }, [catalog, inventory, backgrounds, backgroundInventory]);

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
    selectedIds.forEach((id) => (counts[id] = (counts[id] || 0) + 1));
    return counts;
  }, [selectedIds]);

  // --- Actions ---
  const haptic = (pattern: number | number[]) => {
    try {
      navigator.vibrate?.(pattern);
    } catch {}
  };

  const handleSelect = (entry: TradeEntry) => {
    if (selectedIds.length >= TRADE_ITEM_COUNT) return;
    if (targetRarity && entry.rarity !== targetRarity) return;
    const currentlySelected = selectedCounts[entry.uid] || 0;
    if (currentlySelected < entry.owned) {
      haptic(selectedIds.length + 1 === TRADE_ITEM_COUNT ? [10, 30, 16] : 8);
      setSelectedIds((prev) => [...prev, entry.uid]);
    }
  };

  const handleRemove = (index: number) => {
    haptic(6);
    setSelectedIds((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClear = () => {
    setSelectedIds([]);
    setError(null);
  };

  const handleConfirmTrade = async () => {
    if (selectedIds.length !== TRADE_ITEM_COUNT) return;
    setIsTrading(true);
    setError(null);
    try {
      const picks = selectedIds.map((uid) => {
        const [kind, ...rest] = uid.split(':');
        return { id: rest.join(':'), kind: kind === 'background' ? 'background' : 'item' };
      });
      const res = await fetch('/api/skins/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ picks }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Trade failed');

      setTradeResult(data.reward);
      setSelectedIds([]);
      haptic([12, 40, 20]);
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
    setTradeResult(null);
  };


  const isReady = selectedIds.length === TRADE_ITEM_COUNT;
  const nextRarity: Rarity | null =
    targetRarity && targetRarity !== 'legendary'
      ? (RARITY_ORDER[rarityRank[targetRarity] + 1] as Rarity)
      : null;

  let contractHint = `Combine ${TRADE_ITEM_COUNT} same-rarity items to upgrade.`;
  if (isReady && nextRarity) {
    contractHint = `Ready! Combine into 1 ${nextRarity} reward.`;
  } else if (targetRarity) {
    contractHint = `Add ${TRADE_ITEM_COUNT - selectedIds.length} more ${targetRarity} items.`;
  }

  const renderContract = (desktopMode: boolean) => {
    const expanded = desktopMode || isContractExpanded;

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
        key={selectedIds.length}
        initial={{ scale: 1.35 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 22 }}
        className={cn(
          'text-base font-black',
          isReady ? 'text-green-500' : 'text-primary',
        )}
      >
        {selectedIds.length}
        <span className="text-muted-foreground/40">/{TRADE_ITEM_COUNT}</span>
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
            animate={{ scaleX: selectedIds.length / TRADE_ITEM_COUNT }}
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
            <div className="grid grid-cols-5 gap-1.5 lg:gap-2 mb-2 lg:mb-4">
              {Array.from({ length: TRADE_ITEM_COUNT }).map((_, i) => {
                const uid = selectedIds[i];
                const entry = uid ? entryMap.get(uid) : null;
                const config = entry ? RARITY_CONFIG[entry.rarity] : null;

                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => entry && handleRemove(i)}
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
                  isReady
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/40'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {isReady && !isTrading && (
                  <>
                    <span className="absolute inset-0 pointer-events-none animate-pulse bg-primary-foreground/10" />
                    <span className="absolute top-0 left-0 z-10 block w-1/2 h-full pointer-events-none bg-gradient-to-r from-transparent via-white to-transparent opacity-25 animate-shine" />
                  </>
                )}
                {isTrading ? (
                  <Sparkles className="w-5 h-5 mr-2 animate-spin" />
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
              <RewardCard
                key="card"
                prize={tradeResult}
                claiming={false}
                onClaim={handleClaimReward}
                paused={paused}
              />
            </div>
          </div>,
          document.body
        )
      }

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
        {!availableItems.length && (
          <div className="flex items-center justify-end px-4 py-3 lg:px-6 lg:py-4 shrink-0">
            <span className="text-xs text-muted-foreground/60">
              No tradeable items found
            </span>
          </div>
        )}

        <div className="px-4 pb-52 lg:p-4">
          {availableItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 md:h-64 text-sm border-2 border-dashed text-muted-foreground border-border rounded-xl bg-muted/30">
              <p>Your wardrobe is empty (or filtered out).</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 min-[450px]:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4 pb-4">
                {availableGrid.visibleItems.map((entry, index) => {
                  const selected = selectedCounts[entry.uid] || 0;
                  const remaining = entry.owned - selected;
                  const isWrongRarity =
                    !!targetRarity && entry.rarity !== targetRarity;
                  const isDimmed = remaining === 0 || isWrongRarity;

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
                          actionLoading={false}
                          selectedCount={selected}
                          onAction={() => handleSelect(entry)}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
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
