'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Flame, X } from 'lucide-react';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import { SheetEnteredContext } from '@/lib/sheetEntered';
import { AdPlayIcon } from '@/components/ui/AdPlayIcon';
import { FlyAmount, FlyPriceChip } from '@/components/ui/FlyAmount';
import Frog from '@/components/ui/frog';
import { useUIStore } from '@/lib/uiStore';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { useShields } from '@/hooks/useShields';
import { patchInventoryFlies, useInventory } from '@/hooks/useInventory';
import { dismissStreakRescue, rescueStreak, useLoginStreak } from '@/hooks/useLoginStreak';
import type { QuestRewardCatalogItem } from '@/components/ui/QuestCards';
import { CATALOG } from '@/lib/skins/catalog';
import { PledgeRewardTiles, pledgeName } from './StreakSheet';
import { useRewardGate } from '@/hooks/useRewardGate';
import { creditRewardedAd } from '@/lib/ads';
import type { RescueMethod, RescueResult, StreakRescue } from '@/lib/streak/types';

const VISIBLE_ROWS = 4;
const FROG_W = 210;
const FROG_H = 236;
const FROG_SEAT = 1 + Math.round(FROG_H * 0.045);
const FROG_RESERVE = Math.round(FROG_H * 0.42);
const SETTLE_MAX_MS = 900;
const TILE_HYDRATE_MS = 520;
const QUIET_FRAME_MS = 24;
const QUIET_FRAMES = 6;
const QUIET_MAX_MS = 2500;
const FROG_CUE_PERCENT = 30;

const PRIMARY_BUTTON =
  'flex h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-[#ffc531] text-[16px] font-black text-[#3b2800] shadow-[0_5px_0_0_#c98b00] transition-all active:translate-y-1 active:shadow-none disabled:opacity-70';
const SECONDARY_BUTTON =
  'flex h-12 w-full items-center justify-center gap-1.5 rounded-2xl border border-white/30 bg-white/20 text-[15px] font-black text-white shadow-[0_3px_0_0_rgba(0,0,0,0.18)] transition-all active:translate-y-[3px] active:shadow-none disabled:opacity-60';

type RiskRow = {
  key: string;
  label: string;
  count: number;
  fliesPerTask?: number;
  pledgeDays?: number;
};

const days = (n: number) => (n === 1 ? '1 day' : `${n} days`);

export type RescueOutcome = 'saved' | 'broke' | 'closed';

export function StreakRescueSheet({
  open,
  onOpenChange,
  offer: offerProp,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offer: StreakRescue | null;
  onDone?: (outcome: RescueOutcome, result?: RescueResult) => void;
}) {
  const lastOffer = useRef<StreakRescue | null>(null);
  if (offerProp) lastOffer.current = offerProp;
  const offer = offerProp ?? lastOffer.current;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [frogReady, setFrogReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [quiet, setQuiet] = useState(false);
  const { indices } = useWardrobeIndices(open);
  const { flyBalance, isLoading: shieldsLoading } = useShields(open);
  const { data: inventoryData } = useInventory(open);
  const { view: streakView } = useLoginStreak(open);
  const isPremium = inventoryData?.isPremium ?? false;
  const rewardCatalog = useMemo<Record<string, QuestRewardCatalogItem>>(
    () =>
      Object.fromEntries(
        (inventoryData?.catalog?.length ? inventoryData.catalog : CATALOG).map(
          (item) => [item.id, item],
        ),
      ),
    [inventoryData?.catalog],
  );
  const openFlyShop = useUIStore((s) => s.openFlyShop);
  const [adsWatched, setAdsWatched] = useState(0);
  const [paying, setPaying] = useState(false);
  const [frogGo, setFrogGo] = useState(false);
  const frogGoRef = useRef(false);
  const releaseFrog = () => {
    if (frogGoRef.current) return;
    frogGoRef.current = true;
    setFrogGo(true);
  };

  useRegisterOpenSheet(open);

  const dataReady = !shieldsLoading && (!offer?.goal || !!streakView);
  const go = open && quiet && ((dataReady && frogReady) || timedOut);
  useEffect(() => {
    setQuiet(false);
    if (!open) return;
    let raf = 0;
    let streak = 0;
    let last = performance.now();
    const start = last;
    const tick = (now: number) => {
      streak = now - last < QUIET_FRAME_MS ? streak + 1 : 0;
      last = now;
      if (streak >= QUIET_FRAMES || now - start > QUIET_MAX_MS) {
        setQuiet(true);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open]);
  useEffect(() => {
    setFrogReady(false);
    setTimedOut(false);
    if (!open) return;
    const timer = window.setTimeout(() => setTimedOut(true), SETTLE_MAX_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  const { mode, run, busy, error, setError, plusModal } = useRewardGate(
    'streak_rescue',
    { isPlus: offer?.adsRequired === 0, preload: open },
  );

  useEffect(() => {
    if (!open) return;
    setAdsWatched(offer?.adsWatched ?? 0);
    setError(null);
    setPaying(false);
    setConfirmOpen(false);
    frogGoRef.current = false;
    setFrogGo(false);
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open, offer]);

  const rows = useMemo<RiskRow[]>(() => {
    if (!offer) return [];
    const list: RiskRow[] = [];
    if (offer.previousCount > 0) {
      list.push({
        key: 'login',
        label: 'Daily streak',
        count: offer.previousCount,
        pledgeDays: offer.goal?.days,
      });
    }
    for (const t of offer.taskStreaks) {
      list.push({
        key: t.taskId,
        label: t.text || 'Habit',
        count: t.count,
        fliesPerTask: t.fliesPerTask,
      });
    }
    return list;
  }, [offer]);

  if (typeof document === 'undefined' || !offer) return null;

  const multi = rows.length > 1;
  const largest = rows.reduce((max, r) => Math.max(max, r.count), 0);
  const heroCount = offer.previousCount > 0 ? offer.previousCount : largest;
  const isFreeSave = mode === 'free';
  const adsLeft = Math.max(1, offer.adsRequired - adsWatched);
  const price = offer.priceFlies;
  const canPayFlies = !isFreeSave && price > 0;
  const canAfford = shieldsLoading || flyBalance >= price;
  const anyStake = rows.some(
    (r) => !!r.pledgeDays || (r.fliesPerTask ?? 0) > 1,
  );
  const pledgeTier = offer.goal
    ? streakView?.goalTiers.find((tier) => tier.days === offer.goal?.days) ?? null
    : null;
  const working = busy || paying;
  const adFirst = mode === 'ad' && offer.adEligible;

  const done = (outcome: RescueOutcome, result?: RescueResult) => {
    onDone?.(outcome, result);
    onOpenChange(false);
  };

  const performSave = async (method: RescueMethod) => {
    const result = await rescueStreak(offer.id, method);
    if (result?.error === 'not_enough_flies') {
      if (typeof result.flyBalance === 'number') patchInventoryFlies(result.flyBalance);
      setError('Not enough flies yet.');
      return;
    }
    if (!result || !result.granted) {
      if (method === 'ad' && mode === 'ad') creditRewardedAd('streak_rescue');
      setError('That didn’t go through. Try again.');
      return;
    }
    if (typeof result.flyBalance === 'number') patchInventoryFlies(result.flyBalance);
    if (result.completed) {
      done('saved', result);
    } else {
      setAdsWatched(result.rescue?.adsWatched ?? adsWatched + 1);
    }
  };

  const saveWithAd = () => {
    if (working) return;
    void run(() => performSave('ad'));
  };

  const saveWithFlies = async () => {
    if (working) return;
    if (!canAfford) {
      openFlyShop(Math.max(0, price - flyBalance));
      return;
    }
    setError(null);
    setPaying(true);
    try {
      await performSave('flies');
    } finally {
      setPaying(false);
    }
  };

  const askToBreak = () => {
    if (working) return;
    setError(null);
    setConfirmOpen(true);
  };

  const breakStreak = () => {
    if (working) return;
    void dismissStreakRescue(offer.id);
    done('broke');
  };

  const flyButton = (primary: boolean) => (
    <button
      type="button"
      onClick={saveWithFlies}
      disabled={working}
      className={primary ? PRIMARY_BUTTON : SECONDARY_BUTTON}
    >
      {paying ? (
        'Saving…'
      ) : !canAfford ? (
        <>
          Get
          <FlyAmount amount={price - flyBalance} size={18} iconClassName="-translate-y-[3px]" />
          more to save
        </>
      ) : primary ? (
        <>
          Save my {multi ? 'streaks' : 'streak'}
          <FlyPriceChip amount={price} size={18} className="py-1.5 pl-2 pr-3" iconClassName="-translate-y-[3px]" />
        </>
      ) : (
        <>
          Save for
          <FlyAmount amount={price} size={18} iconClassName="-translate-y-[3px]" />
        </>
      )}
    </button>
  );

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="streak-rescue"
          initial={{ y: '100%' }}
          animate={
            go
              ? { y: 0, transition: { type: 'tween', ease: [0.32, 0.72, 0, 1], duration: 0.4 } }
              : { y: '100%' }
          }
          exit={{ y: '100%', transition: { type: 'tween', ease: [0.32, 0.72, 0, 1], duration: 0.3 } }}
          onUpdate={(latest) => {
            const y = latest.y;
            const remaining =
              typeof y === 'string' ? parseFloat(y) : ((Number(y) || 0) / window.innerHeight) * 100;
            if (go && remaining <= FROG_CUE_PERCENT) releaseFrog();
          }}
          onAnimationComplete={(definition) => {
            if ((definition as { y?: unknown }).y === 0) releaseFrog();
          }}
          style={{ willChange: 'transform' }}
          className="fixed inset-0 z-[1400] select-none bg-[#1c3461] text-foreground"
        >
          <div aria-hidden className="pointer-events-none absolute inset-0 hidden bg-black/30 dark:block" />
          <SheetEnteredContext.Provider value>
            <div
              className="relative mx-auto flex h-full w-full max-w-[420px] flex-col px-6 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-[calc(env(safe-area-inset-top)+0.75rem)]">
              <div className="flex h-10 shrink-0 items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={askToBreak}
                  aria-label="Close"
                  className="grid h-10 w-10 place-items-center rounded-full bg-white/20 text-white ring-1 ring-white/30 transition-transform active:scale-90"
                >
                  <X className="h-5 w-5 stroke-[2.5]" />
                </button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto pb-6">
                <div className="relative isolate w-full" style={{ marginTop: FROG_RESERVE }}>
                  <div
                    className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2"
                    style={{ bottom: `calc(100% - ${FROG_SEAT}px)`, clipPath: 'inset(-60% -60% 0 -60%)' }}
                  >
                    <Frog
                      width={FROG_W}
                      height={FROG_H}
                      indices={indices}
                      emote="question"
                      arrive="rise"
                      holdArrival={!frogGo}
                      onDressed={() => setFrogReady(true)}
                    />
                  </div>
                  <div className="relative z-10 w-full rounded-[28px] bg-white px-5 pb-2 pt-6 shadow-[0_6px_0_0_rgba(0,0,0,0.16)] dark:bg-[hsl(var(--card-raised))]">
                    <h2 className="text-center text-[24px] font-black leading-tight tracking-tight">
                      {multi ? `Keep your ${rows.length} streaks` : `Keep your ${days(heroCount)} streak`}
                    </h2>
                    <p className="mx-auto mt-1.5 max-w-[290px] text-center text-[14px] font-semibold leading-snug text-muted-foreground">
                      {`You missed yesterday. Without a save, ${multi ? 'they go' : 'it goes'} back to 0${
                        anyStake ? ` and you lose what ${multi ? 'they earn' : 'it earns'}` : ''
                      }.`}
                    </p>

                    <div className="mt-4 flex items-center justify-between border-b border-border/70 px-0.5 pb-2 text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                      <span>{multi ? 'Your streaks' : 'Your streak'}</span>
                      {anyStake && <span>Saving keeps</span>}
                    </div>

                    <div className="divide-y divide-border/70">
                      {rows.slice(0, VISIBLE_ROWS).map((r) => {
                        const bonus = (r.fliesPerTask ?? 0) > 1 ? r.fliesPerTask! : 0;
                        return (
                          <div key={r.key} className="flex min-h-[64px] items-center gap-3 py-2.5">
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#ffedd5] dark:bg-white/10">
                              <Flame className="h-5 w-5 fill-[#ea580c] text-[#c2410c]" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[15px] font-bold leading-tight">{r.label}</span>
                              <span className="mt-0.5 block truncate text-[13px] font-semibold text-muted-foreground">
                                <span className="font-black text-[#c2410c]">{days(r.count)}</span>
                                {r.pledgeDays ? ` · ${pledgeName(r.pledgeDays)} pledge` : ' in a row'}
                              </span>
                            </span>
                            {r.pledgeDays ? (
                              <span className="flex min-h-11 shrink-0 items-center">
                                {pledgeTier && (
                                  <PledgeRewardTiles
                                    rewards={pledgeTier.rewards}
                                    rewardCatalog={rewardCatalog}
                                    isPremium={isPremium}
                                    paused
                                    flatLimit={2}
                                    hydrateDelayMs={TILE_HYDRATE_MS}
                                  />
                                )}
                              </span>
                            ) : bonus ? (
                              <span className="flex shrink-0 flex-col items-end leading-none">
                                <FlyAmount
                                  amount={bonus}
                                  size={17}
                                  className="font-black"
                                  iconClassName="-translate-y-[2px]"
                                />
                                <span className="mt-1 text-[11.5px] font-bold text-muted-foreground">per task</span>
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                      {rows.length > VISIBLE_ROWS && (
                        <div className="py-2.5 text-center text-xs font-bold text-muted-foreground">
                          +{rows.length - VISIBLE_ROWS} more
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-center">
                {error && !confirmOpen && (
                  <p className="mb-3 rounded-xl bg-black/20 px-3 py-1.5 text-center text-sm font-bold text-white">
                    {error}
                  </p>
                )}

                <div className="flex w-full flex-col gap-2.5">
                  {isFreeSave ? (
                    <button type="button" onClick={saveWithAd} disabled={working} className={PRIMARY_BUTTON}>
                      {busy ? 'Saving…' : `Save my ${multi ? 'streaks' : 'streak'}`}
                    </button>
                  ) : adFirst ? (
                    <>
                      <button type="button" onClick={saveWithAd} disabled={working} className={PRIMARY_BUTTON}>
                        <AdPlayIcon className="h-[18px] w-[18px]" strokeWidth={2.5} />
                        {busy ? 'Loading ad…' : `Save my ${multi ? 'streaks' : 'streak'}`}
                        {offer.adsRequired > 1 && !busy && (
                          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[12px] font-black tabular-nums">
                            {adsWatched > 0 ? `${adsLeft} left` : `${offer.adsRequired} ads`}
                          </span>
                        )}
                      </button>
                      {canPayFlies && flyButton(false)}
                    </>
                  ) : (
                    canPayFlies && flyButton(true)
                  )}
                </div>

                <button
                  type="button"
                  onClick={askToBreak}
                  className="mt-4 text-sm font-bold text-white underline-offset-4 hover:underline"
                >
                  No thanks, start over
                </button>
              </div>
            </div>

            <AnimatePresence>
              {confirmOpen && (
                <motion.div
                  key="break-confirm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="absolute inset-0 z-20 flex items-end justify-center bg-black/60"
                  onClick={() => !working && setConfirmOpen(false)}
                >
                  <motion.div
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '100%' }}
                    transition={{ type: 'tween', ease: [0.32, 0.72, 0, 1], duration: 0.32 }}
                    onClick={(e) => e.stopPropagation()}
                    role="alertdialog"
                    aria-modal="true"
                    aria-labelledby="break-confirm-title"
                    className="flex w-full max-w-[420px] flex-col items-center rounded-t-[28px] bg-white px-6 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 text-center dark:bg-[hsl(var(--card-raised))]"
                  >
                    <span aria-hidden className="mb-5 h-1.5 w-10 rounded-full bg-black/10 dark:bg-white/15" />
                    <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#ffedd5] dark:bg-white/10">
                      <Flame className="h-7 w-7 fill-[#ea580c] text-[#c2410c]" />
                    </span>
                    <h3 id="break-confirm-title" className="mt-3 text-[20px] font-black leading-tight tracking-tight">
                      {multi ? `Break your ${rows.length} streaks?` : `Break your ${days(heroCount)} streak?`}
                    </h3>
                    <p className="mt-1.5 text-[14px] font-semibold leading-snug text-muted-foreground">
                      {multi
                        ? 'They all go back to 0. You can’t undo this.'
                        : 'It goes back to 0. You can’t undo this.'}
                    </p>

                    {error && (
                      <p className="mt-3 text-center text-sm font-bold text-red-600 dark:text-red-400">{error}</p>
                    )}

                    <div className="mt-5 w-full">
                      {isFreeSave ? (
                        <button type="button" onClick={saveWithAd} disabled={working} className={PRIMARY_BUTTON}>
                          {busy ? 'Saving…' : `Save my ${multi ? 'streaks' : 'streak'}`}
                        </button>
                      ) : canPayFlies ? (
                        flyButton(true)
                      ) : (
                        <button type="button" onClick={saveWithAd} disabled={working} className={PRIMARY_BUTTON}>
                          <AdPlayIcon className="h-[18px] w-[18px]" strokeWidth={2.5} />
                          {busy ? 'Loading ad…' : `Save my ${multi ? 'streaks' : 'streak'}`}
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={breakStreak}
                      disabled={working}
                      className="mt-3 h-11 w-full rounded-2xl text-[15px] font-black text-red-600 transition-colors active:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:active:bg-red-500/10"
                    >
                      Break my {multi ? 'streaks' : 'streak'}
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {plusModal}
          </SheetEnteredContext.Provider>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
