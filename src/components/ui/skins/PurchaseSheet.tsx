'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronDown,
  Loader2,
  Repeat,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { BaseSheet } from '@/components/ui/BaseSheet';
import Fly from '@/components/ui/fly';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/lib/uiStore';
import { emitCampaignTrigger } from '@/lib/campaigns/orchestrator';
import { hapticSuccess } from '@/lib/haptics';
import { useWishlist } from '@/hooks/useWishlist';
import { useTradeConfig } from '@/hooks/useTradeConfig';
import { Icon } from '@/components/ui/Icon';
import type { WishlistKind } from '@/lib/skins/wishlist';
import { isTradeOnlyRarity, type Rarity } from '@/lib/skins/catalog';

const RARITY: Record<
  Rarity,
  {
    label: string;
    text: string;
    gradient: string;
    ring: string;
    chip: string;
    glow: string;
    spot: string;
    restGlow: boolean;
  }
> = {
  common: {
    label: 'Common',
    text: 'text-muted-foreground',
    gradient: 'from-muted/60 to-muted/20',
    ring: 'ring-border',
    chip: 'bg-muted text-muted-foreground',
    glow: 'shadow-[0_0_40px_-12px_rgba(148,163,184,0.5)]',
    spot: 'radial-gradient(circle at 50% 42%, rgba(148,163,184,0.20), transparent 68%)',
    restGlow: false,
  },
  uncommon: {
    label: 'Uncommon',
    text: 'text-emerald-600 dark:text-emerald-400',
    gradient: 'from-emerald-100 to-emerald-50 dark:from-emerald-900/40 dark:to-emerald-950/40',
    ring: 'ring-emerald-500/40',
    chip: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    glow: 'shadow-[0_0_50px_-12px_rgba(16,185,129,0.7)]',
    spot: 'radial-gradient(circle at 50% 42%, rgba(16,185,129,0.22), transparent 68%)',
    restGlow: false,
  },
  rare: {
    label: 'Rare',
    text: 'text-sky-600 dark:text-sky-400',
    gradient: 'from-sky-100 to-sky-50 dark:from-sky-900/40 dark:to-sky-950/40',
    ring: 'ring-sky-500/40',
    chip: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
    glow: 'shadow-[0_0_50px_-12px_rgba(14,165,233,0.7)]',
    spot: 'radial-gradient(circle at 50% 42%, rgba(14,165,233,0.24), transparent 68%)',
    restGlow: false,
  },
  epic: {
    label: 'Epic',
    text: 'text-violet-600 dark:text-violet-400',
    gradient: 'from-violet-100 to-violet-50 dark:from-violet-900/40 dark:to-violet-950/40',
    ring: 'ring-violet-500/40',
    chip: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
    glow: 'shadow-[0_0_55px_-10px_rgba(139,92,246,0.8)]',
    spot: 'radial-gradient(circle at 50% 42%, rgba(139,92,246,0.26), transparent 68%)',
    restGlow: true,
  },
  legendary: {
    label: 'Legendary',
    text: 'text-amber-600 dark:text-amber-400',
    gradient: 'from-amber-100 to-amber-50 dark:from-amber-900/40 dark:to-amber-950/40',
    ring: 'ring-amber-500/50',
    chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    glow: 'shadow-[0_0_60px_-8px_rgba(245,158,11,0.85)]',
    spot: 'radial-gradient(circle at 50% 42%, rgba(245,158,11,0.28), transparent 68%)',
    restGlow: true,
  },
};

const SHEEN_RARITIES: Rarity[] = ['rare', 'epic', 'legendary'];

const RARITY_CONFETTI: Record<Rarity, string[]> = {
  common: ['#cbd5e1', '#94a3b8', '#e2e8f0'],
  uncommon: ['#34d399', '#10b981', '#a7f3d0'],
  rare: ['#38bdf8', '#0ea5e9', '#bae6fd'],
  epic: ['#a78bfa', '#8b5cf6', '#ddd6fe'],
  legendary: ['#fbbf24', '#f59e0b', '#fde68a'],
};

export type PurchaseTarget = {
  id: string;
  name: string;
  rarity: Rarity;
  price: number;
  originalPrice?: number;
  slotLabel?: string;
  kind?: WishlistKind;
};

function fireConfetti(el: HTMLElement | null, colors: string[]) {
  const rect = el?.getBoundingClientRect();
  const origin = rect
    ? {
        x: (rect.left + rect.width / 2) / window.innerWidth,
        y: (rect.top + rect.height / 2) / window.innerHeight,
      }
    : { y: 0.6 };
  confetti({ particleCount: 70, spread: 75, startVelocity: 38, origin, zIndex: 99999, colors });
}

export function PurchaseSheet({
  open,
  onClose,
  target,
  preview,
  balance,
  ownedCount,
  isGuest,
  isPremium = false,
  onBuy,
  onEquip,
  onGoToTrade,
  onUpgrade,
  equipLabel = 'Equip now',
  previewWide = false,
}: {
  open: boolean;
  onClose: () => void;
  target: PurchaseTarget | null;
  preview: React.ReactNode;
  balance: number;
  ownedCount: number;
  isGuest: boolean;
  isPremium?: boolean;
  onBuy: () => Promise<boolean>;
  onEquip: () => Promise<void>;
  onGoToTrade?: () => void;
  onUpgrade?: () => void;
  equipLabel?: string;
  previewWide?: boolean;
}) {
  const [phase, setPhase] = useState<'confirm' | 'success'>('confirm');
  const [busy, setBusy] = useState(false);
  const [tradeInfoOpen, setTradeInfoOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const primaryRef = useRef<HTMLButtonElement>(null);
  const openFlyShop = useUIStore((s) => s.openFlyShop);
  const {
    has: onWishlist,
    add: addToWishlist,
    remove: removeFromWishlist,
    slots: wishlistSlots,
    isFull: wishlistFull,
    busy: wishlistBusy,
    error: wishlistError,
  } = useWishlist(open && !isGuest);
  const modifiers = useTradeConfig(open && !isGuest);
  const plusSlots = modifiers.wishlistSlotsPlus;
  const isPinned = !!target && onWishlist(target.id, target.kind ?? 'item');
  const wishlistLocked = !isPinned && wishlistFull;
  const wishlistUpsell = wishlistLocked && !isPremium && !!onUpgrade;
  const toggleWishlist = async () => {
    if (!target) return;
    if (wishlistUpsell) {
      onUpgrade?.();
      return;
    }
    if (wishlistLocked) return;
    const kind = target.kind ?? 'item';
    if (isPinned) {
      await removeFromWishlist(target.id, kind);
      return;
    }
    const ok = await addToWishlist(target.id, kind);
    if (ok) emitCampaignTrigger('wishlist_pinned');
  };
  const wishlistLabel = (base: string) =>
    wishlistUpsell
      ? `Wishlist full — get ${plusSlots} slots`
      : wishlistLocked
        ? 'Wishlist full'
        : base;
  const wishlistHint = wishlistError
    ? wishlistError
    : wishlistLocked
      ? wishlistUpsell
        ? 'Or free a slot by removing one.'
        : 'Remove one to save this instead.'
      : null;

  useEffect(() => {
    if (open) {
      setPhase('confirm');
      setBusy(false);
      setTradeInfoOpen(false);
    }
  }, [open, target?.id]);

  const rarity = target ? RARITY[target.rarity] : RARITY.common;
  const price = target?.price ?? 0;
  const owned = ownedCount > 0;
  const tradeOnly = !!target && isTradeOnlyRarity(target.rarity);
  const canAfford = !isGuest && balance >= price;
  const shortBy = Math.max(0, price - balance);
  const onDeal = !!target?.originalPrice && target.originalPrice > price;
  const savedPercent = onDeal
    ? Math.round((1 - price / (target?.originalPrice ?? price)) * 100)
    : 0;
  const progress = price > 0 ? Math.min(100, (balance / price) * 100) : 0;
  const showSheen =
    phase === 'confirm' &&
    !!target &&
    !reduceMotion &&
    SHEEN_RARITIES.includes(target.rarity);

  // The gap is the strongest signal this app produces about intent to spend.
  useEffect(() => {
    if (!open || !target || isGuest || canAfford || owned || tradeOnly) return;
    emitCampaignTrigger('insufficient_flies', { gap: shortBy });
  }, [open, target?.id, isGuest, canAfford, owned, shortBy, tradeOnly]);

  const handleBuy = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await onBuy();
    setBusy(false);
    if (ok) {
      fireConfetti(primaryRef.current, RARITY_CONFETTI[target?.rarity ?? 'common']);
      hapticSuccess();
      setPhase('success');
    }
  };

  const handleEquip = async () => {
    if (busy) return;
    setBusy(true);
    await onEquip();
    setBusy(false);
    onClose();
  };

  return (
    <BaseSheet
      open={open && !!target}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      className="max-h-[92dvh] select-none sm:max-h-[88dvh] sm:max-w-[420px]"
      zIndex={1200}
      closeAriaLabel="Close purchase"
    >
      {({ entered, bindScroll }) =>
        target ? (
          // Capped height + internal scroll: on short screens the preview and
          // the cost breakdown together outrun the viewport, and the panel's
          // overflow-hidden would silently clip the buy button.
          <div
            ref={bindScroll}
            className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3 sm:px-6 sm:pb-6 sm:pt-7"
          >
            {/* Eyebrow */}
            <div className="flex items-center gap-2 pr-12 sm:pr-14">
              <span
                className={cn(
                  'rounded-full px-2.5 py-1 text-[12px] font-black',
                  rarity.chip,
                )}
              >
                {rarity.label}
              </span>
              {target.slotLabel && (
                <span className="text-[13px] font-bold text-muted-foreground">
                  {target.slotLabel}
                </span>
              )}
              {owned ? (
                <span className="ml-auto rounded-full bg-foreground/5 px-2.5 py-1 text-[12px] font-black text-muted-foreground">
                  Owned ×{ownedCount}
                </span>
              ) : onDeal ? (
                <span className="ml-auto rounded-full bg-red-500 px-2.5 py-1 text-[12px] font-black text-white shadow-sm shadow-red-500/30">
                  Deal today
                </span>
              ) : null}
            </div>

            {/* Preview */}
            <div
              className={cn(
                'relative mx-auto mt-4 flex shrink-0 items-center justify-center overflow-hidden rounded-[28px] bg-gradient-to-br ring-1',
                // Sized off the viewport height so the preview yields first on
                // a short screen instead of pushing the actions off-sheet.
                previewWide
                  ? 'aspect-[16/10] w-full'
                  : 'aspect-square w-[min(260px,28dvh)]',
                rarity.gradient,
                rarity.ring,
                (phase === 'success' || rarity.restGlow) && rarity.glow,
              )}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{ background: rarity.spot }}
              />
              {entered && showSheen && (
                <motion.div
                  aria-hidden
                  initial={{ x: '-140%' }}
                  animate={{ x: '520%' }}
                  transition={{ duration: 1.2, delay: 0.15, ease: [0.4, 0, 0.2, 1] }}
                  className="pointer-events-none absolute inset-y-[-30%] left-0 z-20 w-1/4 skew-x-[-18deg] bg-gradient-to-r from-transparent via-white/50 to-transparent dark:via-white/20"
                />
              )}
              <motion.div
                key={phase}
                initial={phase === 'success' ? { scale: 0.9 } : false}
                animate={
                  phase === 'success'
                    ? { scale: [0.9, 1.06, 1] }
                    : { scale: 1 }
                }
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="flex h-full w-full items-center justify-center"
              >
                {entered && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.25 }}
                    className="flex h-full w-full items-center justify-center"
                  >
                    {preview}
                  </motion.div>
                )}
              </motion.div>

              <AnimatePresence>
                {phase === 'success' && (
                  <motion.div
                    initial={{ scale: 0, rotate: -25 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 18, delay: 0.08 }}
                    className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-green-500 text-white shadow-lg"
                  >
                    <Check className="h-5 w-5 stroke-[4]" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <motion.h2
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: 0.05 }}
              className="mt-4 text-balance text-center text-[22px] font-black leading-tight tracking-tight text-foreground"
            >
              {target.name}
            </motion.h2>

            {(phase === 'success' || owned) && (
              <p className="mt-1.5 text-center text-sm font-medium text-muted-foreground">
                {phase === 'success'
                  ? 'Added to your wardrobe.'
                  : tradeOnly
                    ? 'Yours already — wear it any time.'
                    : 'Yours already — wear it, or grab a spare.'}
              </p>
            )}

            {/* Trade-only: headline sits in a chip, the reasoning stays folded
                away until asked for. */}
            {phase === 'confirm' && !owned && tradeOnly && (
              <div className="mt-2.5">
                <button
                  type="button"
                  onClick={() => setTradeInfoOpen((v) => !v)}
                  className="mx-auto flex items-center gap-1.5 rounded-full bg-amber-500/10 py-1.5 pl-3 pr-2.5 text-[13px] font-black text-amber-700 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
                >
                  <Repeat className="h-3.5 w-3.5" strokeWidth={3} />
                  Not sold in the shop
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 transition-transform duration-200',
                      tradeInfoOpen && 'rotate-180',
                    )}
                    strokeWidth={3}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {tradeInfoOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="px-2 pt-2.5 text-center text-[13px] font-medium leading-snug text-muted-foreground">
                        There are two ways to get it: trade up your spare items,
                        or open a gift. Add it to your wishlist and both are
                        likelier to land on this piece.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Price */}
            {phase === 'confirm' && !owned && !tradeOnly && (
              <div className="mt-3.5 rounded-[22px] border border-border/60 bg-muted/40 p-4">
                <div className="flex items-center justify-center">
                  <span className="relative text-[30px] font-black leading-none tracking-tight tabular-nums text-foreground">
                    {price.toLocaleString()}
                    <span className="absolute left-full top-1/2 ml-2 -translate-y-1/2">
                      <Fly size={36} paused y={-6} />
                    </span>
                  </span>
                </div>
                {onDeal && (
                  <div className="mt-2 flex items-center justify-center gap-2">
                    <span className="text-sm font-bold leading-none tabular-nums text-muted-foreground line-through decoration-2">
                      {target.originalPrice?.toLocaleString()}
                    </span>
                    <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[12px] font-black leading-none text-white">
                      −{savedPercent}%
                    </span>
                  </div>
                )}

                {!canAfford && !isGuest ? (
                  <div className="mt-4">
                    <div className="mb-1.5 flex items-baseline justify-between text-[13px] font-black">
                      <span className="text-muted-foreground">Your flies</span>
                      <span className="tabular-nums text-foreground">
                        {balance.toLocaleString()}
                        <span className="text-muted-foreground">
                          {' / '}
                          {price.toLocaleString()}
                        </span>
                      </span>
                    </div>
                    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-border/70">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(4, progress)}%` }}
                        transition={{ duration: 0.75, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                        className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-green-500 to-emerald-400"
                      >
                        <span className="absolute inset-0 animate-shimmer bg-[linear-gradient(110deg,transparent_35%,rgba(255,255,255,0.55)_50%,transparent_65%)] bg-[length:200%_100%]" />
                      </motion.div>
                    </div>
                    <p className="mt-2.5 text-center text-[13px] font-black text-foreground">
                      <span className="tabular-nums">{shortBy.toLocaleString()}</span>{' '}
                      more to go
                      <span className="ml-1.5 font-bold text-muted-foreground">
                        · {Math.floor(progress)}% there
                      </span>
                    </p>
                  </div>
                ) : canAfford ? (
                  <div className="mt-3 flex items-center justify-center gap-1.5 border-t border-dashed border-border/70 pt-3 text-xs font-bold text-muted-foreground">
                    <span>Balance</span>
                    <AnimatedNumber
                      value={balance}
                      haptics
                      className="tabular-nums text-foreground"
                    />
                    <span className="opacity-50">→</span>
                    <span className="tabular-nums text-foreground">
                      {(balance - price).toLocaleString()} left
                    </span>
                  </div>
                ) : null}
              </div>
            )}

            {(phase === 'success' || owned) && (
              <div className="mt-4 flex items-center justify-center gap-1.5 text-sm font-bold text-muted-foreground">
                <span>Balance</span>
                <Fly size={30} paused y={-4} />
                <AnimatedNumber value={balance} haptics className="tabular-nums text-foreground" />
              </div>
            )}

            {/* Actions */}
            <div className="mt-5 flex shrink-0 flex-col gap-2.5">
              {phase === 'success' ? (
                <>
                  <PrimaryButton ref={primaryRef} onClick={handleEquip} busy={busy}>
                    {equipLabel}
                  </PrimaryButton>
                  <GhostButton onClick={onClose} disabled={busy}>
                    Keep shopping
                  </GhostButton>
                </>
              ) : owned && tradeOnly ? (
                <PrimaryButton ref={primaryRef} onClick={handleEquip} busy={busy}>
                  {equipLabel}
                </PrimaryButton>
              ) : tradeOnly ? (
                <>
                  <PrimaryButton
                    ref={primaryRef}
                    onClick={() => {
                      onClose();
                      onGoToTrade?.();
                    }}
                  >
                    <span className="relative">
                      <Repeat
                        className="absolute right-full top-1/2 mr-2 h-5 w-5 -translate-y-1/2"
                        strokeWidth={3}
                      />
                      Trade for it
                    </span>
                  </PrimaryButton>
                  {!isGuest && (
                    <>
                      <WishlistButton
                        isPinned={isPinned}
                        upsell={wishlistUpsell}
                        disabled={
                          wishlistBusy || (wishlistLocked && !wishlistUpsell)
                        }
                        onClick={toggleWishlist}
                        pinnedLabel="On your wishlist"
                        label={wishlistLabel('Add to wishlist')}
                        trailing={
                          !isPinned && !wishlistUpsell && wishlistSlots.max > 0
                            ? `${wishlistSlots.used}/${wishlistSlots.max}`
                            : undefined
                        }
                      />
                      {(wishlistHint || isPinned) && (
                        <p className="text-center text-xs font-bold text-muted-foreground">
                          {wishlistHint ??
                            'Trades now favour this one at its tier.'}
                        </p>
                      )}
                    </>
                  )}
                </>
              ) : owned ? (
                <>
                  <PrimaryButton ref={primaryRef} onClick={handleEquip} busy={busy}>
                    {equipLabel}
                  </PrimaryButton>
                  <GhostButton
                    onClick={canAfford ? handleBuy : () => openFlyShop(shortBy)}
                    disabled={busy || (isGuest && !canAfford)}
                  >
                    {canAfford ? (
                      <span className="inline-flex items-center gap-1.5">
                        Buy another
                        <span className="opacity-40">·</span>
                        <span className="tabular-nums">{price.toLocaleString()}</span>
                        <Fly size={28} paused y={-5} />
                      </span>
                    ) : isGuest ? (
                      'Not enough flies'
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        Get{' '}
                        <span className="tabular-nums">{shortBy.toLocaleString()}</span>
                        flies
                        <Fly size={28} paused y={-5} />
                      </span>
                    )}
                  </GhostButton>
                </>
              ) : canAfford ? (
                <>
                  <PrimaryButton ref={primaryRef} onClick={handleBuy} busy={busy} shine>
                    <span className="inline-flex items-center gap-1.5">
                      Buy it
                      <span className="opacity-50">·</span>
                      <span className="tabular-nums">{price.toLocaleString()}</span>
                      <Fly size={30} paused y={-5} />
                    </span>
                  </PrimaryButton>
                  <WishlistButton
                    isPinned={isPinned}
                    upsell={wishlistUpsell}
                    disabled={wishlistBusy || (wishlistLocked && !wishlistUpsell)}
                    onClick={toggleWishlist}
                    pinnedLabel="On your wishlist"
                    label={wishlistLabel('Save it for later')}
                    ghost
                  />
                  {wishlistHint && (
                    <p className="text-center text-xs font-bold text-muted-foreground">
                      {wishlistHint}
                    </p>
                  )}
                </>
              ) : isGuest ? (
                <button
                  ref={primaryRef}
                  type="button"
                  disabled
                  className="flex h-14 w-full items-center justify-center rounded-2xl bg-muted text-sm font-black tracking-wide text-muted-foreground"
                >
                  Sign in to buy
                </button>
              ) : (
                <>
                  <PrimaryButton
                    ref={primaryRef}
                    onClick={() => openFlyShop(shortBy)}
                    shine
                  >
                    <span className="inline-flex items-center gap-1.5">
                      Get{' '}
                      <span className="tabular-nums">
                        {shortBy.toLocaleString()}
                      </span>
                      flies
                      <Fly size={34} paused y={-6} />
                    </span>
                  </PrimaryButton>
                  <WishlistButton
                    isPinned={isPinned}
                    upsell={wishlistUpsell}
                    disabled={wishlistBusy || (wishlistLocked && !wishlistUpsell)}
                    onClick={toggleWishlist}
                    pinnedLabel="Tracking this"
                    label={wishlistLabel('Track it instead')}
                    trailing={
                      !isPinned && !wishlistUpsell && wishlistSlots.max > 0
                        ? `${wishlistSlots.used}/${wishlistSlots.max}`
                        : undefined
                    }
                  />
                  <p className="text-center text-xs font-bold text-muted-foreground">
                    {wishlistHint ??
                      (isPinned
                        ? 'Pinned to your wishlist — we’ll count it down as you earn.'
                        : 'Pin it and we’ll count it down as you earn.')}
                  </p>
                </>
              )}
            </div>
          </div>
        ) : null
      }
    </BaseSheet>
  );
}

function WishlistButton({
  isPinned,
  disabled,
  onClick,
  label,
  pinnedLabel,
  ghost,
  upsell,
  trailing,
}: {
  isPinned: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  pinnedLabel: string;
  ghost?: boolean;
  upsell?: boolean;
  trailing?: string;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'relative flex w-full items-center justify-center gap-2 rounded-2xl font-black transition-colors disabled:opacity-60',
        ghost && !upsell ? 'h-11 text-sm' : 'h-12 text-sm',
        isPinned
          ? 'bg-green-500/10 text-green-700 ring-1 ring-inset ring-green-500/30 dark:text-green-400'
          : upsell
            ? 'border border-amber-400/60 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-400'
            : ghost
              ? 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              : 'bg-muted/60 text-foreground ring-1 ring-inset ring-border/70 hover:bg-muted',
      )}
    >
      {isPinned ? (
        <>
          <BookmarkCheck className="h-5 w-5" strokeWidth={2.75} />
          {pinnedLabel}
        </>
      ) : upsell ? (
        <>
          <Icon name="frogPlus" label="Plus" className="h-6 w-6" />
          {label}
        </>
      ) : (
        <>
          <Bookmark className="h-5 w-5" strokeWidth={2.75} />
          {label}
        </>
      )}
      {trailing && (
        <span className="absolute right-3 rounded-full bg-foreground/[0.07] px-2 py-0.5 text-[10px] font-black tabular-nums text-muted-foreground">
          {trailing}
        </span>
      )}
    </motion.button>
  );
}

const PrimaryButton = React.forwardRef<
  HTMLButtonElement,
  {
    onClick: () => void;
    busy?: boolean;
    shine?: boolean;
    children: React.ReactNode;
  }
>(function PrimaryButton({ onClick, busy, shine, children }, ref) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.button
      ref={ref}
      type="button"
      whileTap={{ scale: 0.97, transition: { duration: 0.1 } }}
      onClick={onClick}
      disabled={busy}
      className="relative flex h-[54px] w-full transform-gpu items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-b from-green-500 to-green-600 text-base font-black tracking-tight text-white shadow-[0_8px_20px_-8px_rgba(34,197,94,0.75)] transition-[filter] hover:brightness-[1.06] disabled:opacity-70"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent"
      />
      {shine && !busy && !reduceMotion && (
        <motion.span
          aria-hidden
          // 2s sweep (the shadcn/ui shimmer default) with a rest between
          // passes, so it reads as ambient polish rather than a ticker.
          initial={{ x: '-150%' }}
          animate={{ x: '360%' }}
          transition={{
            duration: 2,
            ease: 'easeInOut',
            repeat: Infinity,
            repeatDelay: 2.2,
          }}
          className="pointer-events-none absolute inset-y-[-60%] left-0 w-[40%] skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/40 to-transparent blur-[3px]"
        />
      )}
      <span className="relative">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : children}
      </span>
    </motion.button>
  );
});

function GhostButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-11 w-full items-center justify-center rounded-xl text-sm font-bold text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
    >
      {children}
    </button>
  );
}
