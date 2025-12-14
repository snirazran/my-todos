'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { RotatingRays } from './RotatingRays';
import { RewardCard } from './RewardCard';
import { byId } from '@/lib/skins/catalog';
import { RARITY_CONFIG } from './constants';

type RewardPopupProps = {
  show: boolean;
  onClose: () => void;
};

export function RewardPopup({ show, onClose }: RewardPopupProps) {
  const [mounted, setMounted] = useState(false);
  const [claiming, setClaiming] = useState(false);
  // We'll use local state to track if we should show the content
  // This helps when 'show' prop turns false but we want to animate out
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (show) setShouldRender(true);
  }, [show]);

  // Gift Box Item Configuration
  const giftBoxItem = byId['gift_box_1'];
  const giftConfig = giftBoxItem
    ? RARITY_CONFIG[giftBoxItem.rarity]
    : RARITY_CONFIG.common;

  const handleClaimReward = async () => {
    // The gift is already awarded by the task completion logic (backend).
    // We just close the popup to acknowledge.
    onClose();
  };

  const handleBackdropClick = () => {
    // Optional: allow clicking backdrop to close? 
    // Usually rewards require claiming. Let's keep it modal.
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence mode="wait" onExitComplete={() => setShouldRender(false)}>
      {show && giftBoxItem && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden pointer-events-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm"
            onClick={handleBackdropClick}
          />

          {/* Rays - Full Screen */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none"
          >
            <RotatingRays colorClass={giftConfig.rays} />
            <div
              className={cn(
                'absolute inset-0 bg-radial-gradient from-transparent to-slate-950/80'
              )}
            />
          </motion.div>

          {/* Content */}
          <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-md p-6">
            <motion.div 
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.9 }}
               className="relative z-10 w-full"
            >
              <div className="mb-8 text-center">
                <h2 className="text-3xl font-black text-white uppercase tracking-widest drop-shadow-md">
                  Milestone Reached!
                </h2>
                <p className="mt-2 text-lg font-bold text-slate-300">
                  You earned a gift box
                </p>
              </div>
              <RewardCard
                prize={giftBoxItem}
                claiming={claiming}
                onClaim={handleClaimReward}
              />
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
