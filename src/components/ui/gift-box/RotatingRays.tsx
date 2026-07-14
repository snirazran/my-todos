import { cn } from '@/lib/utils';
import React from 'react';

export const RotatingRays = ({ colorClass }: { colorClass: string }) => (
  <div
    className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden pointer-events-none"
    style={{
      maskImage:
        'radial-gradient(circle at center, transparent 0px, transparent 80px, black 200px)',
      WebkitMaskImage:
        'radial-gradient(circle at center, transparent 0px, transparent 80px, black 200px)',
    }}
  >
    <div
      className={cn(
        'animate-[spin_60s_linear_infinite] will-change-transform flex-none transition-colors',
        colorClass
      )}
      style={{
        width: '150vmax',
        height: '150vmax',
        transitionDuration: '500ms',
        background:
          'repeating-conic-gradient(from 0deg, transparent 0deg 15deg, currentColor 15deg 30deg)',
      }}
    />
  </div>
);
