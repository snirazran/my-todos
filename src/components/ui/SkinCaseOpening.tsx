'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { X, Loader2, Sparkles } from 'lucide-react';
import Frog from '@/components/ui/frog';
import { CATALOG, ItemDef, Rarity } from '@/lib/skins/catalog';
// REMOVED: import confetti from 'canvas-confetti';
import { cn } from '@/lib/utils';
import { useRive, Layout, Fit, Alignment } from '@rive-app/react-canvas';

// --- Configuration ---
// REMOVED: const TOTAL_ITEMS = 60; (Unused)

// --- Rarity Visuals ---
const RARITY_CONFIG: Record<
  Rarity,
  {
    border: string;
    bg: string;
    text: string;
    glow: string;
    label: string;
    gradient: string;
    shadow: string;
    rays: string;
    button: string;
  }
> = {
  common: {
    border: 'border-slate-300 dark:border-slate-600',
    bg: 'bg-slate-50 dark:bg-slate-800',
    text: 'text-slate-600 dark:text-slate-400',
    glow: 'shadow-slate-500/20',
    label: 'Common',
    gradient:
      'from-slate-200 to-slate-100 dark:from-slate-800 dark:to-slate-900',
    shadow: 'shadow-xl shadow-slate-900/10',
    rays: 'text-slate-400/20',
    button: 'bg-white text-slate-900 hover:bg-slate-50',
  },
  uncommon: {
    border: 'border-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    text: 'text-emerald-700 dark:text-emerald-400',
    glow: 'shadow-emerald-500/30',
    label: 'Uncommon',
    gradient:
      'from-emerald-100 to-emerald-50 dark:from-emerald-900/40 dark:to-emerald-950/40',
    shadow: 'shadow-xl shadow-emerald-900/10',
    rays: 'text-emerald-500/20',
    button: 'bg-emerald-500 text-white hover:bg-emerald-400',
  },
  rare: {
    border: 'border-sky-400',
    bg: 'bg-sky-50 dark:bg-sky-950/40',
    text: 'text-sky-700 dark:text-sky-400',
    glow: 'shadow-sky-500/40',
    label: 'Rare',
    gradient: 'from-sky-100 to-sky-50 dark:from-sky-900/40 dark:to-sky-950/40',
    shadow: 'shadow-xl shadow-sky-900/10',
    rays: 'text-sky-500/30',
    button: 'bg-sky-500 text-white hover:bg-sky-400',
  },
  epic: {
    border: 'border-violet-400',
    bg: 'bg-violet-50 dark:bg-violet-950/40',
    text: 'text-violet-700 dark:text-violet-400',
    glow: 'shadow-violet-500/50',
    label: 'Epic',
    gradient:
      'from-violet-100 to-violet-50 dark:from-violet-900/40 dark:to-violet-950/40',
    shadow: 'shadow-2xl shadow-violet-900/20',
    rays: 'text-violet-500/40',
    button: 'bg-violet-600 text-white hover:bg-violet-500',
  },
  legendary: {
    border: 'border-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-700 dark:text-amber-400',
    glow: 'shadow-amber-500/60',
    label: 'Legendary',
    gradient:
      'from-amber-100 to-amber-50 dark:from-amber-900/40 dark:to-amber-950/40',
    shadow: 'shadow-2xl shadow-amber-900/30',
    rays: 'text-amber-500/50',
    button:
      'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:brightness-110',
  },
};

// --- Utils ---
const rollRarity = (weights: Record<Rarity, number>): Rarity => {
  const rand = Math.random();
  let cumulative = 0;
  for (const [rarity, weight] of Object.entries(weights)) {
    cumulative += weight;
    if (rand < cumulative) return rarity as Rarity;
  }
  return 'common';
};

const getRandomItem = (
  weights: Record<Rarity, number>,
  catalog: Record<Rarity, ItemDef[]>
): ItemDef => {
  let rarity = rollRarity(weights);
  while (catalog[rarity].length === 0) {
    if (rarity === 'legendary') rarity = 'epic';
    else if (rarity === 'epic') rarity = 'rare';
    else if (rarity === 'rare') rarity = 'uncommon';
    else if (rarity === 'uncommon') rarity = 'common';
    else break;
  }
  const pool = catalog[rarity];
  return pool[Math.floor(Math.random() * pool.length)];
};

// --- Components ---
const GiftRive = () => {
  const { RiveComponent } = useRive({
    src: '/idle_gift.riv',
    stateMachines: 'State Machine 1',
    autoplay: true,
    layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
  });
  return <RiveComponent className="w-full h-full" />;
};

// UPDATED: High Performance CSS Rays
const RotatingRays = ({ colorClass }: { colorClass: string }) => (
  <div
    className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden pointer-events-none"
    style={{
      // Mask applied to the static container, so the center fade doesn't wobble
      // and the viewport edges are handled cleanly.
      maskImage:
        'radial-gradient(circle at center, transparent 0px, transparent 80px, black 200px)',
      WebkitMaskImage:
        'radial-gradient(circle at center, transparent 0px, transparent 80px, black 200px)',
    }}
  >
    {/* 1. Conic Gradient for rays.
        2. Massive size (400vmax) to ensuring corners never peek into the viewport.
        3. `will-change-transform` for performance.
     */}
    <div
      className={cn(
        'animate-[spin_60s_linear_infinite] will-change-transform flex-none',
        colorClass
      )}
      style={{
        width: '250vmax',
        height: '250vmax',
        background:
          'repeating-conic-gradient(from 0deg, transparent 0deg 15deg, currentColor 15deg 30deg)',
      }}
    />
  </div>
);

export default function SkinCaseOpening({
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

    // Removed triggerConfetti call here
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

  const shakeVariants: Variants = {
    idle: { rotate: 0, scale: 1 },
    shaking: {
      rotate: [0, -5, 5, -10, 10, -5, 5, 0],
      scale: [1, 1.1, 1.1, 1.2, 1.2, 1.1, 1],
      transition: { duration: 1.5, ease: 'easeInOut' },
    },
    revealed: { scale: 0, opacity: 0 },
  };

  const cardVariants: Variants = {
    hidden: { opacity: 0, scale: 0.5, rotateY: 90 },
    visible: {
      opacity: 1,
      scale: 1,
      rotateY: 0,
      transition: {
        type: 'spring',
        stiffness: 260,
        damping: 20,
        delay: 0.1,
      },
    },
  };

  if (!prize) return null;
  const config = RARITY_CONFIG[prize.rarity];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden">
      {/* Background Backdrop - Reduced blur for performance */}
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
      {phase === 'revealed' && (
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
            <motion.div
              key="gift"
              className="flex flex-col items-center cursor-pointer"
              onClick={handleOpen}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{
                scale: 1.5,
                opacity: 0,
                filter: 'blur(20px)',
                transition: { duration: 0.5 },
              }}
            >
              <motion.div
                variants={shakeVariants}
                animate={phase}
                className="relative w-72 h-72 md:w-96 md:h-96"
              >
                <div className="absolute inset-10 bg-amber-400/30 blur-[60px] rounded-full animate-pulse" />
                <GiftRive />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0, transition: { delay: 0.3 } }}
                className="mt-4 space-y-2 text-center"
              >
                <h2 className="text-4xl font-black text-white uppercase tracking-widest drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]">
                  {phase === 'shaking' ? 'Unwrapping...' : 'Mystery Gift'}
                </h2>
                <p className="text-lg font-bold tracking-wide text-slate-300">
                  {phase === 'shaking'
                    ? 'Something cool is inside!'
                    : 'Tap to Reveal'}
                </p>
              </motion.div>
            </motion.div>
          )}

          {/* --- REVEAL PHASE --- */}
          {phase === 'revealed' && (
            <motion.div
              key="card"
              className="flex flex-col items-center w-full"
              variants={cardVariants}
              initial="hidden"
              animate="visible"
            >
              {/* 3D Card Container */}
              <div
                className={cn(
                  'relative flex flex-col items-center p-1 rounded-[32px] bg-gradient-to-br shadow-2xl transition-all duration-500',
                  config.border,
                  config.glow
                )}
                style={{
                  transformStyle: 'preserve-3d',
                  perspective: '1000px',
                }}
              >
                {/* Inner Card Card */}
                <div
                  className={cn(
                    'relative flex flex-col w-[280px] h-[380px] md:w-[320px] md:h-[440px] rounded-[28px] overflow-hidden border-[4px]',
                    config.bg,
                    config.border
                  )}
                >
                  {/* Top Badge */}
                  <div
                    className={cn(
                      'absolute top-4 left-0 px-4 py-1.5 rounded-r-xl text-xs font-black uppercase tracking-widest shadow-sm z-20 border-y border-r',
                      config.bg,
                      config.text,
                      config.border
                    )}
                  >
                    {config.label}
                  </div>

                  {/* Main Frog Display */}
                  <div
                    className={cn(
                      'flex-1 m-3 rounded-[20px] relative overflow-hidden flex items-center justify-center',
                      'bg-gradient-to-b shadow-inner',
                      config.gradient
                    )}
                  >
                    {/* Background Pattern/Glow */}
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/40 to-transparent opacity-60" />

                    {/* Frog */}
                    <div className="relative z-10 flex items-end justify-center w-full h-full pb-4">
                      <Frog
                        className="w-[140%] h-[140%] object-contain translate-y-[5%]"
                        indices={{
                          skin: prize.slot === 'skin' ? prize.riveIndex : 0,
                          hat: prize.slot === 'hat' ? prize.riveIndex : 0,
                          scarf: prize.slot === 'scarf' ? prize.riveIndex : 0,
                          hand_item:
                            prize.slot === 'hand_item' ? prize.riveIndex : 0,
                        }}
                        width={280}
                        height={280}
                      />
                    </div>
                  </div>

                  {/* Footer Info */}
                  <div className="flex flex-col items-center justify-center h-24 p-4 border-t bg-white/50 dark:bg-black/20 backdrop-blur-sm border-black/5 dark:border-white/5">
                    <h3 className="mb-1 text-2xl font-black leading-none text-center text-slate-800 dark:text-white">
                      {prize.name}
                    </h3>
                    <p className="text-sm font-bold tracking-wider uppercase text-slate-500 dark:text-slate-400">
                      {prize.slot.replace('_', ' ')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Claim Button */}
              <motion.button
                initial={{ opacity: 0, y: 40 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  transition: { delay: 0.5, type: 'spring' },
                }}
                onClick={handleClaim}
                disabled={claiming}
                className={cn(
                  'group relative mt-10 w-full max-w-[280px] py-4 rounded-2xl font-black text-lg shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] transition-all active:scale-95 flex items-center justify-center gap-3 overflow-hidden',
                  config.button
                )}
              >
                {/* Shimmer Effect */}
                <div className="absolute inset-0 z-10 -translate-x-full group-hover:animate-shine bg-gradient-to-r from-transparent via-white/30 to-transparent" />

                {claiming ? (
                  <>
                    <Loader2 className="relative z-20 w-5 h-5 animate-spin" />
                    <span className="relative z-20">Saving...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="relative z-20 w-5 h-5" />
                    <span className="relative z-20">Claim Reward</span>
                  </>
                )}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
