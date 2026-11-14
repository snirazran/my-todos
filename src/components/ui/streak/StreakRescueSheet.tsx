'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Flame, X } from 'lucide-react';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import { hapticWarning } from '@/lib/haptics';
import { SheetEnteredContext } from '@/lib/sheetEntered';
import { AdPlayIcon } from '@/components/ui/AdPlayIcon';
import { FlyAmount, FlyPriceChip } from '@/components/ui/FlyAmount';
import Frog from '@/components/ui/frog';
import { useUIStore } from '@/lib/uiStore';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useWideStage } from '@/hooks/useWideStage';
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
const MOON_DIGIT_BOTTOM = Math.round(FROG_H * 0.3);
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

const STARS = [
  { x: 9, y: 14, s: 3, d: 0 },
  { x: 22, y: 6, s: 2, d: 1.2 },
  { x: 36, y: 20, s: 2, d: 2.1 },
  { x: 71, y: 9, s: 3, d: 0.6 },
  { x: 84, y: 22, s: 2, d: 1.7 },
  { x: 92, y: 7, s: 2, d: 2.6 },
  { x: 15, y: 34, s: 2, d: 3.1 },
  { x: 88, y: 38, s: 3, d: 0.3 },
];

function moonNumeralSize(count: number, short: boolean) {
  const digits = String(Math.max(0, count)).length;
  const base = digits <= 1 ? 196 : digits === 2 ? 172 : 124;
  return Math.round(base * (short ? 0.7 : 1));
}

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
  const confirmRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
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
  const shortScreen = useMediaQuery('(max-height: 760px)');
  const wide = useWideStage();
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

  useEffect(() => {
    if (!confirmOpen) return;
    const opener = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      confirmRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setConfirmOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown);
      opener?.focus?.({ preventScroll: true });
    };
  }, [confirmOpen]);

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
  const moonSize = moonNumeralSize(heroCount, shortScreen);
  const moonHeight = MOON_DIGIT_BOTTOM + Math.round(moonSize * 0.78) + 12;

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
    hapticWarning();
    setConfirmOpen(true);
  };

  const closeConfirm = () => {
    if (!working) setConfirmOpen(false);
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

  const starField = (
    <>
      {STARS.map((star, i) => (
        <span
          key={i}
          className="rescue-star absolute rounded-full bg-white"
          style={{
            left: `${star.x}%`,
            top: `calc(env(safe-area-inset-top) + ${star.y}%)`,
            width: star.s,
            height: star.s,
            animationDelay: `${star.d}s`,
          }}
        />
      ))}
    </>
  );

  const closeButton = (
    <button
      type="button"
      onClick={askToBreak}
      aria-label="Close"
      className="grid h-10 w-10 place-items-center rounded-full bg-white/20 text-white ring-1 ring-white/30 transition-transform active:scale-90"
    >
      <X className="h-5 w-5 stroke-[2.5]" />
    </button>
  );

  const moon = (
    <div aria-hidden className="relative w-full" style={{ height: moonHeight }}>
      <span
        className="absolute left-1/2 -translate-x-1/2 translate-y-1/2 rounded-full bg-[#75996e] ring-[10px] ring-[#6d9166] dark:bg-[#385a37] dark:ring-[#314e30]"
        style={{
          bottom: MOON_DIGIT_BOTTOM + Math.round(moonSize * 0.36),
          width: Math.round(moonSize * 1.12),
          height: Math.round(moonSize * 1.12),
        }}
      />
      <motion.span
        initial={{ opacity: 0, y: 14 }}
        animate={frogGo ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
        transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        className="absolute inset-x-0 flex justify-center font-display leading-[0.78] tracking-[0.01em] tabular-nums text-[#f2f8ef] [filter:drop-shadow(0_6px_0_#365633)] dark:text-[#e1f0dc]"
        style={{
          bottom: MOON_DIGIT_BOTTOM - Math.round(moonSize * 0.06),
          fontSize: moonSize,
        }}
      >
        {heroCount}
      </motion.span>
    </div>
  );

  const frogSeat = (
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
  );

  const stakesCard = (
    <div className="relative z-10 w-full rounded-[28px] bg-white px-5 pb-2 pt-5 shadow-[0_6px_0_0_rgba(0,0,0,0.16)] dark:bg-[hsl(var(--card-raised))]">
      <h2 className="text-center text-[24px] font-black leading-tight tracking-tight">
        {multi ? `Keep your ${rows.length} streaks` : `Keep your ${days(heroCount)} streak`}
      </h2>
      <p className="mx-auto mt-1.5 max-w-[290px] text-center text-[14px] font-semibold leading-snug text-muted-foreground">
        {`You missed yesterday. Without a save, ${multi ? 'they go' : 'it goes'} back to 0${
          anyStake ? ` and you lose what ${multi ? 'they earn' : 'it earns'}` : ''
        }.`}
      </p>

      <div className="mt-4 flex items-center justify-between border-b border-border/70 px-0.5 pb-2 text-[12px] font-bold text-muted-foreground">
        <span>{multi ? 'Your streaks' : 'Your streak'}</span>
        {anyStake && <span>Saving keeps</span>}
      </div>

      <div className="divide-y divide-border/70">
        {rows.slice(0, VISIBLE_ROWS).map((r) => {
          const bonus = (r.fliesPerTask ?? 0) > 1 ? r.fliesPerTask! : 0;
          return (
            <div key={r.key} className="flex min-h-[60px] items-center gap-3 py-2">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#ffedd5] dark:bg-white/10">
                <Flame className="h-5 w-5 fill-[#ea580c] text-[#c2410c]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold leading-tight">{r.label}</span>
                <span className="mt-0.5 block text-[13px] leading-snug font-semibold text-muted-foreground">
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
  );

  const actions = (
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
  );

  const confirmLayer = (
    <AnimatePresence>
      {confirmOpen && (
        <motion.div
          key="break-confirm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.16 } }}
          transition={{ duration: 0.2 }}
          className={
            wide
              ? 'absolute inset-y-0 left-[42%] right-0 z-20 flex items-end bg-[#344f31]/70'
              : 'absolute inset-0 z-20 flex items-end justify-center bg-black/60'
          }
          onClick={closeConfirm}
        >
          <motion.div
            ref={confirmRef}
            initial={reduceMotion ? { opacity: 0 } : { y: '100%' }}
            animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
            exit={
              reduceMotion
                ? { opacity: 0, transition: { duration: 0.12 } }
                : { y: '100%', transition: { type: 'tween', ease: [0.32, 0.72, 0, 1], duration: 0.2 } }
            }
            transition={{ type: 'tween', ease: [0.32, 0.72, 0, 1], duration: 0.32 }}
            drag={working || wide ? false : 'y'}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.06, bottom: 0.9 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 96 || info.velocity.y > 600) closeConfirm();
            }}
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="break-confirm-title"
            aria-describedby="break-confirm-desc"
            className={
              wide
                ? 'flex w-full flex-col items-center rounded-t-[28px] bg-white px-8 pb-7 pt-8 text-center shadow-[0_-12px_32px_-12px_rgba(0,0,0,0.35)] dark:bg-[hsl(var(--card-raised))]'
                : 'flex w-full max-w-[420px] touch-none flex-col items-center rounded-t-[28px] bg-white px-6 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 text-center shadow-[0_-12px_32px_-12px_rgba(0,0,0,0.35)] dark:bg-[hsl(var(--card-raised))]'
            }
          >
            {!wide && (
              <span aria-hidden className="mb-5 h-1.5 w-10 cursor-grab rounded-full bg-black/10 active:cursor-grabbing dark:bg-white/15" />
            )}
            <ul aria-label="Streaks you would lose" className="flex flex-wrap justify-center gap-1.5">
              {rows.slice(0, VISIBLE_ROWS).map((r, i) => (
                <li
                  key={r.key}
                  className="flex items-center gap-1 rounded-full bg-[#fff1e3] py-1.5 pl-2 pr-3 dark:bg-white/10"
                >
                  <span aria-hidden className="relative grid h-[18px] w-[18px] place-items-center">
                    <Flame className="absolute h-[18px] w-[18px] fill-[#cbd5e1] text-[#94a3b8] dark:fill-white/25 dark:text-white/40" />
                    <motion.span
                      className="absolute grid place-items-center"
                      initial={{ opacity: 1 }}
                      animate={{ opacity: reduceMotion ? 1 : 0 }}
                      transition={{ delay: 0.45 + i * 0.08, duration: 0.5, ease: 'easeOut' }}
                    >
                      <Flame className="h-[18px] w-[18px] fill-[#ea580c] text-[#c2410c]" />
                    </motion.span>
                  </span>
                  <span className="text-[14px] font-black tabular-nums text-[#9a3412] dark:text-orange-300">
                    {days(r.count)}
                  </span>
                  <span className="sr-only">{r.label}</span>
                </li>
              ))}
            </ul>
            <h3 id="break-confirm-title" className="mt-3.5 text-[20px] font-black leading-tight tracking-tight">
              {multi ? `Break your ${rows.length} streaks?` : `Break your ${days(heroCount)} streak?`}
            </h3>
            <p id="break-confirm-desc" className="mt-1.5 text-[14px] font-semibold leading-snug text-muted-foreground">
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
  );

  return createPortal(
    <AnimatePresence>
      {open && !wide && (
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
          className="fixed inset-0 z-[1400] select-none bg-[#63875c] text-foreground"
        >
          <div aria-hidden className="pointer-events-none absolute inset-0 hidden bg-black/30 dark:block" />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[46%]">
            {starField}
          </div>
          <SheetEnteredContext.Provider value>
            <div
              className="relative mx-auto flex h-full w-full max-w-[420px] flex-col px-6 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-[calc(env(safe-area-inset-top)+0.75rem)]">
              <div className="absolute right-6 top-[calc(env(safe-area-inset-top)+0.75rem)] z-30 flex h-10 items-center">
                {closeButton}
              </div>

              <div className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden pb-5">
                <div className="my-auto w-full">
                  {moon}
                  <div className="relative isolate w-full">
                    {frogSeat}
                    {stakesCard}
                  </div>
                </div>
              </div>

              {actions}
            </div>

            {confirmLayer}

            {plusModal}
          </SheetEnteredContext.Provider>
        </motion.div>
      )}
      {open && wide && (
        <motion.div
          key="streak-rescue-wide"
          initial={{ opacity: 0 }}
          animate={{ opacity: go ? 1 : 0 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[1400] flex select-none items-center justify-center bg-black/60 p-6 text-foreground"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={go ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.96, y: 16 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.18 } }}
            transition={{ type: 'spring', duration: 0.45, bounce: 0.12 }}
            onAnimationComplete={(definition) => {
              if ((definition as { opacity?: number }).opacity === 1) releaseFrog();
            }}
            role="dialog"
            aria-modal="true"
            aria-label={multi ? `Keep your ${rows.length} streaks` : `Keep your ${days(heroCount)} streak`}
            className="relative flex h-[min(40rem,calc(100dvh-3rem))] w-[min(100%,60rem)] overflow-hidden rounded-[32px] bg-[#63875c] shadow-2xl"
          >
            <div aria-hidden className="pointer-events-none absolute inset-0 hidden bg-black/30 dark:block" />
            <SheetEnteredContext.Provider value>
              <div className="relative flex w-[42%] shrink-0 flex-col overflow-hidden">
                <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[62%]">
                  {starField}
                </div>
                <div className="relative mt-auto px-8">{moon}</div>
                <div className="relative h-[30%] shrink-0 bg-[#75996e] [border-top-left-radius:50%_36px] [border-top-right-radius:50%_36px] dark:bg-[#385a37]">
                  {frogSeat}
                </div>
              </div>
              <div className="no-scrollbar relative flex min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-8 pb-7 pt-16">
                <div className="absolute right-5 top-5 z-30">{closeButton}</div>
                <div className="my-auto w-full">{stakesCard}</div>
                <div className="mt-6">{actions}</div>
              </div>

              {confirmLayer}

              {plusModal}
            </SheetEnteredContext.Provider>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
