/* components/ui/fly.tsx */
'use client';

import React, { forwardRef } from 'react';
import { motion } from 'framer-motion';

/**
 * A little looping “fly” that wiggles around.
 * Forwarding its ref so the parent can measure its position.
 */
const Fly = forwardRef<HTMLImageElement, { onClick: () => void }>(
  ({ onClick }, ref) => (
    <motion.img
      ref={ref}
      src="/fly.svg" /* ← pulled from /public */
      width={24}
      height={24}
      alt="fly"
      style={{ cursor: 'pointer' }}
      initial={{ x: -5, y: 2 }}
      animate={{ x: [-5, 5, -5], y: [2, -2, 2] }}
      transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
      onClick={onClick}
    />
  )
);

export default Fly;
