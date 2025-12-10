'use client';

import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2 } from 'lucide-react';
import Frog from '@/components/ui/frog';
import { CATALOG, ItemDef, Rarity } from '@/lib/skins/catalog';
import confetti from 'canvas-confetti';

// Rarity Colors (Backgrounds for cards)
const RARITY_BG: Record<Rarity, string> = {
  common: 'bg-slate-200 dark:bg-slate-800',
  uncommon: 'bg-cyan-100 dark:bg-cyan-900',
  rare: 'bg-blue-100 dark:bg-blue-900',
  epic: 'bg-purple-100 dark:bg-purple-900',
  legendary: 'bg-yellow-100 dark:bg-yellow-900',
};

// Border colors for active states/highlights
const RARITY_BORDER: Record<Rarity, string> = {
  common: 'border-slate-400 dark:border-slate-600',
  uncommon: 'border-cyan-400 dark:border-cyan-600',
  rare: 'border-blue-400 dark:border-blue-500',
  epic: 'border-purple-400 dark:border-purple-500',
  legendary: 'border-yellow-400 dark:border-yellow-500',
};

const ITEM_WIDTH = 200; // Wider cards
const ITEM_GAP = 16;
const WINNER_INDEX = 40;
const TOTAL_ITEMS = 50;

export default function SkinCaseOpening({
  onClose,
  onWin,
}: {
  onClose: () => void;
  onWin?: (item: ItemDef) => void;
}) {
  const [items, setItems] = useState<ItemDef[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<ItemDef | null>(null);
  const [showWinnerModal, setShowWinnerModal] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [targetX, setTargetX] = useState(0);

  // Generate random items
  useEffect(() => {
    // Group catalog by rarity
    const itemsByRarity: Record<Rarity, ItemDef[]> = {
      common: [],
      uncommon: [],
      rare: [],
      epic: [],
      legendary: [],
    };
    CATALOG.forEach((item) => {
      if (itemsByRarity[item.rarity]) {
        itemsByRarity[item.rarity].push(item);
      }
    });

    // Weighted Random Helper
    const rollRarity = (weights: Record<Rarity, number>): Rarity => {
      const rand = Math.random();
      let cumulative = 0;
      for (const [rarity, weight] of Object.entries(weights)) {
        cumulative += weight;
        if (rand < cumulative) return rarity as Rarity;
      }
      return 'common'; // Fallback
    };

    const getRandomItem = (weights: Record<Rarity, number>) => {
      let rarity = rollRarity(weights);
      // Ensure we have items of this rarity, otherwise fallback to lower tier
      while (itemsByRarity[rarity].length === 0) {
        if (rarity === 'legendary') rarity = 'epic';
        else if (rarity === 'epic') rarity = 'rare';
        else if (rarity === 'rare') rarity = 'uncommon';
        else if (rarity === 'uncommon') rarity = 'common';
        else break; // Should not happen if common exists
      }
      
      const pool = itemsByRarity[rarity];
      return pool[Math.floor(Math.random() * pool.length)];
    };

    // Probabilities
    const WIN_WEIGHTS: Record<Rarity, number> = {
      common: 0.90,
      uncommon: 0.095,
      rare: 0.0049,
      epic: 0.0001,
      legendary: 0.000002,
    };

    const VISUAL_WEIGHTS: Record<Rarity, number> = {
      common: 0.50,
      uncommon: 0.30,
      rare: 0.15,
      epic: 0.04,
      legendary: 0.01,
    };

    const newItems = Array.from({ length: TOTAL_ITEMS }, (_, i) => {
      // The winner must use the strict win weights
      if (i === WINNER_INDEX) {
        return getRandomItem(WIN_WEIGHTS);
      }
      // Filler items use visual weights to look exciting
      return getRandomItem(VISUAL_WEIGHTS);
    });

    setItems(newItems);
  }, []);

  // Start spin
  const startSpin = () => {
    if (spinning || items.length === 0) return;
    
    // Calculate target immediately
    if (containerRef.current) {
      const containerW = containerRef.current.offsetWidth;
      // Center of the winning item index
      const winnerCenter = (WINNER_INDEX * (ITEM_WIDTH + ITEM_GAP)) + (ITEM_WIDTH / 2);
      
      // Add random offset (-40% to +40% of item width) to simulate analog landing
      const offset = (Math.random() * 0.8 - 0.4) * ITEM_WIDTH;
      
      // We want: (winnerCenter + offset) + x = 0 (relative to center, since pl-[50%] centers the start)
      // So: x = -1 * (winnerCenter + offset)
      const finalX = -1 * (winnerCenter + offset);
      
      setTargetX(finalX);
      setSpinning(true);
    }
  };

  const handleClaim = async () => {
    if (!winner || claiming) return;
    setClaiming(true);

    try {
      await fetch('/api/skins/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: winner.id }),
      });

      if (onWin) onWin(winner);
      onClose();
    } catch (err) {
      console.error('Failed to claim skin', err);
      onClose();
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] w-screen h-screen flex flex-col items-center justify-center bg-slate-950/95 backdrop-blur-xl">
      {/* Close Button */}
      {!spinning && !showWinnerModal && (
        <button
          onClick={onClose}
          className="absolute top-8 right-8 p-3 text-white/50 hover:text-white transition-colors rounded-full hover:bg-white/10"
        >
          <X className="w-8 h-8" />
        </button>
      )}

      {/* Header */}
      <div className="mb-12 text-center relative z-10">
        <h2 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white via-slate-200 to-slate-400 uppercase tracking-widest drop-shadow-2xl">
          Mystery Case
        </h2>
        <p className="text-slate-400 font-medium mt-3 text-lg tracking-wide">
          {spinning ? 'Good luck...' : 'Spin to unlock a new skin'}
        </p>
      </div>

      {/* Spinner Container */}
      <div className="relative w-full h-[320px] bg-slate-900/50 border-y border-white/10 shadow-2xl overflow-hidden flex items-center backdrop-blur-md">
        
        {/* Center Indicator (Cursor) */}
        <div className="absolute left-1/2 top-0 bottom-0 w-[2px] bg-yellow-400 z-30 -translate-x-1/2 shadow-[0_0_20px_rgba(250,204,21,0.6)]" />
        <div className="absolute left-1/2 top-[-1px] -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-yellow-400 rotate-45 z-30 shadow-lg" />
        <div className="absolute left-1/2 bottom-[-1px] -translate-x-1/2 translate-y-1/2 w-4 h-4 bg-yellow-400 rotate-45 z-30 shadow-lg" />

        {/* The Strip */}
        <div ref={containerRef} className="w-full h-full flex items-center relative perspective-[1000px]">
          <motion.div
            className="flex items-center absolute left-0 pl-[50%]"
            initial={{ x: 0 }}
            animate={{ x: spinning ? targetX : 0 }}
            transition={{
              type: 'tween', // Important: NO spring
              duration: 6.5,
              ease: [0.1, 0.9, 0.2, 1.0], // Custom cubic bezier: starts fast, slows down very smoothly
            }}
            onAnimationComplete={() => {
              if (spinning) {
                const winItem = items[WINNER_INDEX];
                setWinner(winItem);
                
                // Delay before showing modal to let user see where it stopped
                setTimeout(() => {
                  setShowWinnerModal(true);
                  confetti({
                    particleCount: 200,
                    spread: 90,
                    origin: { y: 0.6 },
                    zIndex: 10000,
                    colors: ['#fbbf24', '#f472b6', '#22d3ee', '#ffffff']
                  });
                }, 600);
              }
            }}
          >
            {items.map((item, i) => (
              <div
                key={i}
                className={`
                  relative shrink-0 flex flex-col rounded-xl overflow-hidden
                  border-2 shadow-xl transition-transform
                  ${RARITY_BG[item.rarity]} ${RARITY_BORDER[item.rarity]}
                `}
                style={{
                  width: ITEM_WIDTH,
                  height: 240, // Taller card
                  marginRight: ITEM_GAP,
                }}
              >
                {/* Rarity Bar Top */}
                <div className={`h-2 w-full ${RARITY_STRIP_BG[item.rarity]}`} />

                {/* Frog Area */}
                <div className="flex-1 relative flex items-center justify-center -mt-4">
                    {/* Glow */}
                    <div className="absolute w-32 h-32 bg-white/30 blur-3xl rounded-full pointer-events-none" />
                    <Frog
                        width={180}
                        height={160}
                        indices={{
                          skin: item.slot === 'skin' ? item.riveIndex : 0,
                          hat: item.slot === 'hat' ? item.riveIndex : 0,
                          scarf: item.slot === 'scarf' ? item.riveIndex : 0,
                          hand_item: item.slot === 'hand_item' ? item.riveIndex : 0,
                        }}
                    />
                </div>
                
                {/* Info Area (Bottom) */}
                <div className="relative z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm p-3 border-t border-black/5 dark:border-white/5">
                    <div className={`text-[10px] font-black uppercase tracking-widest mb-0.5 ${RARITY_TEXT_COLOR[item.rarity]}`}>
                        {item.rarity}
                    </div>
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                        {item.name}
                    </div>
                </div>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Side Gradients for Focus */}
        <div className="absolute inset-y-0 left-0 w-32 md:w-64 bg-gradient-to-r from-slate-950 to-transparent z-20 pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-32 md:w-64 bg-gradient-to-l from-slate-950 to-transparent z-20 pointer-events-none" />
      </div>

      {/* Spin Button */}
      {!spinning && !showWinnerModal && (
        <div className="mt-16">
            <button
                onClick={startSpin}
                className="group relative px-12 py-5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-black text-2xl uppercase tracking-widest rounded-2xl shadow-[0_0_40px_rgba(34,197,94,0.4)] hover:shadow-[0_0_60px_rgba(34,197,94,0.6)] hover:-translate-y-1 transition-all active:scale-95"
            >
                <span className="relative z-10">Spin Case</span>
                <div className="absolute inset-0 rounded-2xl ring-2 ring-white/20 group-hover:ring-white/40" />
            </button>
        </div>
      )}

      {/* Winner Modal */}
      <AnimatePresence>
        {showWinnerModal && winner && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[10000] flex items-center justify-center bg-slate-950/80 backdrop-blur-xl"
          >
            <motion.div
               initial={{ scale: 0.8, y: 50 }}
               animate={{ scale: 1, y: 0 }}
               exit={{ scale: 0.8, y: 50 }}
               className="relative w-full max-w-lg mx-4"
            >
                {/* Card Container */}
                <div className="relative rounded-[32px] overflow-hidden border border-white/20 shadow-2xl bg-slate-900">
                    {/* Background Rarity Glow */}
                    <div className={`absolute inset-0 opacity-20 ${RARITY_BG[winner.rarity]}`} />
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-900/50 to-slate-900" />

                    <div className="relative p-8 md:p-10 flex flex-col items-center text-center">
                        <motion.div 
                          initial={{ opacity: 0, y: -20 }}
                          animate={{ opacity: 1, y: 0 }}
                          delay={0.3}
                          className="text-sm font-bold text-white/50 uppercase tracking-[0.2em] mb-4"
                        >
                            New Item Unlocked
                        </motion.div>

                        <motion.h2 
                          initial={{ scale: 0.9, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          delay={0.4}
                          className={`text-4xl md:text-5xl font-black mb-8 ${RARITY_TEXT_COLOR[winner.rarity]} uppercase drop-shadow-xl`}
                        >
                            {winner.name}
                        </motion.h2>

                        <div className="relative w-72 h-72 mb-10">
                            {/* Central Glow */}
                             <div className={`absolute inset-0 blur-[60px] opacity-40 rounded-full ${RARITY_BG[winner.rarity]}`} />
                             <div className="relative z-10 scale-125">
                                <Frog
                                    width={288}
                                    height={288}
                                    // Always play on winner too
                                    indices={{
                                      skin: winner.slot === 'skin' ? winner.riveIndex : 0,
                                      hat: winner.slot === 'hat' ? winner.riveIndex : 0,
                                      scarf: winner.slot === 'scarf' ? winner.riveIndex : 0,
                                      hand_item: winner.slot === 'hand_item' ? winner.riveIndex : 0,
                                    }}
                                />
                             </div>
                        </div>

                        <div className="w-full grid gap-4">
                            <button
                                onClick={handleClaim}
                                disabled={claiming}
                                className={`
                                  w-full py-4 rounded-xl font-bold text-lg text-white shadow-lg uppercase tracking-wider
                                  flex items-center justify-center gap-3 transition-all
                                  ${claiming ? 'bg-slate-700 cursor-not-allowed' : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 hover:shadow-violet-500/25'}
                                `}
                            >
                                {claiming && <Loader2 className="w-5 h-5 animate-spin" />}
                                {claiming ? 'Equipping...' : 'Add to Inventory'}
                            </button>
                        </div>
                    </div>
                </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const RARITY_STRIP_BG: Record<Rarity, string> = {
  common: 'bg-slate-400',
  uncommon: 'bg-cyan-400',
  rare: 'bg-blue-500',
  epic: 'bg-purple-500',
  legendary: 'bg-yellow-400',
};

const RARITY_TEXT_COLOR: Record<Rarity, string> = {
  common: 'text-slate-400 dark:text-slate-300',
  uncommon: 'text-cyan-600 dark:text-cyan-400',
  rare: 'text-blue-600 dark:text-blue-400',
  epic: 'text-purple-600 dark:text-purple-400',
  legendary: 'text-yellow-600 dark:text-yellow-400',
};
