'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import Fly from '@/components/ui/fly';
import { cn } from '@/lib/utils';
import type { ItemDef, WardrobeSlot } from '@/lib/skins/catalog';
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

export function ItemCard({
  item,
  ownedCount,
  isEquipped,
  canAfford,
  onAction,
  actionLabel,
  actionLoading,
  mode,
}: {
  item: ItemDef;
  ownedCount: number;
  isEquipped: boolean;
  canAfford: boolean;
  onAction: () => void;
  actionLabel: React.ReactNode;
  actionLoading: boolean;
  mode: 'inventory' | 'shop';
}) {
  const config = RARITY_CONFIG[item.rarity];
  const isOwned = ownedCount > 0;

  // Construct preview indices: DEFAULT (0) + override with THIS item
  const previewIndices = {
    skin: 0,
    hat: 0,
    scarf: 0,
    hand_item: 0,
    [item.slot]: item.riveIndex,
  };

  return (
    <div
      onClick={(e) => {
        // Make the whole card clickable for equipping in inventory
        if (mode === 'inventory' && !actionLoading) onAction();
      }}
      className={cn(
        'group relative flex flex-col p-3.5 transition-shadow duration-300 rounded-[24px] border-[3px] overflow-hidden cursor-pointer', // Changed transition
        config.border,
        config.bg,
        isEquipped
          ? 'bg-green-50 dark:bg-green-900/20 border-green-500 dark:border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.6)]' // Equipped glow
          : cn(config.shadow, config.hoverGlow), // Normal shadow + Hover glow
        !isOwned && mode === 'shop' && !canAfford && ''
      )}
    >
      {/* Selected Indicator (Equipped) - GREEN CHECK BADGE */}
      {isEquipped && (
        <div className="absolute top-2 right-2 z-30 bg-green-500 text-white rounded-full p-1.5 shadow-md animate-in zoom-in duration-300">
          <Check className="w-3.5 h-3.5 stroke-[4]" />
        </div>
      )}

      {/* Rarity Tag */}
      <div
        className={cn(
          'absolute top-0 left-0 px-2.5 py-1 rounded-br-2xl text-[10px] font-black uppercase tracking-wider border-b border-r z-20', // Slightly larger tag
          config.bg,
          config.text,
          config.border
        )}
      >
        {config.label}
      </div>

      {/* Icon Container (Now Rive Frog) */}
      <div
        className={cn(
          'mt-5 mb-3 mx-auto w-full aspect-[1.2/1] rounded-2xl flex items-center justify-center relative overflow-hidden', // Increased margins and roundedness
          'bg-gradient-to-br shadow-inner',
          config.gradient
        )}
      >
        {/* Shine Effect */}
        <div className="absolute top-0 z-10 block w-1/2 h-full -skew-x-12 pointer-events-none -inset-full bg-gradient-to-r from-transparent to-white opacity-40 group-hover:animate-shine" />

        {/* RIVE FROG PREVIEW */}
        <div className="absolute inset-0 flex items-end justify-center">
          <Frog
            className="w-[130%] h-[130%] object-contain translate-y-[25%]" // Slightly reduced translate-y to move frog up
            indices={previewIndices}
            width={180}
            height={180}
          />
        </div>

        {/* OWNED COUNT BADGE */}
        {ownedCount > 0 && (
          <div className="absolute bottom-1.5 right-1.5 bg-black/50 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-lg shadow-sm border border-white/10 z-20">
            x{ownedCount}
          </div>
        )}
      </div>

      {/* Name & Price */}
      <div className="flex-1 flex flex-col items-center justify-end gap-1.5 pb-1.5">
        <h4 className="w-full text-sm font-bold leading-tight text-center truncate text-slate-800 dark:text-slate-100">
          {item.name}
        </h4>

        {mode === 'shop' && (
          <div className="flex items-center justify-center gap-1.5 text-sm font-black bg-black/5 dark:bg-white/10 px-2 py-0.5 rounded-full">
            <Fly size={16} />
            <span
              className={
                canAfford
                  ? 'text-slate-800 dark:text-slate-200'
                  : 'text-red-500'
              }
            >
              {item.priceFlies}
            </span>
          </div>
        )}
      </div>

      {/* Equip Badge (Inventory Mode) */}
      <div className="w-3/4 mx-auto mt-1">
        {mode === 'inventory' && (
          <div
            className={cn(
              'h-8 w-full flex items-center justify-center rounded-lg text-xs font-black uppercase tracking-wide transition-colors', // Matched height and font to shop button
              isEquipped
                ? 'bg-green-600 text-white shadow-md'
                : 'bg-white/50 dark:bg-black/20 text-slate-500 group-hover:bg-purple-100 dark:group-hover:bg-purple-900/30 group-hover:text-purple-600'
            )}
          >
            {actionLoading ? '...' : isEquipped ? 'EQUIPPED' : 'EQUIP'}
          </div>
        )}

        {/* Buy Button (Shop Mode) */}
        {mode === 'shop' && (
          <Button
            size="sm"
            className={cn(
              'h-8 w-full font-black rounded-lg text-xs uppercase tracking-wide shadow-md transition-all active:scale-95', // Increased height and font
              canAfford
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white border border-purple-400/30'
                : 'bg-slate-200 text-slate-400 dark:bg-slate-800 cursor-not-allowed'
            )}
            disabled={actionLoading || !canAfford}
            onClick={(e) => {
              e.stopPropagation();
              onAction();
            }}
          >
            {actionLoading ? '...' : 'Buy'}
          </Button>
        )}
      </div>
    </div>
  );
}
