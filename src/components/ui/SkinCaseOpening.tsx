'use client';

import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Sparkles } from 'lucide-react';
import Frog from '@/components/ui/frog';
import { CATALOG, ItemDef, Rarity } from '@/lib/skins/catalog';
import confetti from 'canvas-confetti';
import { cn } from '@/lib/utils';
import { useRive, Layout, Fit, Alignment } from '@rive-app/react-canvas';

// --- Configuration ---
const TOTAL_ITEMS = 60; // Keep for weighting logic if needed, or simplify

// --- Rarity Visuals (High Fidelity) ---
const RARITY_STYLES: Record<Rarity, {
    border: string;
    bg: string;
    text: string;
    strip: string;
    shadow: string;
    glow: string;
}> = {
  common: {
    border: 'border-slate-300 dark:border-slate-600',
    bg: 'bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900',
    text: 'text-slate-600 dark:text-slate-400',
    strip: 'bg-slate-400',
    shadow: 'shadow-slate-500/20',
    glow: 'shadow-[0_0_30px_-5px_rgba(148,163,184,0.3)]'
  },
  uncommon: {
    border: 'border-emerald-400',
    bg: 'bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950/40 dark:to-emerald-900/40',
    text: 'text-emerald-700 dark:text-emerald-400',
    strip: 'bg-emerald-500',
    shadow: 'shadow-emerald-500/30',
    glow: 'shadow-[0_0_30px_-5px_rgba(16,185,129,0.4)]'
  },
  rare: {
    border: 'border-sky-400',
    bg: 'bg-gradient-to-br from-sky-50 to-sky-100 dark:from-sky-950/40 dark:to-sky-900/40',
    text: 'text-sky-700 dark:text-sky-400',
    strip: 'bg-sky-500',
    shadow: 'shadow-sky-500/30',
    glow: 'shadow-[0_0_40px_-5px_rgba(14,165,233,0.5)]'
  },
  epic: {
    border: 'border-violet-400',
    bg: 'bg-gradient-to-br from-violet-50 to-violet-100 dark:from-violet-950/40 dark:to-violet-900/40',
    text: 'text-violet-700 dark:text-violet-400',
    strip: 'bg-violet-500',
    shadow: 'shadow-violet-500/40',
    glow: 'shadow-[0_0_50px_-5px_rgba(139,92,246,0.6)]'
  },
  legendary: {
    border: 'border-amber-400',
    bg: 'bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950/40 dark:to-amber-900/40',
    text: 'text-amber-700 dark:text-amber-400',
    strip: 'bg-amber-500',
    shadow: 'shadow-amber-500/50',
    glow: 'shadow-[0_0_60px_-5px_rgba(245,158,11,0.7)]'
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

const getRandomItem = (weights: Record<Rarity, number>, catalog: Record<Rarity, ItemDef[]>): ItemDef => {
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

// --- Rive Gift Component ---
const GiftRive = () => {
    const { RiveComponent } = useRive({
        src: '/idle_gift.riv',
        stateMachines: 'State Machine 1',
        autoplay: true,
        layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
    });
    return <RiveComponent className="w-full h-full" />;
};


export default function SkinCaseOpening({
  onClose,
  onWin,
}: {
  onClose: () => void;
  onWin?: (item: ItemDef) => void;
}) {
  // --- State ---
  const [phase, setPhase] = useState<'idle' | 'shaking' | 'revealed'>('idle');
  const [prize, setPrize] = useState<ItemDef | null>(null);
  const [claiming, setClaiming] = useState(false);
  
  // --- Initialization ---
  useEffect(() => {
    // Determine prize immediately but don't show it
    const catalogByRarity: Record<Rarity, ItemDef[]> = {
      common: [], uncommon: [], rare: [], epic: [], legendary: []
    };
    CATALOG.forEach(item => {
        if(catalogByRarity[item.rarity]) catalogByRarity[item.rarity].push(item);
    });

    const WIN_WEIGHTS: Record<Rarity, number> = {
      common: 0.60, uncommon: 0.25, rare: 0.10, epic: 0.04, legendary: 0.01
    };
    
    setPrize(getRandomItem(WIN_WEIGHTS, catalogByRarity));
  }, []);

  const handleOpen = () => {
      if (phase !== 'idle' || !prize) return;
      setPhase('shaking');

      // Play shake animation (managed by CSS/Framer), then explode
      setTimeout(() => {
          setPhase('revealed');
          triggerConfetti(prize.rarity);
      }, 1500);
  };

  const triggerConfetti = (rarity: Rarity) => {
      const colors = {
          common: ['#94a3b8', '#cbd5e1'],
          uncommon: ['#34d399', '#10b981'],
          rare: ['#38bdf8', '#0ea5e9'],
          epic: ['#a78bfa', '#8b5cf6'],
          legendary: ['#fbbf24', '#f59e0b']
      };

      const duration = 3000;
      const end = Date.now() + duration;

      (function frame() {
        confetti({
            particleCount: 5,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            colors: colors[rarity]
        });
        confetti({
            particleCount: 5,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            colors: colors[rarity]
        });

        if (Date.now() < end) {
            requestAnimationFrame(frame);
        }
      }());
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
      console.error('Failed to claim skin', err);
      // Optional: Show error state
      onClose();
    } finally {
      setClaiming(false);
    }
  };

  // Shake variants
  const shakeVariants = {
      idle: { rotate: 0, scale: 1 },
      shaking: {
          rotate: [0, -5, 5, -10, 10, -5, 5, 0],
          scale: [1, 1.1, 1.1, 1.2, 1.2, 1.1, 1],
          transition: { duration: 1.5, ease: [0.42, 0, 0.58, 1] }
      },
      revealed: { scale: 0, opacity: 0 }
  };

  const backdropVariants = {
      hidden: { opacity: 0 },
      visible: { opacity: 1 }
  };

  const cardVariants = {
      hidden: { opacity: 0, y: 50, scale: 0.8 },
      visible: { 
          opacity: 1, 
          y: 0, 
          scale: 1,
          transition: { 
              type: "spring",
              stiffness: 300,
              damping: 20,
              delay: 0.2 
          }
      }
  };

  if (!prize) return null; // Or loading state

  const style = RARITY_STYLES[prize.rarity];

  return (
    <motion.div 
        variants={backdropVariants}
        initial="hidden"
        animate="visible"
        exit="hidden"
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/90 backdrop-blur-xl p-4"
    >
        {/* Close Button (Only in revealed state to prevent accidental closing during suspense) */}
        {phase === 'revealed' && (
            <button 
                onClick={onClose}
                className="absolute top-6 right-6 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
                <X className="w-6 h-6" />
            </button>
        )}

        {/* --- Phase 1: The Gift --- */}
        <AnimatePresence mode="wait">
            {phase !== 'revealed' && (
                <motion.div 
                    key="gift-container"
                    className="flex flex-col items-center justify-center w-full max-w-md cursor-pointer"
                    onClick={handleOpen}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 1.5, opacity: 0, filter: 'blur(10px)' }}
                >
                    <motion.div
                        variants={shakeVariants}
                        animate={phase}
                        className="w-64 h-64 md:w-80 md:h-80 relative"
                    >
                         {/* Glow behind gift */}
                         <div className="absolute inset-0 bg-amber-400/20 blur-[60px] rounded-full animate-pulse" />
                         <GiftRive />
                    </motion.div>

                    <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0, transition: { delay: 0.5 } }}
                        className="text-center mt-8 space-y-2"
                    >
                        <h2 className="text-3xl md:text-4xl font-black text-white uppercase tracking-widest drop-shadow-lg">
                            {phase === 'shaking' ? 'Opening...' : 'Mystery Gift'}
                        </h2>
                        <p className="text-slate-300 font-medium text-lg">
                            {phase === 'shaking' ? 'Good luck!' : 'Tap to open your reward'}
                        </p>
                    </motion.div>
                </motion.div>
            )}

            {/* --- Phase 2: The Reveal --- */}
            {phase === 'revealed' && (
                <motion.div 
                    key="reveal-container"
                    className="relative w-full max-w-lg"
                    variants={cardVariants}
                    initial="hidden"
                    animate="visible"
                >
                    {/* Main Card */}
                    <div className={cn(
                        "relative bg-white dark:bg-slate-900 rounded-[32px] overflow-hidden shadow-2xl border-2",
                        style.border,
                        style.glow
                    )}>
                        
                        {/* Header / Background Glow */}
                        <div className={cn("absolute top-0 left-0 right-0 h-48 opacity-20 z-0", style.bg)} />
                        <div className={cn("absolute top-0 inset-x-0 h-2", style.strip)} />

                        {/* Content */}
                        <div className="relative z-10 flex flex-col items-center p-8 pt-12">
                            
                            {/* Rarity Badge */}
                            <motion.div 
                                initial={{ scale: 0, rotate: -10 }}
                                animate={{ scale: 1, rotate: 0 }}
                                className={cn(
                                    "px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-[0.2em] shadow-sm mb-6 border bg-white dark:bg-slate-950",
                                    style.border,
                                    style.text
                                )}
                            >
                                {prize.rarity}
                            </motion.div>

                            {/* Frog Preview - Wearing the item */}
                            <div className="w-56 h-56 md:w-64 md:h-64 mb-6 relative group">
                                <div className={cn("absolute inset-4 rounded-full blur-2xl opacity-40 group-hover:opacity-60 transition-opacity", style.bg)} />
                                <Frog 
                                    width={256} height={256}
                                    indices={{
                                        skin: prize.slot === 'skin' ? prize.riveIndex : 0,
                                        hat: prize.slot === 'hat' ? prize.riveIndex : 0,
                                        scarf: prize.slot === 'scarf' ? prize.riveIndex : 0,
                                        hand_item: prize.slot === 'hand_item' ? prize.riveIndex : 0,
                                    }}
                                />
                            </div>

                            {/* Text Info */}
                            <h3 className="text-3xl font-black text-slate-900 dark:text-white text-center mb-2">
                                {prize.name}
                            </h3>
                            <p className="text-slate-500 dark:text-slate-400 text-center mb-8 max-w-[80%]">
                                You found a new {prize.slot.replace('_', ' ')}!
                            </p>

                            {/* Actions */}
                            <button
                                onClick={handleClaim}
                                disabled={claiming}
                                className={cn(
                                    "w-full py-4 rounded-2xl font-bold text-lg text-white shadow-lg hover:shadow-xl hover:-translate-y-1 active:scale-95 transition-all flex items-center justify-center gap-2",
                                    style.strip
                                )}
                            >
                                {claiming ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-5 h-5" />
                                        Claim Reward
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    </motion.div>
  );
}
