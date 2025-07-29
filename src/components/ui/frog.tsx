/* components/ui/Frog.tsx */
'use client';

import React, { forwardRef, useImperativeHandle, useRef } from 'react';
// ✅ Import the new CSS file
import './frog.css';

export interface FrogHandle {
  getMouthPoint: () => { x: number; y: number };
}

interface FrogProps {
  className?: string;
  mouthOpen?: boolean;
}

const Frog = React.memo(
  forwardRef<FrogHandle, FrogProps>(
    ({ className = '', mouthOpen = false }, ref) => {
      const imgRef = useRef<HTMLImageElement>(null);

      useImperativeHandle(ref, () => ({
        getMouthPoint: () => {
          const r = imgRef.current!.getBoundingClientRect();
          return { x: r.left + r.width / 1.95, y: r.top + r.height * 0.55 };
        },
      }));

      // Combine the passed className with our animation class
      const combinedClassName = `frog-bob-animation ${className}`.trim();

      return (
        <img
          ref={imgRef}
          src={mouthOpen ? '/frog-rtl-mouth.svg' : '/frog-rtl.svg'}
          width={200}
          height={140}
          alt="frog"
          // We still keep these styles for performance
          style={{
            display: 'block',
            transformOrigin: '50% 70%',
            willChange: 'transform',
          }}
          className={combinedClassName}
        />
      );
    }
  )
);

export default Frog;
