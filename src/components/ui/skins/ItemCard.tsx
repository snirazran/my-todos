'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Lock, Loader2, CircleDollarSign } from 'lucide-react';
import Fly from '@/components/ui/fly';
import { cn } from '@/lib/utils';
import type { ItemDef } from '@/lib/skins/catalog';
import Frog from '@/components/ui/frog';
import { motion, AnimatePresence } from 'framer-motion';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';

/* ---------------- Visual Helpers ---------------- */
// (Keep RARITY_CONFIG exactly as you had it - it was good)
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
    gradient:
      'from-muted/50 to-muted/20',
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

const MotionButton = motion(Button);

export function ItemCard({
  item,
  ownedCount,
  isEquipped,
  canAfford,
  onAction,
  actionLabel,
  actionLoading,
  mode,
  selectedCount,
  isNew,
  onSell, // NEW
}: {
  item: ItemDef;
  ownedCount: number;
  isEquipped: boolean;
  canAfford: boolean;
  onAction?: (e: React.MouseEvent) => void;
  onSell?: () => void; // NEW
  actionLabel?: React.ReactNode;
  actionLoading: boolean;
  mode: 'inventory' | 'shop' | 'trade';
  selectedCount?: number;
  isNew?: boolean;
}) {
  const config = RARITY_CONFIG[item.rarity];
  const isOwned = ownedCount > 0;
  const [shake, setShake] = useState(false);

  const previewIndices = {
    skin: 0,
    hat: 0,
    scarf: 0,
    hand_item: 0,
    glasses: 0,
    mood: 0,
    [item.slot]: item.riveIndex,
  };

  const handleAction = (e?: React.MouseEvent) => {
    if (mode === 'shop' && !canAfford) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }
    if (!actionLoading && onAction && e) {
      onAction(e);
    }
  };

  const isSelected = (selectedCount || 0) > 0;

  return (
    <motion.div
      animate={shake ? { x: [-5, 5, -5, 5, 0] } : {}}
      transition={{ duration: 0.4 }}
      onClick={(e) => {
        if (mode === 'inventory' || mode === 'trade') handleAction(e);
      }}
      // UX TWEAK: Smaller padding on mobile (p-2.5) -> Normal on desktop (md:p-3.5)
      // Added min-h-[220px] to ensure card has presence even if image fails
      className={cn(
        'group relative flex flex-col p-2.5 md:p-3.5 transition-all duration-300 rounded-2xl border-[3px] overflow-hidden cursor-pointer active:scale-95 w-full max-w-[240px] mx-auto',
        config.border,
        config.bg,
        isEquipped
          ? cn(config.shadow)
          : isSelected
          ? 'bg-primary/10 border-primary shadow-[0_0_15px_rgba(34,197,94,0.4)]'
          : cn(config.shadow, config.hoverGlow),
        !isOwned && mode === 'shop' && !canAfford && 'opacity-80'
      )}
    >
      {/* Selected Indicator */}
      <AnimatePresence>
        {isEquipped && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="absolute z-30 p-1 text-white bg-green-500 rounded-full shadow-md top-1.5 right-1.5"
          >
            <Check className="w-3 h-3 md:w-3.5 md:h-3.5 stroke-[4]" />
          </motion.div>
        )}
        {/* Trade Selection Count */}
        {mode === 'trade' && isSelected && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="absolute z-30 px-2 py-0.5 text-primary-foreground bg-primary rounded-full shadow-md top-2 right-2 text-[10px] font-black"
          >
            {selectedCount}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rarity Tag */}
      <div
        className={cn(
          'absolute top-0 left-0 px-2 py-1 md:px-2.5 rounded-br-2xl text-[9px] md:text-[10px] font-black uppercase tracking-wider border-b border-r z-20',
          config.bg,
          config.text,
          config.border
        )}
      >
        {config.label}
      </div>

      <div
        className={cn(
          'mt-4 mb-2 md:mt-5 md:mb-3 mx-auto w-full aspect-[1/0.75] md:aspect-[1.2/1] rounded-xl flex items-center justify-center relative overflow-hidden',
          'bg-gradient-to-br shadow-inner',
          config.gradient
        )}
      >
        <div className="absolute top-0 z-10 block w-1/2 h-full -skew-x-12 pointer-events-none -inset-full bg-gradient-to-r from-transparent to-white opacity-40 group-hover:animate-shine" />

        {/* NEW Badge (Moved) */}
        {isNew && (
          <div className="absolute top-0 left-0 z-50 px-2 py-1 text-[9px] font-black text-white bg-red-500 rounded-br-xl shadow-sm animate-pulse">
            NEW
          </div>
        )}

        <div className="absolute inset-0 z-10 flex items-end justify-center">
          {item.slot === 'container' ? (
            <div className="w-[110%] h-[110%] -translate-y-1 drop-shadow-xl">
              <GiftRive />
            </div>
          ) : (
            <Frog
              className="w-[125%] h-[125%] object-contain translate-y-[10%] md:translate-y-[10%]"
              indices={previewIndices}
              width={180}
              height={180}
            />
          )}
        </div>

        {ownedCount > 0 && (
          <div className="absolute top-1 right-1 md:top-1.5 md:right-1.5 bg-black/50 backdrop-blur-sm text-white text-[9px] md:text-[10px] font-bold px-1.5 py-0.5 rounded-md md:rounded-lg shadow-sm border border-white/10 z-20">
            x{ownedCount}
          </div>
        )}
      </div>

      {/* Name & Price */}
      <div className="flex-1 flex flex-col items-center justify-end gap-1 md:gap-1.5 pb-1">
        <h4 className="w-full text-xs font-bold leading-tight text-center truncate md:text-sm text-foreground">
          {item.name}
        </h4>


      </div>

      {/* Actions */}
      <div className="w-full mx-auto mt-1 md:w-3/4">
        {(mode === 'inventory' || mode === 'trade') && (
          <div
            className={cn(
              'h-7 md:h-8 w-full flex items-center justify-center rounded-lg text-[10px] md:text-xs font-black uppercase tracking-wide transition-colors',
              isEquipped
                ? 'bg-green-600 text-white shadow-md'
                : isSelected
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'bg-muted text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary'
            )}
          >
            {actionLoading
              ? '...'
              : mode === 'trade'
              ? isSelected
                ? 'SELECTED'
                : 'SELECT'
              : item.slot === 'container'
              ? 'OPEN'
              : isEquipped
              ? 'EQUIPPED'
              : 'EQUIP'}
          </div>
        )}

        {/* Shop Button */}
        {mode === 'shop' && (
          <Button
            key="buy"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              onAction?.(e);
            }}
            disabled={!canAfford || actionLoading}
            className={cn(
              'w-full font-bold transition-all duration-300 shadow-sm active:scale-95 h-7 md:h-8 rounded-lg text-[10px] md:text-xs uppercase tracking-wide',
              canAfford
                ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-primary/25'
                : 'bg-secondary text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 cursor-not-allowed opacity-100', // High contrast error state
              actionLoading && 'opacity-80 cursor-wait'
            )}
          >
            {actionLoading ? (
              <span>...</span>
            ) : (
              <span className="flex items-center gap-1">
                {ownedCount > 0 ? 'Buy' : 'Buy'}
                <span className={cn("mx-1", canAfford ? "opacity-40" : "opacity-40 text-red-400")}>|</span>
                <Fly size={18} className={cn(canAfford ? "opacity-80" : "opacity-100")} y={-2} />
                <span className={cn(canAfford ? "" : "font-black")}>{item.priceFlies}</span>
              </span>
            )}
          </Button>
        )}

        {/* Sell Button (Inventory Mode) */}
        {mode === 'inventory' && onSell && (item.priceFlies ?? 0) > 0 && (
          <div className="mt-2 text-center w-full">
            <Button
              variant="ghost"
              size="sm"
               onClick={(e) => {
                 e.stopPropagation();
                 onSell();
               }}
               className="w-full h-7 rounded-lg text-[10px] font-bold uppercase tracking-wide text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 border border-transparent hover:border-red-200 dark:hover:border-red-900 transition-all shadow-none hover:shadow-sm active:scale-95 gap-1.5"
            >
              <span className="flex items-center gap-1">
                Sell
                <span className="mx-1 opacity-40">|</span>
                <Fly size={18} className="opacity-80" y={-3} />
                +{Math.floor((item.priceFlies || 0) / 2)}
              </span>
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
