'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Sparkles, AlertCircle, Plus, ArrowUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ItemDef, Rarity, rarityRank } from '@/lib/skins/catalog';
import { Button } from '@/components/ui/button';
import confetti from 'canvas-confetti';
import Frog from '@/components/ui/frog';
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

const TRADE_ITEM_COUNT = 5;

type TradePanelProps = {
  inventory: Record<string, number>;
  catalog: ItemDef[];
  unseenItems: string[];
  onTradeSuccess?: () => void;
  activeFilter?: FilterCategory;
  sortBy?: SortOrder;
  paused?: boolean;
};

export function TradePanel({
  inventory,
  catalog,
  unseenItems,
  onTradeSuccess,
  activeFilter = 'all',
  sortBy = 'rarity_asc',
  paused = false,
}: TradePanelProps) {
  // --- State ---
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isTrading, setIsTrading] = useState(false);
  const [tradeResult, setTradeResult] = useState<ItemDef | null>(null);
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
  const targetRarity = useMemo(() => {
    if (selectedIds.length === 0) return null;
    const firstItem = catalog.find((i) => i.id === selectedIds[0]);
    return firstItem?.rarity || null;
  }, [selectedIds, catalog]);

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
    const ownedIds = Object.keys(inventory).filter((id) => (inventory[id] ?? 0) > 0);
    let result = catalog.filter((item) => {
      if (!ownedIds.includes(item.id)) return false;
      if (item.slot === 'container') return false; // NEW: Skip gifts
      if (item.rarity === 'legendary') return false; // Legendary can't be traded up
      if (targetRarity && item.rarity !== targetRarity) return false;
      
      // Apply activeFilter
      if (activeFilter !== 'all') {
        if (activeFilter === 'skin') {
          if (item.slot !== 'skin') return false;
        } else if (activeFilter === 'body') {
          if (item.slot !== 'body') return false;
        } else if (activeFilter === 'held') {
          if (item.slot !== 'hand_item') return false;
        } else {
          if (item.slot !== activeFilter) return false;
        }
      }
      return true;
    });

    // Apply sortBy
    return result.sort((a, b) => {
      switch (sortBy) {
        case 'rarity_asc':
          return rarityRank[a.rarity] - rarityRank[b.rarity];
        case 'rarity_desc':
          return rarityRank[b.rarity] - rarityRank[a.rarity];
        case 'price_asc':
          return (a.priceFlies ?? 0) - (b.priceFlies ?? 0);
        case 'price_desc':
          return (b.priceFlies ?? 0) - (a.priceFlies ?? 0);
        default:
          return 0;
      }
    });
  }, [inventory, catalog, targetRarity, activeFilter, sortBy]);

  const availableGrid = useInfiniteScroll(availableItems, {
    initial: availableItems.length,
    batch: availableItems.length || 1,
    resetKey: `${activeFilter}|${sortBy}|${targetRarity ?? ''}|${availableItems.length}`,
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
  const handleSelect = (item: ItemDef) => {
    if (selectedIds.length >= TRADE_ITEM_COUNT) return;
    const currentlySelected = selectedCounts[item.id] || 0;
    const owned = inventory[item.id] || 0;
    if (currentlySelected < owned) {
      setSelectedIds((prev) => [...prev, item.id]);
    }
  };

  const handleRemove = (index: number) => {
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
      const res = await fetch('/api/skins/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: selectedIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Trade failed');

      setTradeResult(data.reward);
      setSelectedIds([]);
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

  // --- Render ---
  return (
    <div className="relative flex flex-col lg:flex-row lg:gap-4 w-full h-full overflow-y-auto lg:overflow-hidden bg-background">
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

      {/* --- INVENTORY (Main View - Order 1) --- */}
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
        className="flex-1 flex flex-col lg:h-full lg:min-h-0 lg:overflow-y-auto order-1 bg-background lg:bg-transparent"
      >
        {!availableItems.length && (
          <div className="flex items-center justify-end px-4 py-3 lg:px-6 lg:py-4 shrink-0">
            <span className="text-xs text-muted-foreground/60">
              No tradeable items found
            </span>
          </div>
        )}

        <div className="px-4 pb-52 lg:pb-6 lg:px-6">
          {availableItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 md:h-64 text-sm border-2 border-dashed text-muted-foreground border-border rounded-xl bg-muted/30">
              <p>Your wardrobe is empty (or filtered out).</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 min-[450px]:grid-cols-3 md:grid-cols-3 lg:grid-cols-2 gap-3 md:gap-4 pb-4">
                {availableGrid.visibleItems.map((item, index) => {
                  const owned = inventory[item.id] || 0;
                  const selected = selectedCounts[item.id] || 0;
                  const remaining = owned - selected;
                  const isDimmed = remaining === 0;

                  return (
                    <div key={item.id} className={isDimmed ? 'opacity-50 grayscale pointer-events-none' : ''}>
                      <ItemCard
                        item={item}
                        mode="trade"
                        ownedCount={owned}
                        isEquipped={false}
                        canAfford={true}
                        actionLoading={false}
                        selectedCount={selected}
                        onAction={() => handleSelect(item)}
                        actionLabel={null}
                        isNew={unseenItems.includes(item.id)}
                        deferPreview
                        pausePreview={true}
                        previewDelayMs={index * 20}
                      />
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

      {/* --- CONTRACT (Side/Bottom Dock - Order 2) --- */}
      <div className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] md:bottom-0 left-0 w-full pointer-events-none lg:static lg:pointer-events-auto lg:self-start shrink-0 z-[60] order-2 lg:w-[320px] xl:w-[360px] bg-card lg:bg-card/40 border-t lg:border-t-0 lg:border lg:border-border/60 lg:rounded-2xl lg:shadow-sm border-border shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.1)] flex flex-col">
        {/* Header (tap to expand/collapse on mobile) */}
        <button
          type="button"
          onClick={() => setIsContractExpanded((v) => !v)}
          aria-expanded={isContractExpanded}
          className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30 shrink-0 w-full text-left lg:cursor-default"
        >
            <div className="flex items-center gap-2">
              <ChevronDown
                size={16}
                className={cn(
                  'lg:hidden transition-transform duration-200 text-muted-foreground',
                  isContractExpanded ? '' : '-rotate-180',
                )}
              />
              <h3 className="flex items-center gap-2 text-sm font-black uppercase text-foreground">
                Contract
                {targetRarity && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold ${getRarityBg(
                      targetRarity
                    )}`}
                  >
                    {targetRarity} Only
                  </span>
                )}
              </h3>
            </div>
            <div className="text-right">
              <div className="text-base font-black text-primary">
                {selectedIds.length}
                <span className="text-muted-foreground/40">/{TRADE_ITEM_COUNT}</span>
              </div>
            </div>
        </button>

        {/* Scrollable Content (Sidebar) or Fixed (Bottom Bar) */}
        <div className="lg:p-4 flex flex-col pointer-events-auto w-full max-w-md mx-auto lg:max-w-none lg:mx-0">
           {/* Slot grid + Trade Up controls (collapsible on mobile, always expanded on lg+) */}
           <div
             className={cn(
               'overflow-hidden transition-[max-height,opacity,padding] duration-300 ease-out',
               'lg:max-h-none lg:opacity-100 lg:p-0',
               isContractExpanded
                 ? 'max-h-[700px] opacity-100 p-2'
                 : 'max-h-0 opacity-0 p-0',
             )}
           >
           <div className="grid grid-cols-5 gap-1.5 lg:gap-3 mb-2 lg:mb-4">
                {Array.from({ length: TRADE_ITEM_COUNT }).map((_, i) => {
                  const itemId = selectedIds[i];
                  const item = itemId
                    ? catalog.find((c) => c.id === itemId)
                    : null;
                  const config = item ? RARITY_CONFIG[item.rarity] : null;

                  return (
                    <motion.button
                      key={i}
                      layout
                      onClick={() => item && handleRemove(i)}
                      className={cn(
                        'h-10 lg:h-auto lg:aspect-square rounded-lg border-2 flex items-center justify-center relative overflow-hidden transition-all duration-200',
                        !item &&
                          'border-dashed border-border bg-muted/50',
                        item &&
                          config &&
                          cn(config.border, config.bg, 'shadow-sm')
                      )}
                    >
                      {item ? (
                        <div className="relative flex items-center justify-center w-full h-full">
                          <Frog
                            className="object-contain w-full h-full"
                            indices={{
                              skin: 0,
                              hat: 0,
                              body: 0,
                              hand_item: 0,
                              [item.slot]: item.riveIndex,
                            }}
                            width={60}
                            height={60}
                            paused={false}
                          />
                        </div>
                      ) : (
                        <span className="text-[10px] font-bold text-muted-foreground/40">
                          {i + 1}
                        </span>
                      )}
                    </motion.button>
                  );
                })}
           </div>

           <div className="mt-auto">
             {error && (
                <div className="flex items-center gap-2 mb-2 text-xs font-bold text-destructive justify-center">
                  <AlertCircle size={14} /> {error}
                </div>
              )}

             <div className="flex gap-2">
                {selectedIds.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={handleClear}
                    className="h-9 lg:h-12 shrink-0 border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive px-3"
                  >
                    Clear
                  </Button>
                )}
                <Button
                  disabled={selectedIds.length !== TRADE_ITEM_COUNT || isTrading}
                  onClick={handleConfirmTrade}
                  className={cn(
                    'group relative flex-1 h-9 lg:h-14 font-black uppercase tracking-wider transition-all overflow-hidden text-sm',
                    selectedIds.length === TRADE_ITEM_COUNT
                      ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {selectedIds.length === TRADE_ITEM_COUNT && (
                    <span className="absolute top-0 z-10 block w-1/2 h-full -skew-x-12 pointer-events-none -inset-full bg-gradient-to-r from-transparent to-white opacity-20 group-hover:animate-shine" />
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
             <p className="text-[10px] text-center text-muted-foreground mt-1">
                Combine {TRADE_ITEM_COUNT} items to upgrade rarity.
              </p>
           </div>
           </div>
        </div>
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
