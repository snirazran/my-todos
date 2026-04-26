'use client';

import React, {
  forwardRef,
  useMemo,
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
  useViewModel,
  useViewModelInstance,
  useViewModelInstanceBoolean,
  useViewModelInstanceTrigger,
} from '@rive-app/react-canvas-lite';
import { useRiveAsset } from '@/hooks/useRiveAsset';
import { useRiveVisibility } from '@/hooks/useRiveVisibility';

const FLY_LAYOUT = new Layout({ fit: Fit.Contain, alignment: Alignment.Center });

type FlyProps = {
  onClick?: (e: React.MouseEvent) => void;
  size?: number;
  className?: string;
  y?: number;
  x?: number;
  paused?: boolean;
  onLoad?: () => void;
};

const Fly = forwardRef<HTMLDivElement, FlyProps>(
  ({ onClick, size = 30, className, x = 0, y = 0, paused = false, onLoad }, ref) => {
    const innerRef = useRef<HTMLDivElement>(null);
    useImperativeHandle(ref, () => innerRef.current!);

    const riveUrl = useRiveAsset('/fly_idle.riv');

    const riveOptions = useMemo(
      () => ({
        src: riveUrl || undefined,
        artboard: 'fly',
        animations: ['Wings', 'Body'],
        autoplay: true,
        autoBind: true,
        layout: FLY_LAYOUT,
        onLoad: () => {
          onLoad?.();
        },
      }),
      [onLoad, riveUrl]
    );

    const { RiveComponent, rive } = useRive(riveOptions);

    useRiveVisibility(rive, innerRef, !paused, 'fly');

    const viewModel = useViewModel(rive, { useDefault: true });
    const viewModelInstance = useViewModelInstance(viewModel, {
      useDefault: true,
      rive,
    });
    const pausedBinding = useViewModelInstanceBoolean(
      'paused',
      viewModelInstance,
    );
    const isPausedBinding = useViewModelInstanceBoolean(
      'isPaused',
      viewModelInstance,
    );
    const playBinding = useViewModelInstanceTrigger('play', viewModelInstance);

    useEffect(() => {
      if (!rive) return;
      const el = innerRef.current;
      if (!el) return;
      const resize = () => rive.resizeDrawingSurfaceToCanvas();
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
      if (pausedBinding.value !== null) pausedBinding.setValue(paused);
      if (isPausedBinding.value !== null) isPausedBinding.setValue(paused);
      if (paused) {
        rive.pause();
      } else if (rive.isPaused) {
        rive.play();
      }
    }, [isPausedBinding, paused, pausedBinding, rive]);

    const handleClick = useCallback(
      (e: React.MouseEvent) => {
        onClick?.(e);
        playBinding.trigger();
        rive?.play();
      },
      [onClick, playBinding, rive]
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
          cursor: 'pointer',
          lineHeight: 0,
        }}
      >
        {riveUrl && <RiveComponent style={{ width: '100%', height: '100%' }} />}
      </div>
    );
  }
);

export default Fly;
