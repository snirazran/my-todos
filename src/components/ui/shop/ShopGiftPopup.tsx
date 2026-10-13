'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Crown, Sparkles, X } from 'lucide-react';
import Fly from '@/components/ui/fly';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import {
  patchInventoryFlies,
  patchInventoryShopGiftClaimed,
} from '@/hooks/useInventory';
import { hapticCelebrate, hapticSuccess, hapticTick } from '@/lib/haptics';
import { whenScreenIsFree } from '@/lib/popupGate';
import { markFlyEarn } from '@/lib/flyEarn';
import { flyFliesToCounter } from '@/lib/flyFlight';
import type { ShopGiftStatus } from '@/lib/economy/shopGift';
import { cn } from '@/lib/utils';

type Reveal = {
  amount: number;
  lucky: boolean;
  luckyMultiplier: number;
  plus: boolean;
  plusMultiplier: number;
  endsAt: string;
};

type Phase = 'hidden' | 'offer' | 'claiming' | 'revealed';

let dismissedDayKey: string | null = null;

function hoursUntil(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.max(1, Math.round(ms / 3_600_000));
}

export function ShopGiftPopup({
  active,
  gift,
}: {
  active: boolean;
  gift?: ShopGiftStatus;
}) {
  const [phase, setPhase] = useState<Phase>('hidden');
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [shownAmount, setShownAmount] = useState(0);
  const [flewAway, setFlewAway] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const closeTimer = useRef<number>(0);
  const medallionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const eligible =
    active && !!gift?.available && dismissedDayKey !== gift.dayKey;

  useEffect(() => {
    if (!eligible || phase !== 'hidden') return;
    return whenScreenIsFree(() => setPhase('offer'), {
      initialDelayMs: 450,
      dropAfterMs: 20_000,
    });
  }, [eligible, phase]);

  useEffect(() => {
    if (!active && phase === 'offer') setPhase('hidden');
  }, [active, phase]);

  const close = () => {
    window.clearTimeout(closeTimer.current);
    if (gift) dismissedDayKey = gift.dayKey;
    setPhase('hidden');
  };

  const collect = async () => {
    if (phase !== 'offer') return;
    hapticTick();
    setError(null);
    setPhase('claiming');
    try {
      const res = await fetch('/api/skins/shop-gift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Claim failed');

      patchInventoryShopGiftClaimed();
      if (!data.granted) {
        close();
        return;
      }

      setReveal({
        amount: data.amount,
        lucky: !!data.lucky,
        luckyMultiplier: data.luckyMultiplier ?? 2,
        plus: !!data.plus,
        plusMultiplier: data.plusMultiplier ?? 2,
        endsAt: data.endsAt,
      });
      setShownAmount(0);
      setFlewAway(false);
      setPhase('revealed');
      requestAnimationFrame(() => setShownAmount(data.amount));
      if (data.lucky) hapticCelebrate();
      else hapticSuccess();

      const settle = () => {
        markFlyEarn();
        patchInventoryFlies(data.balance);
      };
      const finish = () => {
        closeTimer.current = window.setTimeout(close, 1100);
      };
      closeTimer.current = window.setTimeout(() => {
        const from = medallionRef.current?.getBoundingClientRect();
        if (!from) {
          settle();
          finish();
          return;
        }
        setFlewAway(true);
        flyFliesToCounter({
          from,
          count: data.amount,
          onFirstLand: settle,
          onAllLanded: finish,
        });
      }, 650);
    } catch {
      setError("Couldn't collect, try again");
      setPhase('offer');
    }
  };

  if (!mounted) return null;

  const offerAmount = gift?.amount ?? 0;
  const firstGift = !!gift?.first;
  const nextIn = reveal ? hoursUntil(reveal.endsAt) : null;
  const revealed = phase === 'revealed' && !!reveal;
  const golden = !!reveal?.lucky;

  return createPortal(
    <AnimatePresence>
      {phase !== 'hidden' && (
        <motion.div
          key="shop-gift-backdrop"
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          onClick={phase === 'offer' ? close : undefined}
          className="fixed inset-0 z-[79] bg-slate-950/45"
        />
      )}
      {phase !== 'hidden' && (
        <motion.div
          key="shop-gift"
          role="dialog"
          aria-label="Daily shop gift"
          initial={{ opacity: 0, y: 48, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 28, scale: 0.94 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          className={cn(
            'fixed inset-x-4 z-[80] mx-auto max-w-[400px]',
            'bottom-[calc(env(safe-area-inset-bottom)+76px+0.75rem)] md:bottom-8',
          )}
        >
          <div
            className={cn(
              'relative overflow-hidden rounded-[30px] border bg-card px-5 pb-5 pt-6 shadow-2xl shadow-black/15 dark:shadow-black/50',
              golden ? 'border-amber-400/70' : 'border-border/60',
            )}
          >
            <div
              aria-hidden
              className={cn(
                'pointer-events-none absolute inset-x-0 top-0 h-36',
                golden
                  ? 'bg-gradient-to-b from-amber-300/45 to-transparent'
                  : 'bg-gradient-to-b from-emerald-300/30 to-transparent dark:from-emerald-500/15',
              )}
            />

            {phase === 'offer' && (
              <button
                type="button"
                aria-label="Not now"
                onClick={close}
                className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-muted/70 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            )}

            <div className="relative flex flex-col items-center text-center">
              <div ref={medallionRef} className="relative grid h-24 w-24 place-items-center">
                <span
                  aria-hidden
                  className="gift-rays absolute -inset-6 rounded-full opacity-70"
                  style={{
                    backgroundImage: `repeating-conic-gradient(from 0deg, ${
                      golden ? 'rgba(251,191,36,0.55)' : 'rgba(134,239,172,0.55)'
                    } 0deg 12deg, transparent 12deg 30deg)`,
                    maskImage: 'radial-gradient(circle, black 30%, transparent 70%)',
                    WebkitMaskImage: 'radial-gradient(circle, black 30%, transparent 70%)',
                  }}
                />
                <motion.span
                  animate={
                    revealed
                      ? { scale: flewAway ? 0.92 : [1, 1.2, 1], rotate: flewAway ? 0 : [0, -10, 0] }
                      : { scale: 1, rotate: 0 }
                  }
                  transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
                  className={cn(
                    'relative grid h-20 w-20 place-items-center rounded-full shadow-[inset_0_-4px_0_rgba(0,0,0,0.08),0_6px_16px_rgba(0,0,0,0.12)] ring-4',
                    golden
                      ? 'bg-gradient-to-b from-amber-100 to-amber-200 ring-amber-300'
                      : 'bg-gradient-to-b from-[#f4fbe9] to-[#dff3cf] ring-[#b9e29b] dark:from-emerald-950 dark:to-emerald-900 dark:ring-emerald-700',
                  )}
                >
                  <motion.span
                    animate={{ opacity: flewAway ? 0 : 1, scale: flewAway ? 0.5 : 1 }}
                    transition={{ duration: 0.25 }}
                    className={cn(!revealed && 'gift-float')}
                  >
                    <Fly size={60} alwaysPlay />
                  </motion.span>
                </motion.span>
              </div>

              <AnimatePresence mode="wait" initial={false}>
                {revealed && reveal ? (
                  <motion.div
                    key="revealed"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 flex flex-col items-center"
                  >
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[40px] font-black leading-none tabular-nums text-foreground">
                        +<AnimatedNumber value={shownAmount} />
                      </span>
                      <span className="text-lg font-black text-muted-foreground">flies</span>
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
                      {reveal.lucky && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/25 px-2.5 py-1 text-[12px] font-black text-amber-700 dark:text-amber-300">
                          <Sparkles className="h-3.5 w-3.5" />
                          Lucky find ×{reveal.luckyMultiplier}
                        </span>
                      )}
                      {reveal.plus && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[12px] font-black text-emerald-700 dark:text-emerald-300">
                          <Crown className="h-3.5 w-3.5" />
                          Plus ×{reveal.plusMultiplier}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-[13px] font-bold text-muted-foreground">
                      {nextIn ? `Next gift in ${nextIn}h` : 'Next gift tomorrow'}
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="offer"
                    exit={{ opacity: 0, y: -10 }}
                    className="mt-4 flex w-full flex-col items-center"
                  >
                    <p className="text-[13px] font-black uppercase tracking-wider text-[#447d3f] dark:text-emerald-400">
                      {firstGift ? 'Welcome gift' : 'Daily shop gift'}
                    </p>
                    <p className="mt-1 text-[26px] font-black leading-tight tracking-tight text-foreground">
                      {offerAmount > 0 ? `${offerAmount} free flies` : 'Free flies'}
                    </p>
                    <p
                      className={cn(
                        'mt-1 text-sm font-semibold',
                        error ? 'text-rose-500' : 'text-muted-foreground',
                      )}
                    >
                      {error ??
                        (firstGift
                          ? 'A first-visit bonus. Come back daily for more.'
                          : 'Waiting for you today.')}
                    </p>
                    <button
                      type="button"
                      onClick={collect}
                      disabled={phase === 'claiming'}
                      className={cn(
                        'mt-5 h-14 w-full rounded-2xl text-lg font-black tracking-tight text-white transition-[transform,box-shadow] duration-100',
                        'bg-[#447d3f] shadow-[0_4px_0_0_#2c511a] ring-1 ring-[#2c511a]/40',
                        '[@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-[0_5px_0_0_#2c511a] active:translate-y-1 active:shadow-none',
                        'disabled:opacity-70',
                      )}
                    >
                      {phase === 'claiming'
                        ? 'Opening…'
                        : offerAmount > 0
                          ? `Claim ${offerAmount} flies`
                          : 'Claim'}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
