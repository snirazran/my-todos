'use client';

import React, { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import Fly from '@/components/ui/fly';
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
  isEquipped,
  canAfford,
  mode,
  actionLoading,
  confirming,
  onAction,
}: {
  item: BackgroundItem;
  owned: boolean;
  isEquipped: boolean;
  canAfford: boolean;
  mode: 'inventory' | 'shop';
  actionLoading: boolean;
  confirming?: boolean;
  onAction: (e: React.MouseEvent) => void;
}) {
  const config = RARITY_CONFIG[item.rarity];
  const [shake, setShake] = useState(false);
  const preview = item.images.mobile || item.images.tablet || item.images.web || item.images.webLarge;

  const handleClick = (e: React.MouseEvent) => {
    if (mode === 'shop' && !canAfford) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }
    if (!actionLoading) onAction(e);
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        'group relative flex flex-col p-2.5 pb-1 md:p-3.5 md:pb-1.5 transition-all duration-300 rounded-2xl border-[3px] overflow-hidden cursor-pointer active:scale-95 w-full max-w-[240px] lg:max-w-[360px] mx-auto',
        config.border,
        config.bg,
        isEquipped ? config.shadow : cn(config.shadow, config.hoverGlow),
        shake && 'animate-pulse',
      )}
    >
      {isEquipped && (
        <div className="absolute z-30 p-1 text-white bg-green-500 rounded-full shadow-md top-1.5 right-1.5">
          <Check className="w-3 h-3 md:w-3.5 md:h-3.5 stroke-[4]" />
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
      </div>

      <div className="px-1 pt-1 pb-1">
        <p className="text-xs md:text-sm font-black tracking-tight text-center text-foreground truncate">
          {item.name}
        </p>
      </div>

      <div className="w-full mx-auto mt-0 md:w-3/4">
        {mode === 'inventory' ? (
          <div
            className={cn(
              'h-7 md:h-8 w-full flex items-center justify-center rounded-lg text-[10px] md:text-xs font-black uppercase tracking-wide transition-colors',
              isEquipped
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'bg-muted text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary',
            )}
          >
            {actionLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isEquipped ? (
              'EQUIPPED'
            ) : (
              'EQUIP'
            )}
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
              owned
                ? 'text-emerald-600 dark:text-emerald-400'
                : canAfford
                  ? cn(config.text, 'hover:brightness-110')
                  : 'text-red-500 dark:text-red-400',
              actionLoading && 'opacity-60 cursor-wait',
            )}
          >
            {actionLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : owned ? (
              <span>OWNED</span>
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
    </div>
  );
}
