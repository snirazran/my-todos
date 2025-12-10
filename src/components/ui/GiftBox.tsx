'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useRive, Layout, Fit, Alignment } from '@rive-app/react-canvas';

export default function GiftBox({ onClick }: { onClick: () => void }) {
  const { RiveComponent } = useRive({
    src: '/idle_gift.riv',
    stateMachines: 'State Machine 1',
    autoplay: true,
    layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
  });

  return (
    <motion.div
      onClick={onClick}
      initial={{ scale: 0.8, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      whileTap={{ scale: 0.95 }}
      className="group relative cursor-pointer flex flex-col items-center justify-center p-6"
    >
      {/* The Rive Gift Box */}
      <div className="relative w-48 h-48 mt-[-50px]">
        <RiveComponent
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
      </div>

      {/* Label */}
      <div className="mt-6 text-center">
        <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-wider drop-shadow-sm">
          Reward Available!
        </h3>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          Click to unwrap
        </p>
      </div>
    </motion.div>
  );
}
