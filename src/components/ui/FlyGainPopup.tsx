'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import Fly from '@/components/ui/fly';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { useInventory } from '@/hooks/useInventory';
import { useSheetStore } from '@/lib/sheetStore';
import { isFlyEarnActive } from '@/lib/flyEarn';

type Toast = { id: number; from: number; to: number };

let nextId = 0;

export function FlyGainPopup() {
  const { data } = useInventory(true, true);
  const balance = data?.wardrobe?.flies;
  const anySheetOpen = useSheetStore((s) => s.count > 0);
  const prevRef = useRef<number | undefined>(undefined);
  const [pending, setPending] = useState<{ from: number; to: number } | null>(
    null,
  );
  const [toast, setToast] = useState<Toast | null>(null);
  const hideTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (typeof balance !== 'number') return;
    const prev = prevRef.current;
    prevRef.current = balance;
    if (prev === undefined || balance <= prev) return;
    // Only celebrate increments that follow a real earn action; passive
    // revalidations (first load, page changes, sync echoes) reconcile the
    // cached balance silently.
    if (!isFlyEarnActive()) return;
    setPending((curr) => ({ from: curr?.from ?? prev, to: balance }));
  }, [balance]);

  // Hold the toast while any sheet/overlay is up (e.g. a reward reveal) and
  // slide it in once the screen is clear, so the celebration isn't wasted
  // behind a full-screen popup.
  useEffect(() => {
    if (!pending || anySheetOpen) return;
    setPending(null);
    setToast((curr) =>
      curr
        ? { ...curr, to: pending.to }
        : { id: ++nextId, from: pending.from, to: pending.to },
    );
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, [pending, anySheetOpen]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence mode="wait">
      {toast && <Pill key={toast.id} toast={toast} />}
    </AnimatePresence>,
    document.body,
  );
}

function Sparks() {
  return (
    <span
      aria-hidden="true"
      className="task-enter-sparks"
      style={{ left: '50%', top: '50%' }}
    >
      {Array.from({ length: 8 }, (_, i) => (
        <span
          key={i}
          className="task-enter-spark"
          style={{
            ['--spark-angle' as string]: `${i * 45 + 22}deg`,
            animationDelay: `${240 + i * 14}ms`,
            backgroundColor: i % 2 ? '#f59e0b' : '#447d3f',
          }}
        />
      ))}
    </span>
  );
}

function Pill({ toast }: { toast: Toast }) {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(toast.from);

  useEffect(() => {
    const timer = window.setTimeout(() => setValue(toast.to), 280);
    return () => window.clearTimeout(timer);
  }, [toast.to]);

  const delta = toast.to - toast.from;

  return (
    <motion.div
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+10px)] z-[10000] flex justify-center px-4 md:hidden"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -64, scale: 0.86 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={
        reduce
          ? { opacity: 0 }
          : {
              opacity: 0,
              y: -40,
              scale: 0.94,
              transition: { duration: 0.22, ease: [0.4, 0, 1, 1] },
            }
      }
      transition={
        reduce
          ? { duration: 0.2 }
          : { type: 'spring', stiffness: 520, damping: 30, mass: 0.9 }
      }
    >
      <div
        role="status"
        aria-label={`+${delta} ${delta === 1 ? 'fly' : 'flies'}, ${toast.to} total`}
        className="relative flex h-11 items-center gap-2 rounded-full bg-card py-1.5 pl-1.5 pr-1.5 shadow-[0_12px_30px_-12px_rgba(15,23,42,0.4),0_2px_6px_-2px_rgba(15,23,42,0.1)] ring-1 ring-border/60"
      >
        <motion.span
          initial={reduce ? false : { scale: 0.3, rotate: -24 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 560, damping: 17, delay: 0.12 }}
          className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/[0.16] ring-1 ring-inset ring-primary/25"
        >
          <Fly size={27} paused y={-3} interactive={false} />
          {!reduce && <Sparks key={toast.to} />}
        </motion.span>
        <AnimatedNumber
          value={value}
          haptics
          className="min-w-[2ch] text-[16px] font-black leading-none tabular-nums text-foreground"
        />
        <motion.span
          key={delta}
          initial={reduce ? false : { scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 600, damping: 20, delay: 0.24 }}
          className="grid h-[26px] place-items-center rounded-full bg-[#447d3f] px-2.5 text-[12.5px] font-black leading-none text-white shadow-[0_2px_0_0_#2c511a]"
        >
          +{delta}
        </motion.span>
      </div>
    </motion.div>
  );
}
