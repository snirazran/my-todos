'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { hapticCelebrate, hapticImpact, hapticTick } from '@/lib/haptics';
import { AnimatePresence, motion } from 'framer-motion';
import Fly from '@/components/ui/fly';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';
import { RewardCard } from '@/components/ui/gift-box/RewardCard';
import { RotatingRays } from '@/components/ui/gift-box/RotatingRays';
import { RARITY_CONFIG } from '@/components/ui/gift-box/constants';
import type { ItemDef } from '@/lib/skins/catalog';

const BOX_OPEN_MS = 1400;

export function fliesPrize(flies: number): ItemDef {
  return {
    id: 'flies-gift',
    name: `${flies} Flies`,
    rarity: 'uncommon',
    priceFlies: 0,
    slot: 'hand_item',
    riveIndex: 0,
    icon: '',
  };
}

function boxColorFor(rarity: ItemDef['rarity']): number {
  if (rarity === 'legendary' || rarity === 'epic') return 2;
  if (rarity === 'rare') return 1;
  return 0;
}

export function GiftRevealOverlay({
  eyebrow,
  headline,
  prize,
  fliesAmount,
  claiming,
  onClaim,
  contentClassName = '',
}: {
  eyebrow: string;
  headline: string;
  prize: ItemDef;
  fliesAmount?: number;
  claiming: boolean;
  onClaim: () => void;
  contentClassName?: string;
}) {
  const [phase, setPhase] = useState<'box' | 'opening' | 'reveal'>('box');
  const rarity = RARITY_CONFIG[prize.rarity] ? prize.rarity : 'uncommon';

  useEffect(() => {
    if (phase === 'opening') {
      hapticImpact();
      const rattle = window.setInterval(() => hapticTick(), 180);
      return () => window.clearInterval(rattle);
    }
    if (phase === 'reveal') hapticCelebrate();
  }, [phase]);

  const handleOpen = () => {
    if (phase !== 'box') return;
    setPhase('opening');
    setTimeout(() => setPhase('reveal'), BOX_OPEN_MS);
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="gift-reveal"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[10001] flex items-center justify-center px-4"
      >
        <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm" />
        <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
          <RotatingRays colorClass={RARITY_CONFIG[rarity].rays} />
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle, transparent 40%, rgba(2,6,23,0.8) 100%)',
            }}
          />
        </div>
        <div
          className={`relative z-10 flex w-full max-w-md flex-col items-center justify-center p-6 ${contentClassName}`}
        >
          {phase !== 'reveal' ? (
            <motion.button
              type="button"
              key="box"
              onClick={handleOpen}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex cursor-pointer flex-col items-center focus:outline-none"
            >
              <div className="mb-2 text-center">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300/80">
                  {eyebrow}
                </p>
                <p className="mt-1 text-2xl font-black tracking-tight text-white">
                  {headline}
                </p>
              </div>
              <div className="h-[300px] w-auto aspect-[282/381]">
                <GiftRive
                  className="h-full w-full"
                  color={boxColorFor(prize.rarity)}
                  triggerOpen={phase === 'opening'}
                  ambient="jump"
                />
              </div>
              <p className="mt-3 text-base font-black uppercase tracking-widest text-white/80">
                {phase === 'opening' ? 'Unwrapping…' : 'Tap to unwrap'}
              </p>
            </motion.button>
          ) : (
            <RewardCard
              prize={prize}
              claiming={claiming}
              onClaim={onClaim}
              slotLabel={
                fliesAmount != null ? 'Flies' : prize.slot.replace('_', ' ')
              }
              customPreview={
                fliesAmount != null ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2">
                    <Fly size={84} interactive={false} />
                    <span className="text-4xl font-black text-emerald-700 dark:text-emerald-300">
                      +{fliesAmount}
                    </span>
                  </div>
                ) : undefined
              }
            />
          )}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
