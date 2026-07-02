'use client';

import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useRef,
  useImperativeHandle,
} from 'react';
import {
  useRive,
  Layout,
  Fit,
  Alignment,
} from '@rive-app/react-canvas-lite';
import { useRiveAsset } from '@/hooks/useRiveAsset';
import { useRiveVisibility } from '@/hooks/useRiveVisibility';
import { riveDevicePixelRatio } from '@/lib/riveLoader';

const FLY_LAYOUT = new Layout({ fit: Fit.Contain, alignment: Alignment.Center });

type FlyProps = {
  onClick?: (e: React.MouseEvent) => void;
  size?: number;
  className?: string;
  y?: number;
  x?: number;
  paused?: boolean;
  onLoad?: () => void;
  interactive?: boolean;
};

const Fly = memo(forwardRef<HTMLDivElement, FlyProps>(
  (
    {
      onClick,
      size = 30,
      className,
      x = 0,
      y = 0,
      paused = false,
      onLoad,
      interactive = true,
    },
    ref,
  ) => {
    const innerRef = useRef<HTMLDivElement>(null);
    useImperativeHandle(ref, () => innerRef.current!);

    const riveUrl = useRiveAsset('/fly_idle.riv');

    const { RiveComponent, rive } = useRive({
      src: riveUrl || undefined,
      animations: ['Wings', 'Body'],
      autoplay: true,
      autoBind: false,
      layout: FLY_LAYOUT,
      onLoad: () => {
        onLoad?.();
      },
    });

    useRiveVisibility(rive, innerRef, !paused, 'fly');

    useEffect(() => {
      if (!rive) return;
      const el = innerRef.current;
      if (!el) return;
      const resize = () =>
        rive.resizeDrawingSurfaceToCanvas(riveDevicePixelRatio());
      resize();
      const raf = requestAnimationFrame(resize);
      const observer = new ResizeObserver(() => resize());
      observer.observe(el);
      return () => {
        cancelAnimationFrame(raf);
        observer.disconnect();
      };
    }, [rive]);

    useEffect(() => {
      if (!rive) return;
      if (paused) {
        rive.pause();
      } else if (rive.isPaused) {
        rive.play();
      }
    }, [paused, rive]);

    const handleClick = useCallback(
      (e: React.MouseEvent) => {
        if (!interactive) return;
        onClick?.(e);
        rive?.play();
      },
      [interactive, onClick, rive]
    );

    return (
      <div
        ref={innerRef}
        onClick={handleClick}
        className={className}
        style={{
          width: size,
          height: size,
          display: 'inline-block',
          verticalAlign: 'middle',
          marginInlineStart: x,
          transform: y ? `translateY(${y}px)` : undefined,
          cursor: interactive ? 'pointer' : undefined,
          pointerEvents: interactive ? undefined : 'none',
          lineHeight: 0,
        }}
      >
        {riveUrl && <RiveComponent style={{ width: '100%', height: '100%' }} />}
      </div>
    );
  }
));

Fly.displayName = 'Fly';

export default Fly;
