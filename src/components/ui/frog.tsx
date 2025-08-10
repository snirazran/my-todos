'use client';

import React, {
  forwardRef,
  useImperativeHandle,
  useEffect,
  useRef,
} from 'react';
import {
  Layout,
  Fit,
  Alignment,
  useRive,
  useStateMachineInput,
} from '@rive-app/react-canvas';

/* === Put your real artboard + node values here =========================== */
const ARTBOARD_WIDTH = 149;
const ARTBOARD_HEIGHT = 120;
const MOUTH_TARGET_X = 75; // artboard units
const MOUTH_TARGET_Y = 80; // artboard units
/* ========================================================================= */

const ARTBOARD_NAME = 'All';
const STATE_MACHINE = 'State Machine 1';
const MOUTH_TRIGGER = 'trigger_mouth_open';

export interface FrogHandle {
  /** viewport coordinates of the mouth anchor (CSS px, rounded) */
  getMouthPoint: () => { x: number; y: number };
  /** wrapper rect (for visibility checks) */
  getBoxRect: () => DOMRect;
}

interface FrogProps {
  className?: string;
  mouthOpen?: boolean;
  /** fine-tune in CSS pixels after mapping */
  mouthOffset?: { x?: number; y?: number };
  /** wrapper size (optional) */
  width?: number;
  height?: number;
}

const Frog = React.memo(
  forwardRef<FrogHandle, FrogProps>(function Frog(
    { className = '', mouthOpen, mouthOffset, width = 240, height = 180 },
    ref
  ) {
    const wrapperRef = useRef<HTMLDivElement | null>(null);

    const { RiveComponent, rive, setCanvasRef } = useRive({
      src: '/frog_idle.riv',
      artboard: ARTBOARD_NAME,
      stateMachines: STATE_MACHINE,
      autoplay: true,
      layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
    });

    const openMouth = useStateMachineInput(rive, STATE_MACHINE, MOUTH_TRIGGER);

    useEffect(() => {
      if (mouthOpen) openMouth?.fire();
    }, [mouthOpen, openMouth]);

    useImperativeHandle(ref, () => ({
      getMouthPoint() {
        const el = wrapperRef.current;
        if (!el) return { x: 0, y: 0 };

        // 1) wrapper rect in CSS pixels (already includes transforms)
        const rect = el.getBoundingClientRect();

        // 2) Fit.Contain scale
        const sx = rect.width / ARTBOARD_WIDTH;
        const sy = rect.height / ARTBOARD_HEIGHT;
        const scale = Math.min(sx, sy);

        // 3) the actual drawn box (letterboxed & centered)
        const drawW = ARTBOARD_WIDTH * scale;
        const drawH = ARTBOARD_HEIGHT * scale;
        const drawLeft = rect.left + (rect.width - drawW) / 2;
        const drawTop = rect.top + (rect.height - drawH) / 2;

        // 4) map artboard coords -> drawn box
        const cx = drawLeft + MOUTH_TARGET_X * scale;
        const cy = drawTop + MOUTH_TARGET_Y * scale;

        // 5) apply optional fine offset (CSS px), snap to integer to avoid wobble
        const ox = mouthOffset?.x ?? 0;
        const oy = mouthOffset?.y ?? 0;

        return { x: Math.round(cx + ox), y: Math.round(cy + oy) };
      },
      getBoxRect() {
        return (
          wrapperRef.current?.getBoundingClientRect() ?? new DOMRect(0, 0, 0, 0)
        );
      },
    }));

    return (
      <div
        ref={wrapperRef}
        className={className}
        style={{ width, height, position: 'relative' }}
      >
        <RiveComponent
          ref={(node) => setCanvasRef(node as HTMLCanvasElement | null)}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
      </div>
    );
  })
);

export default Frog;
