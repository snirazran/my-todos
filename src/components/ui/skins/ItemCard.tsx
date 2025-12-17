'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
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
}: {
  item: ItemDef;
  ownedCount: number;
  isEquipped: boolean;
  canAfford: boolean;
  onAction: () => void;
  actionLabel: React.ReactNode;
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
    [item.slot]: item.riveIndex,
  };

  const handleAction = () => {
    if (mode === 'shop' && !canAfford) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }
    if (!actionLoading) {
      onAction();
    }
  };

  const isSelected = (selectedCount || 0) > 0;

  return (
    <motion.div
      animate={shake ? { x: [-5, 5, -5, 5, 0] } : {}}
      transition={{ duration: 0.4 }}
      onClick={(e) => {
        if (mode === 'inventory' || mode === 'trade') handleAction();
      }}
      // UX TWEAK: Smaller padding on mobile (p-2.5) -> Normal on desktop (md:p-3.5)
      // Added min-h-[220px] to ensure card has presence even if image fails
      className={cn(
        'group relative flex flex-col p-2.5 md:p-3.5 transition-all duration-300 rounded-2xl md:rounded-[24px] border-[3px] overflow-hidden cursor-pointer min-h-[200px] active:scale-[0.98]',
        config.border,
        config.bg,
        isEquipped
          ? cn(config.shadow)
          : isSelected
          ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-500 dark:border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.4)]'
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
            className="absolute z-30 px-2 py-0.5 text-white bg-indigo-500 rounded-full shadow-md top-2 right-2 text-[10px] font-black"
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

      {/* Icon Container */}
      <div
        className={cn(
          'mt-4 mb-2 md:mt-5 md:mb-3 mx-auto w-full aspect-[1.1/1] md:aspect-[1.2/1] rounded-xl md:rounded-2xl flex items-center justify-center relative overflow-hidden',
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
            <div className="w-[110%] h-[110%] mb-2 drop-shadow-xl">
              <GiftRive />
            </div>
          ) : (
            <Frog
              className="w-[125%] h-[125%] object-contain translate-y-[10%] md:translate-y-[20%]"
              indices={previewIndices}
              width={180}
              height={180}
            />
          )}
        </div>

        {ownedCount > 0 && (
          <div className="absolute bottom-1 right-1 md:bottom-1.5 md:right-1.5 bg-black/50 backdrop-blur-sm text-white text-[9px] md:text-[10px] font-bold px-1.5 py-0.5 rounded-md md:rounded-lg shadow-sm border border-white/10 z-20">
            x{ownedCount}
          </div>
        )}
      </div>

      {/* Name & Price */}
      <div className="flex-1 flex flex-col items-center justify-end gap-1 md:gap-1.5 pb-1">
        <h4 className="w-full text-xs font-bold leading-tight text-center truncate md:text-sm text-slate-800 dark:text-slate-100">
          {item.name}
        </h4>

        {mode === 'shop' && (
          <div className="flex items-center justify-center gap-1 text-[10px] md:text-sm font-black bg-black/5 dark:bg-white/10 px-2 py-0.5 rounded-full">
            <Fly size={14} className="md:w-4 md:h-4" />
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

      {/* Actions */}
      <div className="w-full mx-auto mt-1 md:w-3/4">
        {(mode === 'inventory' || mode === 'trade') && (
          <div
            className={cn(
              'h-7 md:h-8 w-full flex items-center justify-center rounded-lg text-[10px] md:text-xs font-black uppercase tracking-wide transition-colors',
              isEquipped
                ? 'bg-green-600 text-white shadow-md'
                : isSelected
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-white/50 dark:bg-black/20 text-slate-500 group-hover:bg-purple-100 dark:group-hover:bg-purple-900/30 group-hover:text-purple-600'
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

        {mode === 'shop' && (
          <MotionButton
            size="sm"
            // Remove disabled attribute to allow click events for shake animation
            // We handle the logic in handleAction
            className={cn(
              'h-7 md:h-8 w-full font-black rounded-lg text-[10px] md:text-xs uppercase tracking-wide shadow-md overflow-hidden relative',
              canAfford
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white border border-purple-400/30'
                : 'bg-slate-200 text-slate-400 dark:bg-slate-800'
            )}
            onClick={(e) => {
              e.stopPropagation();
              handleAction();
            }}
            whileTap={canAfford ? { scale: 0.95 } : {}}
          >
            <AnimatePresence mode="wait">
              {actionLoading ? (
                <motion.div
                  key="loading"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                >
                  ...
                </motion.div>
              ) : (
                <motion.span
                  key="buy"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                >
                  Buy
                </motion.span>
              )}
            </AnimatePresence>
          </MotionButton>
        )}
      </div>
    </motion.div>
  );
}
