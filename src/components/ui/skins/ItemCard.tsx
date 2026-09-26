'use client';

import React, { memo, useMemo, useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Check, ChevronDown, Info, Loader2, Repeat } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import Fly from '@/components/ui/fly';
import { cn } from '@/lib/utils';
import { isTradeOnlyRarity } from '@/lib/skins/catalog';
import type { ItemDef, Rarity } from '@/lib/skins/catalog';
import { RarityCornerBadge } from './RarityCornerBadge';
import { StackBadge } from './StackBadge';
import Frog from '@/components/ui/frog';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
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

const MotionButton = motion(Button);

function ItemCardComponent({
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
  customAction,
  customPreview,
  hidePrice,
  hideRarity,
  hideDropRates,
  staticPreview = false,
  deferPreview = false,
  pausePreview = false,
  previewDelayMs = 0,
  previewRootMargin = '520px',
  previewUnmountDelayMs = 2400,
  previewClassName,
  previewTopLeftBadge,
  giftAnimation,
  centerFrogPreview = false,
  compact = false,
}: {
  item: ItemDef;
  ownedCount: number;
  isEquipped: boolean;
  canAfford: boolean;
  onAction?: (e: React.MouseEvent) => void;
  actionLabel?: React.ReactNode;
  actionLoading: boolean;
  mode: 'inventory' | 'shop' | 'trade';
  selectedCount?: number;
  isNew?: boolean;
  customAction?: React.ReactNode;
  customPreview?: React.ReactNode;
  hidePrice?: boolean;
  hideRarity?: boolean;
  hideDropRates?: boolean;
  staticPreview?: boolean;
  deferPreview?: boolean;
  pausePreview?: boolean;
  previewDelayMs?: number;
  previewRootMargin?: string;
  previewUnmountDelayMs?: number;
  previewClassName?: string;
  previewTopLeftBadge?: React.ReactNode;
  /** Optional gift-box animation override (e.g. 'box_shake'). */
  giftAnimation?: string;
  centerFrogPreview?: boolean;
  compact?: boolean;
}) {
  const config = RARITY_CONFIG[item.rarity];
  const isOwned = ownedCount > 0;
  const tradeOnly = isTradeOnlyRarity(item.rarity);
  const cardRef = useRef<HTMLDivElement>(null);
  const prevEquippedRef = useRef(isEquipped);
  const [equipPulse, setEquipPulse] = useState<'on' | 'off' | null>(null);

  useEffect(() => {
    if (prevEquippedRef.current === isEquipped) return;
    prevEquippedRef.current = isEquipped;
    setEquipPulse(isEquipped ? 'on' : 'off');
  }, [isEquipped]);
  const [nearViewport, setNearViewport] = useState(false);
  const [previewReady, setPreviewReady] = useState(!deferPreview);
  const [previewMounted, setPreviewMounted] = useState(!deferPreview);
  const shouldShowPlaceholder =
    staticPreview || (deferPreview && (!previewMounted || !previewReady));

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setNearViewport(entry.isIntersecting),
      { rootMargin: previewRootMargin, threshold: [0, 0.01] },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [previewRootMargin]);

  useEffect(() => {
    if (!deferPreview) {
      setPreviewReady(true);
      return;
    }

    if (!nearViewport || previewReady) return;

    const timer = window.setTimeout(() => {
      setPreviewMounted(true);
      setPreviewReady(true);
    }, previewDelayMs);

    return () => window.clearTimeout(timer);
  }, [deferPreview, nearViewport, previewDelayMs, previewReady]);

  useEffect(() => {
    if (!deferPreview || !previewReady || nearViewport) return;

    const timer = window.setTimeout(() => {
      setPreviewMounted(false);
      setPreviewReady(false);
    }, previewUnmountDelayMs);

    return () => window.clearTimeout(timer);
  }, [deferPreview, nearViewport, previewReady, previewUnmountDelayMs]);

  const previewIndices = useMemo(
    () => ({
      skin: item.slot === 'skin' ? item.riveIndex : 0,
      mood: 0,
      hat: item.slot === 'hat' ? item.riveIndex : 0,
      body: item.slot === 'body' ? item.riveIndex : 0,
      hand_item: item.slot === 'hand_item' ? item.riveIndex : 0,
    }),
    [item.riveIndex, item.slot],
  );

  const handleAction = (e?: React.MouseEvent) => {
    if (!actionLoading && onAction && e) {
      onAction(e);
    }
  };

  const isSelected = (selectedCount || 0) > 0;
  const previewCanvasSize: number | string = compact ? '130%' : 180;
  const centerFrog =
    centerFrogPreview && item.slot !== 'container' && !customPreview;
  const frogPreviewClassName = cn(
    centerFrog
      ? compact
        ? 'shrink-0 object-contain -translate-y-2'
        : 'object-contain -translate-y-3'
      : 'w-[125%] h-[125%] object-contain translate-y-[10%] min-[375px]:translate-y-[2%] min-[425px]:-translate-y-[4%] md:-translate-y-[5%]',
    previewClassName,
  );

  return (
    <motion.div
      ref={cardRef}
      onClick={(e) => {
        if (mode === 'inventory' || mode === 'trade' || mode === 'shop')
          handleAction(e);
      }}
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
      // UX TWEAK: Smaller padding on mobile (p-2.5) -> Normal on desktop (md:p-3.5)
      // Added min-h-[220px] to ensure card has presence even if image fails
      className={cn(
        'group relative flex flex-col transition-[color,background-color,border-color,box-shadow] duration-300 overflow-hidden cursor-pointer w-full max-w-[240px] lg:max-w-[360px] mx-auto',
        compact
          ? 'p-1.5 pb-0 md:p-2 md:pb-0.5 rounded-xl border-2'
          : 'p-2.5 pb-1 md:p-3.5 md:pb-1.5 rounded-2xl border-[3px]',
        compact &&
          (mode === 'trade' ||
            (mode === 'inventory' && item.slot !== 'container')) &&
          'pb-1.5 md:pb-2',
        config.border,
        config.bg,
        isEquipped
          ? cn(
              config.shadow,
              'ring-2 ring-green-500/80 ring-offset-2 ring-offset-background',
            )
          : isSelected
            ? 'bg-primary/10 border-primary shadow-[0_0_15px_rgba(34,197,94,0.4)]'
            : cn(config.shadow, config.hoverGlow),
      )}
    >
      {/* Selected Indicator */}
      <AnimatePresence>
        {isEquipped && !customAction && !compact && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 550, damping: 18 }}
            className="absolute z-30 p-1 text-white bg-green-500 rounded-full shadow-md top-1.5 right-1.5"
          >
            <Check className="w-3 h-3 md:w-3.5 md:h-3.5 stroke-[4]" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rarity Tag */}
      {!hideRarity && <RarityCornerBadge rarity={item.rarity} />}

      <div
        className={cn(
          compact
            ? 'mt-0 mb-0.5 aspect-square rounded-lg'
            : 'mt-4 mb-1 md:mt-5 md:mb-2 aspect-[1/0.75] md:aspect-[1.2/1] rounded-xl',
          'mx-auto w-full flex items-center justify-center relative overflow-hidden',
          'bg-gradient-to-br shadow-inner',
          config.gradient,
        )}
      >
        {/* NEW Badge */}
        {isNew && (
          <div className="absolute bottom-0 left-0 z-20 px-2 py-1 text-[9px] font-black text-white bg-red-500 rounded-tr-xl shadow-sm animate-pulse">
            NEW
          </div>
        )}

        <div
          className={cn(
            'absolute inset-0 z-10 flex justify-center',
            centerFrog ? 'items-center' : 'items-end',
          )}
        >
          {shouldShowPlaceholder ? (
            <LightweightItemPreview
              item={item}
              toneClassName={config.text}
            />
          ) : customPreview ? (
            customPreview
          ) : item.slot === 'container' ? (
            <div
              className={cn(
                'w-[110%] h-[110%] -translate-y-1 drop-shadow-xl',
                giftAnimation && '-translate-y-2.5',
                previewClassName,
              )}
            >
              <GiftRive color={item.riveIndex} paused={pausePreview} animation={giftAnimation} />
            </div>
          ) : pausePreview ? (
            <FrogSnapshot
              className={frogPreviewClassName}
              indices={previewIndices}
              width={previewCanvasSize}
              height={previewCanvasSize}
              visualOffsetY={centerFrog ? 0 : undefined}
            />
          ) : (
            <Frog
              className={frogPreviewClassName}
              indices={previewIndices}
              width={previewCanvasSize}
              height={previewCanvasSize}
              visualOffsetY={centerFrog ? 0 : undefined}
              paused={false}
            />
          )}
        </div>

        {equipPulse === 'on' && (
          <motion.div
            initial={{ opacity: 0.6, scale: 0.7 }}
            animate={{ opacity: 0, scale: 1.4 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            className="absolute inset-0 z-20 rounded-xl pointer-events-none bg-[radial-gradient(circle,rgba(74,222,128,0.55)_0%,transparent_70%)]"
          />
        )}

        {mode === 'shop' ? (
          isOwned && (
            <div className="absolute top-1 right-1 z-20 flex items-center gap-0.5 rounded-md bg-green-500 px-1.5 py-0.5 text-[9px] font-black text-white shadow-sm md:top-1.5 md:right-1.5 md:text-[10px]">
              <Check className="h-2.5 w-2.5 stroke-[4]" />
              {ownedCount > 1 ? `x${ownedCount}` : 'Owned'}
            </div>
          )
        ) : (
          (ownedCount > 1 || (mode === 'trade' && isSelected)) && (
            <StackBadge
              owned={ownedCount}
              selected={mode === 'trade' ? selectedCount || 0 : 0}
            />
          )
        )}
        <AnimatePresence>
          {mode === 'trade' && isSelected && !customAction && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 550, damping: 18 }}
              className="absolute bottom-1 right-1 z-20 rounded-full bg-primary p-1 text-primary-foreground shadow-md"
            >
              <Check className="h-3 w-3 stroke-[4]" />
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {compact && isEquipped && !customAction && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 550, damping: 18 }}
              className="absolute bottom-1 right-1 z-20 p-1 text-white bg-green-500 rounded-full shadow-md"
            >
              <Check className="w-3 h-3 stroke-[4]" />
            </motion.div>
          )}
        </AnimatePresence>
        {previewTopLeftBadge ? (
          <div className="absolute left-1 top-1 z-20 md:left-1.5 md:top-1.5">
            {previewTopLeftBadge}
          </div>
        ) : null}
      </div>

      {/* Actions */}
      <div className="w-full mx-auto mt-0 md:w-3/4">
        {/* Custom Action (e.g. Claim) */}
        {customAction && (
          <div className="w-full" onClick={(e) => e.stopPropagation()}>
            {customAction}
          </div>
        )}

        {/* Shop Button */}
        {mode === 'shop' && !customAction && (
          <button
            key="buy"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAction?.(e);
            }}
            disabled={actionLoading}
            className={cn(
              'group/buy w-full flex items-center justify-center gap-1 font-black tracking-tight transition-colors active:scale-95 bg-transparent border-0 shadow-none',
              compact ? 'h-7 text-xs md:text-sm' : 'h-8 text-sm md:text-base',
              tradeOnly
                ? cn(config.text, 'hover:brightness-110')
                : canAfford
                  ? compact
                    ? 'text-foreground hover:brightness-110'
                    : cn(config.text, 'hover:brightness-110')
                  : 'text-red-500 dark:text-red-400',
              actionLoading && 'opacity-60 cursor-wait',
            )}
          >
            {actionLoading ? (
              <span>...</span>
            ) : actionLabel ? (
              <span>{actionLabel}</span>
            ) : tradeOnly ? (
              <span className="inline-flex items-center gap-1 text-[12px] md:text-[13px]">
                <Repeat
                  className="h-3 w-3 md:h-3.5 md:w-3.5"
                  strokeWidth={3}
                />
                Trade only
              </span>
            ) : (
              <>
                <Fly
                  size={compact ? 26 : 22}
                  className="transition-transform group-hover/buy:scale-110"
                  y={compact ? -2 : -3}
                  paused={true}
                />
                <span className="tabular-nums leading-none">{item.priceFlies}</span>
              </>
            )}
          </button>
        )}

        {/* Equip Status Bar (Inventory Mode) */}
        {mode === 'inventory' &&
          !compact &&
          !customAction &&
          item.slot !== 'container' && (
          <div
            className={cn(
              'h-7 md:h-8 w-full flex items-center justify-center gap-1 rounded-lg text-[12px] md:text-[13px] font-black tracking-wide transition-colors duration-200',
              isEquipped
                ? 'bg-green-500 text-white shadow-md'
                : 'bg-primary/15 text-primary border border-primary/30 group-hover:bg-primary/25',
            )}
          >
            {isEquipped ? (
              <>
                <Check className="w-3 h-3 md:w-3.5 md:h-3.5 stroke-[4]" />
                <span>Equipped</span>
              </>
            ) : (
              <span>Equip</span>
            )}
          </div>
        )}

        {/* Drop Rates Button (Containers only) */}
        {item.slot === 'container' && !hideDropRates && (
          <DropRatesButton giftId={item.id} name={item.name} />
        )}
      </div>
    </motion.div>
  );
}

export const ItemCard = memo(ItemCardComponent);

function LightweightItemPreview({
  item,
  toneClassName,
}: {
  item: ItemDef;
  toneClassName: string;
}) {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
      <PreviewSkeleton toneClassName={toneClassName} />
    </div>
  );
}

function PreviewSkeleton({
  toneClassName,
}: {
  toneClassName: string;
}) {
  return (
    <div
      className={cn(
        'absolute inset-0 overflow-hidden rounded-xl',
        toneClassName,
      )}
    >
      <div className="absolute inset-y-[-24%] left-0 w-1/3 bg-gradient-to-r from-transparent via-white/65 to-transparent opacity-90 animate-[shine_1.35s_ease-in-out_8_both] dark:via-current dark:opacity-20" />
    </div>
  );
}

/* ─── DROP RATES BUTTON + POPUP ─────────────────────── */

const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

// Gradient-tinted tile styling, matching the rarity look of the item cards.
const RARITY_TILE: Record<Rarity, { gradient: string; border: string; text: string; dot: string }> = {
  common: {
    gradient: 'from-slate-100 to-slate-50 dark:from-slate-800/60 dark:to-slate-900/40',
    border: 'border-slate-300/70 dark:border-slate-700',
    text: 'text-slate-600 dark:text-slate-300',
    dot: 'bg-slate-400',
  },
  uncommon: {
    gradient: 'from-emerald-100 to-emerald-50 dark:from-emerald-900/40 dark:to-emerald-950/40',
    border: 'border-emerald-400/70 dark:border-emerald-600/70',
    text: 'text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  rare: {
    gradient: 'from-sky-100 to-sky-50 dark:from-sky-900/40 dark:to-sky-950/40',
    border: 'border-sky-400/70 dark:border-sky-600/70',
    text: 'text-sky-700 dark:text-sky-300',
    dot: 'bg-sky-500',
  },
  epic: {
    gradient: 'from-violet-100 to-violet-50 dark:from-violet-900/40 dark:to-violet-950/40',
    border: 'border-violet-400/70 dark:border-violet-600/70',
    text: 'text-violet-700 dark:text-violet-300',
    dot: 'bg-violet-500',
  },
  legendary: {
    gradient: 'from-amber-100 to-amber-50 dark:from-amber-900/40 dark:to-amber-950/40',
    border: 'border-amber-400/70 dark:border-amber-600/70',
    text: 'text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
};

const formatChance = (pct: number) =>
  pct >= 10
    ? `${Math.round(pct)}%`
    : pct >= 1
      ? `${Number(pct.toFixed(1))}%`
      : pct >= 0.01
        ? `${pct.toFixed(2)}%`
        : pct > 0
          ? `${pct.toFixed(4)}%`
          : '0%';

type GiftDropRate = {
  itemId: string;
  chance: number;
  item?: ItemDef;
};

type GiftRarityDropRate = {
  rarity: Rarity;
  chance: number;
};

/** The published mechanics behind the table — randomised rewards must disclose
 *  them. The player's own counter is deliberately never shown as a number. */
type GiftMechanics = {
  luckPerReveal: number;
  softPityLuck: number;
  softPityBonusPoints: number;
  hardPityLuck: number;
  epicPityLuck: number;
  backgroundSharePercent: number;
  newFirstWeight: number;
  wishlistRedirectPercent: number;
  tierBumpEnabled: boolean;
};

function DropRatesButton({ giftId, name }: { giftId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const closingRef = React.useRef(false);

  const handleClose = () => {
    setOpen(false);
    // Block card click for a tick after popup closes
    closingRef.current = true;
    setTimeout(() => { closingRef.current = false; }, 100);
  };

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (closingRef.current) return;
          setOpen(true);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="mt-1.5 w-full flex items-center justify-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors py-1 rounded-lg hover:bg-muted/50"
      >
        <Info className="w-3 h-3" />
        Drop Rates
      </button>

      <DropRatesPopup open={open} giftId={giftId} name={name} onClose={handleClose} />
    </>
  );
}

/** The same odds sheet as {@link DropRatesButton}, sized for a compact card
 *  that has no room for a labelled row. */
export function GiftOddsButton({
  giftId,
  name,
  className,
}: {
  giftId: string;
  name: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const closingRef = useRef(false);

  const handleClose = () => {
    setOpen(false);
    closingRef.current = true;
    setTimeout(() => {
      closingRef.current = false;
    }, 300);
  };

  return (
    <>
      <button
        type="button"
        aria-label={`Drop rates for ${name}`}
        title="Drop rates"
        onClick={(e) => {
          e.stopPropagation();
          if (closingRef.current) return;
          setOpen(true);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className={cn(
          'flex h-6 w-6 touch-manipulation items-center justify-center rounded-full border border-border/70 bg-background/90 text-[11px] font-black leading-none text-muted-foreground shadow-sm backdrop-blur transition-colors hover:border-primary/40 hover:text-foreground active:scale-95',
          className,
        )}
      >
        <Info className="h-3.5 w-3.5" strokeWidth={2.75} />
      </button>

      <DropRatesPopup
        open={open}
        giftId={giftId}
        name={name}
        onClose={handleClose}
      />
    </>
  );
}

function DropRatesPopup({
  open,
  giftId,
  name,
  onClose,
}: {
  open: boolean;
  giftId: string;
  name: string;
  onClose: () => void;
}) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const [drops, setDrops] = useState<GiftDropRate[]>([]);
  const [rarityDrops, setRarityDrops] = useState<GiftRarityDropRate[]>([]);
  const [dropMode, setDropMode] = useState<'item' | 'rarity'>('item');
  const [mechanics, setMechanics] = useState<GiftMechanics | null>(null);
  const [loading, setLoading] = useState(true);
  React.useEffect(() => {
    if (!open) return;
    setRulesOpen(false);
    let cancelled = false;
    setLoading(true);
    fetch(`/api/skins/gift-drops?giftId=${encodeURIComponent(giftId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setDrops(data.drops ?? []);
        setRarityDrops(data.rarityDrops ?? []);
        setDropMode(data.dropMode === 'rarity' ? 'rarity' : 'item');
        setMechanics(data.mechanics ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setDrops([]);
          setRarityDrops([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [giftId, open]);

  // Rarity mode: one row per rarity bucket (no per-item list).
  const rarityTotal = rarityDrops.reduce((sum, d) => sum + Math.max(0, d.chance), 0);
  const rarityRows = RARITY_ORDER.map((rarity) => {
    const weight = rarityDrops.find((d) => d.rarity === rarity)?.chance ?? 0;
    return { rarity, pct: rarityTotal > 0 ? (weight / rarityTotal) * 100 : 0, weight };
  })
    .filter((row) => row.weight > 0)
    .sort((a, b) => b.pct - a.pct);

  // Item mode: items grouped under their rarity, with a bucket total.
  const itemTotal = drops.reduce((sum, d) => sum + Math.max(0, d.chance), 0);
  const itemGroups = RARITY_ORDER.map((rarity) => {
    const items = drops
      .filter((d) => (d.item?.rarity ?? 'common') === rarity && d.chance > 0)
      .sort((a, b) => b.chance - a.chance);
    const bucket = items.reduce((sum, d) => sum + d.chance, 0);
    return { rarity, items, pct: itemTotal > 0 ? (bucket / itemTotal) * 100 : 0 };
  }).filter((group) => group.items.length > 0);

  const isRarityMode = dropMode === 'rarity';
  const hasContent = isRarityMode ? rarityRows.length > 0 : itemGroups.length > 0;

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <span
      className="contents"
      onClick={stop}
      onMouseDown={stop}
      onPointerDown={stop}
    >
      <BaseSheet
        open={open}
        onOpenChange={(v) => {
          if (!v) onClose();
        }}
        className="max-h-[85dvh] sm:max-w-[400px]"
        zIndex={1300}
        closeAriaLabel="Close drop rates"
      >
        {({ bindScroll }) => (
          <div
            ref={bindScroll}
            className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3 sm:px-6 sm:pb-6 sm:pt-6"
          >
            <div className="pr-12">
              <p className="text-[12px] font-black text-muted-foreground">
                {isRarityMode ? 'Chance for each rarity' : 'Drop rates'}
              </p>
              <h3 className="truncate text-xl font-black tracking-tight text-foreground">
                {name}
              </h3>
            </div>

            <div className="mt-4">
              {loading ? (
                <div className="space-y-2">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-12 animate-pulse rounded-2xl bg-muted/60"
                    />
                  ))}
                </div>
              ) : !hasContent ? (
                <div className="rounded-2xl border border-border/50 bg-muted/30 p-4 text-center text-xs font-bold text-muted-foreground">
                  No drops configured.
                </div>
              ) : isRarityMode ? (
                <div className="space-y-2">
                  {rarityRows.map((row, i) => (
                    <DropRateRow
                      key={row.rarity}
                      rarity={row.rarity}
                      pct={row.pct}
                      index={i}
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {itemGroups.map((group, i) => (
                    <DropRateRow
                      key={group.rarity}
                      rarity={group.rarity}
                      pct={group.pct}
                      index={i}
                    >
                      {group.items.map((drop) => {
                        const raw =
                          itemTotal > 0 ? (drop.chance / itemTotal) * 100 : 0;
                        return (
                          <div
                            key={drop.itemId}
                            className="flex items-center justify-between gap-2"
                          >
                            <span className="truncate text-xs font-bold text-foreground">
                              {drop.item?.name ?? drop.itemId}
                            </span>
                            <span className="shrink-0 text-[11px] font-black tabular-nums text-muted-foreground">
                              {formatChance(raw)}
                            </span>
                          </div>
                        );
                      })}
                    </DropRateRow>
                  ))}
                </div>
              )}
            </div>

            {!loading && mechanics && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setRulesOpen((v) => !v)}
                  aria-expanded={rulesOpen}
                  className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl text-[13px] font-black text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  <Info className="h-4 w-4" strokeWidth={2.5} />
                  How the draw works
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 transition-transform duration-200',
                      rulesOpen && 'rotate-180',
                    )}
                    strokeWidth={2.5}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {rulesOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                      className="overflow-hidden"
                    >
                      <GiftMechanicsNote mechanics={mechanics} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        )}
      </BaseSheet>
    </span>
  );
}

function DropRateRow({
  rarity,
  pct,
  index,
  children,
}: {
  rarity: Rarity;
  pct: number;
  index: number;
  children?: React.ReactNode;
}) {
  const tile = RARITY_TILE[rarity];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: index * 0.04,
        type: 'spring',
        stiffness: 400,
        damping: 28,
      }}
      className={cn(
        'overflow-hidden rounded-2xl border bg-gradient-to-br shadow-sm',
        tile.border,
        tile.gradient,
      )}
    >
      <div className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', tile.dot)} />
          <span className={cn('text-sm font-black tracking-wide', tile.text)}>
            {RARITY_LABEL[rarity]}
          </span>
          <span
            className={cn('ml-auto text-base font-black tabular-nums', tile.text)}
          >
            {formatChance(pct)}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-foreground/[.07]">
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: Math.max(0.02, Math.min(1, pct / 100)) }}
            transition={{
              delay: 0.1 + index * 0.04,
              duration: 0.6,
              ease: [0.22, 1, 0.36, 1],
            }}
            className={cn('h-full w-full origin-left rounded-full', tile.dot)}
          />
        </div>
      </div>
      {children && (
        <div className="space-y-0.5 bg-background/55 px-4 py-2 dark:bg-background/30">
          {children}
        </div>
      )}
    </motion.div>
  );
}

/**
 * The rules behind the table, in words. No progress bar and no "37/350" — a
 * numeric pity counter turns a productivity app into a gacha screen.
 */
function GiftMechanicsNote({
  mechanics,
}: Readonly<{ mechanics: GiftMechanics }>) {
  const rows = [
    ['Every gift', 'Pays exactly one cosmetic — never an empty box'],
    [
      'Luck',
      `This gift adds ${mechanics.luckPerReveal} Luck per open. Legendary chance climbs by ${mechanics.softPityBonusPoints} points a reveal past ${mechanics.softPityLuck} Luck, and is guaranteed at ${mechanics.hardPityLuck}.`,
    ],
    [
      'Epic floor',
      `An epic or better is guaranteed at ${mechanics.epicPityLuck} Luck. Winning one resets that counter.`,
    ],
    [
      'New first',
      `Inside the rolled rarity, items you don't own are ${mechanics.newFirstWeight}× more likely than ones you do.`,
    ],
    [
      'Wishlist',
      `${mechanics.wishlistRedirectPercent}% of reveals are drawn from your un-owned wishlist at the rolled rarity.`,
    ],
    [
      'Backgrounds',
      `About ${Math.round(mechanics.backgroundSharePercent)}% of each rarity pays a background instead of a wearable.`,
    ],
    ['Spares', 'Duplicates stack as ×N and count toward trade-ups.'],
    ...(mechanics.tierBumpEnabled
      ? [
          [
            'Completed sets',
            'Once you own every common or uncommon, a drop at that tier upgrades one rarity.',
          ],
        ]
      : []),
  ];
  return (
    <div className="mt-1 space-y-2 rounded-2xl border border-border/50 bg-muted/25 p-3.5">
      {rows.map(([label, body]) => (
        <div key={label}>
          <p className="text-[11px] font-black text-foreground">{label}</p>
          <p className="text-[11px] leading-snug text-muted-foreground">{body}</p>
        </div>
      ))}
    </div>
  );
}
