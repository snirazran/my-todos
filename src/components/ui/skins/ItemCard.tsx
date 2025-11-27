'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import Fly from '@/components/ui/fly';
import { cn } from '@/lib/utils';
import type { ItemDef, WardrobeSlot } from '@/lib/skins/catalog';
import Frog from '@/components/ui/frog';

/* ---------------- Visual Helpers ---------------- */

const RARITY_CONFIG: Record<ItemDef['rarity'], {
  border: string;
  bg: string;
  text: string;
  glow: string;
  label: string;
  gradient: string;
  shadow: string;
}> = {
  common: { 
    border: 'border-slate-400 dark:border-slate-600', 
    bg: 'bg-slate-100 dark:bg-slate-800', 
    text: 'text-slate-600 dark:text-slate-400', 
    glow: 'shadow-none',
    label: 'Common',
    gradient: 'from-slate-200 to-slate-100 dark:from-slate-800 dark:to-slate-900',
    shadow: 'shadow-slate-400/10' // Reduced glow
  },
  uncommon: { 
    border: 'border-emerald-500', 
    bg: 'bg-emerald-50 dark:bg-emerald-950/30', 
    text: 'text-emerald-700 dark:text-emerald-400', 
    glow: 'shadow-emerald-500/10', // Reduced glow
    label: 'Uncommon',
    gradient: 'from-emerald-100 to-emerald-50 dark:from-emerald-900/40 dark:to-emerald-950/40',
    shadow: 'shadow-emerald-500/15' // Reduced glow
  },
  rare: { 
    border: 'border-sky-500', 
    bg: 'bg-sky-50 dark:bg-sky-950/30', 
    text: 'text-sky-700 dark:text-sky-400', 
    glow: 'shadow-sky-500/10', // Reduced glow
    label: 'Rare',
    gradient: 'from-sky-100 to-sky-50 dark:from-sky-900/40 dark:to-sky-950/40',
    shadow: 'shadow-sky-500/15' // Reduced glow
  },
  epic: { 
    border: 'border-violet-500', 
    bg: 'bg-violet-50 dark:bg-violet-950/30', 
    text: 'text-violet-700 dark:text-violet-400', 
    glow: 'shadow-violet-500/15', // Reduced glow
    label: 'Epic',
    gradient: 'from-violet-100 to-violet-50 dark:from-violet-900/40 dark:to-violet-950/40',
    shadow: 'shadow-violet-500/20' // Reduced glow
  },
  legendary: { 
    border: 'border-amber-500', 
    bg: 'bg-amber-50 dark:bg-amber-950/30', 
    text: 'text-amber-700 dark:text-amber-400', 
    glow: 'shadow-amber-500/20', // Reduced glow
    label: 'Legendary',
    gradient: 'from-amber-100 to-amber-50 dark:from-amber-900/40 dark:to-amber-950/40',
    shadow: 'shadow-amber-500/25' // Reduced glow
  },
};

export function ItemCard({
  item,
  ownedCount,
  isEquipped,
  canAfford,
  onAction,
  actionLabel,
  actionLoading,
  mode,
  equippedIndices,
}: {
  item: ItemDef;
  ownedCount: number;
  isEquipped: boolean;
  canAfford: boolean;
  onAction: () => void;
  actionLabel: React.ReactNode;
  actionLoading: boolean;
  mode: 'inventory' | 'shop';
  equippedIndices: Partial<Record<WardrobeSlot, number>>;
}) {
  const config = RARITY_CONFIG[item.rarity];
  const isOwned = ownedCount > 0;

  // Construct preview indices: Current equipped + override with THIS item
  const previewIndices = {
    ...equippedIndices,
    [item.slot]: item.riveIndex,
  };

  return (
    <div
      onClick={(e) => {
        // Make the whole card clickable for equipping in inventory
        if (mode === 'inventory' && !actionLoading) onAction();
      }}
      className={cn(
        'group relative flex flex-col p-1.5 transition-all duration-200 rounded-[22px] border-[3px] shadow-lg overflow-hidden cursor-pointer', // Reduced outer padding
        config.border,
        config.bg,
        config.shadow,
        isEquipped 
          ? 'bg-green-50 dark:bg-green-900/20 border-green-500 dark:border-green-500 scale-[1.02]' 
          : 'hover:scale-[1.02] hover:-translate-y-0.5',
        !isOwned && mode === 'shop' && !canAfford && ''
      )}
    >
      {/* Selected Indicator (Equipped) - GREEN CHECK BADGE */}
      {isEquipped && (
         <div className="absolute top-2 right-2 z-30 bg-green-500 text-white rounded-full p-1 shadow-md animate-in zoom-in duration-300">
           <Check className="w-3 h-3 stroke-[4]" />
         </div>
      )}

      {/* Rarity Tag */}
      <div className={cn(
        "absolute top-0 left-0 px-2 py-1 rounded-br-xl text-[9px] font-black uppercase tracking-wider border-b border-r z-20", // Reverted to previous larger size
        config.bg,
        config.text,
        config.border
      )}>
        {config.label}
      </div>

      {/* Icon Container (Now Rive Frog) */}
      <div className={cn(
        "mt-2 mb-1 mx-auto w-full aspect-[1.2/1] rounded-xl flex items-center justify-center relative overflow-hidden",
        "bg-gradient-to-br shadow-inner", config.gradient
      )}>
        {/* Shine Effect */}
        <div className="absolute -inset-full top-0 block h-full w-1/2 -skew-x-12 bg-gradient-to-r from-transparent to-white opacity-40 group-hover:animate-shine z-10 pointer-events-none" />

                        {/* RIVE FROG PREVIEW */}
                        <div className="absolute inset-0 flex items-end justify-center">
                           <Frog 
                             className="w-[120%] h-[120%] object-contain translate-y-[20%]" // Increased translate-y to push frog further down
                             indices={previewIndices}
                             width={180}
                             height={180}
                           />
                        </div>
        
        {/* OWNED COUNT BADGE */}
        {ownedCount > 0 && (
           <div className="absolute bottom-1 right-1 bg-black/50 backdrop-blur-sm text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-sm border border-white/10 z-20">
             x{ownedCount}
           </div>
        )}
      </div>

      {/* Name & Price */}
      <div className="flex-1 flex flex-col items-center justify-end gap-1 pb-1">
        <h4 className="font-bold text-slate-800 dark:text-slate-100 text-xs leading-tight text-center truncate w-full">
          {item.name}
        </h4>
        
        {mode === 'shop' && (
          <div className="flex items-center justify-center gap-1 text-xs font-black bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded-full">
            <Fly size={12} />
            <span className={canAfford ? "text-slate-800 dark:text-slate-200" : "text-red-500"}>
              {item.priceFlies}
            </span>
          </div>
        )}
      </div>

      {/* Equip Badge (Inventory Mode) */}
      <div className="mt-0.5 w-3/4 mx-auto"> {/* Added wrapper for button width */}
        {mode === 'inventory' && (
          <div className={cn(
            "h-5 w-full flex items-center justify-center rounded-md text-[8px] font-black uppercase tracking-wide transition-colors",
            isEquipped 
              ? "bg-green-600 text-white shadow-md" 
              : "bg-white/50 dark:bg-black/20 text-slate-500 group-hover:bg-purple-100 dark:group-hover:bg-purple-900/30 group-hover:text-purple-600"
          )}>
            {actionLoading ? "..." : (isEquipped ? "EQUIPPED" : "EQUIP")}
          </div>
        )}

        {/* Buy Button (Shop Mode) */}
        {mode === 'shop' && (
          <Button
            size="sm"
            className={cn(
              "h-6 w-full font-black rounded-md text-[9px] uppercase tracking-wide shadow-md transition-all active:scale-95", // Adjusted height for proportion
              canAfford 
                ? "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white border border-purple-400/30"
                : "bg-slate-200 text-slate-400 dark:bg-slate-800 cursor-not-allowed"
            )}
            disabled={actionLoading || !canAfford}
            onClick={(e) => {
              e.stopPropagation();
              onAction();
            }}
          >
            {actionLoading ? "..." : "Buy"}
          </Button>
        )}
      </div>
    </div>
  );
}