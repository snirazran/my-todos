'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { CATALOG, ItemDef, Rarity } from '@/lib/skins/catalog';
import { cn } from '@/lib/utils';
import { RARITY_CONFIG } from './constants';
import { getRandomItem } from './utils';
import { RotatingRays } from './RotatingRays';
import { GiftBox } from './GiftBox';
import { RewardCard } from './RewardCard';

export default function GiftBoxOpening({
  onClose,
  onWin,
}: {
  onClose: () => void;
  onWin?: (item: ItemDef) => void;
}) {
  const [phase, setPhase] = useState<'idle' | 'shaking' | 'revealed'>('idle');
  const [prize, setPrize] = useState<ItemDef | null>(null);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    const catalogByRarity: Record<Rarity, ItemDef[]> = {
      common: [],
      uncommon: [],
      rare: [],
      epic: [],
      legendary: [],
    };
    CATALOG.forEach((item) => {
      if (catalogByRarity[item.rarity]) catalogByRarity[item.rarity].push(item);
    });

    const WIN_WEIGHTS: Record<Rarity, number> = {
      common: 0.6,
      uncommon: 0.25,
      rare: 0.1,
      epic: 0.04,
      legendary: 0.01,
    };

    setPrize(getRandomItem(WIN_WEIGHTS, catalogByRarity));
  }, []);

  const handleOpen = () => {
    if (phase !== 'idle' || !prize) return;
    setPhase('shaking');

    setTimeout(() => {
      setPhase('revealed');
    }, 1500);
  };

  const handleClaim = async () => {
    if (claiming || !prize) return;
    setClaiming(true);
    try {
      await fetch('/api/skins/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: prize.id }),
      });
      if (onWin) onWin(prize);
      onClose();
    } catch (err) {
      console.error(err);
      onClose();
    } finally {
      setClaiming(false);
    }
  };

  if (!prize) return null;
  const config = RARITY_CONFIG[prize.rarity];

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
        {phase === 'revealed' && (
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
            <GiftBox key="gift" phase={phase} onOpen={handleOpen} />
          )}

          {/* --- REVEAL PHASE --- */}
          {phase === 'revealed' && (
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
