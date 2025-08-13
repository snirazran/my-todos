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

/* === Artboard & geometry (adjust to your .riv) =========================== */
const ARTBOARD_NAME = 'All';
const STATE_MACHINE = 'State Machine 1';
const MOUTH_TRIGGER = 'trigger_mouth_open';
const SKIN_INPUT = 'skin'; // <-- numeric Rive input

// The *artboard's* pixel dimensions and the mouth anchor in artboard coords:
const ARTBOARD_WIDTH = 149;
const ARTBOARD_HEIGHT = 120;
const MOUTH_TARGET_X = 75; // artboard units
const MOUTH_TARGET_Y = 70; // artboard units
/* ========================================================================= */

export interface FrogHandle {
  /** viewport coordinates of the mouth anchor (CSS px, rounded) */
  getMouthPoint: () => { x: number; y: number };
  /** wrapper rect (for visibility checks) */
  getBoxRect: () => DOMRect;
  /** imperative way to change skins (maps to Rive `skin` input) */
  setSkin: (index: number) => void;
}

interface FrogProps {
  className?: string;
  mouthOpen?: boolean;
  /** fine-tune mouth anchor in CSS px after mapping */
  mouthOffset?: { x?: number; y?: number };
  /** wrapper size */
  width?: number;
  height?: number;
  /** controlled value for the Rive numeric `skin` input */
  skin?: number;
}

const Frog = React.memo(
  forwardRef<FrogHandle, FrogProps>(function Frog(
    { className = '', mouthOpen, mouthOffset, width = 240, height = 180, skin },
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
    const skinInput = useStateMachineInput(rive, STATE_MACHINE, SKIN_INPUT);

    /* ---- mouth trigger ---- */
    useEffect(() => {
      if (mouthOpen) openMouth?.fire();
    }, [mouthOpen, openMouth]);

    /* ---- controlled skin prop -> rive input ---- */
    useEffect(() => {
      if (skinInput != null && typeof skin === 'number') {
        // Rive union type makes TS complain; it's fine at runtime.

        skinInput.value = skin;
      }
    }, [skin, skinInput]);

    /* ---- expose helpers to parent ---- */
    useImperativeHandle(ref, () => ({
      getMouthPoint() {
        const el = wrapperRef.current;
        if (!el) return { x: 0, y: 0 };

        // 1) wrapper rect in CSS pixels (includes transforms)
        const rect = el.getBoundingClientRect();

        // 2) Fit.Contain scale
        const sx = rect.width / ARTBOARD_WIDTH;
        const sy = rect.height / ARTBOARD_HEIGHT;
        const scale = Math.min(sx, sy);

        // 3) actual drawn box (letterboxed & centered)
        const drawW = ARTBOARD_WIDTH * scale;
        const drawH = ARTBOARD_HEIGHT * scale;
        const drawLft = rect.left + (rect.width - drawW) / 2;
        const drawTop = rect.top + (rect.height - drawH) / 2;

        // 4) map artboard coords -> drawn box (CSS px)
        const cx = drawLft + MOUTH_TARGET_X * scale;
        const cy = drawTop + MOUTH_TARGET_Y * scale;

        // 5) apply optional fine offset, snap to int to avoid wobble
        const ox = mouthOffset?.x ?? 0;
        const oy = mouthOffset?.y ?? 0;

        return { x: Math.round(cx + ox), y: Math.round(cy + oy) };
      },
      getBoxRect() {
        return (
          wrapperRef.current?.getBoundingClientRect() ?? new DOMRect(0, 0, 0, 0)
        );
      },
      setSkin(index: number) {
        if (skinInput != null) {
          skinInput.value = index;
        }
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
