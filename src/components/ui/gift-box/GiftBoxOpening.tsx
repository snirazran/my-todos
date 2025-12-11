'use client';

import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { ItemDef } from '@/lib/skins/catalog';
import { cn } from '@/lib/utils';
import { RARITY_CONFIG } from './constants';
import { RotatingRays } from './RotatingRays';
import { GiftBox } from './GiftBox';
import { RewardCard } from './RewardCard';
import { FUNNY_SENTENCES } from './funnySentences';

export default function GiftBoxOpening({
  onClose,
  onWin,
  giftBoxId = 'gift_box_1',
}: {
  onClose: () => void;
  onWin?: (item: ItemDef) => void;
  giftBoxId?: string;
}) {
  const [phase, setPhase] = useState<'idle' | 'shaking' | 'revealed'>('idle');
  const [prize, setPrize] = useState<ItemDef | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [loadingText, setLoadingText] = useState(FUNNY_SENTENCES[0]);

  // Handle opening logic
  const handleOpen = async () => {
    if (phase !== 'idle') return;
    setPhase('shaking');

    // Cycle funny sentences
    const interval = setInterval(() => {
      setLoadingText(
        FUNNY_SENTENCES[Math.floor(Math.random() * FUNNY_SENTENCES.length)]
      );
    }, 800);

    try {
      // 1. Minimum animation time promise
      const animationPromise = new Promise((resolve) =>
        setTimeout(resolve, 3000)
      );

      // 2. API call promise
      const apiPromise = fetch('/api/skins/open-gift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ giftBoxId }),
      }).then((res) => {
        if (!res.ok) throw new Error('Failed to open gift');
        return res.json();
      });

      // Wait for both
      const [_, data] = await Promise.all([animationPromise, apiPromise]);

      if (data.prize) {
        setPrize(data.prize);
        if (onWin) onWin(data.prize); // Notify parent immediately or on claim?
        setPhase('revealed');
      } else {
        throw new Error('No prize returned');
      }
    } catch (err) {
      console.error(err);
      onClose(); // Close on error
    } finally {
      clearInterval(interval);
    }
  };

  const handleClaim = () => {
    // Prize is already in inventory from the open-gift API call
    // Just close the modal
    onClose();
  };

  const config = prize ? RARITY_CONFIG[prize.rarity] : RARITY_CONFIG.common;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden">
      {/* Background Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm"
      />

      {/* Dynamic God Rays for Reveal */}
      <AnimatePresence>
        {phase === 'revealed' && prize && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-0 flex items-center justify-center"
          >
            <RotatingRays colorClass={config.rays} />
            <div
              className={cn(
                'absolute inset-0 bg-radial-gradient from-transparent to-slate-950/80'
              )}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Close Button */}
      {phase === 'idle' && (
        <button
          onClick={onClose}
          className="absolute z-50 p-3 transition-all rounded-full top-4 right-4 md:top-8 md:right-8 bg-black/20 hover:bg-black/40 text-white/70 hover:text-white backdrop-blur-md"
        >
          <X className="w-6 h-6" />
        </button>
      )}

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-md p-6">
        <AnimatePresence mode="wait">
          {/* --- GIFT PHASE --- */}
          {phase !== 'revealed' && (
            <GiftBox
              key="gift"
              phase={phase}
              onOpen={handleOpen}
              loadingText={loadingText}
            />
          )}

          {/* --- REVEAL PHASE --- */}
          {phase === 'revealed' && prize && (
            <RewardCard
              key="card"
              prize={prize}
              claiming={claiming}
              onClaim={handleClaim}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}