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
  EventType,
  useRive,
  useStateMachineInput,
  useViewModel,
  useViewModelInstance,
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

/** Artboard pixel dimensions + anchor (artboard coords) */
const ARTBOARD_WIDTH = 128;
const ARTBOARD_HEIGHT = 144;
const DEFAULT_FROG_WIDTH = 240;
const DEFAULT_FROG_HEIGHT = Math.round(
  (DEFAULT_FROG_WIDTH * ARTBOARD_HEIGHT) / ARTBOARD_WIDTH,
);
const MOUTH_TARGET_X = 75;
const MOUTH_TARGET_Y = 75;
/* ========================================================================= */

export interface FrogHandle {
  getMouthPoint: () => { x: number; y: number };
  getBoxRect: () => DOMRect;
  /** Imperatively set a slot to a numeric index (Rive input value) */
  setSlotIndex: (slot: WardrobeSlot, index: number) => void;
  /**
   * Set `mood`, then revert to `resetTo` (default 0) after the body loop that
   * swaps it in completes — so the reaction plays exactly one run, timed by
   * Rive's own loop boundary rather than a hardcoded duration.
   */
  reactMoodOnce: (mood: number, resetTo?: number) => void;
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
    },
    ref,
  ) {
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const moodReactionCleanupRef = useRef<(() => void) | null>(null);
    const riveUrl = useRiveAsset('/frog_idle.riv');

    const { RiveComponent, rive } = useRive({
      src: riveUrl || undefined,
      artboard: ARTBOARD_NAME,
      stateMachines: STATE_MACHINE,
      autoplay: true,
      autoBind: true,
      layout: FROG_LAYOUT,
    });

    useRiveVisibility(rive, wrapperRef, !paused, 'frog');

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

    /* ---- tear down any in-flight mood reaction on unmount ---- */
    useEffect(() => () => moodReactionCleanupRef.current?.(), []);

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
      reactMoodOnce(mood, resetTo = 0) {
        setBoundSlotIndex('mood', mood);
        if (!rive) return;

        // Cancel any in-flight reaction so a new eat restarts it cleanly.
        moodReactionCleanupRef.current?.();

        // ---- TEMP DIAGNOSTICS ----
        // Log the real state-change / loop sequence after setting the mood so we
        // can identify which transition is the reaction entering its state.
        const t0 = performance.now();
        console.log('[mood] set mood=', mood, '(t0)');
        const onStateChange = (e: { data?: unknown }) => {
          console.log(
            '[mood] statechange @',
            Math.round(performance.now() - t0),
            'ms data=',
            JSON.stringify(e?.data),
          );
        };
        const onLoop = (e: { data?: unknown }) => {
          console.log(
            '[mood] loop @',
            Math.round(performance.now() - t0),
            'ms data=',
            JSON.stringify(e?.data),
          );
        };
        rive.on(EventType.StateChange, onStateChange);
        rive.on(EventType.Loop, onLoop);
        const timer = setTimeout(() => {
          setBoundSlotIndex('mood', resetTo);
          rive.off(EventType.StateChange, onStateChange);
          rive.off(EventType.Loop, onLoop);
          moodReactionCleanupRef.current = null;
          console.log('[mood] diagnostic window ended -> reset to', resetTo);
        }, 4000);
        moodReactionCleanupRef.current = () => {
          clearTimeout(timer);
          rive.off(EventType.StateChange, onStateChange);
          rive.off(EventType.Loop, onLoop);
          moodReactionCleanupRef.current = null;
        };
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
            }}
          />
        )}
      </div>
    );
  }),
);

export default Frog;
