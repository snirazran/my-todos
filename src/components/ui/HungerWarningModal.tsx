'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import Frog from '@/components/ui/frog';
import type { WardrobeSlot } from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import { Loader2 } from 'lucide-react';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import { useScreenBusy } from '@/lib/popupGate';

interface Props {
  stolenFlies: number;
  onRecover: () => Promise<void>;
  open: boolean;
  indices?: Partial<Record<WardrobeSlot, number>>;
}

export function HungerWarningModal({
  stolenFlies,
  onRecover,
  open,
  indices,
}: Props) {
  const [recovering, setRecovering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const screenBusy = useScreenBusy();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (!open) {
      setVisible(false);
      setDismissed(false);
      return;
    }
    // Latched: once it is up, the modal's own sheet registration must not read
    // as the screen being busy and pull it back down.
    if (visible || screenBusy) return;
    setVisible(true);
  }, [open, visible, screenBusy]);
  useRegisterOpenSheet(visible && !dismissed);

  useEffect(() => {
    if (open) return;
    setError(null);
  }, [open]);

  const handleCollect = useCallback(() => {
    if (recovering || dismissed) return;
    setError(null);
    setRecovering(true);
    void (async () => {
      try {
        await onRecover();
        setDismissed(true);
      } catch (err) {
        console.error('Could not return eaten flies', err);
        setError('Could not return your flies - try again.');
      } finally {
        setRecovering(false);
      }
    })();
  }, [dismissed, onRecover, recovering]);

  return (
    <Dialog
      open={visible && !dismissed}
      onOpenChange={(val) => {
        if (!val) handleCollect();
      }}
    >
      <DialogContent className="no-scrollbar max-h-[88dvh] overflow-y-auto border-none bg-transparent p-0 shadow-none outline-none sm:max-w-[380px] md:max-w-[640px]">
        <DialogTitle className="sr-only">Your flies are back</DialogTitle>
        <div className="relative overflow-hidden rounded-[32px] border border-border/60 bg-card/95 shadow-2xl ring-1 ring-black/5 backdrop-blur-2xl md:flex md:items-stretch">
          <div className="relative flex shrink-0 justify-center bg-gradient-to-b from-emerald-500/10 to-transparent pb-8 pt-4 md:w-60 md:items-center md:bg-gradient-to-br md:from-emerald-500/15 md:via-emerald-500/5 md:to-transparent md:py-0">
            <div className="relative scale-110 md:scale-100">
              <Frog
                width={200}
                height={150}
                indices={indices}
                emote="love"
                className="drop-shadow-sm"
              />
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col px-6 pb-6 md:py-8 md:pl-2 md:pr-8">
            <h2 className="text-center text-2xl font-black tracking-tight text-foreground md:text-left md:text-[28px]">
              Your flies are back
            </h2>

            <p className="mt-1 px-4 text-center text-sm font-medium leading-relaxed text-muted-foreground md:mt-2 md:px-0 md:text-left md:text-[15px]">
              I don&apos;t snack on your stash anymore. Here&apos;s everything I
              ate.
            </p>

            <div className="mt-5 flex w-full items-center justify-center gap-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 md:justify-start md:px-5">
              <Fly size={52} />
              <span className="text-3xl font-black tabular-nums tracking-tight text-emerald-600">
                +{stolenFlies}
              </span>
            </div>

            {error && (
              <p className="mt-3 text-center text-xs font-bold text-red-500 md:text-left">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={handleCollect}
              disabled={recovering}
              className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#4f9149] text-base font-black text-white shadow-[0_4px_0_0_#34631f] transition-all active:translate-y-[2px] active:shadow-none disabled:opacity-60 md:mt-6"
            >
              {recovering ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {recovering ? 'Getting them back...' : 'Collect'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
