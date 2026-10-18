'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import {
  requestFrogStamp,
  drawCachedFrogStamp,
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
  cachedOnly = false,
}: {
  indices?: FrogStampIndices;
  width?: number | string;
  height?: number | string;
  className?: string;
  visualOffsetY?: number;
  /** During a sheet transition, use a saved frame and do no Rive work. */
  cachedOnly?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const indicesRef = useRef(indices);
  indicesRef.current = indices;
  const resolvedVisualOffsetY =
    visualOffsetY ??
    (typeof height === 'number' ? Math.round(height * 0.17) : 0);
  const indicesKey = useMemo(() => JSON.stringify(indices ?? {}), [indices]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelStamp: (() => void) | null = null;
    // Match the live Frog pipeline: the canvas backing store always mirrors
    // the actual on-screen box (flex can shrink the wrapper below its inline
    // width), otherwise the stamped bitmap gets stretched by CSS.
    const applySize = () => {
      const boxWidth = canvas.offsetWidth;
      const boxHeight = canvas.offsetHeight;
      if (boxWidth === 0 || boxHeight === 0) return;
      const dpr = riveDevicePixelRatio();
      const w = Math.max(1, Math.round(boxWidth * dpr));
      const h = Math.max(1, Math.round(boxHeight * dpr));
      if (canvas.width === w && canvas.height === h && cancelStamp) return;
      // Setting either backing dimension clears the bitmap, even when the
      // value is unchanged. Keep the old look visible until its replacement
      // is ready instead of flashing an empty canvas on each selection.
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      cancelStamp?.();
      drawCachedFrogStamp(canvas, indicesRef.current ?? {});
      if (!cachedOnly) cancelStamp = requestFrogStamp(canvas, indicesRef.current ?? {});
    };
    applySize();
    const observer = new ResizeObserver(() => applySize());
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      cancelStamp?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicesKey, cachedOnly]);

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
