'use client';

import { useEffect, useId, useState } from 'react';
import {
  Flame,
  ListX,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import type { PactView } from '@/lib/pact/types';

/**
 * Swapping releases the week's tasks and deletes the pact, so it is the one
 * action on the card that cannot be taken back. A sheet gives the cost the same
 * room as the choice.
 *
 * One consequence list, stating only what is actually true for this user, and
 * one accent colour. The Plus pitch sits under the decision rather than beside
 * the button that charges for it.
 */
export function PactChangeSheet({
  open,
  onClose,
  view,
  onConfirm,
  onUpgrade,
  changing,
  error,
}: {
  open: boolean;
  onClose: () => void;
  view: PactView;
  onConfirm: () => void;
  onUpgrade: () => void;
  changing: boolean;
  error?: string | null;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const titleId = useId();
  const bodyId = useId();
  useEffect(() => {
    if (open) setConfirmed(false);
  }, [open]);

  const active = view.active;
  const hasSwap = view.swapTokens > 0;
  const streakAtStake = hasSwap ? 0 : view.streak.weeks;
  const needsSecondTap = streakAtStake > 0 && !confirmed;

  const consequences = hasSwap
    ? [
        {
          icon: ShieldCheck,
          text: `Uses 1 of your ${view.swapTokens} swap${view.swapTokens === 1 ? '' : 's'}`,
          danger: false,
        },
        {
          icon: Flame,
          text:
            view.streak.weeks > 0
              ? `Your ${view.streak.weeks}-week streak stays`
              : 'Your streak is untouched',
          danger: false,
        },
      ]
    : [
        {
          icon: ListX,
          text: 'Unfinished tasks leave your list',
          danger: false,
        },
        ...(streakAtStake > 0
          ? [
              {
                icon: Flame,
                text: `Your ${streakAtStake}-week streak resets to 0`,
                danger: true,
              },
            ]
          : []),
      ];

  return (
    <BaseSheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      zIndex={1450}
      className="bg-background ring-1 ring-border/70 sm:max-w-[420px]"
    >
      {() => (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={bodyId}
          className="flex flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3"
        >
          <div className="flex items-start gap-3">
            <span
              className={cn(
                'mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl',
                hasSwap
                  ? 'bg-primary/12 text-primary'
                  : 'bg-destructive/10 text-destructive',
              )}
            >
              {hasSwap ? (
                <ShieldCheck className="h-5 w-5" strokeWidth={2.5} />
              ) : (
                <TriangleAlert className="h-5 w-5" strokeWidth={2.5} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <h2
                id={titleId}
                className="text-[19px] font-black leading-tight text-foreground"
              >
                Swap this week&apos;s Leap?
              </h2>
              <p className="mt-1 text-[13px] font-semibold leading-snug text-muted-foreground">
                You&apos;ll pick a new area straight after.
              </p>
            </div>
          </div>

          {active && (
            <div className="mt-4 rounded-2xl border border-border/60 bg-muted/30 px-3.5 py-3">
              <p className="text-[12px] font-black text-muted-foreground">
                Dropping
              </p>
              <p className="mt-1 text-[14.5px] font-black leading-snug text-foreground">
                {active.commitmentText}
              </p>
              <p className="mt-0.5 text-[12px] font-semibold text-muted-foreground">
                {active.scheduleLabel} · {active.progress} of {active.target} done
              </p>
            </div>
          )}

          <ul id={bodyId} className="mt-3 flex flex-col gap-1.5">
            {consequences.map(({ icon: ConsequenceIcon, text, danger }) => (
              <li
                key={text}
                className={cn(
                  'flex items-center gap-2.5 text-[13px] font-bold leading-snug',
                  danger ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                <ConsequenceIcon
                  className="h-4 w-4 shrink-0"
                  strokeWidth={2.5}
                  aria-hidden
                />
                {text}
              </li>
            ))}
          </ul>

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-[13px] font-bold leading-snug text-destructive"
            >
              {error}
            </p>
          )}

          <div className="mt-5 flex flex-col gap-1.5">
            <button
              type="button"
              disabled={changing}
              onClick={() => {
                if (needsSecondTap) {
                  setConfirmed(true);
                  return;
                }
                onConfirm();
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
                    : needsSecondTap
                      ? 'Swap anyway'
                      : streakAtStake > 0
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

          {!hasSwap && !view.isPremium && (
            <button
              type="button"
              onClick={onUpgrade}
              className="mt-2 flex w-full items-center justify-center gap-1.5 border-t border-border/50 pt-3 text-[12px] font-bold text-muted-foreground transition-colors hover:text-foreground"
            >
              <Icon name="frogPlus" className="h-6 w-6 shrink-0" />
              <span>
                Plus includes swaps that keep your streak
              </span>
              <span className="inline-flex items-center rounded-md bg-gradient-to-b from-emerald-600 to-emerald-800 px-1.5 py-0.5 text-[11px] font-black leading-none text-amber-100">
                Plus
              </span>
            </button>
          )}
        </div>
      )}
    </BaseSheet>
  );
}
