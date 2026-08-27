'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { RewardCard } from '@/components/ui/gift-box/RewardCard';
import { RotatingRays } from '@/components/ui/gift-box/RotatingRays';
import { RARITY_CONFIG } from '@/components/ui/gift-box/constants';
import { hapticCelebrate } from '@/lib/haptics';
import { byId } from '@/lib/skins/catalog';
import { PLANNER_TOUR_GIFT_ID } from '@/lib/tour/plannerTour';

export default function TourRewardOverlay({
  claiming,
  onClaim,
}: {
  claiming: boolean;
  onClaim: () => void;
}) {
  useEffect(() => {
    hapticCelebrate();
  }, []);

  const gift = byId[PLANNER_TOUR_GIFT_ID];
  if (typeof document === 'undefined' || !gift) return null;

  const rarity = RARITY_CONFIG[gift.rarity] ? gift.rarity : 'common';

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="tour-reward"
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

        <div className="relative z-10 flex w-full max-w-md flex-col items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-5 text-center"
          >
            <p className="text-[13px] font-black text-emerald-300/80">
              Planner tour complete
            </p>
            <p className="mt-1 text-2xl font-black tracking-tight text-white">
              You earned a gift
            </p>
          </motion.div>

          <RewardCard
            prize={gift}
            claiming={claiming}
            onClaim={onClaim}
            slotLabel="gift"
          />
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
