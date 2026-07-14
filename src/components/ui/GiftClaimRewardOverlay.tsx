'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { RewardCard } from '@/components/ui/gift-box/RewardCard';
import { RotatingRays } from '@/components/ui/gift-box/RotatingRays';
import { RARITY_CONFIG } from '@/components/ui/gift-box/constants';
import { hapticCelebrate } from '@/lib/haptics';
import type { ItemDef } from '@/lib/skins/catalog';

export function GiftClaimRewardOverlay({
  gift,
  inviterName,
  onClose,
}: {
  gift: ItemDef;
  inviterName: string;
  onClose: () => void;
}) {
  useEffect(() => {
    hapticCelebrate();
  }, []);

  if (typeof document === 'undefined') return null;

  const rarity = RARITY_CONFIG[gift.rarity] ? gift.rarity : 'uncommon';

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="gift-claim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[10001] flex items-center justify-center px-4"
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm"
          onClick={onClose}
        />
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
        <div className="relative z-10 flex w-full max-w-md flex-col items-center justify-center p-6">
          <div className="mb-5 text-center">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300/80">
              A gift from
            </p>
            <p className="mt-1 text-2xl font-black tracking-tight text-white">
              {inviterName}
            </p>
          </div>
          <RewardCard
            prize={gift}
            claiming={false}
            onClaim={onClose}
            slotLabel={gift.slot.replace('_', ' ')}
          />
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
