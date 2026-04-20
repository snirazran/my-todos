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
  useViewModel,
  useViewModelInstance,
  useViewModelInstanceBoolean,
  useViewModelInstanceNumber,
} from '@rive-app/react-canvas-lite';
import { useRiveAsset } from '@/hooks/useRiveAsset';
import { useRiveVisibility } from '@/hooks/useRiveVisibility';

/* === Artboard & geometry (adjust to your .riv) =========================== */
const ARTBOARD_NAME = 'main';
const STATE_MACHINE = 'State Machine 1';
const MOUTH_TRIGGER = 'open_mouth';
const OPEN_MOUTH_BINDING = 'openMouth';

// Legacy Rive numeric inputs (all are integers in the older state machine)
const INPUTS = {
  skin: 'skin',
  mood: 'mood',
  hat: 'hat',
  body: 'body',
  hand_item: 'hand_item',
} as const;

export type WardrobeSlot = keyof typeof INPUTS;

const DATA_BINDINGS: Record<WardrobeSlot, string> = {
  skin: 'skin',
  mood: 'mood',
  hat: 'hat',
  body: 'body',
  hand_item: 'handItem',
};

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
      autoBind: true,
      layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
    });

    useRiveVisibility(rive, wrapperRef);

    const viewModel = useViewModel(rive, { useDefault: true });
    const viewModelInstance = useViewModelInstance(viewModel, {
      useDefault: true,
      rive,
    });

    const skinBinding = useViewModelInstanceNumber(
      DATA_BINDINGS.skin,
      viewModelInstance,
    );
    const moodBinding = useViewModelInstanceNumber(
      DATA_BINDINGS.mood,
      viewModelInstance,
    );
    const hatBinding = useViewModelInstanceNumber(
      DATA_BINDINGS.hat,
      viewModelInstance,
    );
    const bodyBinding = useViewModelInstanceNumber(
      DATA_BINDINGS.body,
      viewModelInstance,
    );
    const handItemBinding = useViewModelInstanceNumber(
      DATA_BINDINGS.hand_item,
      viewModelInstance,
    );
    const openMouthBinding = useViewModelInstanceBoolean(
      OPEN_MOUTH_BINDING,
      viewModelInstance,
    );

    // Legacy state machine inputs, kept so older .riv backups still work.
    const mouthTrigger = useStateMachineInput(
      rive,
      STATE_MACHINE,
      MOUTH_TRIGGER
    );
    const skinInput = useStateMachineInput(rive, STATE_MACHINE, INPUTS.skin);
    const moodInput = useStateMachineInput(rive, STATE_MACHINE, INPUTS.mood);
    const hatInput = useStateMachineInput(rive, STATE_MACHINE, INPUTS.hat);
    const bodyInput = useStateMachineInput(rive, STATE_MACHINE, INPUTS.body);
    const handItemInput = useStateMachineInput(
      rive,
      STATE_MACHINE,
      INPUTS.hand_item
    );

    /* ---- mouth trigger ---- */
    useEffect(() => {
      if (!mouthOpen) return;

      if (openMouthBinding.value !== null) {
        openMouthBinding.setValue(true);
        const timer = setTimeout(() => openMouthBinding.setValue(false), 120);
        return () => clearTimeout(timer);
      }

      mouthTrigger?.fire();
    }, [mouthOpen, mouthTrigger, openMouthBinding]);

    const setBoundSlotIndex = React.useCallback(
      (slot: WardrobeSlot, index: number) => {
        if (slot === 'skin') {
          if (skinBinding.value !== null) skinBinding.setValue(index);
          if (skinInput) skinInput.value = index;
        }
        if (slot === 'mood') {
          if (moodBinding.value !== null) moodBinding.setValue(index);
          if (moodInput) moodInput.value = index;
        }
        if (slot === 'hat') {
          if (hatBinding.value !== null) hatBinding.setValue(index);
          if (hatInput) hatInput.value = index;
        }
        if (slot === 'body') {
          if (bodyBinding.value !== null) bodyBinding.setValue(index);
          if (bodyInput) bodyInput.value = index;
        }
        if (slot === 'hand_item') {
          if (handItemBinding.value !== null) handItemBinding.setValue(index);
          if (handItemInput) handItemInput.value = index;
        }
      },
      [
        bodyBinding,
        bodyInput,
        handItemBinding,
        handItemInput,
        hatBinding,
        hatInput,
        moodBinding,
        moodInput,
        skinBinding,
        skinInput,
      ],
    );

    /* ---- controlled per-slot indices -> data bindings + legacy inputs ---- */
    useEffect(() => {
      if (!indices) return;
      if (typeof indices.skin === 'number')
        setBoundSlotIndex('skin', indices.skin);
      if (typeof indices.mood === 'number')
        setBoundSlotIndex('mood', indices.mood);
      if (typeof indices.hat === 'number')
        setBoundSlotIndex('hat', indices.hat);
      if (typeof indices.body === 'number')
        setBoundSlotIndex('body', indices.body);
      if (typeof indices.hand_item === 'number')
        setBoundSlotIndex('hand_item', indices.hand_item);
    }, [indices, setBoundSlotIndex]);

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
        setBoundSlotIndex(slot, index);
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
