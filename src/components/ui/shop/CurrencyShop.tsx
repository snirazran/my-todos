'use client';

import React, { useEffect, useRef, useState } from 'react';
import useSWR, { mutate as revalidateAll } from 'swr';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import { AdPlayIcon } from '@/components/ui/AdPlayIcon';
import confetti from 'canvas-confetti';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { cn } from '@/lib/utils';
import Fly from '@/components/ui/fly';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { Icon } from '@/components/ui/Icon';
import { useUIStore } from '@/lib/uiStore';
import { useInventory, patchInventoryFlies } from '@/hooks/useInventory';
import { rewardedAdFailureMessage, rewardedAdsAvailable, showRewardedAd } from '@/lib/ads';
import { useRewardedAdPreload } from '@/hooks/useRewardedAdPreload';
import { hapticSuccess } from '@/lib/haptics';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';
import { getFlyPackPrices, purchaseFlyPack } from '@/lib/purchases';
import { FLY_PACKS, type FlyPackId } from '@/lib/flyPacks';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import { prefetchStoreBundleBytes } from '@/lib/riveLoader';
import { emitCampaignTrigger, markCampaignConverted } from '@/lib/campaigns/orchestrator';
import { BundleArt } from './BundleArt';

const PACK_TONES = [
  'from-slate-100/80 to-slate-50 dark:from-slate-800 dark:to-slate-900',
  'from-lime-100/80 to-emerald-50 dark:from-emerald-950 dark:to-slate-900',
  'from-teal-100/80 to-emerald-50 dark:from-teal-950 dark:to-slate-900',
  'from-sky-100/80 to-sky-50 dark:from-sky-950 dark:to-slate-900',
  'from-orange-100/80 to-amber-50 dark:from-orange-950 dark:to-slate-900',
  'from-amber-100 to-yellow-50 dark:from-amber-950 dark:to-slate-900',
];
const PACK_NAMES = ['Pinch', 'Jar', 'Swarm', 'Cloud', 'Mega swarm', 'Vault'];
type FreeMode = 'ads' | 'plus' | 'none';
type AdFlyStatus = {
  reward: number;
  cap: number;
  remaining: number;
  cooldownSeconds?: number;
  cooldownLeft?: number;
  available?: boolean;
  isPremium?: boolean;
};
type PurchaseStatus = { text: string; tone: 'muted' | 'success' | 'error' };

export function CurrencyShop() {
  const open = useUIStore((s) => s.isFlyShopOpen);
  const setOpen = useUIStore((s) => s.setFlyShopOpen);
  const need = useUIStore((s) => s.flyShopNeed);
  const target = useUIStore((s) => s.flyShopTarget);
  const focusPackId = useUIStore((s) => s.flyShopFocusPackId);
  const { data: inventoryData } = useInventory(open, true);
  const balance = inventoryData?.wardrobe?.flies ?? 0;
  const remaining = target ? Math.max(0, target.price - balance) : (need ?? 0);
  const [storePrices, setStorePrices] = useState<Partial<Record<FlyPackId, string>>>({});
  const [pricesLoading, setPricesLoading] = useState(true);
  const [priceError, setPriceError] = useState(false);
  const [priceAttempt, setPriceAttempt] = useState(0);
  const [selectedId, setSelectedId] = useState<FlyPackId | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [freeMode, setFreeMode] = useState<FreeMode>('none');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<PurchaseStatus | null>(null);
  const openedRef = useRef(false);
  const boughtRef = useRef(false);
  const purchaseInFlight = useRef(false);
  const sessionRef = useRef(0);
  const priceFor = (id: FlyPackId) => storePrices[id] ?? null;
  const availablePacks = FLY_PACKS.filter((pack) => pricesLoading || priceFor(pack.id));
  const suggested = availablePacks.find((pack) => pack.amount >= remaining) ?? availablePacks[availablePacks.length - 1] ?? FLY_PACKS[0];
  const defaultPack = availablePacks.find((pack) => pack.id === focusPackId) ?? suggested;
  const selected = availablePacks.find((pack) => pack.id === selectedId) ?? defaultPack;
  const focused = remaining > 0 && !showAll;
  const visiblePacks = focused
    ? [defaultPack, ...availablePacks.filter((pack) => pack.id !== defaultPack.id && pack.amount >= remaining)].slice(0, 2)
    : FLY_PACKS;
  const goalReached = !!target && !!inventoryData && remaining === 0;

  useEffect(() => {
    sessionRef.current += 1;
    if (open) {
      setSelectedId(null);
      setShowAll(false);
      setStatus(null);
      trackAnalyticsEvent('fly_shop_viewed');
      emitCampaignTrigger('shop_opened');
      boughtRef.current = false;
      openedRef.current = true;
      void prefetchStoreBundleBytes().catch(() => {});
      return;
    }
    if (openedRef.current && !boughtRef.current) emitCampaignTrigger('shop_abandoned');
    openedRef.current = false;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPricesLoading(true);
    setPriceError(false);
    void getFlyPackPrices().then((prices) => {
      if (!cancelled) {
        setStorePrices(prices);
        setPriceError(Object.keys(prices).length === 0);
      }
    }).catch(() => {
      if (!cancelled) setPriceError(true);
    }).finally(() => {
      if (!cancelled) setPricesLoading(false);
    });
    return () => { cancelled = true; };
  }, [open, priceAttempt]);

  const buy = async () => {
    if (purchaseInFlight.current || !priceFor(selected.id)) return;
    purchaseInFlight.current = true;
    const session = sessionRef.current;
    const sameSession = () => session === sessionRef.current;
    setBusy(true);
    setStatus(null);
    try {
      const result = await purchaseFlyPack(selected.id);
      if (result !== 'purchased') return;
      boughtRef.current = true;
      markCampaignConverted();
      emitCampaignTrigger('purchase_completed');
      if (sameSession()) setStatus({text: 'Adding your flies…', tone: 'muted'});
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        try {
          const res = await fetch(`/api/skins/inventory?view=summary&t=${Date.now()}`, {cache: 'no-store'});
          const payload = await res.json();
          const flies = payload?.wardrobe?.flies;
          if (typeof flies !== 'number' || flies <= balance) continue;
          patchInventoryFlies(flies);
          void revalidateAll(() => true);
          hapticSuccess();
          if (sameSession()) {
            if (target && flies >= target.price) setOpen(false);
            else setStatus({text: `${selected.amount.toLocaleString()} flies added`, tone: 'success'});
            confetti({particleCount: 50, spread: 65, origin: {y: 0.65}, zIndex: 99999, colors: ['#4ade80', '#22c55e', '#fbbf24']});
          }
          return;
        } catch { /* Retry while the store receipt is being credited. */ }
      }
      if (sameSession()) setStatus({text: 'Payment received. Your flies are still processing—no need to buy again.', tone: 'muted'});
    } catch (error) {
      if (sameSession()) setStatus({text: error instanceof Error && error.message.includes('not configured') ? 'This pack is unavailable right now. Please try again later.' : 'Purchase didn’t go through. Please try again.', tone: 'error'});
    } finally {
      purchaseInFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <BaseSheet open={open} onOpenChange={setOpen} zIndex={1700} backdropClassName="bg-black/50 backdrop-blur-sm" className="max-h-[90dvh] bg-background sm:max-h-[88dvh] sm:max-w-xl">
      {({ bindScroll, entered }) => (
        <>
          <div className="shrink-0 px-5 pb-4 pt-1 sm:px-6 sm:pt-6">
            <div className="flex items-center justify-between gap-3 pr-10">
              <h2 className="text-2xl font-black tracking-tight">{target && remaining > 0 ? 'Finish your look' : 'Fly shop'}</h2>
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-muted/70 px-2.5 py-1" aria-label={`Your balance: ${balance.toLocaleString()} flies`}>
                <Fly size={26} y={-4} paused interactive={false} />
                <AnimatedNumber value={balance} className="text-xs font-black tabular-nums" />
              </span>
            </div>
            {remaining > 0 && (
              <p className="mt-2 text-sm font-semibold text-muted-foreground">
                <span className="font-black tabular-nums text-primary">{remaining.toLocaleString()} more</span>
                {target ? <> for <span className="text-foreground">{target.name}</span></> : ' to finish your purchase'}
              </p>
            )}
          </div>

          <div ref={bindScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 sm:px-6">
            <fieldset disabled={busy}>
              <legend className="sr-only">Choose a fly pack</legend>
              <div className={cn('grid grid-cols-2 gap-3', !focused && 'sm:grid-cols-3')}>
                {visiblePacks.map((pack) => {
                  const index = FLY_PACKS.findIndex((entry) => entry.id === pack.id);
                  const checked = selected.id === pack.id;
                  const covers = remaining > 0 && pack.id === suggested.id && pack.amount >= remaining;
                  return (
                    <label key={pack.id} className="relative min-w-0 cursor-pointer">
                      <input type="radio" name="fly-pack" value={pack.id} checked={checked} disabled={!pricesLoading && !priceFor(pack.id)} onChange={() => {setSelectedId(pack.id); setStatus(null);}} className="peer sr-only" />
                      <span className={cn('relative flex h-full flex-col items-center overflow-hidden rounded-[22px] border-2 bg-gradient-to-b px-2 pb-3 pt-5 transition-[border-color,box-shadow] peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background peer-disabled:opacity-60', PACK_TONES[index], checked ? 'border-primary shadow-[0_3px_0_0_hsl(var(--primary))]' : 'border-transparent hover:border-primary/30')}>
                        {covers && <span className="absolute left-2.5 top-2.5 z-10 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-black text-primary">Covers it</span>}
                        <span aria-hidden="true" className={cn('absolute right-2.5 top-2.5 z-10 grid h-5 w-5 place-items-center rounded-full border-2', checked ? 'border-primary bg-primary text-primary-foreground' : 'border-foreground/15 bg-background/60')}>
                          {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                        </span>
                        <BundleArt bundle={index + 1} animate={entered && checked} className="h-32 w-full sm:h-36" />
                        <span className="text-[26px] font-black leading-none tabular-nums tracking-tight">{pack.amount.toLocaleString()}</span>
                        <span className="mt-1 text-[11px] font-bold text-muted-foreground">flies <span aria-hidden="true">·</span> {PACK_NAMES[index]}</span>
                        <span className="mt-2 text-sm font-black tabular-nums text-primary">{priceFor(pack.id) ?? (pricesLoading ? 'Loading…' : 'Unavailable')}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            {priceError && (
              <div role="status" className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-muted px-3 py-2 text-xs font-semibold">
                <span>Prices couldn’t load.</span>
                <button type="button" onClick={() => setPriceAttempt((attempt) => attempt + 1)} className="min-h-10 rounded-full px-3 font-black text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Retry</button>
              </div>
            )}
            {focused && visiblePacks.length < FLY_PACKS.length && (
              <button type="button" onClick={() => setShowAll(true)} className="mx-auto mt-3 flex min-h-10 items-center gap-1 rounded-full px-4 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                See all {FLY_PACKS.length} packs <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            )}
            <FreeFliesCard open={open} onMode={setFreeMode} />
            {freeMode !== 'none' && !remaining && <PlusFliesCard />}
          </div>

          <div className="shrink-0 border-t border-border/60 bg-background px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 sm:px-6">
            <div aria-live="polite" className="mb-2 min-h-4 text-center text-xs font-semibold">
              {status ? <span className={status.tone === 'error' ? 'text-destructive' : 'text-primary'}>{status.text}</span> : goalReached ? <span className="text-primary">You have enough for {target.name}</span> : remaining > 0 ? <span className="text-muted-foreground">{selected.amount >= remaining ? <><span className="font-black tabular-nums text-foreground">{(selected.amount - remaining).toLocaleString()}</span> flies left after your item</> : <>{(remaining - selected.amount).toLocaleString()} more still needed with this pack</>}</span> : <span className="text-muted-foreground">One-time purchase</span>}
            </div>
            <button type="button" onClick={goalReached ? () => setOpen(false) : () => void buy()} disabled={busy || (!goalReached && !priceFor(selected.id))} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-3 text-sm font-black text-primary-foreground shadow-[0_4px_0_0_#34631f] transition-[transform,opacity] active:translate-y-0.5 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
              {busy ? <><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> {status?.text ?? 'Opening checkout…'}</> : goalReached ? 'Back to your item' : priceFor(selected.id) ? <>Get {selected.amount.toLocaleString()} flies <span className="opacity-60">·</span> {priceFor(selected.id)}</> : pricesLoading ? 'Loading prices…' : 'Packs unavailable'}
            </button>
          </div>
        </>
      )}
    </BaseSheet>
  );
}

function PlusFliesCard() {
  const openPremium = useUIStore((s) => s.setPremiumModalOpen);
  return (
    <button type="button" onClick={() => openPremium(true, 'fly_shop_free_flies')} className="plus-upgrade-button group mb-1 mt-4 flex min-h-16 w-full items-center gap-3 rounded-2xl border border-amber-200 bg-[linear-gradient(125deg,#fde68a_0%,#fbbf24_45%,#f59e0b_75%,#d97706_100%)] px-4 py-3 text-left text-emerald-950 hover:brightness-105">
      <Icon name="frogPlus" className="h-12 w-12 shrink-0 animate-wiggle drop-shadow-[0_2px_0_rgba(31,98,28,0.3)] motion-reduce:animate-none" />
      <span className="min-w-0 flex-1"><span className="block text-sm font-black">Make each quest more rewarding</span><span className="mt-0.5 block text-xs font-semibold text-emerald-900">Earn 2× flies from daily quests with Plus.</span></span>
      <span className="shrink-0 rounded-xl bg-gradient-to-b from-emerald-600 to-emerald-800 px-3 py-2 text-xs font-black text-amber-100 shadow-[0_3px_0_#14532d]">See Plus</span>
    </button>
  );
}

function FreeFliesCard({
  open,
  onMode,
}: {
  open: boolean;
  onMode: (mode: FreeMode) => void;
}) {
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

  const mode: FreeMode = !data
    ? 'none'
    : data.available === false
      ? 'none'
      : available
        ? 'ads'
        : 'plus';

  useEffect(() => {
    onMode(mode);
  }, [mode, onMode]);

  // Plus pays to not see ads, so the surface is gone rather than merely refused.
  if (data && data.available === false) return null;
  if (!available) return null;

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
        if (result === 'failed') setError(rewardedAdFailureMessage());
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

  const idle = !busy && !exhausted && !waiting;

  return (
    <div>
      <div className="mb-2 mt-5 flex items-baseline justify-between gap-3 px-1">
        <p className="text-[12px] font-black text-muted-foreground">Free flies</p>
        {!exhausted && (
          <p className="text-[11px] font-bold tabular-nums text-muted-foreground/80">
            {remaining} of {cap} left today
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={handleWatch}
        disabled={busy || exhausted || waiting}
        className={cn(
          'group relative flex w-full items-center gap-3 rounded-[24px] p-3 text-left ring-1 transition-all sm:p-3.5',
          exhausted
            ? 'bg-muted/40 ring-border/60'
            : 'bg-card ring-border/80 shadow-[0_3px_0_0_rgba(0,0,0,0.10)] dark:shadow-[0_3px_0_0_rgba(0,0,0,0.35)]',
          idle && 'hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none',
        )}
      >
        <span
          className={cn(
            'grid h-12 w-12 shrink-0 place-items-center rounded-2xl sm:h-14 sm:w-14',
            exhausted ? 'bg-muted' : 'bg-primary/10',
          )}
        >
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : (
            <AdPlayIcon
              className={cn(
                'h-6 w-6 sm:h-7 sm:w-7',
                exhausted ? 'text-muted-foreground' : 'text-primary',
              )}
              strokeWidth={2.5}
            />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block text-sm font-black tracking-tight sm:text-[15px]',
              exhausted ? 'text-muted-foreground' : 'text-foreground',
            )}
          >
            {exhausted
              ? 'All caught for today'
              : waiting
                ? 'Warming up the next one'
                : `Watch an ad for ${reward} flies`}
          </span>
          <span
            className={cn(
              'mt-0.5 block text-xs font-semibold',
              exhausted ? 'text-muted-foreground/70' : 'text-muted-foreground',
            )}
          >
            {exhausted
              ? `Your ${cap} free rounds refill tomorrow.`
              : waiting
                ? 'One at a time — just a moment.'
                : 'They land in your jar right after.'}
          </span>
          {/* Rounds left is the only honest scarcity in this sheet, so it is
              drawn as something countable rather than buried in a fraction. */}
          {!exhausted && cap <= 8 && (
            <span className="mt-1.5 flex items-center gap-1">
              {Array.from({ length: cap }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    'h-1.5 w-4 rounded-full',
                    i < remaining ? 'bg-primary' : 'bg-primary/20',
                  )}
                />
              ))}
            </span>
          )}
        </span>

        {!exhausted && (
          <span
            className={cn(
              'flex h-11 min-w-[68px] shrink-0 items-center justify-center gap-1 rounded-2xl px-3 text-sm font-black tracking-wide text-white transition-all',
              waiting
                ? 'bg-muted-foreground/40'
                : 'bg-[#4f9149] shadow-[0_4px_0_0_#34631f] ring-1 ring-[#34631f]/40 group-active:translate-y-1 group-active:shadow-none',
            )}
          >
            {waiting ? (
              <span className="tabular-nums">{cooldown}s</span>
            ) : (
              <>
                +{reward}
                <Fly size={22} y={-1} paused />
              </>
            )}
          </span>
        )}
      </button>
      {error && (
        <p className="mt-2 text-center text-xs font-bold text-red-500">{error}</p>
      )}
    </div>
  );
}
