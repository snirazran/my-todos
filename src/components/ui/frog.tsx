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
// No more imports from @rive-app/canvas are needed!

/* === Values from your Rive Editor ======================================== */
// ⬇️ REPLACE THESE WITH YOUR REAL VALUES FROM STEP 1 ⬇️
const ARTBOARD_WIDTH = 149;
const ARTBOARD_HEIGHT = 120;
const MOUTH_TARGET_X = 20; // The X position of your 'mouth_target'
const MOUTH_TARGET_Y = 10; // The Y position of your 'mouth_target'
/* ========================================================================= */

const ARTBOARD_NAME = 'All';
const STATE_MACHINE = 'State Machine 1';
const MOUTH_TRIGGER = 'trigger_mouth_open';

export interface FrogHandle {
  /** page-space coordinates of the mouth anchor */
  getMouthPoint: () => { x: number; y: number };
}

interface FrogProps {
  className?: string;
  mouthOpen?: boolean;
}

const Frog = React.memo(
  forwardRef<FrogHandle, FrogProps>(({ className = '', mouthOpen }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    const { RiveComponent, rive } = useRive({
      src: '/frog_idle.riv',
      artboard: ARTBOARD_NAME,
      stateMachines: STATE_MACHINE,
      autoplay: true,
      layout: new Layout({
        fit: Fit.Contain,
        alignment: Alignment.Center,
      }),
    });

    const openMouth = useStateMachineInput(rive, STATE_MACHINE, MOUTH_TRIGGER);

    useEffect(() => {
      if (mouthOpen) openMouth?.fire();
    }, [mouthOpen, openMouth]);

    useImperativeHandle(ref, () => ({
      getMouthPoint() {
        if (!canvasRef.current) {
          return { x: 0, y: 0 };
        }

        // 1. Get the size of the HTML canvas element on the screen
        const canvasRect = canvasRef.current.getBoundingClientRect();

        // 2. Calculate the scale factor based on "Fit.Contain"
        const scale = Math.min(
          canvasRect.width / ARTBOARD_WIDTH,
          canvasRect.height / ARTBOARD_HEIGHT
        );

        // 3. Calculate the letterboxing (empty space) based on "Alignment.Center"
        const offsetX = (canvasRect.width - ARTBOARD_WIDTH * scale) / 2;
        const offsetY = (canvasRect.height - ARTBOARD_HEIGHT * scale) / 2;

        // 4. Calculate the target's position inside the canvas
        const canvasX = MOUTH_TARGET_X * scale + offsetX;
        const canvasY = MOUTH_TARGET_Y * scale + offsetY;

        // 5. Convert to final screen coordinates by adding the canvas's top-left corner
        return {
          x: canvasRect.left + canvasX,
          y: canvasRect.top + canvasY,
        };
      },
    }));

    return (
      <div
        className={className}
        style={{ width: 240, height: 180, position: 'relative' }}
      >
        <RiveComponent ref={canvasRef} />
      </div>
    );
  })
);

export default Frog;
