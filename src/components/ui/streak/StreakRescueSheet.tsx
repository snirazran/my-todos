'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Flame, Play, ShieldCheck } from 'lucide-react';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { RotatingRays } from '@/components/ui/gift-box/RotatingRays';
import { cn } from '@/lib/utils';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { rescueStreak } from '@/hooks/useLoginStreak';
import { showRewardedAd } from '@/lib/ads';
import { StreakCelebration } from './StreakCelebration';
import type {
  CheckInResult,
  LoginStreakRescue,
  RescueResult,
} from '@/lib/streak/types';

function toCelebrationResult(result: RescueResult): CheckInResult {
  return {
    active: true,
    extended: true,
    previousCount: result.view?.count ?? 0,
    view: result.view,
    freezeConsumedDays: [],
    milestoneEvents: result.milestoneEvents,
    goalEvent: result.goalEvent,
    rescue: null,
  };
}

export function StreakRescueSheet({
  open,
  onOpenChange,
  offer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offer: LoginStreakRescue | null;
}) {
  const { indices } = useWardrobeIndices(open);
  const frogRef = useRef<FrogHandle>(null);
  const [adsWatched, setAdsWatched] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<RescueResult | null>(null);
  const [showRewards, setShowRewards] = useState(false);
  const [frogReady, setFrogReady] = useState(false);

  useRegisterOpenSheet(open);

  useEffect(() => {
    if (!open) return;
    setAdsWatched(offer?.adsWatched ?? 0);
    setBusy(false);
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

  if (typeof document === 'undefined' || !offer) return null;

  const isPremiumRescue = offer.adsRequired === 0;

  const handleSave = async () => {
    if (busy || saved) return;
    setBusy(true);
    setError(null);
    try {
      if (!isPremiumRescue) {
        const adResult = await showRewardedAd('streak_rescue');
        if (adResult !== 'rewarded') {
          if (adResult === 'failed') {
            setError('Ad not available right now — try again in a moment.');
          }
          return;
        }
      }
      const result = await rescueStreak(offer.id);
      if (!result || !result.granted) {
        setError('Could not save your streak — try again.');
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
        try {
          navigator.vibrate?.([25, 30, 55]);
        } catch {}
      } else {
        setAdsWatched(result.rescue?.adsWatched ?? adsWatched + 1);
      }
    } finally {
      setBusy(false);
    }
  };

  const finish = () => {
    if (saved && (saved.milestoneEvents.length > 0 || saved.goalEvent)) {
      setShowRewards(true);
      return;
    }
    onOpenChange(false);
  };

  const adsLeft = Math.max(0, offer.adsRequired - adsWatched);

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
                      {saved.view.count}
                    </motion.span>
                  </div>
                  <p className="mt-2 text-lg font-black uppercase tracking-[0.2em] text-white/90">
                    streak saved
                  </p>
                  <p className="mt-4 max-w-xs text-center text-sm font-bold text-white/85">
                    Phew! Your streak lives on — and today already counts.
                  </p>
                  <button
                    type="button"
                    onClick={finish}
                    className="mt-10 w-full max-w-[280px] rounded-2xl bg-white py-3.5 text-sm font-black uppercase tracking-wide text-amber-700 shadow-[0_5px_0_0_rgba(0,0,0,0.15)] transition-all active:translate-y-1 active:shadow-none"
                  >
                    Continue
                  </button>
                </div>
              ) : (
                <div className="relative flex h-full flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-slate-700 via-slate-800 to-slate-900 px-6">
                  <motion.div
                    initial={{ y: 40, opacity: 0, scale: 0.8 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 240, damping: 20 }}
                  >
                    {frogReady ? (
                      <Frog
                        ref={frogRef}
                        width={170}
                        height={170}
                        indices={indices}
                        emote="question"
                      />
                    ) : (
                      <div style={{ width: 170, height: 170 }} />
                    )}
                  </motion.div>

                  <div className="relative mt-2 flex items-center gap-3">
                    <Flame className="h-14 w-14 text-slate-500" />
                    <span className="text-7xl font-black tabular-nums text-white/60 line-through decoration-red-400 decoration-4">
                      {offer.previousCount}
                    </span>
                  </div>

                  <h2 className="mt-4 text-center text-2xl font-black tracking-tight text-white">
                    Your {offer.previousCount}-day streak is about to break
                  </h2>
                  <p className="mt-2 max-w-xs text-center text-sm font-bold text-white/70">
                    {isPremiumRescue
                      ? 'As a Plus member, you can save it — free, once a week.'
                      : offer.adsRequired === 1
                        ? 'Watch one ad to save it and keep your progress.'
                        : `Watch ${offer.adsRequired} ads to save it and keep your progress.`}
                  </p>

                  {!isPremiumRescue && offer.adsRequired > 1 && (
                    <div className="mt-5 flex items-center gap-2">
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
                          <Play className="h-4 w-4 fill-current" />
                        </div>
                      ))}
                    </div>
                  )}

                  {error && (
                    <p className="mt-4 text-center text-xs font-bold text-red-300">
                      {error}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={busy}
                    className={cn(
                      'mt-8 flex w-full max-w-[300px] items-center justify-center gap-2 rounded-2xl bg-amber-400 py-3.5 text-sm font-black uppercase tracking-wide text-slate-900 shadow-[0_5px_0_0_rgba(0,0,0,0.3)] transition-all active:translate-y-1 active:shadow-none',
                      busy && 'opacity-70',
                    )}
                  >
                    {isPremiumRescue ? (
                      <>
                        <ShieldCheck className="h-4 w-4" />
                        {busy ? 'Saving…' : 'Save my streak'}
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 fill-current" />
                        {busy
                          ? 'Loading ad…'
                          : adsLeft < offer.adsRequired
                            ? `Watch next ad (${adsLeft} left)`
                            : 'Watch ad · save streak'}
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="mt-5 text-sm font-bold text-white/50 underline-offset-4 hover:underline"
                  >
                    Let it go
                  </button>
                </div>
              )}
            </div>
          </div>

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
