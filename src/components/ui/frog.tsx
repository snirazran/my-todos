'use client';

import React, { forwardRef, useImperativeHandle, useEffect } from 'react';
import riveCanvas, {
  Layout,
  Fit,
  Alignment,
  useRive,
  useStateMachineInput,
} from '@rive-app/react-canvas';

const Vec2D = (riveCanvas as any).Vec2D; // runtime helper

/* === names exactly as they appear in the .riv file ======================== */
const ARTBOARD = 'regular_green 2';
const STATE_MACHINE = 'State Machine 1';
const MOUTH_TRIGGER = 'trigger_mouth_open';
const MOUTH_NODE = 'mouth_target';
/* ========================================================================= */

export interface FrogHandle {
  getMouthPoint: () => { x: number; y: number };
}

interface FrogProps {
  className?: string;
  mouthOpen?: boolean;
}

const Frog = React.memo(
  forwardRef<FrogHandle, FrogProps>(
    ({ className = '', mouthOpen = false }, ref) => {
      const { RiveComponent, rive, setCanvasRef } = useRive({
        src: '/frog_idle.riv', // put the .riv in /public
        artboard: ARTBOARD,
        stateMachines: STATE_MACHINE, // <-- for the trigger
        autoplay: true,
        layout: new Layout({
          fit: Fit.Contain,
          alignment: Alignment.Center, // center looks nicer than BottomCenter
        }),
      });

      // trigger for mouth-open
      const openMouth = useStateMachineInput(
        rive,
        STATE_MACHINE,
        MOUTH_TRIGGER
      );

      /* fire the trigger when <Frog mouthOpen /> flips to true */
      useEffect(() => {
        if (mouthOpen) openMouth?.fire();
      }, [mouthOpen, openMouth]);

      /* expose the mouth position so the fly animation knows where to start */
      useImperativeHandle(ref, () => ({
        getMouthPoint: () => {
          if (!rive) return { x: 0, y: 0 };

          // -- reach into private fields (safe at runtime, hidden from TS types)
          const r = rive as any;
          const canvas = r.canvas as HTMLCanvasElement;
          const artboard = r.artboard;
          const map2D = r.mapToCanvas as (v: any) => { x: number; y: number };

          const rect = canvas.getBoundingClientRect();
          const mouthNode = artboard.transformComponent(MOUTH_NODE);
          if (!mouthNode) {
            return {
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
            };
          }
          const local = artboard.worldToLocal(
            new Vec2D(mouthNode.x, mouthNode.y)
          );
          const screen = map2D(local);
          return { x: rect.left + screen.x, y: rect.top + screen.y };
        },
      }));

      return (
        <div className={className} style={{ width: 200, height: 140 }}>
          <RiveComponent ref={setCanvasRef} />
        </div>
      );
    }
  )
);

export default Frog;
