'use client';

import { useEffect, useState } from 'react';
import { Loader2, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import type { PactView } from '@/lib/pact/types';

/**
 * Swapping releases the week's tasks and deletes the pact, so it is the one
 * action on the card that cannot be taken back. It used to confirm in a strip
 * inside the card, where the price sat in 11px muted text beside the button
 * that charged it — the shape of an interface that would rather you did not
 * read it. A sheet gives the cost the same room as the choice.
 *
 * The Plus pitch only appears where it is true: a user with a swap token is
 * already protected, so selling them protection they hold would be noise.
 */
export function PactChangeSheet({
  open,
  onClose,
  view,
  onConfirm,
  onUpgrade,
  changing,
}: {
  open: boolean;
  onClose: () => void;
  view: PactView;
  onConfirm: () => void;
  onUpgrade: () => void;
  changing: boolean;
}) {
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    if (open) setConfirmed(false);
  }, [open]);

  const active = view.active;
  const hasSwap = view.swapTokens > 0;
  const streakAtStake = view.streak.weeks;

  return (
    <BaseSheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      zIndex={1450}
      className="bg-background ring-1 ring-border/70 sm:max-w-[420px]"
    >
      {() => (
        <div className="flex flex-col gap-4 px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2">
          <div className="flex flex-col items-center gap-3 pt-2 text-center">
            <span
              className={cn(
                'grid h-14 w-14 place-items-center rounded-2xl',
                hasSwap
                  ? 'bg-primary/12 text-primary'
                  : 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
              )}
            >
              {hasSwap ? (
                <ShieldCheck className="h-7 w-7" strokeWidth={2.5} />
              ) : (
                <TriangleAlert className="h-7 w-7" strokeWidth={2.5} />
              )}
            </span>
            <div>
              <h2 className="text-[20px] font-black leading-tight text-foreground">
                Swap this week&apos;s Leap?
              </h2>
              <p className="mx-auto mt-1.5 max-w-[34ch] text-[13.5px] font-semibold leading-snug text-muted-foreground">
                {hasSwap
                  ? 'A swap keeps your streak exactly where it is.'
                  : streakAtStake > 0
                    ? `Your ${streakAtStake}-week streak goes back to zero.`
                    : 'You can pick a different area straight after.'}
              </p>
            </div>
          </div>

          {/* What is actually being given up, named. "Change commitment" hid
              the fact that the scheduled tasks disappear with it. */}
          {active && (
            <div className="rounded-2xl border border-border/60 bg-card/60 px-3.5 py-3">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                You&apos;d be dropping
              </p>
              <p className="mt-1 text-[14.5px] font-black leading-snug text-foreground">
                {active.commitmentText}
              </p>
              <p className="mt-0.5 text-[12.5px] font-semibold text-muted-foreground">
                {active.scheduleLabel} · {active.progress} of {active.target}{' '}
                done
              </p>
            </div>
          )}

          <div
            className={cn(
              'rounded-2xl px-3.5 py-3 text-[12.5px] font-bold',
              hasSwap
                ? 'bg-primary/8 text-primary'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
            )}
          >
            {hasSwap
              ? `Uses 1 of your ${view.swapTokens} swap${view.swapTokens === 1 ? '' : 's'} — your streak is safe.`
              : 'The tasks left on your list are removed, and the streak resets.'}
          </div>

          {/* Only shown to someone who would actually gain from it. */}
          {!hasSwap && !view.isPremium && (
            <button
              type="button"
              onClick={onUpgrade}
              aria-label="Unlock Frog Plus"
              className="group relative isolate flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl px-4 text-emerald-950 ring-2 ring-amber-200/80 transition-transform active:scale-[0.98]"
            >
              <span
                aria-hidden
                className="absolute inset-0 -z-10 rounded-2xl bg-[linear-gradient(125deg,#fde68a_0%,#fbbf24_45%,#f59e0b_75%,#d97706_100%)]"
              />
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 -z-10 h-1/2 rounded-t-2xl bg-gradient-to-b from-white/45 to-transparent"
              />
              <Icon
                name="frogPlus"
                className="-my-8 -ml-1 h-20 w-20 drop-shadow-[0_3px_0_rgba(31,98,28,0.4)]"
              />
              <span className="text-left text-[12.5px] font-black leading-tight text-emerald-900 drop-shadow-[0_1px_0_rgba(255,255,255,0.5)]">
                Plus gives you swaps
                <span className="block text-[11px] font-bold opacity-80">
                  Change your mind without losing the streak
                </span>
              </span>
              <span className="inline-flex items-center rounded-lg bg-gradient-to-b from-emerald-600 to-emerald-800 px-2 py-1.5 text-[11px] font-black uppercase leading-none tracking-[0.18em] text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_4px_rgba(0,0,0,0.25)] ring-1 ring-emerald-900/40">
                Plus
              </span>
            </button>
          )}

          <div className="flex flex-col gap-2">
            {/* Two taps when a streak is on the line, one when nothing is.
                The second tap is the price being acknowledged, not friction
                for its own sake. */}
            <button
              type="button"
              disabled={changing}
              onClick={() => {
                if (hasSwap || streakAtStake === 0 || confirmed) {
                  onConfirm();
                  return;
                }
                setConfirmed(true);
              }}
              className={cn(
                'inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-black text-white transition-transform active:translate-y-[2px] active:shadow-none disabled:opacity-60',
                hasSwap
                  ? 'bg-[#4f9149] shadow-[0_4px_0_0_#34631f]'
                  : 'bg-destructive shadow-[0_4px_0_0_rgba(0,0,0,0.28)]',
              )}
            >
              {changing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" strokeWidth={2.75} />
                  {hasSwap
                    ? 'Use a swap'
                    : confirmed
                      ? 'Yes, reset my streak'
                      : 'Swap anyway'}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-11 w-full rounded-2xl text-[14px] font-black text-muted-foreground transition-colors hover:text-foreground"
            >
              Keep my Leap
            </button>
          </div>
        </div>
      )}
    </BaseSheet>
  );
}
