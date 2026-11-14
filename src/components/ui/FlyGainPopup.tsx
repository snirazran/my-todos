'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import Fly from '@/components/ui/fly';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { useInventory } from '@/hooks/useInventory';
import { useSheetStore } from '@/lib/sheetStore';
import { isFlyEarnActive, takeFlownFlies } from '@/lib/flyEarn';

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
    const flown = takeFlownFlies(balance - prev);
    if (balance - prev - flown <= 0) return;
    setPending((curr) => ({ from: (curr?.from ?? prev) + flown, to: balance }));
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

function Sparks({ delay }: { delay: number }) {
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
            animationDelay: `${delay + i * 14}ms`,
            backgroundColor: i % 2 ? '#f59e0b' : '#447d3f',
          }}
        />
      ))}
    </span>
  );
}

const PUNCH_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const FIRST_TICK_MS = 340;
const MERGE_TICK_MS = 110;

function punch(node: HTMLElement | null, peak: number, duration: number) {
  node?.animate(
    [
      { transform: 'scale(1)' },
      { transform: `scale(${peak})`, offset: 0.3 },
      { transform: 'scale(0.96)', offset: 0.68 },
      { transform: 'scale(1)' },
    ],
    { duration, easing: PUNCH_EASE },
  );
}

function Pill({ toast }: { toast: Toast }) {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(toast.from);
  const [firstTo] = useState(toast.to);
  const merged = toast.to !== firstTo;
  const numberRef = useRef<HTMLSpanElement>(null);
  const chipRef = useRef<HTMLSpanElement>(null);
  const flyRef = useRef<HTMLSpanElement>(null);
  const haloRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (merged && !reduce) punch(chipRef.current, 1.32, 300);
    const timer = window.setTimeout(
      () => {
        setValue(toast.to);
        if (reduce) return;
        punch(numberRef.current, 1.3, 380);
        numberRef.current?.animate(
          [
            { color: 'hsl(var(--primary))' },
            { color: 'hsl(var(--primary))', offset: 0.45 },
            {},
          ],
          { duration: 520, easing: 'ease-out' },
        );
        flyRef.current?.animate(
          [
            { transform: 'scale(1) rotate(0deg)' },
            { transform: 'scale(1.22) rotate(-12deg)', offset: 0.28 },
            { transform: 'scale(0.95) rotate(6deg)', offset: 0.62 },
            { transform: 'scale(1) rotate(0deg)' },
          ],
          { duration: 520, easing: PUNCH_EASE },
        );
        haloRef.current?.animate(
          [
            { opacity: 0, transform: 'scale(0.8)' },
            { opacity: 1, transform: 'scale(1.1)', offset: 0.3 },
            { opacity: 0, transform: 'scale(1.45)' },
          ],
          { duration: 700, easing: PUNCH_EASE },
        );
      },
      merged ? MERGE_TICK_MS : FIRST_TICK_MS,
    );
    return () => window.clearTimeout(timer);
  }, [toast.to, merged, reduce]);

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
          <span
            ref={haloRef}
            aria-hidden="true"
            className="pointer-events-none absolute -inset-2 rounded-full bg-[radial-gradient(closest-side,rgba(245,158,11,0.34),rgba(79,145,73,0.16)_60%,transparent)] opacity-0"
          />
          <span ref={flyRef} className="relative grid place-items-center">
            <Fly size={27} paused y={-3} interactive={false} />
          </span>
          {!reduce && (
            <Sparks
              key={toast.to}
              delay={(merged ? MERGE_TICK_MS : FIRST_TICK_MS) - 20}
            />
          )}
        </motion.span>
        <span ref={numberRef} className="inline-block origin-center text-foreground">
          <AnimatedNumber
            value={value}
            haptics
            className="inline-block min-w-[2ch] text-[16px] font-black leading-none tabular-nums"
          />
        </span>
        <motion.span
          initial={reduce ? false : { scale: 0.2, opacity: 0, rotate: -14, x: 6 }}
          animate={{ scale: 1, opacity: 1, rotate: 0, x: 0 }}
          transition={{
            type: 'spring',
            stiffness: 620,
            damping: 15,
            delay: 0.2,
            opacity: { duration: 0.1, delay: 0.2 },
          }}
          className="inline-grid"
        >
          <span
            ref={chipRef}
            className="grid h-[26px] place-items-center rounded-full bg-[#447d3f] px-2.5 text-[12.5px] font-black leading-none tabular-nums text-white shadow-[0_2px_0_0_#2c511a]"
          >
            +{delta}
          </span>
        </motion.span>
      </div>
    </motion.div>
  );
}
