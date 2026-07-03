'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import Fly from '@/components/ui/fly';
import { Button } from '@/components/ui/button';
import type { BackgroundItem, BackgroundRarity } from '@/hooks/useBackgrounds';

const RARITY_CONFIG: Record<
  BackgroundRarity,
  { border: string; bg: string; text: string; label: string; gradient: string; shadow: string; hoverGlow: string }
> = {
  common: {
    border: 'border-border',
    bg: 'bg-card',
    text: 'text-muted-foreground',
    label: 'Common',
    gradient: 'from-muted/50 to-muted/20',
    shadow: 'shadow-sm',
    hoverGlow: 'hover:shadow-[0_0_20px_rgba(148,163,184,0.1)]',
  },
  uncommon: {
    border: 'border-emerald-500',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    text: 'text-emerald-700 dark:text-emerald-400',
    label: 'Uncommon',
    gradient: 'from-emerald-100 to-emerald-50 dark:from-emerald-900/40 dark:to-emerald-950/40',
    shadow: 'shadow-emerald-500/15',
    hoverGlow: 'hover:shadow-[0_0_20px_rgba(16,185,129,0.5)]',
  },
  rare: {
    border: 'border-sky-500',
    bg: 'bg-sky-50 dark:bg-sky-950/30',
    text: 'text-sky-700 dark:text-sky-400',
    label: 'Rare',
    gradient: 'from-sky-100 to-sky-50 dark:from-sky-900/40 dark:to-sky-950/40',
    shadow: 'shadow-sky-500/15',
    hoverGlow: 'hover:shadow-[0_0_20px_rgba(14,165,233,0.5)]',
  },
  epic: {
    border: 'border-violet-500',
    bg: 'bg-violet-50 dark:bg-violet-950/30',
    text: 'text-violet-700 dark:text-violet-400',
    label: 'Epic',
    gradient: 'from-violet-100 to-violet-50 dark:from-violet-900/40 dark:to-violet-950/40',
    shadow: 'shadow-violet-500/20',
    hoverGlow: 'hover:shadow-[0_0_20px_rgba(139,92,246,0.5)]',
  },
  legendary: {
    border: 'border-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    text: 'text-amber-700 dark:text-amber-400',
    label: 'Legendary',
    gradient: 'from-amber-100 to-amber-50 dark:from-amber-900/40 dark:to-amber-950/40',
    shadow: 'shadow-amber-500/25',
    hoverGlow: 'hover:shadow-[0_0_20px_rgba(245,158,11,0.5)]',
  },
};

export function BackgroundCard({
  item,
  owned,
  ownedCount = 0,
  isEquipped,
  canAfford,
  mode,
  actionLoading,
  confirming,
  selectedCount = 0,
  onAction,
  onSell,
}: {
  item: BackgroundItem;
  owned: boolean;
  ownedCount?: number;
  isEquipped: boolean;
  canAfford: boolean;
  mode: 'inventory' | 'shop' | 'trade';
  actionLoading: boolean;
  confirming?: boolean;
  selectedCount?: number;
  onAction: (e: React.MouseEvent) => void;
  onSell?: () => void;
}) {
  const config = RARITY_CONFIG[item.rarity];
  const preview = item.images.mobile || item.images.tablet || item.images.web || item.images.webLarge;
  const isSelected = selectedCount > 0;
  const prevEquippedRef = useRef(isEquipped);
  const [equipPulse, setEquipPulse] = useState<'on' | 'off' | null>(null);

  useEffect(() => {
    if (prevEquippedRef.current === isEquipped) return;
    prevEquippedRef.current = isEquipped;
    setEquipPulse(isEquipped ? 'on' : 'off');
  }, [isEquipped]);

  const handleClick = (e: React.MouseEvent) => {
    if (!actionLoading) onAction(e);
  };

  return (
    <motion.div
      onClick={handleClick}
      whileTap={{ scale: 0.95 }}
      animate={
        equipPulse === 'on'
          ? { scale: [1, 1.05, 1] }
          : equipPulse === 'off'
            ? { scale: [1, 0.97, 1] }
            : { scale: 1 }
      }
      transition={
        equipPulse
          ? { duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }
          : { type: 'spring', stiffness: 500, damping: 30 }
      }
      onAnimationComplete={() => setEquipPulse(null)}
      className={cn(
        'group relative flex flex-col p-2.5 pb-1 md:p-3.5 md:pb-1.5 transition-[color,background-color,border-color,box-shadow] duration-300 rounded-2xl border-[3px] overflow-hidden cursor-pointer w-full max-w-[240px] lg:max-w-[360px] mx-auto',
        config.border,
        config.bg,
        isEquipped
          ? cn(
              config.shadow,
              'ring-2 ring-green-500/80 ring-offset-2 ring-offset-background',
            )
          : cn(config.shadow, config.hoverGlow),
        isSelected && 'border-primary ring-2 ring-primary/30',
      )}
    >
      {isEquipped && (
        <div className="absolute z-30 p-1 text-white bg-green-500 rounded-full shadow-md top-1.5 right-1.5">
          <Check className="w-3 h-3 md:w-3.5 md:h-3.5 stroke-[4]" />
        </div>
      )}
      {mode === 'trade' && isSelected && (
        <div className="absolute z-30 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-black text-primary-foreground shadow-md top-1.5 right-1.5">
          {selectedCount}
        </div>
      )}

      <div
        className={cn(
          'absolute top-0 left-0 px-2 py-1 md:px-2.5 rounded-br-2xl text-[9px] md:text-[10px] font-black uppercase tracking-wider border-b border-r z-20',
          config.bg,
          config.text,
          config.border,
        )}
      >
        {config.label}
      </div>

      <div
        className={cn(
          'mt-4 mb-1 md:mt-5 md:mb-2 mx-auto w-full aspect-[1/0.75] md:aspect-[1.2/1] rounded-xl flex items-center justify-center relative overflow-hidden bg-gradient-to-br shadow-inner',
          config.gradient,
        )}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt={item.name}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <span className="relative text-xs font-bold opacity-60">No image</span>
        )}

        {equipPulse === 'on' && (
          <motion.div
            initial={{ opacity: 0.6, scale: 0.7 }}
            animate={{ opacity: 0, scale: 1.4 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            className="absolute inset-0 z-20 rounded-xl pointer-events-none bg-[radial-gradient(circle,rgba(74,222,128,0.55)_0%,transparent_70%)]"
          />
        )}

        {ownedCount > 0 && (
          <div className="absolute top-1 right-1 md:top-1.5 md:right-1.5 bg-black/50 backdrop-blur-sm text-white text-[9px] md:text-[10px] font-bold px-1.5 py-0.5 rounded-md md:rounded-lg shadow-sm border border-white/10 z-20">
            x{ownedCount}
          </div>
        )}
      </div>

      <div className="w-full mx-auto mt-2 md:w-3/4">
        {mode === 'inventory' ? (
          <>
            <div
              className={cn(
                'h-7 md:h-8 w-full flex items-center justify-center gap-1 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-wide transition-colors duration-200',
                isEquipped
                  ? 'bg-green-500 text-white shadow-md'
                  : 'bg-muted text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary',
              )}
            >
              {actionLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isEquipped ? (
                <>
                  <Check className="w-3 h-3 md:w-3.5 md:h-3.5 stroke-[4]" />
                  <span>Equipped</span>
                </>
              ) : (
                <span>Equip</span>
              )}
            </div>
            {onSell && (item.priceFlies ?? 0) > 0 && (
              <div className="mt-1 text-center w-full">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSell();
                  }}
                  className="w-full h-5 rounded-md text-[9px] font-bold uppercase tracking-wide text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 border border-transparent hover:border-red-200 dark:hover:border-red-900 transition-all shadow-none active:scale-95 gap-1 px-1"
                >
                  <span className="flex items-center gap-0.5">
                    Sell
                    <span className="mx-0.5 opacity-40">|</span>
                    <Fly size={14} className="opacity-80" y={-2} paused={true} />+
                    {Math.floor((item.priceFlies || 0) / 2)}
                  </span>
                </Button>
              </div>
            )}
          </>
        ) : mode === 'trade' ? (
          <div
            className={cn(
              'h-7 md:h-8 w-full flex items-center justify-center rounded-lg text-[10px] md:text-xs font-black uppercase tracking-wide transition-colors',
              isSelected
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'bg-muted text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary',
            )}
          >
            {isSelected ? 'SELECTED' : 'SELECT'}
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleClick(e);
            }}
            disabled={actionLoading}
            className={cn(
              'group/buy w-full flex items-center justify-center gap-1 h-8 text-sm md:text-base font-black tracking-tight transition-colors active:scale-95 bg-transparent border-0 shadow-none',
              canAfford
                ? cn(config.text, 'hover:brightness-110')
                : 'text-red-500 dark:text-red-400',
              actionLoading && 'opacity-60 cursor-wait',
            )}
          >
            {actionLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : confirming ? (
              <span>CONFIRM</span>
            ) : (
              <>
                <Fly size={22} className="transition-transform group-hover/buy:scale-110" y={-3} paused={true} />
                <span className="tabular-nums leading-none">{item.priceFlies}</span>
              </>
            )}
          </button>
        )}
      </div>
    </motion.div>
  );
}
