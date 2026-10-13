'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronDown,
  Loader2,
  Repeat,
} from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { CloseButton } from '@/components/ui/CloseButton';
import { FlyAmount, FlyPriceChip } from '@/components/ui/FlyAmount';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { TILE_TONE } from '@/components/ui/skins/DressingRoom';
import { PurchaseBurst } from '@/components/ui/skins/PurchaseBurst';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/lib/uiStore';
import { emitCampaignTrigger } from '@/lib/campaigns/orchestrator';
import { celebratePurchase } from '@/lib/purchaseCelebration';
import { useWishlist } from '@/hooks/useWishlist';
import { useTradeConfig } from '@/hooks/useTradeConfig';
import { Icon } from '@/components/ui/Icon';
import type { WishlistKind } from '@/lib/skins/wishlist';
import { isTradeOnlyRarity, type Rarity } from '@/lib/skins/catalog';

const RARITY: Record<Rarity, { label: string; chip: string }> = {
  common: { label: 'Common', chip: 'bg-muted text-muted-foreground' },
  uncommon: {
    label: 'Uncommon',
    chip: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  },
  rare: { label: 'Rare', chip: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  epic: {
    label: 'Epic',
    chip: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  },
  legendary: {
    label: 'Legendary',
    chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  },
};

const CARD_SURFACE =
  'bg-popover ring-1 ring-border/80 shadow-[0_3px_0_0_rgba(0,0,0,0.18)]';

export type PurchaseTarget = {
  id: string;
  name: string;
  rarity: Rarity;
  price: number;
  originalPrice?: number;
  slotLabel?: string;
  kind?: WishlistKind;
};

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
  const primaryRef = useRef<HTMLButtonElement>(null);
  const tileRef = useRef<HTMLDivElement>(null);
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
  const slotsTrailing =
    !isPinned && !wishlistUpsell && wishlistSlots.max > 0
      ? `${wishlistSlots.used}/${wishlistSlots.max}`
      : undefined;

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
  const showFoil =
    !!target && (target.rarity === 'epic' || target.rarity === 'legendary');
  const showBalance = phase === 'success' || owned;
  const showAfter =
    phase === 'confirm' && !owned && !tradeOnly && canAfford;
  const showGoal =
    phase === 'confirm' && !owned && !tradeOnly && !canAfford && !isGuest;

  useEffect(() => {
    if (!open || !target || isGuest || canAfford || owned || tradeOnly) return;
    emitCampaignTrigger('insufficient_flies', { gap: shortBy });
  }, [open, target?.id, isGuest, canAfford, owned, shortBy, tradeOnly]);

  const handleBuy = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await onBuy();
    setBusy(false);
    if (ok && target) {
      celebratePurchase(
        { id: target.id, name: target.name, rarity: target.rarity },
        tileRef.current,
      );
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

  const getFlies = () =>
    target && openFlyShop(shortBy, undefined, { name: target.name, price });

  const wishlistButton = (label: string, pinnedLabel: string, trailing?: string) => (
    <WishlistButton
      isPinned={isPinned}
      upsell={wishlistUpsell}
      disabled={wishlistBusy || (wishlistLocked && !wishlistUpsell)}
      onClick={toggleWishlist}
      pinnedLabel={pinnedLabel}
      label={wishlistLabel(label)}
      trailing={trailing}
    />
  );

  const hint = (text: string | null) =>
    text ? (
      <p className="px-4 text-center text-xs font-bold text-muted-foreground">
        {text}
      </p>
    ) : null;

  return (
    <BaseSheet
      open={open && !!target}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      className="max-h-[92dvh] select-none !border-0 !bg-transparent !shadow-none sm:max-w-[420px]"
      zIndex={1200}
      hideHandle
      showClose={false}
      closeAriaLabel="Close purchase"
    >
      {({ entered, bindScroll, dragControls }) =>
        target ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-1 sm:px-1.5 sm:pb-3">
            <div
              className={cn(
                'relative flex min-h-0 flex-col overflow-hidden rounded-[28px] sm:shadow-[0_3px_0_0_rgba(0,0,0,0.18),0_24px_56px_-18px_rgba(0,0,0,0.45)]',
                CARD_SURFACE,
              )}
            >
              <div
                onPointerDown={(e) => dragControls.start(e)}
                className="flex h-7 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing sm:hidden"
              >
                <div className="h-1.5 w-10 rounded-full bg-muted-foreground/25" />
              </div>
              <CloseButton
                onClick={onClose}
                ariaLabel="Close purchase"
                className="hidden sm:flex"
              />

              <div
                ref={bindScroll}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 sm:pt-3"
              >
                <div
                  ref={tileRef}
                  className={cn(
                    'relative flex w-full shrink-0 items-center justify-center overflow-hidden rounded-[22px] ring-1',
                    previewWide ? 'aspect-[16/10]' : 'h-[min(232px,27dvh)]',
                    TILE_TONE[target.rarity],
                    showFoil && phase === 'confirm' && 'closet-foil',
                    target.rarity === 'legendary' && 'closet-foil-gold',
                  )}
                >
                  {phase === 'success' && (
                    <PurchaseBurst rarity={target.rarity} size={320} />
                  )}
                  <motion.div
                    key={phase}
                    initial={phase === 'success' ? { scale: 0.9 } : false}
                    animate={
                      phase === 'success' ? { scale: [0.9, 1.06, 1] } : { scale: 1 }
                    }
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className={cn(
                      'relative flex h-full items-center justify-center',
                      previewWide ? 'w-full' : 'aspect-square',
                    )}
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
                        className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-[#447d3f] text-white shadow-[0_2px_0_0_#2c511a]"
                      >
                        <Check className="h-5 w-5 stroke-[4]" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="px-1.5 pt-3.5">
                  <motion.h2
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.28, delay: 0.05 }}
                    className="text-balance text-[22px] font-black leading-tight tracking-tight text-foreground"
                  >
                    {target.name}
                  </motion.h2>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-[12px] font-black',
                        rarity.chip,
                      )}
                    >
                      {rarity.label}
                    </span>
                    {target.slotLabel && (
                      <span className="rounded-full bg-foreground/[0.06] px-2.5 py-0.5 text-[12px] font-bold text-muted-foreground">
                        {target.slotLabel}
                      </span>
                    )}
                    {phase === 'success' && (
                      <span className="yours-seal flex items-center gap-1 rounded-full bg-[#447d3f] px-2.5 py-0.5 text-[12px] font-black text-white">
                        <Check className="h-3 w-3 stroke-[4]" />
                        It&apos;s yours
                      </span>
                    )}
                    {owned && phase === 'confirm' && (
                      <span className="flex items-center gap-1 rounded-full bg-[#447d3f]/10 px-2.5 py-0.5 text-[12px] font-black text-[#3d7a38] dark:text-emerald-400">
                        <Check className="h-3 w-3 stroke-[4]" />
                        Owned{ownedCount > 1 ? ` ×${ownedCount}` : ''}
                      </span>
                    )}
                    {!owned && onDeal && (
                      <span className="flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[12px] font-black text-amber-700 dark:text-amber-300">
                        −{savedPercent}%
                        <span className="font-bold tabular-nums line-through decoration-2 opacity-70">
                          {target.originalPrice?.toLocaleString()}
                        </span>
                      </span>
                    )}
                  </div>

                  {phase === 'confirm' && !owned && tradeOnly && (
                    <div className="mt-2.5">
                      <button
                        type="button"
                        onClick={() => setTradeInfoOpen((v) => !v)}
                        className="flex items-center gap-1.5 rounded-full bg-amber-500/15 py-1.5 pl-3 pr-2.5 text-[13px] font-black text-amber-700 transition-colors hover:bg-amber-500/25 dark:text-amber-300"
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
                            <p className="pt-2.5 text-[13px] font-medium leading-snug text-muted-foreground">
                              There are two ways to get it: trade up your spare
                              items, or open a gift. Add it to your wishlist and
                              both are likelier to land on this piece.
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>

                {(showBalance || showAfter || showGoal) && (
                  <div className="mx-1.5 mt-3.5 h-px bg-border/60" />
                )}

                {showBalance && (
                  <div className="flex items-center gap-2 px-1.5 pt-3 text-[13px] font-bold text-muted-foreground">
                    Balance
                    <FlyAmount
                      size={15}
                      className="font-black text-foreground"
                      amount={<AnimatedNumber value={balance} haptics />}
                    />
                  </div>
                )}

                {showAfter && (
                  <div className="flex items-center gap-2 px-1.5 pt-3 text-[13px] font-bold text-muted-foreground">
                    <FlyAmount
                      size={15}
                      className="font-black text-foreground"
                      amount={<AnimatedNumber value={balance} />}
                    />
                    <ArrowRight className="h-3.5 w-3.5 opacity-60" strokeWidth={3} />
                    <span className="font-black tabular-nums text-foreground">
                      {(balance - price).toLocaleString()}
                    </span>
                    left after
                  </div>
                )}

                {showGoal && (
                  <div className="px-1.5 pt-3">
                    <div className="relative h-2.5 overflow-hidden rounded-full bg-foreground/[0.07] shadow-[inset_0_1px_2px_rgba(0,0,0,0.10)]">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(5, progress)}%` }}
                        transition={{ duration: 0.75, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-b from-amber-300 to-amber-400"
                      >
                        <span className="absolute inset-x-[3px] top-px h-[35%] rounded-full bg-white/50" />
                      </motion.div>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[13px] font-bold text-muted-foreground">
                      <FlyAmount
                        size={14}
                        className="font-black text-foreground"
                        amount={
                          <>
                            {balance.toLocaleString()}
                            <span className="ml-1 text-muted-foreground">
                              / {price.toLocaleString()}
                            </span>
                          </>
                        }
                      />
                      <span className="tabular-nums">
                        {shortBy.toLocaleString()} to go
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-2.5">
              {phase === 'success' ? (
                <>
                  <PrimaryButton ref={primaryRef} onClick={handleEquip} busy={busy}>
                    {equipLabel}
                  </PrimaryButton>
                  <SecondaryButton onClick={onClose} disabled={busy}>
                    Keep shopping
                  </SecondaryButton>
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
                    <Repeat className="h-5 w-5" strokeWidth={3} />
                    Trade for it
                  </PrimaryButton>
                  {!isGuest && (
                    <>
                      {wishlistButton('Add to wishlist', 'On your wishlist', slotsTrailing)}
                      {hint(
                        wishlistHint ??
                          (isPinned ? 'Trades now favour this one at its tier.' : null),
                      )}
                    </>
                  )}
                </>
              ) : owned ? (
                <>
                  <PrimaryButton ref={primaryRef} onClick={handleEquip} busy={busy}>
                    {equipLabel}
                  </PrimaryButton>
                  <SecondaryButton
                    onClick={canAfford ? handleBuy : getFlies}
                    disabled={busy || (isGuest && !canAfford)}
                  >
                    {canAfford ? (
                      <>
                        Buy another
                        <FlyAmount amount={price} size={15} className="text-muted-foreground" />
                      </>
                    ) : isGuest ? (
                      'Not enough flies'
                    ) : (
                      <>
                        Get
                        <FlyAmount amount={shortBy} size={15} />
                        more
                      </>
                    )}
                  </SecondaryButton>
                </>
              ) : canAfford ? (
                <>
                  <PrimaryButton ref={primaryRef} onClick={handleBuy} busy={busy}>
                    Buy
                    <FlyPriceChip amount={price} size={16} />
                  </PrimaryButton>
                  {wishlistButton('Save for later', 'On your wishlist')}
                  {hint(wishlistHint)}
                </>
              ) : isGuest ? (
                <button
                  ref={primaryRef}
                  type="button"
                  disabled
                  className="flex h-14 w-full items-center justify-center gap-2.5 rounded-[22px] bg-muted text-[16px] font-black text-muted-foreground"
                >
                  Sign in to buy
                  <FlyPriceChip
                    amount={price}
                    size={15}
                    className="bg-background text-muted-foreground shadow-none"
                  />
                </button>
              ) : (
                <>
                  <PrimaryButton ref={primaryRef} onClick={getFlies}>
                    Get
                    <FlyAmount amount={shortBy} size={17} />
                    more
                  </PrimaryButton>
                  {wishlistButton('Track it instead', 'Tracking this', slotsTrailing)}
                  {hint(
                    wishlistHint ??
                      (isPinned
                        ? 'Pinned to your wishlist — we’ll count it down as you earn.'
                        : 'Pin it and we’ll count it down as you earn.'),
                  )}
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
  upsell,
  trailing,
}: {
  isPinned: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  pinnedLabel: string;
  upsell?: boolean;
  trailing?: string;
}) {
  return (
    <SecondaryButton
      onClick={onClick}
      disabled={disabled}
      className={cn(
        isPinned && 'text-[#3d7a38] dark:text-emerald-400',
        upsell && 'text-amber-700 dark:text-amber-300',
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
        <span className="absolute right-3 rounded-full bg-foreground/[0.07] px-2 py-0.5 text-[11px] font-black tabular-nums text-muted-foreground">
          {trailing}
        </span>
      )}
    </SecondaryButton>
  );
}

const PrimaryButton = React.forwardRef<
  HTMLButtonElement,
  {
    onClick: () => void;
    busy?: boolean;
    children: React.ReactNode;
  }
>(function PrimaryButton({ onClick, busy, children }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={busy}
      className="flex h-14 w-full items-center justify-center gap-2.5 rounded-[22px] bg-[#447d3f] px-4 text-[17px] font-black tracking-tight text-white shadow-[0_4px_0_0_#2c511a] ring-1 ring-[#2c511a]/40 transition-[transform,box-shadow,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#447d3f]/40 active:translate-y-1 active:shadow-none disabled:pointer-events-none disabled:opacity-80 short:h-12 short:text-[15px] [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:bg-[#3d7038] [@media(hover:hover)]:hover:shadow-[0_5px_0_0_#2c511a]"
    >
      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : children}
    </button>
  );
});

function SecondaryButton({
  onClick,
  disabled,
  className,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'relative flex h-12 w-full items-center justify-center gap-2 rounded-[20px] text-[15px] font-black text-foreground transition-[transform,box-shadow] active:translate-y-[3px] active:shadow-none disabled:pointer-events-none disabled:opacity-60 short:h-11 short:text-[14px]',
        CARD_SURFACE,
        className,
      )}
    >
      {children}
    </button>
  );
}
