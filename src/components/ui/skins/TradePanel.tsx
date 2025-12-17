'use client';

import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Sparkles, AlertCircle, Plus, ArrowUp } from 'lucide-react';
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
    border: 'border-slate-400 dark:border-slate-600',
    bg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-600 dark:text-slate-400',
    glow: 'shadow-none',
    label: 'Common',
    gradient:
      'from-slate-200 to-slate-100 dark:from-slate-800 dark:to-slate-900',
    shadow: 'shadow-slate-400/10',
    hoverGlow: 'hover:shadow-[0_0_20px_rgba(148,163,184,0.5)]',
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

type TradePanelProps = {
  inventory: Record<string, number>;
  catalog: ItemDef[];
  unseenItems: string[];
  onTradeSuccess?: () => void;
};

export function TradePanel({
  inventory,
  catalog,
  unseenItems,
  onTradeSuccess,
}: TradePanelProps) {
  // --- State ---
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isTrading, setIsTrading] = useState(false);
  const [tradeResult, setTradeResult] = useState<ItemDef | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // --- Derived ---
  const targetRarity = useMemo(() => {
    if (selectedIds.length === 0) return null;
    const firstItem = catalog.find((i) => i.id === selectedIds[0]);
    return firstItem?.rarity || null;
  }, [selectedIds, catalog]);

  const availableItems = useMemo(() => {
    const ownedIds = Object.keys(inventory);
    return catalog
      .filter((item) => {
        if (!ownedIds.includes(item.id)) return false;
        if (targetRarity && item.rarity !== targetRarity) return false;
        if (!targetRarity && item.rarity === 'legendary') return false;
        return true;
      })
      .sort((a, b) => rarityRank[a.rarity] - rarityRank[b.rarity]);
  }, [inventory, catalog, targetRarity]);

  const selectedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    selectedIds.forEach((id) => (counts[id] = (counts[id] || 0) + 1));
    return counts;
  }, [selectedIds]);

  // --- Actions ---
  const handleSelect = (item: ItemDef) => {
    if (selectedIds.length >= 10) return;
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
    if (selectedIds.length !== 10) return;
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
    <div className="relative flex flex-col lg:flex-row w-full h-full overflow-y-auto lg:overflow-hidden bg-slate-50 dark:bg-black/20">
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
              />
            </div>
          </div>,
          document.body
        )
      }

      {/* --- INVENTORY (Main View - Order 1) --- */}
      <div className="flex-1 flex flex-col lg:h-full lg:min-h-0 lg:overflow-y-auto order-1 bg-slate-50 dark:bg-black/20 lg:bg-transparent">
        <div className="flex items-center justify-between px-4 py-3 lg:px-6 lg:py-4 shrink-0">
          <h3 className="text-sm font-bold tracking-wider uppercase text-slate-500">
            Your Inventory
          </h3>
          {!availableItems.length && (
            <span className="text-xs text-slate-400">
              No tradeable items found
            </span>
          )}
        </div>

        <div className="px-4 pb-96 lg:pb-6 lg:px-6">
          {availableItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 md:h-64 text-sm border-2 border-dashed text-slate-400 border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-900/50">
              <p>Your wardrobe is empty (or filtered out).</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 min-[450px]:grid-cols-3 md:grid-cols-3 gap-3 md:gap-4 pb-4">
              {availableItems.map((item) => {
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
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* --- CONTRACT (Side/Bottom Dock - Order 2) --- */}
      <div className="fixed bottom-0 left-0 w-full pointer-events-none lg:static lg:pointer-events-auto shrink-0 z-20 order-2 lg:w-[320px] xl:w-[360px] bg-white dark:bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.1)] lg:shadow-[-4px_0_20px_-5px_rgba(0,0,0,0.1)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
            <div>
              <h3 className="flex items-center gap-2 text-base md:text-lg font-black uppercase text-slate-800 dark:text-white">
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
              <div className="text-lg md:text-xl font-black text-indigo-600 dark:text-indigo-400">
                {selectedIds.length}
                <span className="text-slate-300">/10</span>
              </div>
            </div>
        </div>

        {/* Scrollable Content (Sidebar) or Fixed (Bottom Bar) */}
        <div className="flex-1 p-4 flex flex-col pointer-events-auto w-full max-w-md mx-auto lg:max-w-none lg:mx-0 lg:overflow-y-auto">
           {/* Grid */}
           <div className="grid grid-cols-5 gap-2 md:gap-3 mb-4">
                {Array.from({ length: 10 }).map((_, i) => {
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
                        'aspect-square rounded-lg border-2 flex items-center justify-center relative overflow-hidden transition-all duration-200',
                        !item &&
                          'border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50',
                        item &&
                          config &&
                          cn(config.border, config.bg, 'shadow-sm')
                      )}
                    >
                      {item ? (
                        <div className="relative flex items-center justify-center w-full h-full p-0.5">
                          <Frog
                            className="object-contain w-full h-full"
                            indices={{
                              skin: 0,
                              hat: 0,
                              scarf: 0,
                              hand_item: 0,
                              [item.slot]: item.riveIndex,
                            }}
                            width={80}
                            height={80}
                          />
                        </div>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-300 dark:text-slate-700">
                          {i + 1}
                        </span>
                      )}
                    </motion.button>
                  );
                })}
           </div>
           
           <div className="mt-auto">
             {error && (
                <div className="flex items-center gap-2 mb-2 text-xs font-bold text-rose-500 justify-center">
                  <AlertCircle size={14} /> {error}
                </div>
              )}

             <div className="flex gap-2">
                {selectedIds.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={handleClear}
                    className="h-12 shrink-0 border-rose-200 text-rose-500 hover:bg-rose-50 hover:text-rose-600 px-3"
                  >
                    Clear
                  </Button>
                )}
                <Button
                  disabled={selectedIds.length !== 10 || isTrading}
                  onClick={handleConfirmTrade}
                  className={cn(
                    'group relative flex-1 h-12 md:h-14 font-black uppercase tracking-wider transition-all overflow-hidden text-sm md:text-base',
                    selectedIds.length === 10
                      ? 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg shadow-indigo-500/30'
                      : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600'
                  )}
                >
                  {selectedIds.length === 10 && (
                    <span className="absolute top-0 z-10 block w-1/2 h-full -skew-x-12 pointer-events-none -inset-full bg-gradient-to-r from-transparent to-white opacity-40 group-hover:animate-shine" />
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
             <p className="text-[10px] text-center text-slate-400 mt-2">
                Combine 10 items to upgrade rarity.
              </p>
           </div>
        </div>
      </div>
    </div>
  );
}

// --- Helpers ---
function getRarityColor(rarity: Rarity) {
  switch (rarity) {
    case 'common':
      return 'text-slate-500';
    case 'uncommon':
      return 'text-emerald-500';
    case 'rare':
      return 'text-blue-500';
    case 'epic':
      return 'text-purple-500';
    case 'legendary':
      return 'text-amber-500';
    default:
      return 'text-slate-500';
  }
}

function getRarityBg(rarity: Rarity) {
  switch (rarity) {
    case 'common':
      return 'bg-slate-100 text-slate-600';
    case 'uncommon':
      return 'bg-emerald-100 text-emerald-700';
    case 'rare':
      return 'bg-blue-100 text-blue-700';
    case 'epic':
      return 'bg-purple-100 text-purple-700';
    case 'legendary':
      return 'bg-amber-100 text-amber-700';
    default:
      return 'bg-slate-100';
  }
}
