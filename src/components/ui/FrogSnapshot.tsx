'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import {
  requestFrogStamp,
  type FrogStampIndices,
} from '@/lib/frogStampEngine';
import { riveDevicePixelRatio } from '@/lib/riveLoader';

/**
 * Static frog preview rendered by the shared stamp engine — a plain canvas
 * holding one frame, visually identical to `<Frog paused />` but without a
 * per-instance Rive runtime. Use for grids of non-animating previews.
 */
export function FrogSnapshot({
  indices,
  width = 240,
  height = 270,
  className = '',
  visualOffsetY,
}: {
  indices?: FrogStampIndices;
  width?: number;
  height?: number;
  className?: string;
  visualOffsetY?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const indicesRef = useRef(indices);
  indicesRef.current = indices;
  const resolvedVisualOffsetY = visualOffsetY ?? Math.round(height * 0.17);
  const indicesKey = useMemo(() => JSON.stringify(indices ?? {}), [indices]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelStamp: (() => void) | null = null;
    // Match the live Frog pipeline: the canvas backing store always mirrors
    // the actual on-screen box (flex can shrink the wrapper below its inline
    // width), otherwise the stamped bitmap gets stretched by CSS.
    const applySize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = riveDevicePixelRatio();
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width === w && canvas.height === h && cancelStamp) return;
      canvas.width = w;
      canvas.height = h;
      cancelStamp?.();
      cancelStamp = requestFrogStamp(canvas, indicesRef.current ?? {});
    };
    applySize();
    const observer = new ResizeObserver(() => applySize());
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      cancelStamp?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicesKey]);

  return (
    <div
      className={className}
      style={{ width, height, position: 'relative', overflow: 'visible' }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          transform: `translateY(${resolvedVisualOffsetY}px)`,
        }}
      />
    </div>
  );
}
