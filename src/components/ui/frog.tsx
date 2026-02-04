'use client';

import React, {
  forwardRef,
  useImperativeHandle,
  useEffect,
  useRef,
  memo,
} from 'react';
import {
  Layout,
  Fit,
  Alignment,
  useRive,
  useStateMachineInput,
} from '@rive-app/react-canvas';
import { useRiveAsset } from '@/hooks/useRiveAsset';

/* === Artboard & geometry (adjust to your .riv) =========================== */
const ARTBOARD_NAME = 'main';
const STATE_MACHINE = 'State Machine 1';
const MOUTH_TRIGGER = 'open_mouth';

// Rive numeric inputs (all are integers in your state machine)
const INPUTS = {
  skin: 'skin',
  hat: 'hat',
  scarf: 'scarf',
  hand_item: 'hand_item',
  glasses: 'glasses',
  mood: 'mood',
} as const;

export type WardrobeSlot = keyof typeof INPUTS;

/** Artboard pixel dimensions + anchor (artboard coords) */
const ARTBOARD_WIDTH = 149;
const ARTBOARD_HEIGHT = 120;
const MOUTH_TARGET_X = 75;
const MOUTH_TARGET_Y = 75;
/* ========================================================================= */

export interface FrogHandle {
  getMouthPoint: () => { x: number; y: number };
  getBoxRect: () => DOMRect;
  /** Imperatively set a slot to a numeric index (Rive input value) */
  setSlotIndex: (slot: WardrobeSlot, index: number) => void;
}

interface FrogProps {
  className?: string;
  mouthOpen?: boolean;
  mouthOffset?: { x?: number; y?: number };
  width?: number;
  height?: number;

  /** Controlled numeric indices per slot (optional) */
  indices?: Partial<Record<WardrobeSlot, number>>;
}

const Frog = memo(
  forwardRef<FrogHandle, FrogProps>(function Frog(
    {
      className = '',
      mouthOpen,
      mouthOffset,
      width = 240,
      height = 180,
      indices,
    },
    ref
  ) {
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const riveUrl = useRiveAsset('/frog_idle.riv');

    const { RiveComponent, rive } = useRive({
      src: riveUrl || undefined,
      artboard: ARTBOARD_NAME,
      stateMachines: STATE_MACHINE,
      autoplay: true,
      layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
    });

    // inputs
    const mouthTrigger = useStateMachineInput(
      rive,
      STATE_MACHINE,
      MOUTH_TRIGGER
    );
    const skinInput = useStateMachineInput(rive, STATE_MACHINE, INPUTS.skin);
    const hatInput = useStateMachineInput(rive, STATE_MACHINE, INPUTS.hat);
    const scarfInput = useStateMachineInput(rive, STATE_MACHINE, INPUTS.scarf);
    const handItemInput = useStateMachineInput(
      rive,
      STATE_MACHINE,
      INPUTS.hand_item
    );
    const glassesInput = useStateMachineInput(rive, STATE_MACHINE, INPUTS.glasses);
    const moodInput = useStateMachineInput(rive, STATE_MACHINE, INPUTS.mood);

    /* ---- mouth trigger ---- */
    useEffect(() => {
      if (mouthOpen) mouthTrigger?.fire();
    }, [mouthOpen, mouthTrigger]);

    /* ---- controlled per-slot indices -> rive inputs ---- */
    useEffect(() => {
      if (!indices) return;
      if (typeof indices.skin === 'number' && skinInput)
        skinInput.value = indices.skin;
      if (typeof indices.hat === 'number' && hatInput)
        hatInput.value = indices.hat;
      if (typeof indices.scarf === 'number' && scarfInput)
        scarfInput.value = indices.scarf;
      if (typeof indices.hand_item === 'number' && handItemInput)
        handItemInput.value = indices.hand_item;
      if (typeof indices.glasses === 'number' && glassesInput)
        glassesInput.value = indices.glasses;
      if (typeof indices.mood === 'number' && moodInput)
        moodInput.value = indices.mood;
    }, [indices, skinInput, hatInput, scarfInput, handItemInput, glassesInput, moodInput]);

    /* ---- expose helpers to parent ---- */
    useImperativeHandle(ref, () => ({
      getMouthPoint() {
        const el = wrapperRef.current;
        if (!el) return { x: 0, y: 0 };
        const rect = el.getBoundingClientRect();
        const sx = rect.width / ARTBOARD_WIDTH;
        const sy = rect.height / ARTBOARD_HEIGHT;
        const scale = Math.min(sx, sy);
        const drawW = ARTBOARD_WIDTH * scale;
        const drawH = ARTBOARD_HEIGHT * scale;
        const drawLft = rect.left + (rect.width - drawW) / 2;
        const drawTop = rect.top + (rect.height - drawH) / 2;

        const cx = drawLft + MOUTH_TARGET_X * scale;
        const cy = drawTop + MOUTH_TARGET_Y * scale;
        const ox = mouthOffset?.x ?? 0;
        const oy = mouthOffset?.y ?? 0;
        return { x: Math.round(cx + ox), y: Math.round(cy + oy) };
      },
      getBoxRect() {
        return (
          wrapperRef.current?.getBoundingClientRect() ?? new DOMRect(0, 0, 0, 0)
        );
      },
      setSlotIndex(slot, index) {
        if (slot === 'skin' && skinInput) skinInput.value = index;
        if (slot === 'hat' && hatInput) hatInput.value = index;
        if (slot === 'scarf' && scarfInput) scarfInput.value = index;
        if (slot === 'hand_item' && handItemInput) handItemInput.value = index;
        if (slot === 'glasses' && glassesInput) glassesInput.value = index;
        if (slot === 'mood' && moodInput) moodInput.value = index;
      },
    }));

    return (
      <div
        ref={wrapperRef}
        className={className}
        style={{ width, height, position: 'relative' }}
      >
        {riveUrl && (
          <RiveComponent
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
        )}
      </div>
    );
  })
);

export default Frog;
