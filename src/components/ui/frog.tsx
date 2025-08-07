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

/* === names exactly as they appear in the .riv file ======================== */
const ARTBOARD = 'All';
const STATE_MACHINE = 'State Machine 1';
const MOUTH_TRIGGER = 'trigger_mouth_open';
/* ========================================================================= */

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
    const { RiveComponent, rive, setCanvasRef } = useRive({
      src: '/frog_idle.riv',
      artboard: ARTBOARD,
      stateMachines: STATE_MACHINE,
      autoplay: true,
      layout: new Layout({
        fit: Fit.Contain,
        alignment: Alignment.Center,
      }),
    });

    /* trigger that opens the mouth animation */
    const openMouth = useStateMachineInput(rive, STATE_MACHINE, MOUTH_TRIGGER);

    useEffect(() => {
      if (mouthOpen) openMouth?.fire();
    }, [mouthOpen, openMouth]);

    /* === mouth anchor ==================================================== */
    const mouthAnchorRef = useRef<HTMLDivElement | null>(null);

    useImperativeHandle(ref, () => ({
      getMouthPoint() {
        const el = mouthAnchorRef.current;
        if (!el) return { x: 0, y: 0 };
        const rect = el.getBoundingClientRect(); // CSS-pixel box
        return { x: rect.left, y: rect.top };
      },
    }));

    /* === render ========================================================== */
    return (
      <div
        className={className}
        style={{ width: 240, height: 180, position: 'relative' }} // relative! ⬅
      >
        {/* Rive canvas */}
        <RiveComponent ref={setCanvasRef} />

        {/* invisible mouth anchor — tweak the percentages once and forget */}
        <div
          ref={mouthAnchorRef}
          style={{
            position: 'absolute',
            left: '50%', // 50 % of wrapper’s width  → centre horizontally
            top: '66.6%', // adjust until tongue looks perfect
            width: 0,
            height: 0,
            pointerEvents: 'none',
          }}
        />
      </div>
    );
  })
);

export default Frog;
