'use client';

import React, { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Clapperboard, Loader2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { cn } from '@/lib/utils';
import Fly from '@/components/ui/fly';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { useUIStore } from '@/lib/uiStore';
import { useInventory, patchInventoryFlies } from '@/hooks/useInventory';
import { rewardedAdsAvailable, showRewardedAd } from '@/lib/ads';
import { hapticSuccess } from '@/lib/haptics';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';
import { getFlyPackPrices, purchaseFlyPack } from '@/lib/purchases';
import type { FlyPackId } from '@/lib/flyPacks';
import { trackAnalyticsEvent } from '@/lib/analytics/client';

type Pack = {
  id: string;
  amount: number;
  price: string;
  bonus?: string;
  badge?: 'popular' | 'best';
  flies: number[];
};

const PACKS: Pack[] = [
  { id: 'pinch', amount: 200, price: '$1.99', flies: [30] },
  { id: 'rare-jar', amount: 650, price: '$4.99', bonus: '+30%', badge: 'popular', flies: [32, 22] },
  { id: 'swarm', amount: 1500, price: '$9.99', bonus: '+50%', flies: [36, 26] },
  { id: 'epic-cloud', amount: 3500, price: '$19.99', bonus: '+75%', flies: [36, 28, 20] },
  { id: 'mega-swarm', amount: 10000, price: '$49.99', bonus: '+100%', flies: [40, 30, 22] },
  { id: 'legendary-vault', amount: 22000, price: '$99.99', bonus: '+120%', badge: 'best', flies: [44, 34, 26, 20] },
];

type AdFlyStatus = {
  reward: number;
  cap: number;
  remaining: number;
};

export function CurrencyShop() {
  const [mounted, setMounted] = useState(false);
  const [storePrices, setStorePrices] = useState<Partial<Record<FlyPackId, string>>>({});
  const open = useUIStore((s) => s.isFlyShopOpen);
  const setOpen = useUIStore((s) => s.setFlyShopOpen);
  const { data: inventoryData, mutate: mutateInventory } = useInventory(open, true);
  const balance = inventoryData?.wardrobe?.flies ?? 0;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) trackAnalyticsEvent('fly_shop_viewed');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void getFlyPackPrices().then(setStorePrices).catch(() => {});
  }, [open]);

  if (!mounted) return null;

  return (
    <BaseSheet
      open={open}
      onOpenChange={setOpen}
      zIndex={1700}
      backdropClassName="bg-black/70 backdrop-blur-sm"
      className="max-h-[90vh] bg-popover sm:max-h-[85vh] sm:max-w-2xl"
    >
      {({ bindScroll }) => (
        <>
          <div className="flex shrink-0 items-center justify-between gap-4 px-6 pb-4 pt-2 sm:pt-7">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                Fly Shop
              </h2>
              <div className="mt-1 flex items-center gap-1.5">
                <Fly size={22} y={-1} alwaysPlay />
                <AnimatedNumber
                  value={balance}
                  haptics
                  className="text-[13px] font-extrabold tabular-nums text-muted-foreground"
                />
                <span className="text-[13px] font-extrabold text-muted-foreground">
                  flies
                </span>
              </div>
            </div>
          </div>

          <div
            ref={bindScroll}
            className="min-h-0 flex-1 overflow-y-auto overscroll-none px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
          >
            <FreeFliesCard open={open} />

            <div className="mt-4 grid grid-cols-3 gap-2.5 sm:gap-4">
              {PACKS.map((pack) => (
                <PackCard key={pack.id} pack={{ ...pack, price: storePrices[pack.id as FlyPackId] ?? pack.price }} onPurchased={() => {
                  window.setTimeout(() => void mutateInventory(), 1200);
                  window.setTimeout(() => void mutateInventory(), 5000);
                  window.setTimeout(() => void mutateInventory(), 15000);
                  window.setTimeout(() => void mutateInventory(), 45000);
                }} />
              ))}
            </div>

            <p className="mx-auto mt-7 max-w-xs text-center text-[11px] font-medium leading-relaxed text-muted-foreground/70">
              Made with love by a tiny team — every purchase keeps Frogress
              hopping. 🐸💚
            </p>
          </div>
        </>
      )}
    </BaseSheet>
  );
}

function PackCard({ pack, onPurchased }: { pack: Pack; onPurchased: () => void }) {
  const popular = pack.badge === 'popular';
  const best = pack.badge === 'best';
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const buy = async () => {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const result = await purchaseFlyPack(pack.id as FlyPackId);
      if (result === 'purchased') {
        setStatus('Adding flies...');
        onPurchased();
      }
    } catch (error) {
      setStatus(error instanceof Error && error.message.includes('not configured')
        ? 'Pack unavailable'
        : 'Purchase failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={buy}
      disabled={busy}
      className={cn(
        'group relative flex flex-col items-center overflow-hidden rounded-[20px] px-2.5 pb-2.5 pt-7 text-center transition-all hover:-translate-y-0.5 active:scale-[0.98] sm:rounded-[24px] sm:px-4 sm:pb-4 sm:pt-8',
        popular
          ? 'bg-gradient-to-b from-primary/10 to-card ring-2 ring-primary'
          : best
            ? 'bg-gradient-to-b from-amber-400/15 to-card ring-2 ring-amber-400'
            : 'bg-card ring-1 ring-border/70 hover:ring-border',
      )}
    >
      {pack.badge && (
        <span
          className={cn(
            'absolute inset-x-0 top-0 flex h-5 items-center justify-center whitespace-nowrap text-[8px] font-black uppercase tracking-widest sm:h-6 sm:text-[9px]',
            popular
              ? 'bg-primary text-primary-foreground'
              : 'bg-gradient-to-r from-amber-400 to-amber-500 text-amber-950',
          )}
        >
          {popular ? '★ Popular' : '👑 Best Value'}
        </span>
      )}

      <div className="flex h-12 items-end justify-center sm:h-14">
        {pack.flies.map((size, i) => (
          <span
            key={i}
            className={cn(i > 0 && '-ml-2 sm:-ml-1.5')}
            style={{ transform: `translateY(${i % 2 === 1 ? -8 : 0}px)` }}
          >
            <Fly size={size} y={-2} paused />
          </span>
        ))}
      </div>

      <p className="mt-1.5 text-xl font-black leading-none tabular-nums text-foreground sm:text-2xl">
        {pack.amount.toLocaleString()}
      </p>
      <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-muted-foreground sm:text-[10px]">
        Flies
      </p>

      <span className="mt-1.5 flex h-4 items-center">
        {pack.bonus && (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-black leading-none text-emerald-600 dark:text-emerald-400">
            {pack.bonus} bonus
          </span>
        )}
      </span>

      <span className="mt-2 flex h-9 w-full items-center justify-center rounded-xl bg-[#4f9149] text-xs font-black tracking-wide text-white shadow-[0_4px_0_0_#34631f] transition-all group-hover:-translate-y-0.5 group-hover:shadow-[0_5px_0_0_#34631f] group-active:translate-y-1 group-active:shadow-none sm:h-11 sm:rounded-2xl sm:text-sm">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : pack.price}
      </span>
      {status ? <span className="mt-2 text-[9px] font-bold text-muted-foreground">{status}</span> : null}
    </button>
  );
}

function FreeFliesCard({ open }: { open: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const available = rewardedAdsAvailable();

  const { data, mutate } = useSWR<AdFlyStatus>(
    available && open
      ? `/api/rewards/flies?timezone=${encodeURIComponent(timezone)}`
      : null,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );

  if (!available) return null;

  const remaining = data?.remaining ?? 0;
  const cap = data?.cap ?? 5;
  const reward = data?.reward ?? 10;
  const exhausted = data ? remaining <= 0 : false;

  const handleWatch = async () => {
    if (busy || exhausted || !data) return;
    setBusy(true);
    setError(null);
    try {
      const result = await showRewardedAd('daily_flies');
      if (result !== 'rewarded') {
        if (result === 'failed') setError('Ad not available right now — try again later.');
        return;
      }
      const res = await fetch('/api/rewards/flies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.granted) {
        setError('Could not grant flies — try again.');
        mutate();
        return;
      }
      patchInventoryFlies(payload.balance);
      mutate(
        { reward: payload.reward, cap: payload.cap, remaining: payload.remaining },
        { revalidate: false },
      );
      confetti({
        particleCount: 50,
        spread: 70,
        startVelocity: 32,
        origin: { y: 0.35 },
        zIndex: 99999,
        colors: ['#4ade80', '#22c55e', '#bbf7d0'],
      });
      hapticSuccess();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pt-2">
      <button
        type="button"
        onClick={handleWatch}
        disabled={busy || exhausted}
        className={cn(
          'group relative flex w-full items-center gap-3 rounded-[20px] p-3.5 text-left transition-all sm:rounded-[24px] sm:p-4',
          exhausted
            ? 'bg-muted/50 ring-1 ring-border/60'
            : 'bg-violet-500 text-white shadow-lg shadow-violet-500/25 hover:-translate-y-0.5 active:scale-[0.99] dark:bg-violet-600',
        )}
      >
        <div
          className={cn(
            'grid h-12 w-12 shrink-0 place-items-center rounded-2xl sm:h-14 sm:w-14',
            exhausted ? 'bg-muted' : 'bg-white/15',
          )}
        >
          {busy ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Clapperboard
              className={cn('h-6 w-6 sm:h-7 sm:w-7', exhausted && 'text-muted-foreground')}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'text-sm font-black tracking-tight sm:text-base',
              exhausted && 'text-muted-foreground',
            )}
          >
            {exhausted ? 'Free flies — back tomorrow' : 'Free flies'}
          </p>
          <p
            className={cn(
              'text-xs font-semibold',
              exhausted ? 'text-muted-foreground/70' : 'text-white/85',
            )}
          >
            {exhausted
              ? `You caught all ${cap} bonus rounds today.`
              : `Watch a short ad, catch +${reward} flies.`}
          </p>
        </div>
        {!exhausted && (
          <span className="flex shrink-0 flex-col items-center gap-0.5">
            <span className="flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-black text-violet-700 shadow-sm">
              +{reward}
              <Fly size={16} y={-2} paused />
            </span>
            <span className="text-[10px] font-bold text-white/75 tabular-nums">
              {remaining}/{cap} today
            </span>
          </span>
        )}
      </button>
      {error && (
        <p className="mt-2 text-center text-xs font-bold text-red-500">{error}</p>
      )}
    </div>
  );
}
