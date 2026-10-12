import { cn } from '@/lib/utils';
import React from 'react';

export const RotatingRays = ({
  colorClass,
  masked = true,
  size = '150vmax',
}: {
  colorClass: string;
  masked?: boolean;
  size?: string;
}) => (
  <div
    className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden pointer-events-none"
    style={
      masked
        ? {
            maskImage:
              'radial-gradient(circle at center, transparent 0px, transparent 80px, black 200px)',
            WebkitMaskImage:
              'radial-gradient(circle at center, transparent 0px, transparent 80px, black 200px)',
          }
        : undefined
    }
  >
    <div
      className={cn(
        'animate-[spin_60s_linear_infinite] will-change-transform flex-none transition-colors',
        colorClass
      )}
      style={{
        width: size,
        height: size,
        transitionDuration: '500ms',
        background:
          'repeating-conic-gradient(from 0deg, transparent 0deg 15deg, currentColor 15deg 30deg)',
      }}
    />
  </div>
);
