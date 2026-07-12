'use client';

import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { attachFlyCanvas, type FlyCanvasHandle } from '@/lib/flyEngine';
import { riveDevicePixelRatio } from '@/lib/riveLoader';
import { useRiveStatsStore } from '@/lib/riveStatsStore';
import { useUIStore } from '@/lib/uiStore';

type FlyProps = {
  onClick?: (e: React.MouseEvent) => void;
  size?: number;
  className?: string;
  y?: number;
  x?: number;
  paused?: boolean;
  /** Keep animating while a sheet/scroll holds the global Rive pause (for flies rendered inside an open sheet). */
  alwaysPlay?: boolean;
  onLoad?: () => void;
  interactive?: boolean;
};

const Fly = memo(forwardRef<HTMLSpanElement, FlyProps>(
  (
    {
      onClick,
      size = 30,
      className,
      x = 0,
      y = 0,
      paused = false,
      alwaysPlay = false,
      onLoad,
      interactive = true,
    },
    ref,
  ) => {
    const innerRef = useRef<HTMLSpanElement>(null);
    useImperativeHandle(ref, () => innerRef.current!);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const handleRef = useRef<FlyCanvasHandle | null>(null);
    const onLoadRef = useRef(onLoad);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
      onLoadRef.current = onLoad;
    }, [onLoad]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const handle = attachFlyCanvas(canvas, {
        ignoreInteractionPause: alwaysPlay,
      });
      handleRef.current = handle;
      onLoadRef.current?.();
      return () => {
        handle?.detach();
        handleRef.current = null;
      };
    }, [alwaysPlay]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const applySize = () => {
        const px = Math.max(1, Math.round(size * riveDevicePixelRatio()));
        if (canvas.width !== px || canvas.height !== px) {
          canvas.width = px;
          canvas.height = px;
          handleRef.current?.redraw();
        }
      };
      applySize();
      let mql: MediaQueryList | null = null;
      const onDprChange = () => {
        applySize();
        watchDpr();
      };
      const watchDpr = () => {
        mql?.removeEventListener('change', onDprChange);
        mql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
        mql.addEventListener('change', onDprChange);
      };
      watchDpr();
      return () => mql?.removeEventListener('change', onDprChange);
    }, [size]);

    useEffect(() => {
      const el = innerRef.current;
      if (!el) return;
      const observer = new IntersectionObserver(
        (observed) => {
          for (const entry of observed) {
            const nowVisible =
              entry.isIntersecting && entry.intersectionRatio >= 0.1;
            setVisible(nowVisible);
            // Repaint immediately on entering the viewport: the browser can
            // evict offscreen canvas bitmaps, and the shared engine won't push
            // a frame until playback resumes after the scroll settles — this
            // blits the latest master frame synchronously so the fly is never
            // blank mid-scroll.
            if (nowVisible) handleRef.current?.redraw();
          }
        },
        { threshold: [0, 0.1] },
      );
      observer.observe(el);
      return () => observer.disconnect();
    }, []);

    const playing = visible && !paused;
    useEffect(() => {
      handleRef.current?.setPlaying(playing);
    }, [playing]);

    const instanceId = useId();
    const fullId = `fly-${instanceId}`;
    const isDebugMode = useUIStore((s) => s.isDebugMode);
    const registerInstance = useRiveStatsStore((s) => s.registerInstance);
    const unregisterInstance = useRiveStatsStore((s) => s.unregisterInstance);
    const updateInstance = useRiveStatsStore((s) => s.updateInstance);

    useEffect(() => {
      if (!isDebugMode) return;
      registerInstance(fullId);
      return () => unregisterInstance(fullId);
    }, [isDebugMode, fullId, registerInstance, unregisterInstance]);

    useEffect(() => {
      if (!isDebugMode) return;
      updateInstance(fullId, { isPlaying: playing, isPaused: !playing });
    }, [isDebugMode, fullId, playing, updateInstance]);

    const handleClick = useCallback(
      (e: React.MouseEvent) => {
        if (!interactive) return;
        onClick?.(e);
      },
      [interactive, onClick]
    );

    return (
      <span
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
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
      </span>
    );
  }
));

Fly.displayName = 'Fly';

export default Fly;
