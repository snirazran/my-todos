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

/* === Replace with your real Rive artboard + node values =================== */
const ARTBOARD_WIDTH = 149;
const ARTBOARD_HEIGHT = 120;
const MOUTH_TARGET_X = 75; // mouth_target.x in artboard units
const MOUTH_TARGET_Y = 70; // mouth_target.y in artboard units
/* ========================================================================= */

const ARTBOARD_NAME = 'All';
const STATE_MACHINE = 'State Machine 1';
const MOUTH_TRIGGER = 'trigger_mouth_open';

export interface FrogHandle {
  /** viewport coordinates of the mouth anchor */
  getMouthPoint: () => { x: number; y: number };
}

interface FrogProps {
  className?: string;
  mouthOpen?: boolean;
  mouthOffset?: { x?: number; y?: number }; // NEW
}

const Frog = React.memo(
  forwardRef<FrogHandle, FrogProps>(
    ({ className = '', mouthOpen, mouthOffset }, ref) => {
      const wrapperRef = useRef<HTMLDivElement | null>(null);

      const { RiveComponent, rive, setCanvasRef } = useRive({
        src: '/frog_idle.riv',
        artboard: ARTBOARD_NAME,
        stateMachines: STATE_MACHINE,
        autoplay: true,
        layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
      });

      const openMouth = useStateMachineInput(
        rive,
        STATE_MACHINE,
        MOUTH_TRIGGER
      );

      useEffect(() => {
        if (mouthOpen) openMouth?.fire();
      }, [mouthOpen, openMouth]);

      useImperativeHandle(ref, () => ({
        getMouthPoint() {
          const el = wrapperRef.current;
          if (!el) return { x: 0, y: 0 };

          const rect = el.getBoundingClientRect();
          const scale = Math.min(
            rect.width / ARTBOARD_WIDTH,
            rect.height / ARTBOARD_HEIGHT
          );
          const offsetX = (rect.width - ARTBOARD_WIDTH * scale) / 2;
          const offsetY = (rect.height - ARTBOARD_HEIGHT * scale) / 2;

          const canvasX = MOUTH_TARGET_X * scale + offsetX;
          const canvasY = MOUTH_TARGET_Y * scale + offsetY;

          const ox = mouthOffset?.x ?? 0;
          const oy = mouthOffset?.y ?? 0;

          return { x: rect.left + canvasX + ox, y: rect.top + canvasY + oy };
        },
      }));

      return (
        <div
          ref={wrapperRef}
          className={className}
          style={{ width: 240, height: 180, position: 'relative' }}
        >
          {/* Let Rive render into our box; we still give it the actual canvas via setCanvasRef,
            but we don't rely on reading that canvas back. */}
          <RiveComponent
            ref={(node) => setCanvasRef(node as HTMLCanvasElement | null)}
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
        </div>
      );
    }
  )
);

export default Frog;
