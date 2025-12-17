import React, { useState, useEffect } from 'react';
import { motion, Variants } from 'framer-motion';
import {
  useRive,
  useStateMachineInput,
  Layout,
  Fit,
  Alignment,
} from '@rive-app/react-canvas';
import { cn } from '@/lib/utils';

// Define layout outside component to maintain reference stability
const RIVE_LAYOUT = new Layout({
  fit: Fit.Contain,
  alignment: Alignment.Center,
});

// --- FIXED: Removed all delay logic, just simple rendering ---
export const GiftRive = React.memo(
  ({
    width,
    height,
    className,
    triggerOpen,
  }: {
    width?: number;
    height?: number;
    className?: string;
    triggerOpen?: boolean;
  }) => {
    const { rive, RiveComponent } = useRive({
      src: '/idle_gift.riv',
      stateMachines: 'State Machine 1',
      autoplay: true,
      layout: RIVE_LAYOUT,
    });

    const startOpenInput = useStateMachineInput(
      rive,
      'State Machine 1',
      'start_box_open'
    );

    useEffect(() => {
      if (triggerOpen && startOpenInput) {
        // Delay the Rive animation to let the CSS/Framer shake finish (1.5s)
        const timer = setTimeout(() => {
          startOpenInput.fire();
        }, 500);
        return () => clearTimeout(timer);
      }
    }, [triggerOpen, startOpenInput]);

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
  }
);

// Display name for debugging
GiftRive.displayName = 'GiftRive';

type GiftBoxProps = {
  phase: 'idle' | 'shaking' | 'revealed';
  onOpen: () => void;
  loadingText?: string;
};

export const GiftBox = ({ phase, onOpen, loadingText }: GiftBoxProps) => {
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
        animate={phase}
        className="relative w-[450px] h-[450px] md:w-[500px] md:h-[500px]"
      >
        <GiftRive triggerOpen={phase === 'shaking'} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0, transition: { delay: 0.3 } }}
        className="mt-4 space-y-2 text-center"
      >
        <h2 className="text-4xl font-black tracking-widest text-white uppercase">
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
