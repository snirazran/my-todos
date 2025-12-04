'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Sparkles, AlertCircle, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ItemDef, Rarity, rarityRank } from '@/lib/skins/catalog';
import { Button } from '@/components/ui/button';
import confetti from 'canvas-confetti';
import Frog from '@/components/ui/frog';

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
  onTradeSuccess?: () => void;
};

export function TradePanel({
  inventory,
  catalog,
  onTradeSuccess,
}: TradePanelProps) {
  // --- State ---
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isTrading, setIsTrading] = useState(false);
  const [tradeResult, setTradeResult] = useState<ItemDef | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  // --- Render ---
  return (
    // Main Container: Full height on desktop to prevent page scroll
    <div className="relative w-full h-full flex flex-col md:grid md:grid-cols-12 md:gap-6 md:overflow-hidden">
      
      {/* --- RESULT OVERLAY --- */}
      <AnimatePresence>
        {tradeResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.5, y: 50 }}
              animate={{ scale: 1, y: 0 }}
              className="flex flex-col items-center w-full max-w-sm gap-6 p-8 text-center border-2 shadow-2xl bg-slate-900 border-yellow-500/50 rounded-3xl shadow-yellow-500/20"
            >
              <div className="relative">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-[-20px] bg-gradient-to-tr from-yellow-500/20 to-purple-500/20 rounded-full blur-xl"
                />
                <div className="relative flex items-center justify-center w-32 h-32 border bg-slate-800 rounded-2xl border-slate-700">
                  <Frog
                    className="w-[125%] h-[125%] object-contain translate-y-[10%]"
                    indices={{
                      skin: 0,
                      hat: 0,
                      scarf: 0,
                      hand_item: 0,
                      [tradeResult.slot]: tradeResult.riveIndex,
                    }}
                    width={180}
                    height={180}
                  />
                </div>
              </div>
              <div>
                <h2 className="mb-1 text-2xl font-black tracking-wide text-white uppercase">Trade Successful!</h2>
                <p className="text-slate-400">You received:</p>
                <p className={`text-xl font-bold mt-1 ${getRarityColor(tradeResult.rarity)}`}>{tradeResult.name}</p>
              </div>
              <Button onClick={() => setTradeResult(null)} className="w-full font-bold bg-white text-slate-900 hover:bg-slate-200">
                Awesome
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- LEFT PANEL: CONTRACT --- */}
      <div className="md:col-span-5 lg:col-span-4 flex flex-col shrink-0 md:h-full md:overflow-hidden">
        <div className="flex flex-col bg-white dark:bg-slate-900 rounded-xl md:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden md:h-full">
          
          {/* Compact Header */}
          <div className="px-4 py-3 md:p-5 border-b border-slate-100 dark:border-slate-800 shrink-0 bg-slate-50/50 dark:bg-slate-900">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-black uppercase text-slate-800 dark:text-white">Contract</h3>
               <div className="text-xs font-bold text-slate-400">
                {selectedIds.length}/10
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              10 items <ArrowRight size={12} className="inline mx-0.5"/> 1 higher rarity
            </p>
          </div>

          {/* Slots Grid */}
          <div className="p-4 md:p-6 bg-slate-100/50 dark:bg-slate-950/30 flex-1 md:overflow-hidden md:flex md:flex-col md:justify-center">
            <div className="grid grid-cols-5 gap-x-2 gap-y-5 md:gap-3 md:content-center">
              {Array.from({ length: 10 }).map((_, i) => {
                const itemId = selectedIds[i];
                const item = itemId ? catalog.find((c) => c.id === itemId) : null;
                const config = item ? RARITY_CONFIG[item.rarity] : null;

                return (
                  <motion.button
                    key={i}
                    layout
                    onClick={() => item && handleRemove(i)}
                    className={cn(
                      'aspect-square rounded-lg md:rounded-xl border-2 flex items-center justify-center relative overflow-hidden transition-all duration-200',
                      !item && 'border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/50',
                      item && config && cn(config.border, config.bg, 'shadow-sm')
                    )}
                  >
                    {item ? (
                      <div className="relative w-full h-full p-1 flex items-center justify-center">
                        <Frog
                          className="w-full h-full object-contain"
                          indices={{ skin: 0, hat: 0, scarf: 0, hand_item: 0, [item.slot]: item.riveIndex }}
                          width={80}
                          height={80}
                        />
                      </div>
                    ) : (
                      <span className="text-xs font-bold text-slate-300 dark:text-slate-700">{i + 1}</span>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 md:p-5 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 z-10 space-y-3">
             {error && (
              <div className="flex items-center gap-2 text-xs font-bold text-rose-500">
                <AlertCircle size={14} /> {error}
              </div>
            )}
            
            <div className="flex gap-2">
              {selectedIds.length > 0 && (
                 <Button variant="outline" size="icon" onClick={handleClear} className="shrink-0 border-rose-200 text-rose-500 hover:bg-rose-50 hover:text-rose-600 h-12 w-12">
                   <span className="sr-only">Clear</span>
                   <span className="font-bold text-lg">×</span>
                 </Button>
              )}
              <Button
                disabled={selectedIds.length !== 10 || isTrading}
                onClick={handleConfirmTrade}
                className={cn(
                  'flex-1 h-12 font-black uppercase tracking-wider transition-all',
                  selectedIds.length === 10
                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                    : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600'
                )}
              >
                {isTrading ? (
                  <Sparkles className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  'Trade Up'
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* --- RIGHT PANEL: INVENTORY --- */}
      <div className="md:col-span-7 lg:col-span-8 flex flex-col min-h-0 mt-4 md:mt-0 h-full md:overflow-hidden">
         {/* Minimal Header / Rarity Indicator (Only if active) */}
         {targetRarity && (
            <div className="flex items-center gap-2 mb-2 px-1 shrink-0">
               <span className="text-xs font-bold text-slate-400">Inventory Locked:</span>
               <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getRarityBg(targetRarity)}`}>
                  {targetRarity}
               </span>
            </div>
         )}

        {/* Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-2 pb-24 md:pb-2 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
           {availableItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 text-sm border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50">
              No items available.
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {availableItems.map((item) => {
                const owned = inventory[item.id] || 0;
                const selected = selectedCounts[item.id] || 0;
                const remaining = owned - selected;
                const isDimmed = remaining === 0;
                const config = RARITY_CONFIG[item.rarity];
                const isSelected = selected > 0;

                return (
                  <motion.button
                    key={item.id}
                    disabled={isDimmed}
                    onClick={() => handleSelect(item)}
                    whileTap={!isDimmed ? { scale: 0.95 } : {}}
                    className={cn(
                      'group relative flex flex-col p-2 transition-all duration-200 rounded-xl border-2 text-left overflow-hidden bg-white dark:bg-slate-900',
                      config.border,
                      isDimmed ? 'opacity-40 grayscale cursor-not-allowed' : 'hover:shadow-md cursor-pointer',
                      // Highlight border if selected but still available
                      isSelected && !isDimmed && 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-white dark:ring-offset-slate-950'
                    )}
                  >
                    {/* Selection Badge (Top Right) */}
                    <AnimatePresence>
                      {isSelected && (
                         <motion.div
                           initial={{ scale: 0 }} animate={{ scale: 1 }}
                           className="absolute top-1 right-1 z-30 bg-indigo-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow-sm"
                         >
                           {selected}/{owned}
                         </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Rarity Label (Top Left) */}
                    <div className={cn("text-[9px] font-black uppercase tracking-wider mb-1 opacity-70", config.text)}>
                      {config.label}
                    </div>

                    {/* Image */}
                    <div className={cn(
                        "w-full aspect-square rounded-lg flex items-center justify-center relative overflow-hidden mb-2",
                        "bg-gradient-to-br shadow-inner",
                        config.gradient
                    )}>
                        <div className="absolute inset-0 p-1 flex items-center justify-center">
                           <Frog
                              className="w-full h-full object-contain drop-shadow-sm"
                              indices={{ skin: 0, hat: 0, scarf: 0, hand_item: 0, [item.slot]: item.riveIndex }}
                              width={100}
                              height={100}
                           />
                        </div>
                        {/* Plus overlay if can add more */}
                        {!isDimmed && isSelected && (
                           <div className="absolute inset-0 flex items-center justify-center bg-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Plus className="text-indigo-600 w-6 h-6 drop-shadow-md" strokeWidth={3} />
                           </div>
                        )}
                    </div>

                    {/* Name */}
                    <div className="mt-auto">
                       <h4 className="text-[10px] md:text-xs font-bold leading-tight text-slate-700 dark:text-slate-200 truncate">
                         {item.name}
                       </h4>
                       <div className="text-[9px] font-medium text-slate-400 mt-0.5">
                          x{remaining} left
                       </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Helpers ---
function getRarityColor(rarity: Rarity) {
  switch (rarity) {
    case 'common': return 'text-slate-500';
    case 'uncommon': return 'text-emerald-500';
    case 'rare': return 'text-blue-500';
    case 'epic': return 'text-purple-500';
    case 'legendary': return 'text-amber-500';
    default: return 'text-slate-500';
  }
}

function getRarityBg(rarity: Rarity) {
  switch (rarity) {
    case 'common': return 'bg-slate-100 text-slate-600';
    case 'uncommon': return 'bg-emerald-100 text-emerald-700';
    case 'rare': return 'bg-blue-100 text-blue-700';
    case 'epic': return 'bg-purple-100 text-purple-700';
    case 'legendary': return 'bg-amber-100 text-amber-700';
    default: return 'bg-slate-100';
  }
}