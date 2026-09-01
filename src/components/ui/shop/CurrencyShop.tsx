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
import { useInventory, patchInventoryFlies } from '@/hooks/useInventory';
import { rewardedAdsAvailable, showRewardedAd } from '@/lib/ads';
import { useRewardedAdPreload } from '@/hooks/useRewardedAdPreload';
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

/**
 * A pond, one hour later per tier: dawn mist over the cheapest pack, golden
 * hour behind the biggest. Escalation lives in the artwork's own scene rather
 * than in the card chrome, so the ladder reads at a glance without six
 * competing borders — the only cards that get a coloured edge are the ones
 * actually being merchandised.
 *
 * `sky` is the wash behind the art, `sun` the glow it sits against, `water`
 * the band it stands on. The packs from the bucket up are objects resting on
 * something, so they also get a contact shadow; the loose flies do not, since
 * a fly in flight touching the ground is exactly the wrong read.
 */
const TIER_SCENE = [
  {
    sky: 'from-slate-100 to-emerald-50 dark:from-slate-800 dark:to-slate-900',
    sun: 'bg-emerald-200/40 dark:bg-emerald-400/10',
    water: 'from-slate-300/40 dark:from-slate-950/50',
  },
  {
    sky: 'from-emerald-100 to-lime-50 dark:from-emerald-900/60 dark:to-slate-900',
    sun: 'bg-lime-300/40 dark:bg-emerald-400/15',
    water: 'from-emerald-300/40 dark:from-emerald-950/60',
  },
  {
    sky: 'from-teal-100 to-emerald-50 dark:from-teal-900/60 dark:to-slate-900',
    sun: 'bg-teal-300/40 dark:bg-teal-400/15',
    water: 'from-teal-300/40 dark:from-teal-950/60',
  },
  {
    sky: 'from-sky-100 to-cyan-50 dark:from-sky-900/60 dark:to-slate-900',
    sun: 'bg-sky-300/45 dark:bg-sky-400/15',
    water: 'from-sky-300/45 dark:from-sky-950/60',
  },
  {
    sky: 'from-orange-100 to-amber-50 dark:from-orange-900/50 dark:to-slate-900',
    sun: 'bg-orange-300/45 dark:bg-orange-400/15',
    water: 'from-orange-300/45 dark:from-orange-950/60',
  },
  {
    sky: 'from-amber-200 to-yellow-50 dark:from-amber-900/60 dark:to-slate-900',
    sun: 'bg-amber-300/60 dark:bg-amber-400/20',
    water: 'from-amber-400/45 dark:from-amber-950/60',
  },
];

/** From the bucket up the artwork is an object standing in the scene. */
const FIRST_GROUNDED_BUNDLE = 4;

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
  const { data: inventoryData } = useInventory(open, true);
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

  const handlePurchased = async (report: (info: string) => void) => {
    boughtRef.current = true;
    markCampaignConverted();
    emitCampaignTrigger('purchase_completed');
    const before = inventoryData?.wardrobe?.flies ?? 0;
    const deadline = Date.now() + 60000;
    let attempt = 0;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      attempt += 1;
      let seen: string | number = 'err';
      try {
        const res = await fetch(
          `/api/skins/inventory?view=summary&t=${Date.now()}`,
          { cache: 'no-store' },
        );
        const payload = await res.json();
        const flies = payload?.wardrobe?.flies;
        seen = typeof flies === 'number' ? flies : 'undef';
        if (typeof flies === 'number' && flies > before) {
          patchInventoryFlies(flies);
          void revalidateAll(() => true);
          return true;
        }
      } catch (error) {
        seen = error instanceof Error ? error.message : 'throw';
      }
      report(`#${attempt} base ${before} got ${seen}`);
    }
    return false;
  };

  const shared = {
    showArt: artReady,
    coversId,
    onPurchased: handlePurchased,
  };

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

            <p className="mb-2 mt-5 px-1 text-[12px] font-black text-muted-foreground">
              Fly packs
            </p>

            {/* Four small tiers side by side stay comparable at a glance, then
                the ladder opens up: the top two packs get the width and the
                stage their artwork was drawn for. */}
            <div className="grid grid-cols-2 gap-2.5">
              {packs.slice(0, 4).map((pack, index) => (
                <PackCard
                  key={pack.id}
                  pack={pack}
                  bundle={index + 1}
                  variant="grid"
                  {...shared}
                />
              ))}
            </div>

            <div className="mt-2.5 flex flex-col gap-2.5">
              <PackCard pack={packs[4]} bundle={5} variant="wide" {...shared} />
              <PackCard pack={packs[5]} bundle={6} variant="hero" {...shared} />
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

function PackStage({
  bundle,
  showArt,
  fallback,
  rays = false,
  className,
}: {
  bundle: number;
  showArt: boolean;
  fallback: React.ReactNode;
  rays?: boolean;
  className?: string;
}) {
  const scene = TIER_SCENE[bundle - 1] ?? TIER_SCENE[0];
  const grounded = bundle >= FIRST_GROUNDED_BUNDLE;
  return (
    <span
      className={cn(
        'relative flex items-center justify-center overflow-hidden rounded-[18px] bg-gradient-to-b ring-1 ring-inset ring-black/[0.07] dark:ring-white/[0.06]',
        scene.sky,
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute -top-1/4 left-1/2 h-[110%] w-[130%] -translate-x-1/2 rounded-full blur-2xl',
          scene.sun,
        )}
      />
      {rays && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-[260%] w-[160%] -translate-x-1/2 -translate-y-1/2 animate-[spin_60s_linear_infinite] text-amber-500/20 will-change-transform dark:text-amber-300/15"
          style={{
            background:
              'repeating-conic-gradient(from 0deg, transparent 0deg 13deg, currentColor 13deg 26deg)',
            maskImage:
              'radial-gradient(circle at center, black 10%, transparent 68%)',
            WebkitMaskImage:
              'radial-gradient(circle at center, black 10%, transparent 68%)',
          }}
        />
      )}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 h-[30%] bg-gradient-to-t to-transparent',
          scene.water,
        )}
      />
      {grounded && (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-[13%] left-1/2 h-2 w-[42%] -translate-x-1/2 rounded-[50%] bg-black/20 blur-[5px] dark:bg-black/50"
        />
      )}
      <span
        className={cn(
          'relative h-full w-full transition-opacity duration-300',
          showArt ? 'opacity-100' : 'opacity-0',
        )}
      >
        {showArt && (
          <BundleArt bundle={bundle} className="h-full w-full" fallback={fallback} />
        )}
      </span>
    </span>
  );
}

function PackCard({
  pack,
  bundle,
  variant,
  coversId,
  showArt,
  onPurchased,
}: {
  pack: Pack;
  bundle: number;
  variant: 'grid' | 'wide' | 'hero';
  coversId: string | null;
  showArt: boolean;
  onPurchased: (report: (info: string) => void) => Promise<boolean>;
}) {
  const covers = pack.id === coversId;
  const popular = !covers && pack.badge === 'popular';
  const best = !covers && pack.badge === 'best';
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
        const landed = await onPurchased((info) => setStatus(`Adding flies ${info}`));
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
    <span className="flex h-full items-center justify-center">
      {pack.flies.map((size, i) => (
        <span
          key={i}
          className={cn(i > 0 && '-ml-2 sm:-ml-1.5')}
          style={{ transform: `translateY(${i % 2 === 1 ? -8 : 0}px)` }}
        >
          <Fly size={size} y={-2} alwaysPlay />
        </span>
      ))}
    </span>
  );

  const badge = (covers || popular || best) && (
    <span
      className={cn(
        'absolute z-10 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black shadow-sm',
        variant === 'hero' ? 'left-4 top-4 px-2.5 py-1 text-[11px]' : 'left-3.5 top-3.5',
        best
          ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-amber-950'
          : 'bg-primary text-primary-foreground',
      )}
    >
      {covers ? '✓ Covers it' : popular ? '★ Popular' : '👑 Best value'}
    </span>
  );

  const amount = (
    <span className="flex items-baseline gap-1.5">
      <span
        className={cn(
          'font-black leading-none tabular-nums text-foreground',
          variant === 'hero'
            ? 'text-[32px]'
            : variant === 'wide'
              ? 'text-2xl'
              : 'text-xl',
        )}
      >
        {pack.amount.toLocaleString()}
      </span>
      <span className="text-[11px] font-black text-muted-foreground">Flies</span>
    </span>
  );

  const bonus = pack.bonus && (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-[10px] font-black leading-none',
        best
          ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400'
          : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
      )}
    >
      {pack.bonus} bonus
    </span>
  );

  const priceButton = (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-2xl font-black tracking-wide text-white transition-all group-hover:-translate-y-0.5 group-active:translate-y-1 group-active:shadow-none',
        best
          ? 'bg-[#d99215] shadow-[0_4px_0_0_#96610a] group-hover:shadow-[0_5px_0_0_#96610a]'
          : 'bg-[#4f9149] shadow-[0_4px_0_0_#34631f] group-hover:shadow-[0_5px_0_0_#34631f]',
        variant === 'grid' ? 'h-10 w-full text-sm' : 'h-12 min-w-[104px] px-4 text-base',
      )}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : pack.price}
    </span>
  );

  // The artwork is drawn sticker-style — thick outlines, flat fills — so the
  // cards carry a real edge rather than a hairline, and the merchandised ones
  // add a glow instead of a heavier border.
  const shell = cn(
    'group relative w-full rounded-[22px] p-2.5 text-left transition-all hover:-translate-y-0.5 active:scale-[0.99] disabled:opacity-70',
    covers || popular
      ? 'bg-primary/[0.06] ring-2 ring-primary shadow-lg shadow-primary/15'
      : best
        ? 'bg-amber-400/[0.08] ring-2 ring-amber-400 shadow-lg shadow-amber-500/20'
        : 'bg-card ring-2 ring-border/60 hover:ring-border',
  );

  const statusLine = status && (
    <span className="block text-[10px] font-bold leading-none text-muted-foreground">
      {status}
    </span>
  );

  if (variant === 'hero') {
    return (
      <button type="button" onClick={buy} disabled={busy} className={cn(shell, 'p-3')}>
        {badge}
        <PackStage
          bundle={bundle}
          showArt={showArt}
          fallback={flyCluster}
          rays
          className="h-36 w-full sm:h-40"
        />
        <span className="mt-3 flex items-center justify-between gap-3 px-1">
          <span className="flex min-w-0 flex-col items-start gap-1.5">
            {amount}
            {bonus}
            {statusLine}
          </span>
          {priceButton}
        </span>
      </button>
    );
  }

  if (variant === 'wide') {
    return (
      <button
        type="button"
        onClick={buy}
        disabled={busy}
        className={cn(shell, 'flex items-center gap-3')}
      >
        {badge}
        <PackStage
          bundle={bundle}
          showArt={showArt}
          fallback={flyCluster}
          className="h-24 w-32 shrink-0"
        />
        <span className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
          {amount}
          {bonus}
          {statusLine}
        </span>
        {priceButton}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={buy}
      disabled={busy}
      className={cn(shell, 'flex flex-col gap-2')}
    >
      {badge}
      <PackStage
        bundle={bundle}
        showArt={showArt}
        fallback={flyCluster}
        className="h-24 w-full"
      />
      {/* The cheapest pack carries no bonus chip, so the buttons only line up
          across a row if the price is pinned to the bottom of the card. */}
      <span className="flex w-full flex-col items-start gap-1.5 px-0.5">
        {amount}
        {bonus}
        {statusLine}
      </span>
      <span className="mt-auto w-full">{priceButton}</span>
    </button>
  );
}

function PlusFliesCard() {
  const openPremium = useUIStore((s) => s.setPremiumModalOpen);
  return (
    <div>
      <p className="mb-2 mt-5 px-1 text-[12px] font-black text-muted-foreground">
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

  useRewardedAdPreload('daily_flies', open && available);

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
      <p className="mb-2 mt-5 px-1 text-[12px] font-black text-muted-foreground">
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
