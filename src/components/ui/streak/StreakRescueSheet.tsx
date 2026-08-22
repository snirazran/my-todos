'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Flame, ShieldCheck, SquarePlay } from 'lucide-react';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { RotatingRays } from '@/components/ui/gift-box/RotatingRays';
import { cn } from '@/lib/utils';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { dismissStreakRescue, rescueStreak } from '@/hooks/useLoginStreak';
import { useRewardGate } from '@/hooks/useRewardGate';
import { Icon } from '@/components/ui/Icon';
import { hapticCelebrate } from '@/lib/haptics';
import { StreakCelebration } from './StreakCelebration';
import type {
  CheckInResult,
  RescueMethod,
  RescueResult,
  StreakRescue,
} from '@/lib/streak/types';

const VISIBLE_ROWS = 5;

type RiskRow = { key: string; label: string; count: number };

function toCelebrationResult(result: RescueResult): CheckInResult {
  return {
    active: true,
    extended: true,
    previousCount: result.view?.count ?? 0,
    view: result.view,
    shieldConsumedDays: [],
    goalEvent: result.goalEvent,
    rescue: null,
    shieldOffer: null,
  };
}

function StreakRow({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <Flame className="h-4 w-4 shrink-0 text-slate-500" />
        <span className="truncate text-sm font-bold text-white/80">
          {label}
        </span>
      </div>
      <span className="shrink-0 text-sm font-black tabular-nums text-white/50 line-through decoration-red-400/80 decoration-2">
        {count}
      </span>
    </div>
  );
}

export function StreakRescueSheet({
  open,
  onOpenChange,
  offer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offer: StreakRescue | null;
}) {
  const { indices } = useWardrobeIndices(open);
  const frogRef = useRef<FrogHandle>(null);
  const [adsWatched, setAdsWatched] = useState(0);
  const [saved, setSaved] = useState<RescueResult | null>(null);
  const [showRewards, setShowRewards] = useState(false);
  const [frogReady, setFrogReady] = useState(false);

  useRegisterOpenSheet(open);

  const {
    mode,
    run,
    busy,
    error,
    setError,
    plusModal,
  } = useRewardGate('streak_rescue', { isPlus: offer?.adsRequired === 0 });

  useEffect(() => {
    if (!open) return;
    setAdsWatched(offer?.adsWatched ?? 0);
    setError(null);
    setSaved(null);
    setShowRewards(false);
    const t = window.setTimeout(() => setFrogReady(true), 300);
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(t);
      setFrogReady(false);
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
      });
    }
    for (const t of offer.taskStreaks) {
      list.push({ key: t.taskId, label: t.text || 'Habit', count: t.count });
    }
    return list;
  }, [offer]);

  if (typeof document === 'undefined' || !offer) return null;

  const isFreeSave = offer.adsRequired === 0;
  const canWatchAd = offer.adEligible;
  const adsLeft = Math.max(0, offer.adsRequired - adsWatched);
  const largest = rows.reduce((max, r) => Math.max(max, r.count), 0);
  const multi = rows.length > 1;

  const performSave = async (method: RescueMethod = 'ad') => {
    const result = await rescueStreak(offer.id, method);
    if (!result || !result.granted) {
      setError('Could not save your streaks — try again.');
      return;
    }
    if (result.completed) {
      setSaved(result);
      frogRef.current?.fireEmote('love');
      confetti({
        particleCount: 120,
        spread: 90,
        startVelocity: 42,
        origin: { y: 0.45 },
        zIndex: 99999,
        colors: ['#fb923c', '#fbbf24', '#fde68a', '#ffffff'],
      });
      hapticCelebrate();
    } else {
      setAdsWatched(result.rescue?.adsWatched ?? adsWatched + 1);
    }
  };

  const handleSave = () => {
    if (busy || saved) return;
    void run(() => performSave('ad'));
  };

  const letItGo = () => {
    if (busy) return;
    void dismissStreakRescue(offer.id);
    onOpenChange(false);
  };

  const finish = () => {
    if (saved?.goalEvent) {
      setShowRewards(true);
      return;
    }
    onOpenChange(false);
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="streak-rescue-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="fixed inset-0 z-[1400]"
        >
          <div className="absolute inset-0 bg-background md:bg-black/60 md:backdrop-blur-sm" />

          <div className="absolute inset-0 md:flex md:items-center md:justify-center md:p-6">
            <div className="mx-auto h-full w-full sm:max-w-md md:h-[min(720px,100%)] md:overflow-hidden md:rounded-[32px] md:shadow-2xl">
              {saved && saved.view ? (
                <div className="relative flex h-full flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-orange-500 via-amber-500 to-amber-600 px-6">
                  <div className="pointer-events-none absolute inset-0 opacity-30">
                    <RotatingRays colorClass="text-white" />
                  </div>
                  <motion.div
                    initial={{ y: 40, opacity: 0, scale: 0.8 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 240, damping: 20 }}
                  >
                    {frogReady ? (
                      <Frog
                        ref={frogRef}
                        width={190}
                        height={190}
                        indices={indices}
                        emote="love"
                      />
                    ) : (
                      <div style={{ width: 190, height: 190 }} />
                    )}
                  </motion.div>
                  <div className="relative mt-2 flex items-center gap-3">
                    <Flame className="h-16 w-16 fill-yellow-200 text-yellow-100 drop-shadow-[0_3px_10px_rgba(255,200,50,0.55)]" />
                    <motion.span
                      initial={{ scale: 1.5, y: -6 }}
                      animate={{ scale: 1, y: 0 }}
                      transition={{ type: 'spring', stiffness: 320, damping: 14 }}
                      className="text-8xl font-black tabular-nums text-white drop-shadow-[0_3px_0_rgba(0,0,0,0.15)]"
                    >
                      {offer.previousCount > 0 ? saved.view.count : largest}
                    </motion.span>
                  </div>
                  <p className="mt-2 text-lg font-black text-white/90">
                    {multi ? `${rows.length} streaks saved` : 'streak saved'}
                  </p>
                  <p className="mt-4 max-w-xs text-center text-sm font-bold text-white/85">
                    Phew! Yesterday is covered — everything picks up where it
                    left off.
                  </p>
                  <button
                    type="button"
                    onClick={finish}
                    className="mt-10 w-full max-w-[280px] rounded-2xl bg-white py-3.5 text-sm font-black tracking-wide text-amber-700 shadow-[0_5px_0_0_rgba(0,0,0,0.15)] transition-all active:translate-y-1 active:shadow-none"
                  >
                    Continue
                  </button>
                </div>
              ) : (
                <div className="relative flex h-full flex-col items-center justify-center overflow-y-auto bg-gradient-to-b from-slate-700 via-slate-800 to-slate-900 px-6 py-8">
                  <motion.div
                    initial={{ y: 40, opacity: 0, scale: 0.8 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 240, damping: 20 }}
                    className="shrink-0"
                  >
                    {frogReady ? (
                      <Frog
                        ref={frogRef}
                        width={150}
                        height={150}
                        indices={indices}
                        emote="question"
                      />
                    ) : (
                      <div style={{ width: 150, height: 150 }} />
                    )}
                  </motion.div>

                  <h2 className="mt-3 text-center text-2xl font-black tracking-tight text-white">
                    {multi
                      ? `${rows.length} streaks are about to break`
                      : `Your ${largest}-day streak is about to break`}
                  </h2>
                  <p className="mt-2 max-w-xs text-center text-sm font-bold text-white/60">
                    Yesterday went unmarked, and you had no Lily Pad under you.
                    One save covers the whole day.
                  </p>

                  <div className="mt-5 w-full max-w-[320px] divide-y divide-white/10 rounded-2xl bg-white/[0.06] px-4 py-1">
                    {rows.slice(0, VISIBLE_ROWS).map((r) => (
                      <StreakRow key={r.key} label={r.label} count={r.count} />
                    ))}
                    {rows.length > VISIBLE_ROWS && (
                      <div className="py-2 text-center text-xs font-bold text-white/40">
                        +{rows.length - VISIBLE_ROWS} more
                      </div>
                    )}
                  </div>

                  {!isFreeSave && canWatchAd && mode === 'ad' && offer.adsRequired > 1 && (
                    <div className="mt-4 flex items-center gap-2">
                      {Array.from({ length: offer.adsRequired }, (_, i) => (
                        <div
                          key={i}
                          className={cn(
                            'grid h-9 w-9 place-items-center rounded-full',
                            i < adsWatched
                              ? 'bg-amber-400 text-slate-900'
                              : 'bg-white/10 text-white/40',
                          )}
                        >
                          <SquarePlay className="h-[18px] w-[18px]" strokeWidth={2.5} />
                        </div>
                      ))}
                    </div>
                  )}

                  {error && (
                    <p className="mt-4 text-center text-xs font-bold text-red-300">
                      {error}
                    </p>
                  )}

                  {isFreeSave ? (
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={busy}
                      className={cn(
                        'mt-6 flex w-full max-w-[300px] items-center justify-center gap-2 rounded-2xl bg-amber-400 py-3.5 text-sm font-black tracking-wide text-slate-900 shadow-[0_5px_0_0_rgba(0,0,0,0.3)] transition-all active:translate-y-1 active:shadow-none',
                        busy && 'opacity-70',
                      )}
                    >
                      <ShieldCheck className="h-4 w-4" />
                      {busy ? 'Saving…' : 'Save my streaks'}
                    </button>
                  ) : (
                    <div className="mt-6 flex w-full max-w-[300px] flex-col gap-3">
                      {canWatchAd &&
                        (mode === 'plus' ? (
                          <button
                            type="button"
                            onClick={handleSave}
                            disabled={busy}
                            className={cn(
                              'flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 py-3.5 text-sm font-black tracking-wide text-slate-900 shadow-[0_5px_0_0_rgba(0,0,0,0.3)] transition-all active:translate-y-1 active:shadow-none',
                              busy && 'opacity-70',
                            )}
                          >
                            <Icon
                              name="frogPlus"
                              label="Plus"
                              className="h-5 w-5"
                            />
                            {busy ? 'Saving…' : 'Save my streaks with Plus'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleSave}
                            disabled={busy}
                            className={cn(
                              'flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 py-3.5 text-sm font-black tracking-wide text-slate-900 shadow-[0_5px_0_0_rgba(0,0,0,0.3)] transition-all active:translate-y-1 active:shadow-none',
                              busy && 'opacity-70',
                            )}
                          >
                            <SquarePlay className="h-[18px] w-[18px]" strokeWidth={2.5} />
                            {busy
                              ? 'Loading ad…'
                              : adsWatched > 0
                                ? `Save my streaks (${adsLeft} left)`
                                : 'Save my streaks'}
                          </button>
                        ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={letItGo}
                    className="mt-5 shrink-0 text-sm font-bold text-white/50 underline-offset-4 hover:underline"
                  >
                    Let it go
                  </button>
                </div>
              )}
            </div>
          </div>

          {plusModal}

          {showRewards && saved && (
            <StreakCelebration
              open
              onClose={() => onOpenChange(false)}
              result={toCelebrationResult(saved)}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
