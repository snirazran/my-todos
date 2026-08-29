'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import Frog from '@/components/ui/frog';
import type { WardrobeSlot } from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import { Loader2, SquarePlay, Utensils } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { useRewardGate } from '@/hooks/useRewardGate';
import { useRegisterOpenSheet, useSheetStore } from '@/lib/sheetStore';
import { useUIStore } from '@/lib/uiStore';

interface Props {
  stolenFlies: number;
  onAcknowledge: () => void | Promise<void>;
  onRecover: () => Promise<void>;
  open: boolean;
  isPremium?: boolean;
  indices?: Partial<Record<WardrobeSlot, number>>;
}

export function HungerWarningModal({
  stolenFlies,
  onAcknowledge,
  onRecover,
  open,
  isPremium = false,
  indices,
}: Props) {
  const { mode, run, busy, error, setError, plusModal, plusOpen } =
    useRewardGate('frog_hunger_recovery', {
      isPlus: isPremium,
      adFailedMessage: 'Ad not available right now - try again in a moment.',
    });
  const recovering = busy;

  const screenBusy = useSheetStore((s) => s.count > 0);
  const cinematic = useUIStore((s) => s.isCinematicActive);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (!open) {
      setVisible(false);
      setDismissed(false);
      return;
    }
    if (visible || screenBusy || cinematic) return;
    setVisible(true);
  }, [open, visible, screenBusy, cinematic]);
  useRegisterOpenSheet(visible && !dismissed);

  useEffect(() => {
    if (open) return;
    setError(null);
  }, [open, setError]);

  const handleAcknowledge = useCallback(() => {
    if (recovering || dismissed) return;
    setError(null);
    setDismissed(true);
    void (async () => {
      try {
        await onAcknowledge();
      } catch (err) {
        console.error('Could not put the hunger warning away', err);
        setDismissed(false);
        setError('Could not save that - try again.');
      }
    })();
  }, [dismissed, onAcknowledge, recovering, setError]);

  const handleRecover = () => {
    if (recovering) return;
    void run(async () => {
      try {
        await onRecover();
      } catch (err) {
        console.error('Could not recover eaten flies', err);
        setError('Could not return your flies - try again.');
      }
    });
  };

  return (
    <>
      <Dialog
        open={visible && !dismissed && !plusOpen}
        onOpenChange={(val) => {
          if (!val && !recovering && !plusOpen) handleAcknowledge();
        }}
      >
        <DialogContent className="no-scrollbar max-h-[88dvh] overflow-y-auto border-none bg-transparent p-0 shadow-none outline-none sm:max-w-[380px] md:max-w-[640px]">
          <DialogTitle className="sr-only">I was Starving!</DialogTitle>
          <div className="relative overflow-hidden rounded-[32px] border border-border/60 bg-card/95 shadow-2xl ring-1 ring-black/5 backdrop-blur-2xl md:flex md:items-stretch">
            <div className="relative flex shrink-0 justify-center bg-gradient-to-b from-rose-500/10 to-transparent pb-8 pt-4 md:w-60 md:items-center md:bg-gradient-to-br md:from-rose-500/15 md:via-rose-500/5 md:to-transparent md:py-0">
              <div className="relative scale-110 md:scale-100">
                <Frog
                  width={200}
                  height={150}
                  indices={{ ...indices, mood: 1 }}
                  className="drop-shadow-sm"
                />
                <div className="absolute bottom-7 right-3 rounded-full border-[3px] border-card bg-rose-500 p-2.5 text-white shadow-lg animate-in zoom-in duration-300">
                  <Utensils className="h-5 w-5" strokeWidth={3} />
                </div>
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col px-6 pb-6 md:py-8 md:pl-2 md:pr-8">
              <h2 className="text-center text-2xl font-black tracking-tight text-foreground md:text-left md:text-[28px]">
                I was Starving!
              </h2>

              <p className="mt-1 px-4 text-center text-sm font-medium leading-relaxed text-muted-foreground md:mt-2 md:px-0 md:text-left md:text-[15px]">
                I got too hungry and had to snack on your stash while you were
                away.
              </p>

              <div className="mt-5 flex w-full items-center justify-center gap-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 md:justify-start md:px-5">
                <div className="relative top-1 opacity-80">
                  <Fly
                    size={52}
                    className="text-rose-600 grayscale brightness-75"
                  />
                  <div className="absolute left-0 right-0 top-1/2 h-0.5 -rotate-45 rounded-full bg-rose-600" />
                </div>
                <span className="text-3xl font-black tabular-nums tracking-tight text-rose-600">
                  -{stolenFlies}
                </span>
              </div>

              {error && (
                <p className="mt-3 text-center text-xs font-bold text-red-500 md:text-left">
                  {error}
                </p>
              )}

              <div className="mt-5 flex w-full flex-col-reverse gap-3 md:mt-6 md:flex-row md:items-stretch">
                <Button
                  onClick={handleAcknowledge}
                  disabled={recovering || dismissed}
                  className="h-12 w-full rounded-2xl bg-primary text-base font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 active:scale-95 md:h-16 md:w-auto md:flex-1 md:text-[15px]"
                >
                  I&apos;ll Do My Tasks
                </Button>

                <button
                  type="button"
                  onClick={handleRecover}
                  disabled={recovering}
                  className="flex h-16 w-full flex-col items-center justify-center gap-1 rounded-2xl bg-amber-500 text-white shadow-[0_4px_0_0_#b45309] ring-1 ring-[#b45309]/40 transition-all [@media(hover:hover)]:hover:bg-amber-400 active:translate-y-[2px] active:shadow-none disabled:opacity-60 md:w-auto md:flex-[1.35]"
                >
                  <span className="flex items-center gap-2 text-[13px] font-black">
                    {recovering ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : mode === 'plus' ? (
                      <Icon name="frogPlus" label="Plus" className="h-5 w-5" />
                    ) : (
                      <SquarePlay className="h-4 w-4" strokeWidth={2.5} />
                    )}
                    {recovering
                      ? mode === 'ad'
                        ? 'Loading ad...'
                        : 'Getting them back...'
                      : 'Get my flies back'}
                  </span>
                  {!recovering && (
                    <span className="text-[11px] font-bold normal-case tracking-normal text-white/90">
                      {mode === 'ad'
                        ? `Recover all ${stolenFlies}`
                        : mode === 'plus'
                          ? `Recover all ${stolenFlies} with Plus`
                          : `Recover all ${stolenFlies} — on the house`}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {plusModal}
    </>
  );
}
