'use client';

import { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { Flame, HeartCrack, ShieldCheck, Trophy } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { FlyWorth } from '@/components/ui/QuestCards';
import { hapticCelebrate } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import type { PactWeekResult } from '@/lib/pact/types';

/**
 * The one moment the weekly pact never had.
 *
 * Settlement is lazy — it runs on the first page load after the week rolls
 * over — so a streak could break, a shield could be spent, and a finished
 * week's rewards could be granted, all with the card simply gone by the time
 * the user next looked. Every one of those is the payoff for something they
 * committed to; none of them should arrive as a number that quietly changed.
 *
 * A miss is reported plainly and once. No guilt, no "you let your frog down" —
 * the point is that the user learns the rule (all sessions, or no bonus), and
 * is offered the shield that would have covered it. That offer belongs here
 * because this is the only moment they have felt the cost of not having one.
 */
export function PactWeekResultSheet({
  result,
  onClose,
  onGetShield,
}: {
  result: PactWeekResult;
  onClose: () => void;
  onGetShield: () => void;
}) {
  const [open, setOpen] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => {
    setOpen(true);
  }, []);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    if (result.outcome === 'missed') return;
    hapticCelebrate();
    confetti({
      particleCount: result.outcome === 'kept' ? 110 : 70,
      spread: 78,
      startVelocity: 40,
      origin: { y: 0.4 },
      zIndex: 1600,
    });
  }, [result.outcome]);

  const dismiss = () => {
    setOpen(false);
    // Let the sheet's exit finish before the parent drops it from the tree.
    window.setTimeout(onClose, 260);
  };

  const kept = result.outcome === 'kept';
  const rescued = result.outcome === 'rescued';
  const missed = result.outcome === 'missed';

  const tone = missed
    ? 'bg-muted text-muted-foreground'
    : rescued
      ? 'bg-sky-500/12 text-sky-600 dark:text-sky-400'
      : 'bg-lime-500/12 text-lime-600 dark:text-lime-400';

  return (
    <BaseSheet
      open={open}
      onOpenChange={(next) => !next && dismiss()}
      zIndex={1500}
      className="bg-background ring-1 ring-border/70 sm:max-w-[420px]"
    >
      {() => (
        <div className="flex flex-col gap-4 px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2">
          <div className="flex flex-col items-center gap-3 pt-2 text-center">
            <span className={cn('grid h-16 w-16 place-items-center rounded-2xl', tone)}>
              {missed ? (
                <HeartCrack className="h-8 w-8" strokeWidth={2.25} />
              ) : rescued ? (
                <ShieldCheck className="h-8 w-8" strokeWidth={2.25} />
              ) : (
                <Trophy className="h-8 w-8" strokeWidth={2.25} />
              )}
            </span>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                Last week · {result.categoryName}
              </p>
              <h2 className="mt-1.5 text-[21px] font-black leading-tight text-foreground">
                {result.lapCompleted
                  ? 'You finished the whole ladder'
                  : kept
                    ? 'You kept your word'
                    : rescued
                      ? 'A shield saved your streak'
                      : 'That week got away'}
              </h2>
              {/* A lap has to explain itself here or nowhere: the streak the
                  user is about to see is zero, and without this screen that
                  reads as the thing they were trying to avoid. */}
              <p className="mx-auto mt-1.5 max-w-[34ch] text-[13.5px] font-semibold leading-snug text-muted-foreground">
                {result.lapCompleted
                  ? `${result.streakAfter} weeks straight, paid at the top rate. The climb starts again from ×1 — your best gift is at the top.`
                  : kept
                    ? `All ${result.target} session${result.target === 1 ? '' : 's'} done.`
                    : rescued
                      ? `You finished ${result.progress} of ${result.target}. A shield covered the rest, so the streak stands.`
                      : `You finished ${result.progress} of ${result.target}. Sessions you did still paid — the week bonus needed all of them.`}
              </p>
            </div>
          </div>

          {/* The streak, stated as a change rather than a final number: what
              the week cost or bought is the whole reason this screen exists. */}
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/60 px-4 py-3">
            <span className="text-[12px] font-black uppercase tracking-wider text-muted-foreground">
              Streak
            </span>
            <span className="inline-flex items-center gap-2">
              {result.streakBefore !== result.streakAfter && (
                <span className="text-[15px] font-black text-muted-foreground line-through decoration-1">
                  {result.streakBefore}
                </span>
              )}
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-[19px] font-black',
                  missed
                    ? 'text-muted-foreground'
                    : 'text-amber-600 dark:text-amber-400',
                )}
              >
                <Flame className="h-4 w-4" strokeWidth={2.75} />
                {result.streakAfter}
              </span>
            </span>
          </div>

          {result.fliesGranted > 0 && (
            <div className="flex items-center gap-1.5 rounded-2xl bg-lime-500/10 px-4 py-3 text-[12.5px] font-bold text-lime-700 dark:text-lime-400">
              <FlyWorth amount={result.fliesGranted} />
              <span>collected for you</span>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {/* Only offered where it would have helped, and only when there is
                none in hand — the cost of not having one is exactly what the
                user has just been told. */}
            {missed && result.shieldsLeft === 0 && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  window.setTimeout(onGetShield, 260);
                }}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 text-[15px] font-black text-white shadow-[0_4px_0_0_#0369a1] transition-transform active:translate-y-[2px] active:shadow-none"
              >
                <ShieldCheck className="h-4 w-4" strokeWidth={2.75} />
                Get a shield for next time
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              className={cn(
                'h-12 w-full rounded-2xl text-[15px] font-black transition-transform active:translate-y-[2px] active:shadow-none',
                missed && result.shieldsLeft === 0
                  ? 'text-muted-foreground hover:text-foreground'
                  : 'bg-[#4f9149] text-white shadow-[0_4px_0_0_#34631f] ring-1 ring-[#34631f]/40',
              )}
            >
              {missed ? 'Start this week' : 'Nice'}
            </button>
          </div>
        </div>
      )}
    </BaseSheet>
  );
}
