'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import { HomeFocusFlies } from '@/components/ui/HomeFocusFlies';
import { PremiumFrogAura } from '@/components/ui/PremiumFrogAura';
import { FrogBellyDeck } from '@/components/ui/FrogBellyDeck';

type FrogIndicesInput = Partial<
  Record<'skin' | 'hat' | 'body' | 'hand_item' | 'mood', number>
>;

export function PondHero({
  indices,
  paused = false,
  claimable,
  claiming,
  gate,
  hasFriends,
  hunger,
  maxHunger,
  onClaim,
}: {
  indices: FrogIndicesInput;
  paused?: boolean;
  claimable: number;
  claiming: boolean;
  gate?: { required: number; done: number; open: boolean };
  hasFriends: boolean;
  /** Remaining belly time in ms, or null while unknown. */
  hunger: number | null;
  maxHunger: number;
  onClaim: () => void;
}) {
  const frogRef = React.useRef<FrogHandle | null>(null);
  const frogBoxRef = React.useRef<HTMLDivElement | null>(null);
  const [mouthOpen, setMouthOpen] = React.useState(false);

  const locked = !!gate && !gate.open;
  const left = gate ? Math.max(0, gate.required - gate.done) : 0;
  const ready = claimable > 0 && !locked;

  return (
    <div className="flex flex-col items-center">
      <div
        ref={frogBoxRef}
        data-fly-hero
        className="pointer-events-none relative z-30 flex shrink-0 origin-bottom flex-col items-center -translate-y-[11px] md:scale-110 lg:scale-100"
      >
        <HomeFocusFlies
          frogRef={frogRef}
          frogBoxRef={frogBoxRef}
          onGrabActive={setMouthOpen}
        />
        <div data-fly-hero-frog>
          <Frog
            ref={frogRef}
            width={240}
            height={270}
            indices={indices}
            paused={paused}
            mouthOpen={mouthOpen}
          />
        </div>
        <PremiumFrogAura />
      </div>

      {hunger !== null && (
        <div data-fly-fade data-hint="hunger-bar" className="relative z-20">
          <FrogBellyDeck
            hunger={hunger}
            maxHunger={maxHunger}
            animateHunger={!paused}
            className="-mt-6"
          />
        </div>
      )}

      <div
        data-fly-fade
        className={cn(
          'relative z-20 flex w-[min(22rem,88vw)] flex-col items-center justify-center',
          ready || (locked && claimable > 0)
            ? 'mt-4 min-h-[3.5rem]'
            : 'mt-0 min-h-0',
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          {ready ? (
            <motion.button
              key="claim"
              type="button"
              onClick={onClaim}
              disabled={claiming}
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 340, damping: 24 }}
              className="relative flex min-h-14 w-full touch-manipulation items-center justify-center gap-2 rounded-full bg-[#4f9149] px-7 text-white shadow-[0_5px_0_#34631f] transition-[filter,transform,box-shadow] hover:brightness-105 active:translate-y-0.5 active:shadow-none disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#4f9149]"
            >
              <span className="text-[17px] font-black tracking-tight">
                {claiming ? 'Catching…' : `Catch ${claimable}`}
              </span>
              {!claiming && (
                <span className="flex items-center drop-shadow-sm">
                  <Fly size={40} y={-8} interactive={false} paused={paused} />
                </span>
              )}
              <AnimatePresence>
                {!claiming && (
                  <motion.span
                    aria-hidden
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0.35, 0.9, 0.35] }}
                    transition={{ duration: 2.4, repeat: Infinity }}
                    className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-[#4f9149]/40"
                  />
                )}
              </AnimatePresence>
            </motion.button>
          ) : locked && claimable > 0 ? (
            <motion.div
              key="locked"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-2 text-center"
            >
              <p className="text-[15px] font-bold tracking-tight text-foreground">
                {claimable} {claimable === 1 ? 'fly' : 'flies'} waiting for you
              </p>
              <div className="flex items-center gap-1.5">
                {Array.from({ length: gate?.required ?? 0 }).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      'h-1.5 rounded-full transition-colors',
                      i < (gate?.done ?? 0)
                        ? 'w-6 bg-[#4f9149]'
                        : 'w-6 bg-border',
                    )}
                  />
                ))}
              </div>
              <p className="text-xs font-medium text-muted-foreground">
                {left} more of your own {left === 1 ? 'task' : 'tasks'} opens
                the pond
              </p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
