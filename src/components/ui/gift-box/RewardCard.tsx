import React, { useState } from 'react';
import { motion, Variants } from 'framer-motion';
import { Loader2, Sparkles } from 'lucide-react';
import Frog from '@/components/ui/frog';
import { ItemDef } from '@/lib/skins/catalog';
import { cn } from '@/lib/utils';
import { RARITY_CONFIG } from './constants';
import { GiftRive } from './GiftBox';

type RewardCardProps = {
  prize: ItemDef;
  claiming: boolean;
  onClaim: () => void;
};

const GLOW_COLORS = {
  common: 'bg-slate-400',
  uncommon: 'bg-emerald-400',
  rare: 'bg-sky-400',
  epic: 'bg-violet-400',
  legendary: 'bg-amber-400',
};

export const RewardCard = ({ prize, claiming, onClaim }: RewardCardProps) => {
  const [showContent, setShowContent] = useState(false);
  const [localClaiming, setLocalClaiming] = useState(false);
  const config = RARITY_CONFIG[prize.rarity];
  const glowColor = GLOW_COLORS[prize.rarity];

  const handleClaimClick = () => {
    setLocalClaiming(true);
    // Simulate a small delay for the claiming process so the user sees the "Claiming..." state
    // and the popup stays open for a moment with the content visible.
    setTimeout(() => {
      onClaim();
    }, 200);
  };

  const cardVariants: Variants = {
    hidden: { opacity: 0, scale: 0.5, rotateY: 90 },
    visible: {
      opacity: 1,
      scale: 1,
      rotateY: 0,
      transition: {
        // --- THE FIX ---
        // Instead of 'spring' (physics), we use a custom bezier curve.
        // This curve "pops" past 1 (overshoots) and settles, looking like a spring
        // but stable for the canvas.
        ease: [0.34, 1.56, 0.64, 1],
        duration: 0.6,
        delay: 0.1,
      },
    },
  };

  const isProcessing = claiming || localClaiming;

  return (
    <motion.div
      key="card"
      className="flex flex-col items-center w-full"
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      onAnimationComplete={() => setShowContent(true)}
    >
      {/* 3D Card Container */}
      <div
        className={cn(
          'relative flex flex-col items-center p-1 rounded-[32px] bg-gradient-to-br shadow-2xl transition-all duration-500',
          config.border,
          config.glow
        )}
      >
        <div
          className={cn(
            'relative flex flex-col w-[280px] md:w-[320px] h-auto rounded-[28px] overflow-hidden border-[4px]',
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
          <div className="flex items-center justify-center flex-1 w-full p-3 mt-4">
            <div
              className={cn(
                'w-full aspect-[1.1/1] md:aspect-[1.2/1] rounded-[20px] relative overflow-hidden flex items-center justify-center',
                'bg-gradient-to-b shadow-inner',
                config.gradient
              )}
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/40 to-transparent opacity-60" />

              {/* === LAYER 1: CINEMATIC EFFECTS (Centered) === */}
              <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                {/* 1. Rotating God Rays */}
                <motion.div
                  key="rays"
                  animate={
                    showContent
                      ? { opacity: 0, scale: 2, rotate: 180 }
                      : { rotate: 360 }
                  }
                  transition={
                    showContent
                      ? { duration: 0.5, ease: 'easeIn' }
                      : { duration: 20, repeat: Infinity, ease: 'linear' }
                  }
                  className={cn(
                    'absolute w-[600px] h-[600px] opacity-40 mix-blend-plus-lighter',
                    // Mapping rarity to TEXT colors so 'currentColor' works in the gradient
                    {
                      'text-slate-400': prize.rarity === 'common',
                      'text-emerald-500': prize.rarity === 'uncommon',
                      'text-sky-500': prize.rarity === 'rare',
                      'text-violet-500': prize.rarity === 'epic',
                      'text-amber-500': prize.rarity === 'legendary',
                    }
                  )}
                  style={{
                    background:
                      'repeating-conic-gradient(from 0deg, transparent 0deg, transparent 15deg, currentColor 15deg, currentColor 20deg, transparent 20deg)',
                    maskImage:
                      'radial-gradient(circle, black 30%, transparent 70%)',
                    WebkitMaskImage:
                      'radial-gradient(circle, black 30%, transparent 70%)',
                  }}
                />

                {/* 2. Anamorphic Lens Flare */}
                <motion.div
                  key="flare-h"
                  animate={
                    showContent
                      ? { scaleX: 5, opacity: 0 }
                      : { scaleX: [1, 1.5, 1], opacity: [0.8, 1, 0.8] }
                  }
                  transition={
                    showContent
                      ? { duration: 0.3 }
                      : { duration: 3, repeat: Infinity, ease: 'easeInOut' }
                  }
                  className="absolute w-32 h-[2px] bg-white blur-[2px] shadow-[0_0_20px_10px_rgba(255,255,255,0.4)]"
                />

                {/* 3. Central Star */}
                <motion.div
                  key="star"
                  animate={
                    showContent
                      ? { scale: 5, opacity: 0 }
                      : { scale: [1, 1.2, 1], rotate: [0, 45, 0] }
                  }
                  transition={
                    showContent
                      ? { duration: 0.4 }
                      : { duration: 4, repeat: Infinity, ease: 'easeInOut' }
                  }
                  className="absolute w-8 h-8 bg-white rotate-45 blur-md shadow-[0_0_40px_rgba(255,255,255,0.8)]"
                />
              </div>

              {/* === LAYER 2: ACTUAL CONTENT (Bottom Aligned for Gift, Centered for Frog) === */}
              <div className="absolute inset-0 z-30 flex justify-center pointer-events-none">
                {showContent && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{
                      type: 'spring',
                      damping: 12,
                      stiffness: 200,
                      delay: 0.1,
                    }}
                    className={cn(
                      'relative w-full h-full flex justify-center',
                      prize.slot === 'container' ? 'items-end' : 'items-center'
                    )}
                  >
                    {prize.slot === 'container' ? (
                      <div className="h-[90%] w-auto aspect-[282/381] mb-2 drop-shadow-2xl">
                        <GiftRive className="w-full h-full" />
                      </div>
                    ) : (
                      <Frog
                        className="object-contain translate-y-2"
                        indices={{
                          skin: prize.slot === 'skin' ? prize.riveIndex : 0,
                          hat: prize.slot === 'hat' ? prize.riveIndex : 0,
                          scarf: prize.slot === 'scarf' ? prize.riveIndex : 0,
                          hand_item:
                            prize.slot === 'hand_item' ? prize.riveIndex : 0,
                        }}
                        width={300}
                        height={300}
                      />
                    )}
                  </motion.div>
                )}
              </div>
            </div>
          </div>

          {/* Footer Info */}
          <motion.div
            initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
            animate={
              showContent
                ? { opacity: 1, y: 0, filter: 'blur(0px)' }
                : { opacity: 0, y: 10, filter: 'blur(4px)' }
            }
            transition={{ duration: 0.5, delay: 0.2, ease: 'easeOut' }}
            className="flex flex-col items-center justify-center h-24 p-4 border-t bg-white/50 dark:bg-black/20 backdrop-blur-sm border-black/5 dark:border-white/5"
          >
            <h3 className="mb-1 text-2xl font-black leading-none text-center text-slate-800 dark:text-white">
              {prize.name}
            </h3>
            <p className="text-sm font-bold tracking-wider uppercase text-slate-500 dark:text-slate-400">
              {prize.slot.replace('_', ' ')}
            </p>
          </motion.div>
        </div>
      </div>

      {/* Claim Button - We can keep spring here as it doesn't contain Rive */}
      <motion.button
        initial="hidden"
        animate={showContent ? 'visible' : 'hidden'}
        variants={{
          hidden: { opacity: 0, y: 40 },
          visible: {
            opacity: 1,
            y: 0,
            transition: {
              delay: 0.2,
              ease: [0.34, 1.56, 0.64, 1],
              duration: 0.6,
            },
          },
        }}
        onClick={handleClaimClick}
        disabled={isProcessing}
        className={cn(
          'group relative mt-10 w-full max-w-[280px] py-4 rounded-2xl font-black text-lg shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] transition-all active:scale-95 flex items-center justify-center gap-3 overflow-hidden',
          config.button
        )}
      >
        <div className="absolute inset-0 z-10 -translate-x-full group-hover:animate-shine bg-gradient-to-r from-transparent via-white/30 to-transparent" />

        {isProcessing ? (
          <>
            <Loader2 className="relative z-20 w-5 h-5 animate-spin" />
            <span className="relative z-20">Claiming...</span>
          </>
        ) : (
          <>
            <Sparkles className="relative z-20 w-5 h-5" />
            <span className="relative z-20">Claim Reward</span>
          </>
        )}
      </motion.button>
    </motion.div>
  );
};
