'use client';

import React, { useEffect, useRef, useState } from 'react';
import useSWR, { mutate as revalidateAll } from 'swr';
import { Loader2, SquarePlay } from 'lucide-react';
import confetti from 'canvas-confetti';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { cn } from '@/lib/utils';
import Fly from '@/components/ui/fly';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { Icon } from '@/components/ui/Icon';
import { useUIStore } from '@/lib/uiStore';
import { useInventory, patchInventoryFlies, mutateInventoryCaches } from '@/hooks/useInventory';
import { rewardedAdsAvailable, showRewardedAd } from '@/lib/ads';
import { hapticSuccess } from '@/lib/haptics';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';
import { getFlyPackPrices, purchaseFlyPack } from '@/lib/purchases';
import { getFlyPack, type FlyPackId } from '@/lib/flyPacks';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import { prefetchStoreBundleBytes } from '@/lib/riveLoader';
import { emitCampaignTrigger, markCampaignConverted } from '@/lib/campaigns/orchestrator';
import { WishlistGoalCard } from './WishlistGoalCard';
import { BundleArt } from './BundleArt';

type Pack = {
  id: string;
  amount: number;
  price: string;
  bonus?: string;
  badge?: 'popular' | 'best';
  flies: number[];
};

const PACK_META: Omit<Pack, 'amount'>[] = [
  { id: 'pinch', price: '$1.99', flies: [30] },
  { id: 'rare-jar', price: '$4.99', bonus: '+14%', badge: 'popular', flies: [32, 22] },
  { id: 'swarm', price: '$9.99', bonus: '+37%', flies: [36, 26] },
  { id: 'epic-cloud', price: '$19.99', bonus: '+48%', flies: [36, 28, 20] },
  { id: 'mega-swarm', price: '$49.99', bonus: '+59%', flies: [40, 30, 22] },
  { id: 'legendary-vault', price: '$99.99', bonus: '+71%', badge: 'best', flies: [44, 34, 26, 20] },
];

const PACKS: Pack[] = PACK_META.map((meta) => ({
  ...meta,
  amount: getFlyPack(meta.id)?.amount ?? 0,
}));


type AdFlyStatus = {
  reward: number;
  cap: number;
  remaining: number;
  cooldownSeconds?: number;
  cooldownLeft?: number;
  available?: boolean;
  isPremium?: boolean;
};

/** BaseSheet's mobile slide-in runs 400ms; give it a frame of headroom. */
const SHEET_SETTLE_MS = 440;

export function CurrencyShop() {
  const [mounted, setMounted] = useState(false);
  const [storePrices, setStorePrices] = useState<Partial<Record<FlyPackId, string>>>({});
  const open = useUIStore((s) => s.isFlyShopOpen);
  const setOpen = useUIStore((s) => s.setFlyShopOpen);
  const need = useUIStore((s) => s.flyShopNeed);
  const focusPackId = useUIStore((s) => s.flyShopFocusPackId);
  const { data: inventoryData, mutate: mutateInventory } = useInventory(open, true);
  const balance = inventoryData?.wardrobe?.flies ?? 0;
  const [artReady, setArtReady] = useState(false);
  const openedRef = useRef(false);
  const boughtRef = useRef(false);
  const packs = PACKS.map((pack) => ({
    ...pack,
    price: storePrices[pack.id as FlyPackId] ?? pack.price,
  }));
  // Arriving from a purchase they couldn't afford: point at the cheapest pack
  // that actually closes the gap, so the shop answers the question they came
  // with instead of restating the whole price ladder.
  const coversId =
    focusPackId ||
    (need
      ? (packs.find((pack) => pack.amount >= need) ?? packs[packs.length - 1]).id
      : null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      trackAnalyticsEvent('fly_shop_viewed');
      emitCampaignTrigger('shop_opened');
      boughtRef.current = false;
      openedRef.current = true;
      return;
    }
    // Left empty-handed: the one moment we know they considered spending and
    // didn't. Fires on close so it can't collide with the sheet itself.
    if (openedRef.current && !boughtRef.current) {
      emitCampaignTrigger('shop_abandoned');
    }
    openedRef.current = false;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void getFlyPackPrices().then(setStorePrices).catch(() => {});
  }, [open]);

  // The pack artwork is one shared Rive file, and parsing it blocks the main
  // thread — enough to visibly chew through the sheet's slide-in. So the bytes
  // start downloading on open (network only, off-thread) while the canvases
  // stay unmounted until the sheet has landed, then fade in.
  useEffect(() => {
    if (!open) {
      setArtReady(false);
      return;
    }
    void prefetchStoreBundleBytes().catch(() => {});
    const timer = window.setTimeout(() => setArtReady(true), SHEET_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!mounted) return null;

  return (
    <BaseSheet
      open={open}
      onOpenChange={setOpen}
      zIndex={1700}
      backdropClassName="bg-black/70 backdrop-blur-sm"
      className="max-h-[90vh] bg-popover sm:max-h-[85vh] sm:max-w-md"
    >
      {({ bindScroll }) => (
        <>
          <div className="flex shrink-0 items-center justify-between gap-4 px-5 pb-3 pt-2 sm:px-6 sm:pt-6">
            <h2 className="text-2xl font-black tracking-tight text-foreground sm:text-[28px]">
              Fly Shop
            </h2>
            <div className="mr-9 flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 sm:mr-10">
              <Fly size={26} y={-4} paused />
              <AnimatedNumber
                value={balance}
                haptics
                className="text-[13px] font-black tabular-nums text-foreground"
              />
            </div>
          </div>

          <div
            ref={bindScroll}
            className="min-h-0 flex-1 overflow-y-auto overscroll-none px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-6"
          >
            {need ? (
              <div className="mt-1 flex items-center justify-center gap-2 rounded-2xl bg-primary/10 px-4 py-3 ring-1 ring-primary/25">
                <span className="text-[13px] font-black text-foreground">
                  You need
                </span>
                <span className="text-[13px] font-black tabular-nums text-foreground">
                  {need.toLocaleString()}
                </span>
                <span className="text-[13px] font-black text-foreground">
                  more flies
                </span>
                <Fly size={32} y={-4} paused />
              </div>
            ) : (
              <WishlistGoalCard open={open} onNavigate={() => setOpen(false)} />
            )}

            <FreeFliesCard open={open} />

            <div className="mt-4 flex flex-col gap-2">
              {packs.map((pack, index) => (
                <PackRow
                  key={pack.id}
                  bundle={index + 1}
                  pack={pack}
                  covers={pack.id === coversId}
                  showArt={artReady}
                  onPurchased={async () => {
                    boughtRef.current = true;
                    markCampaignConverted();
                    emitCampaignTrigger('purchase_completed');
                    const before = inventoryData?.wardrobe?.flies ?? 0;
                    const deadline = Date.now() + 60000;
                    while (Date.now() < deadline) {
                      await new Promise((resolve) => setTimeout(resolve, 1200));
                      const next = await mutateInventory();
                      if ((next?.wardrobe?.flies ?? 0) > before) {
                        mutateInventoryCaches();
                        void revalidateAll(() => true);
                        return true;
                      }
                    }
                    return false;
                  }}
                />
              ))}
            </div>

            <p className="mx-auto mt-6 max-w-[17rem] text-center text-[11px] font-medium leading-relaxed text-muted-foreground/70">
              Built by a tiny team and one very hungry frog. Every pack keeps
              Frogress hopping. 💚
            </p>
          </div>
        </>
      )}
    </BaseSheet>
  );
}

function PackRow({
  pack,
  bundle,
  covers,
  showArt,
  onPurchased,
}: {
  pack: Pack;
  bundle: number;
  covers: boolean;
  showArt: boolean;
  onPurchased: () => Promise<boolean>;
}) {
  const popular = !covers && pack.badge === 'popular';
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
        const landed = await onPurchased();
        setStatus(landed ? null : 'Still processing...');
      }
    } catch (error) {
      setStatus(error instanceof Error && error.message.includes('not configured')
        ? 'Pack unavailable'
        : 'Purchase failed');
    } finally {
      setBusy(false);
    }
  };
  const flyCluster = (
    <div className="flex h-full items-center justify-center">
      {pack.flies.map((size, i) => (
        <span
          key={i}
          className={cn(i > 0 && '-ml-2 sm:-ml-1.5')}
          style={{ transform: `translateY(${i % 2 === 1 ? -8 : 0}px)` }}
        >
          <Fly size={size} y={-2} alwaysPlay />
        </span>
      ))}
    </div>
  );
  return (
    <button
      type="button"
      onClick={buy}
      disabled={busy}
      className={cn(
        'group relative flex w-full items-center gap-3 rounded-[20px] p-2.5 pr-3 text-left transition-all hover:-translate-y-0.5 active:scale-[0.99]',
        covers || popular
          ? 'bg-gradient-to-r from-primary/10 to-card ring-2 ring-primary'
          : best
            ? 'bg-gradient-to-r from-amber-400/20 to-card ring-2 ring-amber-400'
            : 'bg-card ring-1 ring-border/70 hover:ring-border',
      )}
    >
      <span
        className={cn(
          'flex shrink-0 items-center justify-center transition-opacity duration-300',
          best ? 'h-20 w-20' : 'h-16 w-16',
          showArt ? 'opacity-100' : 'opacity-0',
        )}
      >
        {showArt && (
          <BundleArt
            bundle={bundle}
            className="h-full w-full"
            fallback={flyCluster}
          />
        )}
      </span>

      <span className="flex min-w-0 flex-1 flex-col items-start">
        {(covers || pack.badge) && (
          <span
            className={cn(
              'mb-1 inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest',
              covers || popular
                ? 'bg-primary text-primary-foreground'
                : 'bg-gradient-to-r from-amber-400 to-amber-500 text-amber-950',
            )}
          >
            {covers ? '✓ Covers it' : popular ? '★ Popular' : '👑 Best value'}
          </span>
        )}
        <span className="flex items-baseline gap-1.5">
          <span className="text-2xl font-black leading-none tabular-nums text-foreground">
            {pack.amount.toLocaleString()}
          </span>
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Flies
          </span>
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {pack.bonus && (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-black leading-none text-emerald-600 dark:text-emerald-400">
              {pack.bonus} bonus
            </span>
          )}
          {status && (
            <span className="text-[10px] font-bold leading-none text-muted-foreground">
              {status}
            </span>
          )}
        </span>
      </span>

      <span className="flex h-11 min-w-[86px] shrink-0 items-center justify-center rounded-2xl bg-[#4f9149] px-3 text-sm font-black tracking-wide text-white shadow-[0_4px_0_0_#34631f] transition-all group-hover:-translate-y-0.5 group-hover:shadow-[0_5px_0_0_#34631f] group-active:translate-y-1 group-active:shadow-none">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : pack.price}
      </span>
    </button>
  );
}

function PlusFliesCard() {
  const openPremium = useUIStore((s) => s.setPremiumModalOpen);
  return (
    <div>
      <p className="mb-2 mt-5 px-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
        Free flies
      </p>
      <button
        type="button"
        onClick={() => openPremium(true, 'fly_shop_free_flies')}
        className="group relative flex w-full items-center gap-3 rounded-[20px] bg-amber-500 p-3.5 text-left text-white shadow-lg shadow-amber-500/25 transition-all hover:-translate-y-0.5 active:scale-[0.99] sm:rounded-[24px] sm:p-4 dark:bg-amber-600"
      >
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15 sm:h-14 sm:w-14">
          <Icon name="frogPlus" label="Plus" className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black tracking-tight sm:text-base">
            Double every reward
          </p>
          <p className="text-xs font-semibold text-white/85">
            Bonus ad rounds are mobile-only. Plus doubles what you earn
            everywhere.
          </p>
        </div>
        <span className="flex h-11 shrink-0 items-center justify-center rounded-2xl bg-white px-3 text-xs font-black text-amber-700 shadow-sm">
          Get Plus
        </span>
      </button>
    </div>
  );
}

function FreeFliesCard({ open }: { open: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const available = rewardedAdsAvailable();

  const { data, mutate } = useSWR<AdFlyStatus>(
    open ? `/api/rewards/flies?timezone=${encodeURIComponent(timezone)}` : null,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );

  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    setCooldown(data?.cooldownLeft ?? 0);
  }, [data?.cooldownLeft]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((left) => Math.max(0, left - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  // Plus pays to not see ads, so the surface is gone rather than merely refused.
  if (data && data.available === false) return null;
  if (!available) return data ? <PlusFliesCard /> : null;

  const remaining = data?.remaining ?? 0;
  const cap = data?.cap ?? 5;
  const reward = data?.reward ?? 10;
  const exhausted = data ? remaining <= 0 : false;
  const waiting = cooldown > 0;

  const handleWatch = async () => {
    if (busy || exhausted || waiting || !data) return;
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
        {
          reward: payload.reward,
          cap: payload.cap,
          remaining: payload.remaining,
          cooldownSeconds: payload.cooldownSeconds,
          cooldownLeft: payload.cooldownLeft,
          available: true,
        },
        { revalidate: false },
      );
      setCooldown(payload.cooldownLeft ?? 0);
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
    <div>
      <p className="mb-2 mt-5 px-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
        Free flies
      </p>
      <button
        type="button"
        onClick={handleWatch}
        disabled={busy || exhausted || waiting}
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
            <SquarePlay
              className={cn('h-6 w-6 sm:h-7 sm:w-7', exhausted && 'text-muted-foreground')}
              strokeWidth={2.5}
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
            {exhausted
              ? 'Free flies — back tomorrow'
              : waiting
                ? `Free flies — ready in ${cooldown}s`
                : 'Free flies'}
          </p>
          <p
            className={cn(
              'text-xs font-semibold',
              exhausted ? 'text-muted-foreground/70' : 'text-white/85',
            )}
          >
            {exhausted
              ? `You caught all ${cap} bonus rounds today.`
              : waiting
                ? 'One at a time — the pond needs a moment.'
                : `Catch +${reward} flies.`}
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
