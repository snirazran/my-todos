'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import Fly from '@/components/ui/fly';
import { patchInventoryShopGiftClaimed } from '@/hooks/useInventory';
import { hapticCelebrate, hapticSuccess, hapticTick } from '@/lib/haptics';
import { whenScreenIsFree } from '@/lib/popupGate';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { presentFlyReward } from '@/components/ui/questRewardReveal';
import type { ShopGiftStatus } from '@/lib/economy/shopGift';
import { cn } from '@/lib/utils';

type Phase = 'hidden' | 'offer' | 'claiming';

type Notice = { title: string; body: string };

const REFUSALS: Record<string, Notice> = {
  claimed: {
    title: 'Already collected',
    body: "You've opened today's gift. A new one arrives with tomorrow's shop.",
  },
  breaker: {
    title: 'Daily fly limit reached',
    body: "You've earned today's max flies. A new gift arrives with tomorrow's shop.",
  },
};

let dismissedDayKey: string | null = null;

export function ShopGiftPopup({
  active,
  gift,
  claimRequest = 0,
}: {
  active: boolean;
  gift?: ShopGiftStatus;
  claimRequest?: number;
}) {
  const [phase, setPhase] = useState<Phase>('hidden');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [fromTile, setFromTile] = useState(false);
  const medallionRef = useRef<HTMLDivElement | null>(null);
  const claimedRef = useRef(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useEffect(
    () => () => {
      if (claimedRef.current) patchInventoryShopGiftClaimed();
    },
    [],
  );

  useEffect(() => {
    if (phase === 'hidden') return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => (closeButtonRef.current ?? dialogRef.current)?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeButtonRef.current?.click();
      if (event.key !== 'Tab') return;
      const controls = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
    };
  }, [phase === 'hidden']);

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
    if (gift) dismissedDayKey = gift.dayKey;
    if (claimedRef.current) {
      claimedRef.current = false;
      patchInventoryShopGiftClaimed();
    }
    setNotice(null);
    setPhase('hidden');
  };

  const collect = async (tile = false) => {
    if (phase !== 'offer' && phase !== 'hidden') return;
    hapticTick();
    setError(null);
    setNotice(null);
    setFromTile(tile && phase === 'hidden');
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

      if (!data.granted) {
        patchInventoryShopGiftClaimed();
        const refusal = REFUSALS[data.reason];
        if (!refusal) {
          close();
          return;
        }
        setNotice(refusal);
        setPhase('offer');
        return;
      }
      claimedRef.current = true;

      if (data.lucky) hapticCelebrate();
      else hapticSuccess();
      presentFlyReward({
        amount: data.amount,
        balanceAfter: data.balance,
        source: medallionRef.current?.getBoundingClientRect(),
      });
      close();
    } catch {
      setError("Couldn't collect, try again");
      setPhase('offer');
    }
  };

  useEffect(() => {
    if (claimRequest > 0) void collect(true);
  }, [claimRequest]);

  const offerAmount = gift?.amount ?? 0;
  const firstGift = !!gift?.first;
  const opening = phase === 'claiming' && fromTile;

  return phase !== 'hidden' ? (
    <BaseSheet
      open
      onOpenChange={(open) => { if (!open && phase === 'offer') close(); }}
      showClose={false}
      className="max-h-[90dvh] bg-gradient-to-b from-emerald-100 to-card dark:from-emerald-950 dark:to-card sm:max-w-[400px]"
      backdropClassName="bg-slate-950/45"
    >
      {({ bindScroll }) => (
        <div ref={(el) => { dialogRef.current = el; bindScroll(el); }} role="dialog" aria-modal="true" aria-label="Daily shop gift" tabIndex={-1} className="overflow-y-auto">
          <div
            className={cn(
              'relative overflow-hidden px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4 sm:pt-8',
            )}
          >
            {phase === 'offer' && (
              <button
                type="button"
                ref={closeButtonRef}
                aria-label="Not now"
                onClick={close}
                className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            )}

            <div className="relative flex flex-col items-center text-center">
              <div ref={medallionRef} className="relative grid h-28 w-28 place-items-center">
                <span
                  aria-hidden
                  className="gift-rays absolute -inset-6 rounded-full opacity-70"
                  style={{
                    backgroundImage: `repeating-conic-gradient(from 0deg, rgba(134,239,172,0.55) 0deg 12deg, transparent 12deg 30deg)`,
                    maskImage: 'radial-gradient(circle, black 30%, transparent 70%)',
                    WebkitMaskImage: 'radial-gradient(circle, black 30%, transparent 70%)',
                  }}
                />
                <span className="relative grid h-24 w-24 place-items-center rounded-full bg-gradient-to-b from-[#f4fbe9] to-[#dff3cf] shadow-[inset_0_-4px_0_rgba(0,0,0,0.08),0_6px_16px_rgba(0,0,0,0.12)] ring-4 ring-[#b9e29b] dark:from-emerald-950 dark:to-emerald-900 dark:ring-emerald-700">
                  <span className="gift-float"><Fly size={60} alwaysPlay /></span>
                </span>
              </div>

              <div className="w-full">
                <div className="flow-root pb-2">
                  <AnimatePresence mode="wait" initial={false}>
                    {opening ? (
                      <motion.div
                        key="opening"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="mt-4 flex flex-col items-center"
                      >
                        <p className="text-[26px] font-black leading-tight tracking-tight text-foreground">
                          Opening…
                        </p>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="offer"
                        exit={{ opacity: 0, y: -10 }}
                        className="mt-4 flex w-full flex-col items-center"
                      >
                        <p className="text-[28px] font-black leading-tight tracking-tight text-foreground">
                          {notice
                            ? notice.title
                            : offerAmount > 0
                              ? `${offerAmount} free flies`
                              : 'Free flies'}
                        </p>
                        <p
                          className={cn(
                            'mt-2 max-w-[28ch] text-sm font-semibold leading-relaxed',
                            error ? 'text-rose-500' : 'text-muted-foreground',
                          )}
                        >
                          {notice?.body ??
                            error ??
                            (firstGift
                              ? 'A first-visit bonus. Come back daily for more.'
                              : 'Waiting for you today.')}
                        </p>
                        <button
                          type="button"
                          onClick={notice ? close : () => void collect()}
                          disabled={phase === 'claiming'}
                          className={cn(
                            'mt-6 h-14 w-full rounded-2xl text-lg font-black tracking-tight text-white transition-[transform,box-shadow] duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary',
                            'bg-[#447d3f] shadow-[0_4px_0_0_#2c511a] ring-1 ring-[#2c511a]/40',
                            '[@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-[0_5px_0_0_#2c511a] active:translate-y-1 active:shadow-none',
                            'disabled:opacity-70',
                          )}
                        >
                          {notice
                            ? 'Got it'
                            : phase === 'claiming'
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
            </div>
          </div>
        </div>
      )}
    </BaseSheet>
  ) : null;
}

export function ShopGiftTile({
  gift,
  onClaim,
}: {
  gift: ShopGiftStatus;
  onClaim: () => void;
}) {
  const amount = gift.amount ?? 0;
  return (
    <button
      type="button"
      onClick={onClaim}
      className="flex w-full items-center gap-3 rounded-[20px] border-2 border-[#b9e29b] bg-card p-2.5 pr-3 text-left transition-transform active:scale-[0.98] dark:border-emerald-700"
    >
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-b from-[#f4fbe9] to-[#dff3cf] dark:from-emerald-950 dark:to-emerald-900">
        <span className="gift-float">
          <Fly size={38} paused interactive={false} />
        </span>
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-[12px] font-black text-[#447d3f] dark:text-emerald-400">
          {gift.first ? 'Welcome gift' : 'Daily shop gift'}
        </span>
        <span className="mt-0.5 block truncate text-[15px] font-black text-foreground">
          {amount > 0 ? `${amount} free flies` : 'Free flies'}
        </span>
      </span>
      <span className="grid h-10 shrink-0 place-items-center rounded-xl bg-[#447d3f] px-4 text-[13px] font-black text-white shadow-[0_3px_0_0_#2c511a]">
        Claim
      </span>
    </button>
  );
}
