'use client';

import { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { motion, useReducedMotion } from 'framer-motion';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { FlyAmount } from '@/components/ui/FlyAmount';
import { hapticCelebrate } from '@/lib/haptics';
import type { LeapView, LeapWeekResult } from '@/lib/leap/types';
import { cn } from '@/lib/utils';
import { leagueArt } from './leapCopy';

const SPRING = { type: 'spring' as const, stiffness: 260, damping: 18 };

function labelFor(view: LeapView | undefined, index: number) {
  return view?.leagues[index]?.label ?? 'Lily';
}

function copyFor(result: LeapWeekResult, view: LeapView | undefined) {
  const after = labelFor(view, result.leagueAfter);
  const before = labelFor(view, result.leagueBefore);
  const upNext = view?.leagues[result.leagueAfter + 1]?.label;
  switch (result.outcome) {
    case 'up':
      return {
        title: `You advanced to the ${after} League!`,
        body: upNext ? `Next up: the ${upNext} League.` : "That's the top league!",
      };
    case 'top':
      return { title: 'You stayed on top!', body: `The ${after} League is still yours.` };
    case 'covered':
      return { title: 'A Lily Pad saved you', body: `You stay in the ${after} League.` };
    case 'down':
      return {
        title: `You were demoted to the ${after} League`,
        body: `Reach the promotion zone to climb back to ${before}.`,
      };
    default:
      return {
        title: `You stayed in the ${after} League`,
        body: 'Reach the promotion zone this week to advance.',
      };
  }
}

export function LeapDaySheet({
  result,
  view,
  open,
  onClose,
}: {
  result: LeapWeekResult;
  view: LeapView | undefined;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <BaseSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      zIndex={1320}
      className="select-none sm:max-w-[420px]"
      closeAriaLabel="Close"
    >
      {() => (
        <div className="px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-5 sm:px-6 sm:pb-6 sm:pt-8">
          <LeapDayContent result={result} view={view} active={open} onClose={onClose} />
        </div>
      )}
    </BaseSheet>
  );
}

export function LeapDayContent({
  result,
  view,
  active,
  onClose,
  quiet = false,
}: {
  result: LeapWeekResult;
  view: LeapView | undefined;
  active: boolean;
  onClose: () => void;
  quiet?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const climbed = result.outcome === 'up';
  const celebrate = climbed || result.outcome === 'top';
  const { title, body } = copyFor(result, view);
  const gifts = result.grantedItemIds.filter((id) => id.startsWith('gift_box')).length;

  useEffect(() => {
    if (!active || !celebrate || quiet) return;
    const timer = window.setTimeout(() => {
      hapticCelebrate();
      if (!reduceMotion) {
        void confetti({
          particleCount: result.newBest ? 120 : 70,
          spread: 70,
          origin: { y: 0.5 },
          zIndex: 2000,
        });
      }
    }, climbed ? 1050 : 500);
    return () => window.clearTimeout(timer);
  }, [active, celebrate, quiet, climbed, reduceMotion, result.newBest]);

  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative flex h-36 w-full items-end justify-center">
        {climbed && (
          <motion.img
            src={leagueArt(result.leagueBefore)}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="absolute bottom-1 left-[calc(50%-8.5rem)] h-20 w-24 object-contain"
            initial={reduceMotion ? false : { opacity: 1, scale: 1 }}
            animate={{ opacity: 0.55, scale: 0.86 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          />
        )}
        {climbed && !reduceMotion && (
          <motion.span
            aria-hidden="true"
            className="absolute bottom-0 left-1/2 h-3 w-3 rounded-full bg-amber-300 shadow-[0_0_12px_4px_rgba(245,179,1,0.7)]"
            initial={{ x: -88, y: -56, opacity: 0 }}
            animate={{
              x: [-88, -24, 40],
              y: [-56, -118, -62],
              opacity: [0, 1, 0],
            }}
            transition={{ duration: 0.75, delay: 0.35, ease: [0.32, 0.06, 0.24, 1] }}
          />
        )}
        <motion.img
          src={leagueArt(result.leagueAfter)}
          alt=""
          aria-hidden="true"
          draggable={false}
          className={cn(
            'relative h-32 w-40 object-contain',
            climbed && 'translate-x-10',
            celebrate &&
              'drop-shadow-[0_0_14px_rgba(202,138,4,0.55)] dark:drop-shadow-[0_0_12px_rgba(245,179,1,0.45)]',
          )}
          initial={
            reduceMotion
              ? false
              : climbed
                ? { scale: 0.4, opacity: 0, y: 24 }
                : { scale: 0.85, opacity: 0 }
          }
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ ...SPRING, delay: climbed ? 1 : 0.15 }}
        />
      </div>

      <motion.h2
        className="mt-3 text-[24px] font-black leading-tight tracking-tight text-foreground"
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: climbed ? 1.15 : 0.3 }}
      >
        {title}
      </motion.h2>
      <motion.p
        className="mt-1 max-w-[300px] text-[14px] font-semibold leading-snug text-muted-foreground"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35, delay: climbed ? 1.3 : 0.45 }}
      >
        {body}
      </motion.p>

      {(result.fliesGranted > 0 || gifts > 0) && (
        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-muted/60 px-3.5 py-1.5 text-[13px] font-black text-foreground">
          <span className="text-muted-foreground">Last week</span>
          {result.fliesGranted > 0 && <FlyAmount amount={result.fliesGranted} />}
          {gifts > 0 && <span>+ {gifts} gift{gifts === 1 ? '' : 's'}</span>}
        </div>
      )}

      <button
        type="button"
        onClick={onClose}
        className="mt-6 h-12 w-full rounded-2xl bg-primary text-[15px] font-black text-primary-foreground shadow-[0_4px_0_0_#34631f] transition active:translate-y-[2px] active:shadow-none"
      >
        Let&apos;s go
      </button>
    </div>
  );
}
