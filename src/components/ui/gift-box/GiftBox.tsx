import React, { useState } from 'react';
import { motion, Variants } from 'framer-motion';
import { useRive, Layout, Fit, Alignment } from '@rive-app/react-canvas';
import { cn } from '@/lib/utils';

// Define layout outside component to maintain reference stability
const RIVE_LAYOUT = new Layout({ fit: Fit.Contain, alignment: Alignment.Center });

// --- FIXED: Removed all delay logic, just simple rendering ---
export const GiftRive = React.memo(({
  width,
  height,
  className,
}: {
  width?: number;
  height?: number;
  className?: string;
}) => {
  const { RiveComponent } = useRive({
    src: '/idle_gift.riv',
    stateMachines: 'State Machine 1',
    autoplay: true,
    layout: RIVE_LAYOUT,
  });

  return (
    <div
      className={className}
      style={{
        width: width ?? '100%',
        height: height ?? '100%',
        display: 'block', // Ensures no inline alignment issues
      }}
    >
      <RiveComponent
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
});

// Display name for debugging
GiftRive.displayName = 'GiftRive';

type GiftBoxProps = {
  phase: 'idle' | 'shaking' | 'revealed';
  onOpen: () => void;
  loadingText?: string;
};

export const GiftBox = ({ phase, onOpen, loadingText }: GiftBoxProps) => {
  const shakeVariants: Variants = {
    idle: { rotate: 0, scale: 1 },
    shaking: {
      rotate: [0, -5, 5, -10, 10, -5, 5, 0],
      scale: [1, 1.1, 1.1, 1.2, 1.2, 1.1, 1],
      transition: { duration: 1.5, ease: 'easeInOut' },
    },
    revealed: { scale: 0, opacity: 0 },
  };

  return (
    <motion.div
      key="gift"
      className="flex flex-col items-center cursor-pointer"
      onClick={onOpen}
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
          {phase === 'shaking' ? 'UNWRAPPING...' : 'TAP TO UNWRAP'}
        </h2>
        {phase === 'idle' && (
          <p className="text-lg font-bold tracking-wide text-slate-300">
            Mystery Gift
          </p>
        )}
        {phase === 'shaking' && (
          <p className="text-base font-bold text-slate-300 animate-pulse min-h-[1.5em]">
            {loadingText}
          </p>
        )}
      </motion.div>
    </motion.div>
  );
};
