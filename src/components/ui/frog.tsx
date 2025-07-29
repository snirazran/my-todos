/* components/ui/Frog.tsx */
'use client';

import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { motion, Variants } from 'framer-motion';

export interface FrogHandle {
  getMouthPoint: () => { x: number; y: number };
}

interface FrogProps {
  className?: string;
  /** show the open‑mouth SVG while the tongue is out */
  mouthOpen?: boolean;
}

/* subtle idle motion */
const breathe: Variants = {
  idle: {
    y: [0, -2, 0, 1, 0],
    transition: { duration: 4, ease: 'easeInOut', repeat: Infinity },
  },
};

const Frog = forwardRef<FrogHandle, FrogProps>(
  ({ className = '', mouthOpen = false }, ref) => {
    const imgRef = useRef<HTMLImageElement>(null);

    /* expose mouth centre */
    useImperativeHandle(ref, () => ({
      getMouthPoint: () => {
        const r = imgRef.current!.getBoundingClientRect();
        return { x: r.left + r.width / 1.95, y: r.top + r.height * 0.55 };
      },
    }));

    return (
      <motion.img
        ref={imgRef}
        src={mouthOpen ? '/frog-rtl-mouth.svg' : '/frog-rtl.svg'}
        width={200}
        height={140}
        alt="frog"
        initial="idle"
        animate="idle"
        variants={breathe}
        style={{
          display: 'block',
          transform: 'scaleX(-1)',
          transformOrigin: '50% 70%',
        }}
        className={className}
      />
    );
  }
);

export default Frog;
