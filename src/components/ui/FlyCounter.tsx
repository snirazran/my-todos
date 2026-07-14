'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { Plus } from 'lucide-react';
import Fly from '@/components/ui/fly';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { useSheetStore } from '@/lib/sheetStore';
import { isFlyEarnActive } from '@/lib/flyEarn';
import { hapticTick } from '@/lib/haptics';

type Variant = 'mobile' | 'desktop';

interface Props {
  balance: number;
  variant?: Variant;
  onClick?: () => void;
  /** Force-pause the fly Rive regardless of sheet state. */
  paused?: boolean;
  /**
   * Celebrate every increment regardless of the earn window. Used by toast
   * pills and demos that feed the counter a scripted balance; the default
   * only celebrates increments that follow a real earn action, so passive
   * cache revalidations update the number silently.
   */
  alwaysCelebrate?: boolean;
}

export function FlyCounter({
  balance,
  variant = 'desktop',
  onClick,
  paused = false,
  alwaysCelebrate = false,
}: Props) {
  // Pause the fly while any sheet/popup is open (read here, in the leaf, rather
  // than in the layout-level header — subscribing in the header trips Next's
  // dev HMR/PPR refresh loop).
  const anySheetOpen = useSheetStore((s) => s.count > 0);
  const flyPaused = paused || anySheetOpen;
  const prevRef = useRef(balance);
  // Skip the very first run so initial load / login doesn't trigger the
  // bump animation — only real increments after mount should fire it.
  const hasMountedRef = useRef(false);
  const [bump, setBump] = useState<{ delta: number } | null>(null);
  const bumpTimer = useRef<number | null>(null);
  const pendingDeltaRef = useRef(0);
  const pillControls = useAnimationControls();
  const flyControls = useAnimationControls();

  useEffect(
    () => () => {
      if (bumpTimer.current) window.clearTimeout(bumpTimer.current);
    },
    [],
  );

  const celebrate = useCallback((delta: number) => {
    // Consecutive gains fold into one badge instead of stacking overlapping
    // "+N" pills; the timer restarts so the running total stays readable.
    setBump((curr) => ({ delta: (curr?.delta ?? 0) + delta }));
    // Fire the pulse + fly shimmy imperatively so it replays on every
    // increment (framer's `animate` prop dedupes identical keyframes).
    pillControls.start({
      scale: [1, 1.12, 1],
      boxShadow: [
        '0 0 0 0 hsl(var(--primary) / 0)',
        '0 0 0 8px hsl(var(--primary) / 0.18)',
        '0 0 0 0 hsl(var(--primary) / 0)',
      ],
      transition: { duration: 0.55, ease: [0.32, 0.72, 0, 1] },
    });
    flyControls.start({
      rotate: [0, -14, 14, -8, 0],
      y: [0, -3, 0, -1, 0],
      transition: { duration: 0.55, ease: [0.32, 0.72, 0, 1] },
    });
    hapticTick();
    if (bumpTimer.current) window.clearTimeout(bumpTimer.current);
    bumpTimer.current = window.setTimeout(() => setBump(null), 1200);
  }, [pillControls, flyControls]);

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
  const flySize = isMobile ? 28 : 24;
  const flyY = -3;

  return (
    <motion.div
      onClick={onClick}
      className={`relative flex items-center gap-1.5 rounded-full border border-border/50 bg-card/80 shadow-sm backdrop-blur-xl ${
        isMobile ? 'px-3 py-1.5' : 'h-10 px-3'
      } ${onClick ? 'cursor-pointer transition-colors active:scale-95' : ''} shrink-0`}
      animate={pillControls}
    >
      <motion.div
        animate={flyControls}
        className="flex items-center"
      >
        <Fly size={flySize} paused={flyPaused} y={flyY} />
      </motion.div>

      <AnimatedNumber
        value={balance}
        haptics
        className="text-xs font-black tabular-nums text-foreground"
      />

      {/* "+" affordance — perched on the top-right corner, half in/half out, to
          show the counter can be tapped to buy more flies. */}
      {onClick && (
        <span className="absolute -right-0.5 -top-0.5 z-10 grid h-4 w-4 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm ring-2 ring-background">
          <Plus className="h-2.5 w-2.5 stroke-[3.5]" />
        </span>
      )}

      {/* Floating "+N" badge — drops below the counter so it stays visible
          even when the counter is anchored to the top of the viewport. */}
      <AnimatePresence>
        {bump && (
          <motion.span
            key="bump"
            initial={{ opacity: 0, x: '-50%', y: -4, scale: 0.6 }}
            animate={{ opacity: 1, x: '-50%', y: 10, scale: 1 }}
            exit={{ opacity: 0, x: '-50%', y: 18 }}
            transition={{
              duration: 0.7,
              ease: [0.32, 0.72, 0, 1],
            }}
            className="pointer-events-none absolute left-1/2 top-full mt-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-black leading-none text-primary-foreground shadow-md"
          >
            <motion.span
              key={bump.delta}
              initial={{ scale: 1.35 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              className="inline-block"
            >
              +{bump.delta}
            </motion.span>
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
