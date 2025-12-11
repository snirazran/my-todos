import React from 'react';
import { motion, Variants } from 'framer-motion';
import { Loader2, Sparkles } from 'lucide-react';
import Frog from '@/components/ui/frog';
import { ItemDef } from '@/lib/skins/catalog';
import { cn } from '@/lib/utils';
import { RARITY_CONFIG } from './constants';

type RewardCardProps = {
  prize: ItemDef;
  claiming: boolean;
  onClaim: () => void;
};

export const RewardCard = ({ prize, claiming, onClaim }: RewardCardProps) => {
  const config = RARITY_CONFIG[prize.rarity];

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

  return (
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

              <div className="relative z-10 flex items-end justify-center w-full h-full">
                <Frog
                  className="w-[125%] h-[125%] object-contain translate-y-[5%] md:translate-y-0"
                  indices={{
                    skin: prize.slot === 'skin' ? prize.riveIndex : 0,
                    hat: prize.slot === 'hat' ? prize.riveIndex : 0,
                    scarf: prize.slot === 'scarf' ? prize.riveIndex : 0,
                    hand_item: prize.slot === 'hand_item' ? prize.riveIndex : 0,
                  }}
                  width={250}
                  height={250}
                />
              </div>
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
        onClick={onClaim}
        disabled={claiming}
        className={cn(
          'group relative mt-10 w-full max-w-[280px] py-4 rounded-2xl font-black text-lg shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] transition-all active:scale-95 flex items-center justify-center gap-3 overflow-hidden',
          config.button
        )}
      >
        <div className="absolute inset-0 z-10 -translate-x-full group-hover:animate-shine bg-gradient-to-r from-transparent via-white/30 to-transparent" />

        {claiming ? (
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
