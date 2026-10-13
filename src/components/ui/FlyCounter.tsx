'use client';

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import Fly from '@/components/ui/fly';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { useSheetStore } from '@/lib/sheetStore';
import { isFlyEarnActive } from '@/lib/flyEarn';
import { isFlyCounterHeld, subscribeFlyCounterHold } from '@/lib/flyFlight';
import { hapticTick } from '@/lib/haptics';
import { useWishlist } from '@/hooks/useWishlist';
import { HEADER_CONTROL_SURFACE } from '@/components/ui/MobileHeaderActions';
import { cn } from '@/lib/utils';

type Variant = 'mobile' | 'desktop';

interface Props {
  balance: number;
  variant?: Variant;
  onClick?: () => void;
  /**
   * Celebrate every increment regardless of the earn window. Used by toast
   * pills and demos that feed the counter a scripted balance; the default
   * only celebrates increments that follow a real earn action, so passive
   * cache revalidations update the number silently.
   */
  alwaysCelebrate?: boolean;
  /**
   * Fill the pill toward the pinned wishlist item. Off by default so demo and
   * toast counters stay presentational (and skip the summary subscription).
   */
  showGoal?: boolean;
}

export function FlyCounter({
  balance: liveBalance,
  variant = 'desktop',
  onClick,
  alwaysCelebrate = false,
  showGoal = false,
}: Props) {
  const { wishlist, progress } = useWishlist(showGoal);
  const goalReached = !!progress?.reached;
  const held =
    useSyncExternalStore(subscribeFlyCounterHold, isFlyCounterHeld, () => false) && showGoal;
  const heldBalanceRef = useRef(liveBalance);
  if (!held) heldBalanceRef.current = liveBalance;
  const balance = held ? heldBalanceRef.current : liveBalance;
  // Held gains celebrate once the screen is clear again (read here, in the
  // leaf, rather than in the layout-level header — subscribing in the header
  // trips Next's dev HMR/PPR refresh loop).
  const anySheetOpen = useSheetStore((s) => s.count > 0);
  const prevRef = useRef(balance);
  // Skip the very first run so initial load / login doesn't trigger the
  // bump animation — only real increments after mount should fire it.
  const hasMountedRef = useRef(false);
  const [bump, setBump] = useState<{ delta: number } | null>(null);
  const bumpTimer = useRef<number | null>(null);
  const pendingDeltaRef = useRef(0);

  useEffect(
    () => () => {
      if (bumpTimer.current) window.clearTimeout(bumpTimer.current);
    },
    [],
  );

  const pillRef = useRef<HTMLDivElement>(null);
  const padRef = useRef<HTMLSpanElement>(null);
  const haloRef = useRef<HTMLSpanElement>(null);
  const sparkHostRef = useRef<HTMLSpanElement>(null);

  const celebrate = useCallback((delta: number) => {
    setBump((curr) => ({ delta: (curr?.delta ?? 0) + delta }));
    hapticTick();
    if (bumpTimer.current) window.clearTimeout(bumpTimer.current);
    bumpTimer.current = window.setTimeout(() => setBump(null), 1400);
    if (
      typeof window === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    const easing = 'cubic-bezier(0.32, 0.72, 0, 1)';
    padRef.current?.animate(
      [
        { transform: 'scale(1) rotate(0deg)' },
        { transform: 'scale(1.24) rotate(-10deg)', offset: 0.28 },
        { transform: 'scale(0.94) rotate(5deg)', offset: 0.6 },
        { transform: 'scale(1) rotate(0deg)' },
      ],
      { duration: 640, easing },
    );
    pillRef.current?.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.07)', offset: 0.3 },
        { transform: 'scale(1)' },
      ],
      { duration: 520, easing },
    );
    haloRef.current?.animate(
      [
        { opacity: 0, transform: 'scale(0.85)' },
        { opacity: 1, transform: 'scale(1.08)', offset: 0.3 },
        { opacity: 0, transform: 'scale(1.3)' },
      ],
      { duration: 900, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
    const host = sparkHostRef.current;
    if (host) {
      const burst = document.createElement('span');
      burst.setAttribute('aria-hidden', 'true');
      burst.className = 'task-enter-sparks';
      burst.style.left = '50%';
      burst.style.top = '50%';
      for (let i = 0; i < 8; i++) {
        const spark = document.createElement('span');
        spark.className = 'task-enter-spark';
        spark.style.setProperty('--spark-angle', `${i * 45 + 22}deg`);
        spark.style.animationDelay = `${80 + i * 14}ms`;
        spark.style.backgroundColor = i % 2 ? '#f59e0b' : '#447d3f';
        burst.appendChild(spark);
      }
      host.appendChild(burst);
      window.setTimeout(() => burst.remove(), 900);
    }
  }, []);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      prevRef.current = balance;
      return;
    }
    const prev = prevRef.current;
    prevRef.current = balance;
    if (balance <= prev) return;
    if (!alwaysCelebrate && !isFlyEarnActive()) return;
    const delta = balance - prev;
    // Gains that land behind a sheet/overlay (e.g. a reward reveal) are held
    // and celebrated once the screen is clear again.
    if (!alwaysCelebrate && anySheetOpen) {
      pendingDeltaRef.current += delta;
      return;
    }
    celebrate(delta);
  }, [balance, alwaysCelebrate, anySheetOpen, celebrate]);

  useEffect(() => {
    if (anySheetOpen || pendingDeltaRef.current <= 0) return;
    const delta = pendingDeltaRef.current;
    pendingDeltaRef.current = 0;
    celebrate(delta);
  }, [anySheetOpen, celebrate]);

  const isMobile = variant === 'mobile';
  const ringRatio = showGoal && wishlist && progress ? progress.ratio : null;
  const RING = 2 * Math.PI * 15;

  return (
    <div
      ref={pillRef}
      onClick={onClick}
      aria-label={
        wishlist
          ? `${balance} flies — saving for ${wishlist.name}, ${progress?.remaining ?? 0} to go`
          : `${balance} flies`
      }
      className={cn(
        'relative flex h-10 shrink-0 items-center gap-1.5 pl-1 pr-3',
        HEADER_CONTROL_SURFACE,
        goalReached && 'border-amber-400/60',
        onClick && 'cursor-pointer transition-transform active:scale-95',
      )}
    >
      <span
        ref={haloRef}
        aria-hidden
        className="pointer-events-none absolute -inset-2 rounded-full bg-[radial-gradient(closest-side,rgba(245,158,11,0.32),rgba(79,145,73,0.16)_60%,transparent)] opacity-0"
      />
      <span
        ref={sparkHostRef}
        className="relative grid h-8 w-8 shrink-0 place-items-center"
      >
        {ringRatio !== null && (
          <svg
            aria-hidden
            viewBox="0 0 32 32"
            className="absolute inset-0 -rotate-90"
          >
            <circle
              cx="16"
              cy="16"
              r="15"
              fill="none"
              strokeWidth="2"
              className="stroke-primary/15"
            />
            <circle
              cx="16"
              cy="16"
              r="15"
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={RING}
              strokeDashoffset={RING * (1 - Math.max(0.04, ringRatio))}
              className={goalReached ? 'stroke-amber-500' : 'stroke-primary'}
              style={{
                transition: 'stroke-dashoffset 700ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            />
          </svg>
        )}
        <span
          ref={padRef}
          data-fly-counter={showGoal ? '' : undefined}
          className={cn(
            'fly-purse-pad grid place-items-center rounded-full ring-1 ring-inset',
            ringRatio !== null ? 'h-[25px] w-[25px]' : 'h-8 w-8',
            goalReached
              ? 'bg-amber-400/20 ring-amber-500/30'
              : 'bg-primary/[0.16] ring-primary/25',
          )}
        >
          <Fly
            size={ringRatio !== null ? 24 : isMobile ? 30 : 28}
            paused
            y={-2}
            interactive={false}
          />
        </span>
      </span>

      <AnimatedNumber
        value={balance}
        haptics
        className="relative text-[15px] font-black leading-none tabular-nums text-foreground"
      />

      {onClick && (
        <span className="absolute -right-0.5 -top-0.5 z-10 grid h-4 w-4 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm ring-2 ring-background">
          <Plus className="h-2.5 w-2.5 stroke-[3.5]" />
        </span>
      )}

      <AnimatePresence>
        {bump && (
          <motion.span
            key="bump"
            initial={{ opacity: 0, x: '-50%', y: -6, scale: 0.5 }}
            animate={{ opacity: 1, x: '-50%', y: 8, scale: 1 }}
            exit={{ opacity: 0, x: '-50%', y: 16, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 520, damping: 26 }}
            className="pointer-events-none absolute left-1/2 top-full z-20 mt-0.5 grid h-6 place-items-center rounded-full bg-[#447d3f] px-2.5 text-[12px] font-black leading-none text-white shadow-[0_2px_0_0_#2c511a]"
          >
            <motion.span
              key={bump.delta}
              initial={{ scale: 1.4 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 520, damping: 20 }}
              className="inline-block tabular-nums"
            >
              +{bump.delta}
            </motion.span>
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
