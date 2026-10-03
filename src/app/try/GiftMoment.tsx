'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { hapticCelebrate, hapticImpact, hapticTick } from '@/lib/haptics';
import type { ItemDef } from '@/lib/skins/catalog';

const OPEN_MS = 1400;

const RARITY_STYLE: Record<
  ItemDef['rarity'],
  { label: string; box: number; ring: string; pill: string; glow: string; tint: string; lift: string }
> = {
  common: { label: 'Common', box: 0, ring: 'ring-slate-300', pill: 'bg-slate-100 text-slate-700', glow: 'rgba(148,163,184,0.45)', tint: 'from-slate-100 via-slate-50', lift: 'rgba(71,85,105,0.3)' },
  uncommon: { label: 'Uncommon', box: 0, ring: 'ring-emerald-300', pill: 'bg-emerald-100 text-emerald-700', glow: 'rgba(52,211,153,0.4)', tint: 'from-emerald-100 via-emerald-50', lift: 'rgba(4,120,87,0.3)' },
  rare: { label: 'Rare', box: 1, ring: 'ring-sky-300', pill: 'bg-sky-100 text-sky-700', glow: 'rgba(56,189,248,0.45)', tint: 'from-sky-100 via-sky-50', lift: 'rgba(3,105,161,0.3)' },
  epic: { label: 'Epic', box: 2, ring: 'ring-violet-300', pill: 'bg-violet-100 text-violet-700', glow: 'rgba(167,139,250,0.45)', tint: 'from-violet-100 via-violet-50', lift: 'rgba(109,40,217,0.3)' },
  legendary: { label: 'Legendary', box: 2, ring: 'ring-amber-300', pill: 'bg-amber-100 text-amber-700', glow: 'rgba(251,191,36,0.45)', tint: 'from-amber-100 via-amber-50', lift: 'rgba(180,83,9,0.35)' },
};

type Phase = 'box' | 'opening' | 'reveal' | 'leaving';

export function GiftMoment({
  prize,
  onWear,
}: {
  prize: ItemDef;
  onWear: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>('box');
  const style = RARITY_STYLE[prize.rarity] ?? RARITY_STYLE.rare;
  const slotLabel = prize.slot === 'hand_item' ? 'item' : prize.slot;

  useEffect(() => {
    if (phase === 'opening') {
      hapticImpact();
      const rattle = window.setInterval(() => hapticTick(), 180);
      const done = window.setTimeout(() => setPhase('reveal'), OPEN_MS);
      return () => {
        window.clearInterval(rattle);
        window.clearTimeout(done);
      };
    }
    if (phase === 'reveal') hapticCelebrate();
  }, [phase]);

  const wear = () => {
    if (phase !== 'reveal') return;
    setPhase('leaving');
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence onExitComplete={onWear}>
      {phase !== 'leaving' && (
        <motion.div
          key="gift-moment"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.35 } }}
          className="fixed inset-0 z-[10001] flex items-center justify-center overflow-hidden px-5"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(255,251,235,0.97)_0%,rgba(254,243,199,0.9)_45%,rgba(253,230,138,0.82)_100%)] backdrop-blur-md" />

          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center [mask-image:radial-gradient(circle,black_20%,transparent_70%)]"
          >
            <div
              className="h-[150vmax] w-[150vmax] flex-none text-amber-300/45 motion-safe:animate-[spin_40s_linear_infinite]"
              style={{
                background:
                  'repeating-conic-gradient(from 0deg, transparent 0deg 12deg, currentColor 12deg 24deg)',
              }}
            />
          </div>

          <AnimatePresence mode="wait">
            {phase === 'reveal' ? (
              <motion.div
                key="reveal"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.6, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                className="relative z-10 flex w-full max-w-[340px] flex-col items-center"
              >
                <div
                  className={`w-full overflow-hidden rounded-[28px] bg-white text-center ring-2 ${style.ring}`}
                  style={{
                    boxShadow: `0 6px 0 0 ${style.lift}, 0 24px 60px -12px ${style.lift}`,
                  }}
                >
                  <div className={`relative flex h-[210px] items-center justify-center overflow-hidden bg-gradient-to-b ${style.tint} to-white`}>
                    <div
                      aria-hidden
                      className="absolute left-1/2 top-[48%] h-[240px] w-[240px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                      style={{
                        background: `radial-gradient(circle, ${style.glow} 0%, transparent 68%)`,
                      }}
                    />
                    <motion.div
                      className="relative"
                      initial={reduceMotion ? false : { scale: 0.4, rotate: -8 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 220, damping: 12, delay: 0.1 }}
                    >
                      <FrogSnapshot
                        indices={{ skin: prize.riveIndex, mood: 0 }}
                        width={220}
                        height={176}
                        visualOffsetY={0}
                        className="h-[176px] w-[220px]"
                      />
                    </motion.div>
                  </div>
                  <div className="px-6 pb-6 pt-4">
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-[13px] font-black ${style.pill}`}>
                      {style.label} {slotLabel}
                    </span>
                    <p className="mt-2 font-display text-[32px] leading-none tracking-wide text-[#1d3b1f]">
                      {prize.name}
                    </p>
                    <p className="mt-2 text-[14px] font-semibold text-[#1d3b1f]/60">
                      It&apos;s yours to keep.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={wear}
                  autoFocus
                  className="mt-5 flex h-[56px] w-full items-center justify-center rounded-2xl bg-[#4f9149] text-[17px] font-black tracking-tight text-white shadow-[0_5px_0_0_#34631f] transition-all hover:brightness-110 active:translate-y-[4px] active:shadow-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#4f9149]/40"
                >
                  Put it on
                </button>
              </motion.div>
            ) : (
              <motion.button
                key="box"
                type="button"
                onClick={() => phase === 'box' && setPhase('opening')}
                aria-label="Open your gift"
                initial={reduceMotion ? { opacity: 0, y: -48 } : { opacity: 0, y: -300, scale: 0.7 }}
                animate={{ opacity: 1, y: -48, scale: 1 }}
                exit={{ opacity: 0, scale: 1.3, transition: { duration: 0.2 } }}
                transition={{ type: 'spring', stiffness: 170, damping: 13, delay: 0.15 }}
                className="relative z-10 flex flex-col items-center focus:outline-none"
              >
                <p className="font-display text-[34px] leading-none tracking-wide text-[#1d3b1f] [filter:drop-shadow(0_2px_0_rgba(255,255,255,0.9))]">
                  A gift for you!
                </p>
                <p className="mt-2 text-[15px] font-bold text-[#1d3b1f]/65">
                  For finishing your first task
                </p>
                <div className="-mt-16 aspect-[282/381] h-[290px] w-auto drop-shadow-[0_18px_24px_rgba(146,64,14,0.3)]">
                  <GiftRive
                    className="h-full w-full"
                    color={style.box}
                    triggerOpen={phase === 'opening'}
                    ambient="jump"
                  />
                </div>
                <motion.span
                  animate={
                    phase === 'opening'
                      ? { opacity: 0, scale: 0.9 }
                      : reduceMotion
                        ? { opacity: 1 }
                        : { opacity: 1, scale: [1, 1.07, 1] }
                  }
                  transition={
                    phase === 'opening' || reduceMotion
                      ? { duration: 0.2 }
                      : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
                  }
                  className="mt-6 rounded-full bg-white px-5 py-2.5 text-[15px] font-black text-[#1d3b1f] shadow-[0_3px_0_0_rgba(180,83,9,0.25)]"
                >
                  Tap to open
                </motion.span>
              </motion.button>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {phase === 'reveal' && !reduceMotion && (
              <motion.div
                key="flash"
                aria-hidden
                className="pointer-events-none absolute inset-0 z-20 bg-white"
                initial={{ opacity: 0.95 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
