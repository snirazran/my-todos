'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Check } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import Fly from '@/components/ui/fly';
import { Icon } from '@/components/ui/Icon';
import { PlusUpgradeModal } from '@/components/ui/PlusUpgradeModal';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/lib/uiStore';
import { hapticSuccess } from '@/lib/haptics';
import { patchInventoryFlies } from '@/hooks/useInventory';
import {
  buyShields,
  dismissShieldOffer,
  patchShieldView,
  useShields,
} from '@/hooks/useShields';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import type { ShieldOffer } from '@/lib/shields/types';

function headline(offer: ShieldOffer | null) {
  if (!offer) return 'Lily Pad';
  if (offer.reason === 'missed') {
    return offer.system === 'pact'
      ? 'Your week broke'
      : `Your ${offer.atStake}-day streak broke`;
  }
  return offer.system === 'pact'
    ? 'Nothing is holding your week up'
    : `Nothing is holding your ${offer.atStake}-day streak up`;
}

function subhead(offer: ShieldOffer | null) {
  if (offer?.reason === 'missed') {
    return 'A Lily Pad would have caught that one on its own. Keep one under you for the next slip.';
  }
  return 'A Lily Pad floats under your streak and catches the first day you miss. Nothing to remember, nothing to switch on.';
}

/**
 * The only place a Lily Pad is ever bought. Opens by itself at a miss (rate
 * limited server-side) or on a tap from the streak card, and is deliberately
 * not a shop shelf — this is a safety net, and merchandising it next to hats
 * taught users to scroll past it.
 */
export function ShieldSheet({
  open,
  onOpenChange,
  offer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offer: ShieldOffer | null;
}) {
  const { shields, flyBalance } = useShields(open);
  const [phase, setPhase] = useState<'confirm' | 'success'>('confirm');
  const [busy, setBusy] = useState<1 | 2 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const openFlyShop = useUIStore((s) => s.openFlyShop);
  const [plusOpen, setPlusOpen] = useState(false);
  const purchasedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setPhase('confirm');
    setBusy(null);
    setError(null);
    purchasedRef.current = false;
    trackAnalyticsEvent('shield_sheet_opened', {
      reason: offer?.reason ?? 'manual',
      system: offer?.system ?? null,
      at_stake: offer?.atStake ?? 0,
    });
  }, [open, offer]);

  const price = shields?.priceFlies ?? 0;
  const twoPackPrice = shields?.twoPackPriceFlies ?? 0;
  const held = shields?.count ?? 0;
  const cap = shields?.cap ?? 0;
  const room = Math.max(0, cap - held);
  const canAfford = flyBalance >= price;
  const twoPackOffered = room >= 2 && twoPackPrice > 0;
  const twoPackSaving = price * 2 - twoPackPrice;

  const close = () => {
    // Only an offer the app pushed counts as a "no". A manual open that ends
    // without a purchase is just browsing, and muting on it would hide the
    // sheet from the user who went looking for it.
    if (offer && !purchasedRef.current) void dismissShieldOffer();
    onOpenChange(false);
  };

  const buy = async (quantity: 1 | 2) => {
    if (busy || room < quantity) return;
    setBusy(quantity);
    setError(null);
    try {
      const { ok, payload } = await buyShields(quantity);
      if (!ok || !payload.shields) {
        setError(payload.error ?? 'That didn’t go through');
        return;
      }
      purchasedRef.current = true;
      patchShieldView(payload.shields, payload.flyBalance);
      if (typeof payload.flyBalance === 'number') {
        patchInventoryFlies(payload.flyBalance);
      }
      trackAnalyticsEvent('shield_purchased', {
        quantity,
        reason: offer?.reason ?? 'manual',
      });
      const rect = buttonRef.current?.getBoundingClientRect();
      confetti({
        particleCount: 60,
        spread: 70,
        startVelocity: 34,
        origin: rect
          ? {
              x: (rect.left + rect.width / 2) / window.innerWidth,
              y: (rect.top + rect.height / 2) / window.innerHeight,
            }
          : { y: 0.6 },
        zIndex: 99999,
        colors: ['#6FBF5F', '#4F9149', '#F7A8C8'],
      });
      hapticSuccess();
      setPhase('success');
    } finally {
      setBusy(null);
    }
  };

  return (
    <BaseSheet
      open={open}
      onOpenChange={(v) => {
        if (!v) close();
      }}
      className="select-none sm:max-w-[400px]"
      zIndex={1420}
      closeAriaLabel="Close Lily Pad"
    >
      {() => (
        <div className="flex flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3 sm:px-6 sm:pb-6 sm:pt-7">
          <div
            className={cn(
              'relative mx-auto mt-2 flex aspect-square w-full max-w-[180px] items-center justify-center overflow-hidden rounded-[28px] bg-gradient-to-br from-emerald-50 to-emerald-100 ring-1 ring-emerald-300/60 dark:from-emerald-500/15 dark:to-emerald-500/25',
              phase === 'success' && 'shadow-[0_0_40px_-8px_#6FBF5F]',
            )}
          >
            <motion.div
              key={phase}
              animate={
                phase === 'success' ? { scale: [0.9, 1.08, 1] } : { scale: 1 }
              }
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <Icon name="lilyPad" label="Lily Pad" className="h-24 w-24" />
            </motion.div>
            {phase === 'success' && (
              <motion.div
                initial={{ scale: 0, rotate: -25 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-green-500 text-white shadow-lg"
              >
                <Check className="h-5 w-5 stroke-[4]" />
              </motion.div>
            )}
          </div>

          <h2 className="mt-4 text-center text-2xl font-black tracking-tight text-foreground">
            {phase === 'success'
              ? "You're covered"
              : offer
                ? headline(offer)
                : 'Lily Pad'}
          </h2>
          <p className="mt-1 text-center text-sm font-medium text-muted-foreground">
            {phase === 'success'
              ? 'It catches the next day you miss, by itself. Nothing to switch on.'
              : subhead(offer)}
          </p>

          <div className="mt-3 flex items-center justify-center gap-1.5 text-sm font-bold text-muted-foreground">
            <span>You hold</span>
            <span className="tabular-nums text-foreground">
              {held} / {cap}
            </span>
            <Icon name="lilyPad" className="h-6 w-6" />
          </div>

          {phase === 'confirm' && (
            <div className="mt-4 rounded-2xl border border-border/60 bg-muted/40 p-4 text-sm font-bold">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Price</span>
                <span className="flex items-center gap-1.5 tabular-nums">
                  <Fly size={18} paused y={-2} />
                  {price.toLocaleString()}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-muted-foreground">Your balance</span>
                <span className="flex items-center gap-1.5">
                  <Fly size={18} paused y={-2} />
                  <AnimatedNumber
                    value={flyBalance}
                    haptics
                    className="tabular-nums"
                  />
                </span>
              </div>
            </div>
          )}

          {phase === 'confirm' && shields && !shields.isPremium && (
            <button
              type="button"
              onClick={() => setPlusOpen(true)}
              className="mt-3 flex items-center justify-center gap-2 text-center text-xs font-bold text-amber-600 underline decoration-amber-500/40 decoration-2 underline-offset-4 transition-colors hover:text-amber-500 dark:text-amber-400"
            >
              <Icon name="frogPlus" label="Plus" className="h-7 w-7 shrink-0" />
              <span>Plus holds {cap + 1} and gets one free every month</span>
            </button>
          )}

          {error && (
            <p className="mt-3 text-center text-sm font-bold text-red-500">
              {error}
            </p>
          )}

          {phase === 'confirm' ? (
            <>
              <button
                ref={buttonRef}
                type="button"
                disabled={busy !== null || room < 1}
                onClick={
                  canAfford
                    ? () => buy(1)
                    : () => openFlyShop(Math.max(0, price - flyBalance))
                }
                className={cn(
                  'mt-5 flex h-12 w-full items-center justify-center rounded-2xl text-sm font-black text-white transition-all',
                  room < 1
                    ? 'bg-muted-foreground/30'
                    : !canAfford
                      ? 'bg-primary shadow-[0_4px_0_0_hsl(var(--primary)/0.6)] active:translate-y-1 active:shadow-none'
                      : 'bg-[#4f9149] shadow-[0_4px_0_0_#3b7a38] active:translate-y-1 active:shadow-none',
                )}
              >
                {room < 1 ? (
                  'Your pond is full'
                ) : !canAfford ? (
                  <span className="inline-flex items-center gap-1.5">
                    Get {(price - flyBalance).toLocaleString()} more flies
                    <Fly size={30} paused y={-4} />
                  </span>
                ) : busy === 1 ? (
                  'Buying…'
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    Get a Lily Pad · {price.toLocaleString()} flies
                    <Fly size={28} paused y={-5} />
                  </span>
                )}
              </button>

              {twoPackOffered && canAfford && (
                <button
                  type="button"
                  disabled={busy !== null || flyBalance < twoPackPrice}
                  onClick={() => buy(2)}
                  className="mt-2.5 flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-border/60 text-sm font-black text-foreground transition-all active:translate-y-[2px] disabled:opacity-50"
                >
                  {busy === 2 ? (
                    'Buying…'
                  ) : (
                    <>
                      Two for
                      <Fly size={16} paused y={-1} />
                      <span className="tabular-nums">
                        {twoPackPrice.toLocaleString()}
                      </span>
                      {twoPackSaving > 0 && (
                        <span className="text-[#4f9149]">
                          save {twoPackSaving.toLocaleString()}
                        </span>
                      )}
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={close}
                className="mt-3 text-sm font-bold text-muted-foreground underline-offset-4 hover:underline"
              >
                Not now
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="mt-5 flex h-12 w-full items-center justify-center rounded-2xl bg-primary text-sm font-black text-primary-foreground shadow-[0_4px_0_0_hsl(var(--primary)/0.6)] transition-all active:translate-y-1 active:shadow-none"
            >
              Done
            </button>
          )}

          <PlusUpgradeModal
            open={plusOpen}
            onClose={() => setPlusOpen(false)}
            placement="shield_offer"
          />
        </div>
      )}
    </BaseSheet>
  );
}
