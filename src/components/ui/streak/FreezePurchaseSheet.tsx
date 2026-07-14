'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Snowflake, Check } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import Fly from '@/components/ui/fly';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/lib/uiStore';
import { hapticSuccess } from '@/lib/haptics';
import type { LoginStreakView } from '@/lib/streak/types';

export function FreezePurchaseSheet({
  open,
  onClose,
  view,
  balance,
  onPurchased,
}: {
  open: boolean;
  onClose: () => void;
  view: LoginStreakView;
  balance: number;
  onPurchased: (freezes: number, balance: number) => void;
}) {
  const [phase, setPhase] = useState<'confirm' | 'success'>('confirm');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const openFlyShop = useUIStore((s) => s.openFlyShop);

  useEffect(() => {
    if (open) {
      setPhase('confirm');
      setBusy(false);
      setError(null);
    }
  }, [open]);

  const price = view.freezePriceFlies;
  const atCap = view.freezes >= view.freezeCap;
  const canAfford = balance >= price;

  const handleBuy = async () => {
    if (busy || atCap || !canAfford) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/streak/buy-freeze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload.error ?? 'Purchase failed');
        return;
      }
      onPurchased(payload.freezes, payload.flyBalance);
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
        colors: ['#38bdf8', '#0ea5e9', '#bae6fd'],
      });
      hapticSuccess();
      setPhase('success');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BaseSheet
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      className="select-none sm:max-w-[400px]"
      zIndex={1200}
      closeAriaLabel="Close freeze purchase"
    >
      {() => (
        <div className="flex flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3 sm:px-6 sm:pb-6 sm:pt-7">
          <div
            className={cn(
              'relative mx-auto mt-2 flex aspect-square w-full max-w-[200px] items-center justify-center overflow-hidden rounded-[28px] bg-gradient-to-br from-sky-100 to-sky-200 ring-1 ring-sky-300/60 dark:from-sky-500/15 dark:to-sky-500/25',
              phase === 'success' && 'shadow-[0_0_40px_-8px_#38bdf8]',
            )}
          >
            <motion.div
              key={phase}
              animate={
                phase === 'success' ? { scale: [0.9, 1.08, 1] } : { scale: 1 }
              }
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <Snowflake className="h-24 w-24 text-sky-500" />
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
            Streak Freeze
          </h2>
          <p className="mt-1 text-center text-sm font-medium text-muted-foreground">
            {phase === 'success'
              ? 'Your streak is protected for one missed day.'
              : 'Steps in automatically if you miss a day, so your streak survives.'}
          </p>

          <div className="mt-3 flex items-center justify-center gap-1.5 text-sm font-bold text-muted-foreground">
            <span>You hold</span>
            <span className="text-foreground">
              {view.freezes} / {view.freezeCap}
            </span>
            <Snowflake className="h-4 w-4 text-sky-500" />
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
                  <AnimatedNumber value={balance} haptics className="tabular-nums" />
                </span>
              </div>
            </div>
          )}

          {error && (
            <p className="mt-3 text-center text-sm font-bold text-red-500">
              {error}
            </p>
          )}

          {phase === 'confirm' ? (
            <button
              ref={buttonRef}
              type="button"
              disabled={busy || atCap}
              onClick={canAfford ? handleBuy : openFlyShop}
              className={cn(
                'mt-5 flex h-12 w-full items-center justify-center gap-1.5 rounded-2xl text-sm font-black text-white transition-all',
                atCap
                  ? 'bg-muted-foreground/30'
                  : !canAfford
                    ? 'bg-primary shadow-[0_4px_0_0_hsl(var(--primary)/0.6)] active:translate-y-1 active:shadow-none'
                    : 'bg-sky-500 shadow-[0_4px_0_0_#0369a1] active:translate-y-1 active:shadow-none',
              )}
            >
              {atCap
                ? 'Freeze limit reached'
                : !canAfford
                  ? `Get ${(price - balance).toLocaleString()} more flies`
                  : busy
                    ? 'Buying…'
                    : 'Buy freeze'}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="mt-5 flex h-12 w-full items-center justify-center rounded-2xl bg-primary text-sm font-black text-primary-foreground shadow-[0_4px_0_0_hsl(var(--primary)/0.6)] transition-all active:translate-y-1 active:shadow-none"
            >
              Stay frosty
            </button>
          )}
        </div>
      )}
    </BaseSheet>
  );
}
