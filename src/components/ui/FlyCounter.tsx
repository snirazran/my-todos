'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import Fly from '@/components/ui/fly';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';

type Variant = 'mobile' | 'desktop';

interface Props {
  balance: number;
  variant?: Variant;
  onClick?: () => void;
}

let nextBumpId = 0;

export function FlyCounter({ balance, variant = 'desktop', onClick }: Props) {
  const prevRef = useRef(balance);
  // Skip the very first run so initial load / login doesn't trigger the
  // bump animation — only real increments after mount should fire it.
  const hasMountedRef = useRef(false);
  const [bumps, setBumps] = useState<{ id: number; delta: number }[]>([]);
  const pillControls = useAnimationControls();
  const flyControls = useAnimationControls();

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      prevRef.current = balance;
      return;
    }
    const prev = prevRef.current;
    if (balance > prev) {
      const delta = balance - prev;
      const id = ++nextBumpId;
      setBumps((curr) => [...curr, { id, delta }]);
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
      const t = window.setTimeout(() => {
        setBumps((curr) => curr.filter((b) => b.id !== id));
      }, 900);
      prevRef.current = balance;
      return () => window.clearTimeout(t);
    }
    prevRef.current = balance;
  }, [balance, pillControls, flyControls]);

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
        <Fly size={flySize} paused={false} y={flyY} />
      </motion.div>

      <AnimatedNumber
        value={balance}
        className="text-xs font-black tabular-nums text-foreground"
      />

      {/* Floating "+N" badge — drops below the counter so it stays visible
          even when the counter is anchored to the top of the viewport. */}
      <AnimatePresence>
        {bumps.map((b) => (
          <motion.span
            key={b.id}
            initial={{ opacity: 0, x: '-50%', y: -4, scale: 0.6 }}
            animate={{ opacity: 1, x: '-50%', y: 10, scale: 1 }}
            exit={{ opacity: 0, x: '-50%', y: 18 }}
            transition={{
              duration: 0.7,
              ease: [0.32, 0.72, 0, 1],
            }}
            className="pointer-events-none absolute left-1/2 top-full mt-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-black leading-none text-primary-foreground shadow-md"
          >
            +{b.delta}
          </motion.span>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
