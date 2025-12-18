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
  onClose: (claimed?: boolean) => void;
  dailyGiftCount?: number;
};

export function RewardPopup({
  show,
  onClose,
  dailyGiftCount = 0,
}: RewardPopupProps) {
  const [mounted, setMounted] = useState(false);
  const [claiming, setClaiming] = useState(false);

  // 1. Frozen index stores the gift ID so it doesn't switch while closing
  const [frozenIndex, setFrozenIndex] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 2. Lock the index when 'show' becomes true.
  useEffect(() => {
    if (show && frozenIndex === null) {
      setFrozenIndex(dailyGiftCount);
    } else if (!show) {
      // Keep the index frozen for 500ms so the exit animation shows the correct gift
      const timer = setTimeout(() => {
        setFrozenIndex(null);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [show, dailyGiftCount, frozenIndex]);

  // 3. Use frozenIndex for data content
  const activeIndex = frozenIndex ?? dailyGiftCount;

  const giftId = `gift_box_${activeIndex + 1}`;
  const giftBoxItem = byId[giftId] || byId['gift_box_1'];

  const giftConfig = giftBoxItem
    ? RARITY_CONFIG[giftBoxItem.rarity]
    : RARITY_CONFIG.common;

  const handleClaimReward = async () => {
    if (claiming) return;
    setClaiming(true);

    try {
      const statsReq = await fetch('/api/statistics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claim_gift' }),
      });

      if (!statsReq.ok) {
        const errorData = await statsReq.json();
        console.warn('Cannot claim:', errorData.error);
        onClose(false);
        return;
      }

      // This will set 'show' to false immediately
      onClose(true);
    } catch (e) {
      console.error(e);
      onClose(false);
    } finally {
      setClaiming(false);
    }
  };

  if (!mounted) return null;

  // ⚠️ FIX: REMOVED 'shouldRender'.
  // We use 'show' to control visibility, and 'frozenIndex' to control content validity.

  // Safety check: if we are trying to render but have no valid item, abort.
  if (activeIndex >= 3 && !show) return null;

  return createPortal(
    <AnimatePresence>
      {/* ⚠️ FIX: Use 'show' directly here. This triggers the exit animation immediately. */}
      {show && giftBoxItem && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden pointer-events-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm"
            onClick={() => !claiming && onClose(false)}
          />

          {/* Rays */}
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
              key="modal-content"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative z-10 w-full"
            >
              <div className="mb-8 text-center">
                <h2 className="text-3xl font-black tracking-widest text-white uppercase drop-shadow-md">
                  Tasks Complete!
                </h2>
                <p className="mt-2 text-lg font-bold text-slate-300">
                  You earned a reward
                </p>
                <p className="mt-1 text-xs font-bold tracking-widest uppercase text-slate-500">
                  {/* Using frozen activeIndex prevents number jumping during exit */}
                  Gift {activeIndex + 1}/3 today
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
