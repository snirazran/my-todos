'use client';

import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import Frog from '@/components/ui/frog';
import type { WardrobeSlot } from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import { Loader2, Play, Utensils } from 'lucide-react';
import { rewardedAdsAvailable, showRewardedAd } from '@/lib/ads';

interface Props {
  stolenFlies: number;
  onAcknowledge: () => void;
  onRecover: () => Promise<void>;
  open: boolean;
  indices?: Partial<Record<WardrobeSlot, number>>;
}

export function HungerWarningModal({
  stolenFlies,
  onAcknowledge,
  onRecover,
  open,
  indices,
}: Props) {
  const [recovering, setRecovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canWatchAd = rewardedAdsAvailable();

  useEffect(() => {
    if (open) return;
    setRecovering(false);
    setError(null);
  }, [open]);

  const handleRecover = async () => {
    if (recovering) return;
    setRecovering(true);
    setError(null);
    try {
      const adResult = await showRewardedAd('frog_hunger_recovery');
      if (adResult !== 'rewarded') {
        if (adResult === 'failed') {
          setError('Ad not available right now - try again in a moment.');
        }
        return;
      }
      await onRecover();
    } catch (err) {
      console.error('Could not recover eaten flies', err);
      setError('Could not return your flies - try again.');
    } finally {
      setRecovering(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => !val && !recovering && onAcknowledge()}
    >
      <DialogContent className="sm:max-w-[360px] border-none bg-transparent shadow-none p-0 outline-none">
        <DialogTitle className="sr-only">I was Starving!</DialogTitle>
        <div className="relative flex flex-col items-center bg-card/95 backdrop-blur-2xl border border-border/60 rounded-[32px] p-6 shadow-2xl overflow-hidden ring-1 ring-black/5">
          {/* Header: Frog + Icon */}
          <div className="relative mb-4 mt-2 scale-110">
            <Frog
              width={200}
              height={150}
              indices={{ ...indices, mood: 1 }}
              className="drop-shadow-sm"
            />
            <div className="absolute -right-2 -top-1 bg-rose-500 text-white p-2.5 rounded-full shadow-lg border-[3px] border-card animate-in zoom-in duration-300">
              <Utensils className="w-5 h-5" strokeWidth={3} />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-2xl font-black text-foreground tracking-tight mb-1 text-center">
            I was Starving!
          </h2>

          {/* Explanation */}
          <p className="text-sm text-muted-foreground font-medium text-center mb-6 px-4 leading-relaxed">
            I got too hungry and had to snack on your stash while you were away.
          </p>

          {/* The "Bill" / Loss Visual */}
          <div className="w-full bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 mb-6 flex items-center justify-center gap-4">
            <div className="relative opacity-80 -top-2">
              <Fly
                size={52}
                className="text-rose-600 grayscale brightness-75"
              />
              {/* Cross out the fly */}
              <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-rose-600 -rotate-45 rounded-full" />
            </div>
            <span className="text-3xl font-black text-rose-600 tabular-nums tracking-tight">
              -{stolenFlies}
            </span>
          </div>

          {/* Actions */}
          <div className="flex w-full flex-col gap-3">
            {canWatchAd && (
              <button
                type="button"
                onClick={handleRecover}
                disabled={recovering}
                className="flex h-16 w-full flex-col items-center justify-center gap-1 rounded-2xl bg-amber-500 text-white shadow-[0_4px_0_0_#b45309] ring-1 ring-[#b45309]/40 transition-all [@media(hover:hover)]:hover:bg-amber-400 active:translate-y-[2px] active:shadow-none disabled:opacity-60"
              >
                <span className="flex items-center gap-2 text-[13px] font-black uppercase tracking-[0.11em]">
                  {recovering ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5 fill-current" />
                  )}
                  {recovering ? 'Loading ad...' : 'Get my flies back'}
                </span>
                {!recovering && (
                  <span className="text-[11px] font-bold normal-case tracking-normal text-white/90">
                    Watch a short ad to recover all {stolenFlies}
                  </span>
                )}
              </button>
            )}

            {error && (
              <p className="text-center text-xs font-bold text-red-500">
                {error}
              </p>
            )}

            <Button
              onClick={onAcknowledge}
              disabled={recovering}
              className="h-12 w-full rounded-2xl bg-primary text-base font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 active:scale-95"
            >
              I'll Do My Tasks
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
