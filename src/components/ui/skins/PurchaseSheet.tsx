'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import { BaseSheet } from '@/components/ui/BaseSheet';
import Fly from '@/components/ui/fly';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/lib/uiStore';
import type { Rarity } from '@/lib/skins/catalog';

const RARITY: Record<
  Rarity,
  { label: string; text: string; gradient: string; ring: string; chip: string; glow: string }
> = {
  common: {
    label: 'Common',
    text: 'text-muted-foreground',
    gradient: 'from-muted/60 to-muted/20',
    ring: 'ring-border',
    chip: 'bg-muted text-muted-foreground',
    glow: 'shadow-[0_0_40px_-12px_rgba(148,163,184,0.5)]',
  },
  uncommon: {
    label: 'Uncommon',
    text: 'text-emerald-600 dark:text-emerald-400',
    gradient: 'from-emerald-100 to-emerald-50 dark:from-emerald-900/40 dark:to-emerald-950/40',
    ring: 'ring-emerald-500/40',
    chip: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    glow: 'shadow-[0_0_50px_-12px_rgba(16,185,129,0.7)]',
  },
  rare: {
    label: 'Rare',
    text: 'text-sky-600 dark:text-sky-400',
    gradient: 'from-sky-100 to-sky-50 dark:from-sky-900/40 dark:to-sky-950/40',
    ring: 'ring-sky-500/40',
    chip: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
    glow: 'shadow-[0_0_50px_-12px_rgba(14,165,233,0.7)]',
  },
  epic: {
    label: 'Epic',
    text: 'text-violet-600 dark:text-violet-400',
    gradient: 'from-violet-100 to-violet-50 dark:from-violet-900/40 dark:to-violet-950/40',
    ring: 'ring-violet-500/40',
    chip: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
    glow: 'shadow-[0_0_55px_-10px_rgba(139,92,246,0.8)]',
  },
  legendary: {
    label: 'Legendary',
    text: 'text-amber-600 dark:text-amber-400',
    gradient: 'from-amber-100 to-amber-50 dark:from-amber-900/40 dark:to-amber-950/40',
    ring: 'ring-amber-500/50',
    chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    glow: 'shadow-[0_0_60px_-8px_rgba(245,158,11,0.85)]',
  },
};

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
  onBuy,
  onEquip,
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
  onBuy: () => Promise<boolean>;
  onEquip: () => Promise<void>;
  equipLabel?: string;
  previewWide?: boolean;
}) {
  const [phase, setPhase] = useState<'confirm' | 'success'>('confirm');
  const [busy, setBusy] = useState(false);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const openFlyShop = useUIStore((s) => s.openFlyShop);

  useEffect(() => {
    if (open) {
      setPhase('confirm');
      setBusy(false);
    }
  }, [open, target?.id]);

  const rarity = target ? RARITY[target.rarity] : RARITY.common;
  const price = target?.price ?? 0;
  const owned = ownedCount > 0;
  const canAfford = !isGuest && balance >= price;
  const shortBy = Math.max(0, price - balance);

  const handleBuy = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await onBuy();
    setBusy(false);
    if (ok) {
      fireConfetti(primaryRef.current, RARITY_CONFETTI[target?.rarity ?? 'common']);
      try {
        navigator.vibrate?.(28);
      } catch {}
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
      className="select-none sm:max-w-[420px]"
      zIndex={1200}
      closeAriaLabel="Close purchase"
    >
      {({ entered }) =>
        target ? (
          <div className="flex flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3 sm:px-6 sm:pb-6 sm:pt-7">
            {/* Eyebrow */}
            <div className="flex items-center gap-2 pr-12 sm:pr-14">
              <span
                className={cn(
                  'rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em]',
                  rarity.chip,
                )}
              >
                {rarity.label}
              </span>
              {target.slotLabel && (
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {target.slotLabel}
                </span>
              )}
              {owned && (
                <span className="ml-auto rounded-full bg-foreground/5 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  Owned ×{ownedCount}
                </span>
              )}
            </div>

            {/* Preview */}
            <div
              className={cn(
                'relative mx-auto mt-4 flex items-center justify-center overflow-hidden rounded-[28px] bg-gradient-to-br ring-1',
                previewWide
                  ? 'aspect-[16/10] w-full'
                  : 'aspect-square w-full max-w-[260px]',
                rarity.gradient,
                rarity.ring,
                phase === 'success' && rarity.glow,
              )}
            >
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

            {/* Title */}
            <h2 className="mt-4 text-center text-2xl font-black tracking-tight text-foreground">
              {target.name}
            </h2>
            <p className="mt-1 text-center text-sm font-medium text-muted-foreground">
              {phase === 'success'
                ? 'Added to your wardrobe.'
                : owned
                  ? 'You already own this — wear it or grab another.'
                  : 'Preview it on your frog, then make it yours.'}
            </p>

            {/* Cost breakdown */}
            {phase === 'confirm' && !owned && (
              <div className="mt-4 rounded-2xl border border-border/60 bg-muted/40 p-4">
                <Row label="Price">
                  {target.originalPrice != null &&
                    target.originalPrice > price && (
                      <span className="tabular-nums text-muted-foreground line-through decoration-2 opacity-60">
                        {target.originalPrice.toLocaleString()}
                      </span>
                    )}
                  <Fly size={24} paused y={-2} />
                  <span className="tabular-nums">{price.toLocaleString()}</span>
                </Row>
                <Row label="Your balance">
                  <Fly size={24} paused y={-2} />
                  <AnimatedNumber value={balance} className="tabular-nums" />
                </Row>
                <div className="my-2.5 border-t border-dashed border-border/70" />
                <Row label="Balance after" strong>
                  <Fly size={24} paused y={-2} />
                  <span
                    className={cn('tabular-nums', !canAfford && 'text-red-500')}
                  >
                    {Math.max(0, balance - price).toLocaleString()}
                  </span>
                </Row>
              </div>
            )}

            {(phase === 'success' || owned) && (
              <div className="mt-4 flex items-center justify-center gap-1.5 text-sm font-bold text-muted-foreground">
                <span>Balance</span>
                <Fly size={24} paused y={-2} />
                <AnimatedNumber value={balance} className="tabular-nums text-foreground" />
              </div>
            )}

            {/* Actions */}
            <div className="mt-5 flex flex-col gap-2.5">
              {phase === 'success' ? (
                <>
                  <PrimaryButton ref={primaryRef} onClick={handleEquip} busy={busy}>
                    {equipLabel}
                  </PrimaryButton>
                  <GhostButton onClick={onClose} disabled={busy}>
                    Keep shopping
                  </GhostButton>
                </>
              ) : owned ? (
                <>
                  <PrimaryButton ref={primaryRef} onClick={handleEquip} busy={busy}>
                    {equipLabel}
                  </PrimaryButton>
                  <GhostButton
                    onClick={canAfford ? handleBuy : openFlyShop}
                    disabled={busy || (isGuest && !canAfford)}
                  >
                    {canAfford ? (
                      <span className="inline-flex items-center gap-1.5">
                        Buy another
                        <span className="opacity-40">·</span>
                        <Fly size={16} paused y={-2} />
                        <span className="tabular-nums">{price.toLocaleString()}</span>
                      </span>
                    ) : isGuest ? (
                      'Not enough flies'
                    ) : (
                      'Not enough flies — get more'
                    )}
                  </GhostButton>
                </>
              ) : canAfford ? (
                <PrimaryButton ref={primaryRef} onClick={handleBuy} busy={busy}>
                  <span className="inline-flex items-center gap-2">
                    Buy
                    <span className="opacity-50">·</span>
                    <Fly size={20} paused y={-2} />
                    <span className="tabular-nums">{price.toLocaleString()}</span>
                  </span>
                </PrimaryButton>
              ) : isGuest ? (
                <button
                  ref={primaryRef}
                  type="button"
                  disabled
                  className="flex h-14 w-full items-center justify-center rounded-2xl bg-muted text-sm font-black uppercase tracking-wide text-muted-foreground"
                >
                  Sign in to buy
                </button>
              ) : (
                <>
                  <PrimaryButton ref={primaryRef} onClick={openFlyShop}>
                    <span className="inline-flex items-center gap-2">
                      Get
                      <Fly size={30} y={-5} alwaysPlay />
                      <span className="tabular-nums">{shortBy.toLocaleString()}</span>
                      more flies
                    </span>
                  </PrimaryButton>
                  <p className="text-center text-xs font-bold text-muted-foreground">
                    You&apos;re {shortBy.toLocaleString()} flies short
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

function Row({
  label,
  children,
  strong,
}: {
  label: string;
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span
        className={cn(
          'text-sm',
          strong ? 'font-black text-foreground' : 'font-medium text-muted-foreground',
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'flex items-center gap-1.5',
          strong ? 'text-base font-black text-foreground' : 'text-sm font-bold text-foreground',
        )}
      >
        {children}
      </span>
    </div>
  );
}

const PrimaryButton = React.forwardRef<
  HTMLButtonElement,
  { onClick: () => void; busy?: boolean; children: React.ReactNode }
>(function PrimaryButton({ onClick, busy, children }, ref) {
  return (
    <motion.button
      ref={ref}
      type="button"
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      disabled={busy}
      className="flex h-14 w-full items-center justify-center rounded-2xl bg-green-500 text-base font-black tracking-tight text-white shadow-lg shadow-green-500/25 transition-colors hover:bg-green-600 disabled:opacity-70"
    >
      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : children}
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
