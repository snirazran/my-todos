'use client';

import React, { memo, useMemo, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Check, Info, Loader2, X } from 'lucide-react';
import Fly from '@/components/ui/fly';
import { cn } from '@/lib/utils';
import type { ItemDef, Rarity } from '@/lib/skins/catalog';
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
  onSell,
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
}: {
  item: ItemDef;
  ownedCount: number;
  isEquipped: boolean;
  canAfford: boolean;
  onAction?: (e: React.MouseEvent) => void;
  onSell?: () => void;
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
}) {
  const config = RARITY_CONFIG[item.rarity];
  const isOwned = ownedCount > 0;
  const [shake, setShake] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
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
      ref={cardRef}
      animate={shake ? { x: [-5, 5, -5, 5, 0] } : {}}
      transition={{ duration: 0.4 }}
      onClick={(e) => {
        if (mode === 'inventory' || mode === 'trade' || mode === 'shop')
          handleAction(e);
      }}
      // UX TWEAK: Smaller padding on mobile (p-2.5) -> Normal on desktop (md:p-3.5)
      // Added min-h-[220px] to ensure card has presence even if image fails
      className={cn(
        'group relative flex flex-col p-2.5 pb-1 md:p-3.5 md:pb-1.5 transition-all duration-300 rounded-2xl border-[3px] overflow-hidden cursor-pointer active:scale-95 w-full max-w-[240px] lg:max-w-[360px] mx-auto',
        config.border,
        config.bg,
        isEquipped
          ? cn(config.shadow)
          : isSelected
            ? 'bg-primary/10 border-primary shadow-[0_0_15px_rgba(34,197,94,0.4)]'
            : cn(config.shadow, config.hoverGlow),
      )}
    >
      {/* Selected Indicator */}
      <AnimatePresence>
        {isEquipped && !customAction && (
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
      {!hideRarity && (
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
      )}

      <div
        className={cn(
          'mt-4 mb-1 md:mt-5 md:mb-2 mx-auto w-full aspect-[1/0.75] md:aspect-[1.2/1] rounded-xl flex items-center justify-center relative overflow-hidden',
          'bg-gradient-to-br shadow-inner',
          config.gradient,
        )}
      >
        {/* NEW Badge (Moved) */}
        {isNew && (
          <div className="absolute top-0 left-0 z-50 px-2 py-1 text-[9px] font-black text-white bg-red-500 rounded-br-xl shadow-sm animate-pulse">
            NEW
          </div>
        )}

        <div className="absolute inset-0 z-10 flex items-end justify-center">
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
          ) : (
            <Frog
              className={cn(
                'w-[125%] h-[125%] object-contain translate-y-[10%] md:translate-y-[10%]',
                previewClassName,
              )}
              indices={previewIndices}
              width={180}
              height={180}
              paused={pausePreview}
            />
          )}
        </div>

        {ownedCount > 0 && (
          <div className="absolute top-1 right-1 md:top-1.5 md:right-1.5 bg-black/50 backdrop-blur-sm text-white text-[9px] md:text-[10px] font-bold px-1.5 py-0.5 rounded-md md:rounded-lg shadow-sm border border-white/10 z-20">
            x{ownedCount}
          </div>
        )}
        {previewTopLeftBadge ? (
          <div className="absolute left-1 top-1 z-20 md:left-1.5 md:top-1.5">
            {previewTopLeftBadge}
          </div>
        ) : null}
      </div>

      {/* Actions */}
      <div className="w-full mx-auto mt-0 md:w-3/4">
        {mode === 'trade' && !customAction && (
          <div
            className={cn(
              'h-7 md:h-8 w-full flex items-center justify-center rounded-lg text-[10px] md:text-xs font-black uppercase tracking-wide transition-colors',
              isSelected
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'bg-muted text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary',
            )}
          >
            {actionLoading ? '...' : isSelected ? 'SELECTED' : 'SELECT'}
          </div>
        )}

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
              'group/buy w-full flex items-center justify-center gap-1 h-8 text-sm md:text-base font-black tracking-tight transition-colors active:scale-95 bg-transparent border-0 shadow-none',
              canAfford
                ? cn(config.text, 'hover:brightness-110')
                : 'text-red-500 dark:text-red-400',
              actionLoading && 'opacity-60 cursor-wait',
            )}
          >
            {actionLoading ? (
              <span>...</span>
            ) : actionLabel ? (
              <span>{actionLabel}</span>
            ) : (
              <>
                <Fly
                  size={22}
                  className="transition-transform group-hover/buy:scale-110"
                  y={-3}
                  paused={true}
                />
                <span className="tabular-nums leading-none">{item.priceFlies}</span>
              </>
            )}
          </button>
        )}

        {/* Sell Button (Inventory Mode) */}
        {mode === 'inventory' &&
          onSell &&
          (item.priceFlies ?? 0) > 0 &&
          !customAction && (
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
      <div className="absolute inset-y-[-24%] left-0 w-1/3 bg-gradient-to-r from-transparent via-white/65 to-transparent opacity-90 animate-shine dark:via-current dark:opacity-20" />
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
  pct >= 1
    ? `${Math.round(pct)}%`
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

      <AnimatePresence>
        {open && <DropRatesPopup giftId={giftId} name={name} onClose={handleClose} />}
      </AnimatePresence>
    </>
  );
}

function DropRatesPopup({
  giftId,
  name,
  onClose,
}: {
  giftId: string;
  name: string;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [drops, setDrops] = useState<GiftDropRate[]>([]);
  const [rarityDrops, setRarityDrops] = useState<GiftRarityDropRate[]>([]);
  const [dropMode, setDropMode] = useState<'item' | 'rarity'>('item');
  const [loading, setLoading] = useState(true);
  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/skins/gift-drops?giftId=${encodeURIComponent(giftId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setDrops(data.drops ?? []);
        setRarityDrops(data.rarityDrops ?? []);
        setDropMode(data.dropMode === 'rarity' ? 'rarity' : 'item');
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
  }, [giftId, mounted]);

  if (!mounted) return null;

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

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className="relative flex max-h-[80vh] w-full max-w-xs flex-col overflow-hidden rounded-3xl border border-border/60 bg-card shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border/40 px-5 pb-3 pt-5">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-black tracking-tight text-foreground">{name}</h3>
            <p className="mt-0.5 text-[11px] font-bold text-muted-foreground">
              {isRarityMode ? 'Chance to win each rarity' : 'Drop rates'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : !hasContent ? (
            <div className="rounded-2xl border border-border/50 bg-muted/30 p-4 text-center text-xs font-bold text-muted-foreground">
              No drops configured.
            </div>
          ) : isRarityMode ? (
            <div className="space-y-2">
              {rarityRows.map((row, i) => {
                const tile = RARITY_TILE[row.rarity];
                return (
                  <motion.div
                    key={row.rarity}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, type: 'spring', stiffness: 400, damping: 28 }}
                    className={cn(
                      'flex items-center gap-3 rounded-2xl border bg-gradient-to-br px-4 py-3 shadow-sm',
                      tile.border,
                      tile.gradient,
                    )}
                  >
                    <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', tile.dot)} />
                    <span className={cn('text-sm font-black uppercase tracking-wide', tile.text)}>
                      {RARITY_LABEL[row.rarity]}
                    </span>
                    <span className={cn('ml-auto text-lg font-black tabular-nums', tile.text)}>
                      {formatChance(row.pct)}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2.5">
              {itemGroups.map((group, i) => {
                const tile = RARITY_TILE[group.rarity];
                return (
                  <motion.div
                    key={group.rarity}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, type: 'spring', stiffness: 400, damping: 28 }}
                    className={cn(
                      'overflow-hidden rounded-2xl border bg-gradient-to-br shadow-sm',
                      tile.border,
                      tile.gradient,
                    )}
                  >
                    {/* Rarity header */}
                    <div className="flex items-center gap-2 px-4 pb-2 pt-2.5">
                      <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', tile.dot)} />
                      <span className={cn('text-sm font-black uppercase tracking-wide', tile.text)}>
                        {RARITY_LABEL[group.rarity]}
                      </span>
                      <span className={cn('ml-auto text-base font-black tabular-nums', tile.text)}>
                        {formatChance(group.pct)}
                      </span>
                    </div>
                    {/* Items inside this rarity */}
                    <div className="space-y-0.5 bg-background/55 px-4 py-2 dark:bg-background/30">
                      {group.items.map((drop) => {
                        const raw = itemTotal > 0 ? (drop.chance / itemTotal) * 100 : 0;
                        return (
                          <div key={drop.itemId} className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-bold text-foreground">
                              {drop.item?.name ?? drop.itemId}
                            </span>
                            <span className="shrink-0 text-[11px] font-black tabular-nums text-muted-foreground">
                              {formatChance(raw)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
