'use client';

import React, { forwardRef, useMemo, useCallback, useEffect } from 'react';
import { useRive, Layout, Fit, Alignment } from '@rive-app/react-canvas';

type FlyProps = {
  onClick?: (e: React.MouseEvent) => void;
  size?: number;
  className?: string;
  y?: number;
  x?: number;
  paused?: boolean;
};

const Fly = forwardRef<HTMLDivElement, FlyProps>(
  ({ onClick, size = 30, className, x = 0, y = 0, paused = false }, ref) => {
    // 1) Memoize options so Rive isn't re-created on parent re-renders
    const riveOptions = useMemo(
      () => ({
        src: '/fly_idle.riv',
        artboard: 'fly',
        // If it's a single animation named "Wings and Body", replace the array with that string.
        animations: ['Wings', 'Body'],
        autoplay: true,
        layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
      }),
      []
    );

    const { RiveComponent, rive } = useRive(riveOptions);

    // 2) Control play/pause based on prop
    useEffect(() => {
      if (!rive) return;
      if (paused) {
        rive.pause();
      } else if (rive.isPaused) {
        rive.play();
      }
    }, [rive, paused]);

    // 3) On click, run parent handler and re-assert play (belt & suspenders)
    const handleClick = useCallback(
      (e: React.MouseEvent) => {
        onClick?.(e);
        rive?.play();
      },
      [onClick, rive]
    );

    return (
      <div
        ref={ref}
        onClick={handleClick}
        className={className}
        style={{
          width: size,
          height: size,
          display: 'inline-block',
          verticalAlign: 'middle',
          marginInlineStart: x,
          transform: y ? `translateY(${y}px)` : undefined, // <- fine-tune
          cursor: 'pointer',
          lineHeight: 0,
        }}
      >
        <RiveComponent style={{ width: '100%', height: '100%' }} />
      </div>
    );
  }
);

export default Fly;
