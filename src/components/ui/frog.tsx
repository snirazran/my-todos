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
  useViewModelInstanceTrigger,
} from '@rive-app/react-canvas-lite';
import { useRiveAsset } from '@/hooks/useRiveAsset';
import { useRiveVisibility } from '@/hooks/useRiveVisibility';
import { riveDevicePixelRatio } from '@/lib/riveLoader';

// Stable layout constant — defined once at module level to prevent useRive from seeing
// a new object reference on every render, which can cause unnecessary reinitialization.
const FROG_LAYOUT = new Layout({
  fit: Fit.Contain,
  alignment: Alignment.Center,
});

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

export type FrogEmote = 'love' | 'question';

const EMOTE_BINDINGS = {
  loveOnce: 'emoteLove',
  questionOnce: 'emoteQuestion',
  loveRepeat: 'emoteLoveRepeat',
  questionRepeat: 'emoteQuestionRepeat',
} as const;

/** Artboard pixel dimensions + anchor (artboard coords) */
const ARTBOARD_WIDTH = 128;
const ARTBOARD_HEIGHT = 144;
const DEFAULT_FROG_WIDTH = 240;
const DEFAULT_FROG_HEIGHT = Math.round(
  (DEFAULT_FROG_WIDTH * ARTBOARD_HEIGHT) / ARTBOARD_WIDTH,
);
const MOUTH_TARGET_X = 75;
const MOUTH_TARGET_Y = 75;
export const FROG_TONGUE_MOUTH_OFFSET = { x: -18, y: 12 } as const;
export const FROG_TONGUE_MOUTH_OFFSET_TABLET = { x: -19, y: 18 } as const;
export const FROG_TONGUE_MOUTH_OFFSET_DESKTOP = { x: -21, y: 26 } as const;
/* ========================================================================= */

export interface FrogHandle {
  getMouthPoint: () => { x: number; y: number };
  getBoxRect: () => DOMRect;
  /** Imperatively set a slot to a numeric index (Rive input value) */
  setSlotIndex: (slot: WardrobeSlot, index: number) => void;
  /** Fire a one-shot emote trigger (plays exactly one run in Rive) */
  fireEmote: (emote: FrogEmote) => void;
}

interface FrogProps {
  className?: string;
  mouthOpen?: boolean;
  mouthOffset?: { x?: number; y?: number };
  width?: number;
  height?: number;
  visualOffsetY?: number;
  paused?: boolean;

  /** Controlled numeric indices per slot (optional) */
  indices?: Partial<Record<WardrobeSlot, number>>;
  /** Looping emote held on while mounted (emoteLoveRepeat / emoteQuestionRepeat) */
  emote?: FrogEmote | null;
}

const Frog = memo(
  forwardRef<FrogHandle, FrogProps>(function Frog(
    {
      className = '',
      mouthOpen,
      mouthOffset,
      width = DEFAULT_FROG_WIDTH,
      height = DEFAULT_FROG_HEIGHT,
      visualOffsetY,
      paused = false,
      indices,
      emote = null,
    },
    ref,
  ) {
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const riveUrl = useRiveAsset('/frog_idle.riv');
    const [dressed, setDressed] = React.useState(false);
    const dressedRef = useRef(false);
    const markDressed = React.useCallback(() => {
      if (dressedRef.current) return;
      dressedRef.current = true;
      setDressed(true);
    }, []);

    const { RiveComponent, rive } = useRive(
      {
        src: riveUrl || undefined,
        artboard: ARTBOARD_NAME,
        stateMachines: STATE_MACHINE,
        autoplay: true,
        autoBind: true,
        layout: FROG_LAYOUT,
      },
      { shouldUseIntersectionObserver: false },
    );

    useRiveVisibility(rive, wrapperRef, !paused, 'frog', !!mouthOpen);

    const resolvedVisualOffsetY =
      visualOffsetY ?? Math.round(height * 0.17);

    useEffect(() => {
      if (!rive) return;
      const el = wrapperRef.current;
      if (!el) return;
      const resize = () =>
        rive.resizeDrawingSurfaceToCanvas(riveDevicePixelRatio());
      resize();
      const raf = requestAnimationFrame(resize);
      const observer = new ResizeObserver(() => resize());
      observer.observe(el);
      return () => {
        cancelAnimationFrame(raf);
        observer.disconnect();
      };
    }, [rive]);

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
    const { trigger: triggerOpenMouth } = useViewModelInstanceTrigger(
      OPEN_MOUTH_BINDING,
      viewModelInstance,
    );
    const { trigger: triggerEmoteLove } = useViewModelInstanceTrigger(
      EMOTE_BINDINGS.loveOnce,
      viewModelInstance,
    );
    const { trigger: triggerEmoteQuestion } = useViewModelInstanceTrigger(
      EMOTE_BINDINGS.questionOnce,
      viewModelInstance,
    );
    const loveRepeatBinding = useViewModelInstanceBoolean(
      EMOTE_BINDINGS.loveRepeat,
      viewModelInstance,
    );
    const questionRepeatBinding = useViewModelInstanceBoolean(
      EMOTE_BINDINGS.questionRepeat,
      viewModelInstance,
    );

    useEffect(() => {
      if (loveRepeatBinding.value !== null) {
        loveRepeatBinding.setValue(emote === 'love');
      }
      if (questionRepeatBinding.value !== null) {
        questionRepeatBinding.setValue(emote === 'question');
      }
    }, [emote, loveRepeatBinding, questionRepeatBinding]);

    // Legacy state machine inputs, kept so older .riv backups still work.
    const mouthTrigger = useStateMachineInput(
      rive,
      STATE_MACHINE,
      MOUTH_TRIGGER,
    );
    const skinInput = useStateMachineInput(rive, STATE_MACHINE, INPUTS.skin);
    const moodInput = useStateMachineInput(rive, STATE_MACHINE, INPUTS.mood);
    const hatInput = useStateMachineInput(rive, STATE_MACHINE, INPUTS.hat);
    const bodyInput = useStateMachineInput(rive, STATE_MACHINE, INPUTS.body);
    const handItemInput = useStateMachineInput(
      rive,
      STATE_MACHINE,
      INPUTS.hand_item,
    );

    /* ---- mouth trigger ---- */
    useEffect(() => {
      if (!mouthOpen) return;

      triggerOpenMouth();
      mouthTrigger?.fire();
    }, [mouthOpen, mouthTrigger, triggerOpenMouth]);

    const setBoundSlotIndex = React.useCallback(
      (slot: WardrobeSlot, index: number) => {
        try {
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
        } catch {
          // Rive WASM not ready yet — indices will be applied once it initialises
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

    const slotReady: Record<WardrobeSlot, boolean> = {
      skin: skinBinding.value !== null || !!skinInput,
      mood: moodBinding.value !== null || !!moodInput,
      hat: hatBinding.value !== null || !!hatInput,
      body: bodyBinding.value !== null || !!bodyInput,
      hand_item: handItemBinding.value !== null || !!handItemInput,
    };
    const providedSlots = (
      Object.keys(INPUTS) as WardrobeSlot[]
    ).filter((slot) => typeof indices?.[slot] === 'number');
    const allProvidedReady =
      providedSlots.length > 0 &&
      providedSlots.every((slot) => slotReady[slot]);

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

    /* ---- keep the canvas hidden until the wardrobe indices are applied ---- */
    useEffect(() => {
      if (!rive || dressedRef.current) return;
      if (providedSlots.length === 0 || allProvidedReady) {
        let raf2 = 0;
        const raf = requestAnimationFrame(() => {
          raf2 = requestAnimationFrame(markDressed);
        });
        const timer = setTimeout(markDressed, 150);
        return () => {
          cancelAnimationFrame(raf);
          cancelAnimationFrame(raf2);
          clearTimeout(timer);
        };
      }
      const timer = setTimeout(markDressed, 500);
      return () => clearTimeout(timer);
    }, [rive, providedSlots.length, allProvidedReady, markDressed]);

    /* ---- pause: play one RAF tick so the state machine applies indices, then freeze ---- */
    useEffect(() => {
      if (!rive || !paused) return;
      rive.play();
      const raf = requestAnimationFrame(() => rive.pause());
      return () => cancelAnimationFrame(raf);
    // setBoundSlotIndex is recreated when bindings become ready, so including it
    // here ensures we re-run after indices are actually applied, not before.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rive, paused, setBoundSlotIndex]);

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
        const cy = drawTop + MOUTH_TARGET_Y * scale + resolvedVisualOffsetY;
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
      fireEmote(name) {
        if (name === 'love') triggerEmoteLove();
        else triggerEmoteQuestion();
      },
    }));

    return (
      <div
        ref={wrapperRef}
        className={className}
        style={{ width, height, position: 'relative', overflow: 'visible' }}
      >
        {riveUrl && (
          <RiveComponent
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
              transform: `translateY(${resolvedVisualOffsetY}px)`,
              opacity: dressed ? 1 : 0,
              transition: 'opacity 150ms ease-out',
            }}
          />
        )}
      </div>
    );
  }),
);

export default Frog;
