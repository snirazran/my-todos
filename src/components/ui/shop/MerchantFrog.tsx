'use client';

import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Alignment,
  EventType,
  Fit,
  Layout,
  useRive,
  useViewModel,
  useViewModelInstance,
  useViewModelInstanceTrigger,
} from '@rive-app/react-canvas-lite';
import { useRiveAsset } from '@/hooks/useRiveAsset';
import { useRiveVisibility } from '@/hooks/useRiveVisibility';
import { useRiveIdlePause } from '@/lib/riveIdlePause';
import { registerPokeable } from '@/lib/frogEmotes';
import { hapticTick } from '@/lib/haptics';
import {
  getMerchantFile,
  MERCHANT_RIVE_ASSET_URL,
  preloadMerchantFile,
  riveDevicePixelRatio,
} from '@/lib/riveLoader';

const LAYOUT = new Layout({ fit: Fit.Contain, alignment: Alignment.BottomCenter });
const ARTBOARD = 'main';
const STATE_MACHINE = 'State Machine 1';
const ARTBOARD_ASPECT = 121 / 175;
const JUMP_HEADROOM = 0.2;
const PENDING_INTERACT_TTL_MS = 1500;
const PENDING_PURCHASE_TTL_MS = 10000;
const HIT_TOLERANCE_PX = 6;
const HIT_MIN_ALPHA = 8;
const nextBreathDelayMs = () => 2700 + Math.random() * 500;

type MerchantState = 'idle' | 'breathing' | 'interact' | 'purchase';
const STATES: ReadonlySet<string> = new Set<MerchantState>([
  'idle',
  'breathing',
  'interact',
  'purchase',
]);

export const merchantArtHeight = (width: number) => Math.round(width * ARTBOARD_ASPECT);

export interface MerchantFrogHandle {
  interact: (options?: { soft?: boolean }) => boolean;
  purchase: () => void;
}

interface MerchantFrogProps {
  width: number;
  className?: string;
  pokeable?: boolean;
  onReady?: () => void;
}

const MerchantFrog = memo(
  forwardRef<MerchantFrogHandle, MerchantFrogProps>(function MerchantFrog(
    { width, className, pokeable = true, onReady },
    ref,
  ) {
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const [file, setFile] = useState(getMerchantFile);
    const [fileFailed, setFileFailed] = useState(false);
    useEffect(() => {
      if (file) return;
      let alive = true;
      void preloadMerchantFile().then((loaded) => {
        if (!alive) return;
        if (loaded) setFile(loaded);
        else setFileFailed(true);
      });
      return () => {
        alive = false;
      };
    }, [file]);
    const riveUrl = useRiveAsset(MERCHANT_RIVE_ASSET_URL);
    const fallbackSrc = !file && fileFailed ? riveUrl || undefined : undefined;

    const { rive, RiveComponent } = useRive(
      {
        ...(file ? { riveFile: file } : { src: fallbackSrc }),
        artboard: ARTBOARD,
        stateMachines: STATE_MACHINE,
        autoplay: true,
        autoBind: true,
        layout: LAYOUT,
      },
      { shouldUseIntersectionObserver: false },
    );

    useRiveVisibility(rive, wrapperRef, true, 'merchant');

    const viewModel = useViewModel(rive, { useDefault: true });
    const viewModelInstance = useViewModelInstance(viewModel, {
      useDefault: true,
      rive,
    });
    const { trigger: triggerBreathing } = useViewModelInstanceTrigger(
      'breathing',
      viewModelInstance,
    );
    const { trigger: triggerInteract } = useViewModelInstanceTrigger(
      'interact',
      viewModelInstance,
    );
    const { trigger: triggerPurchase } = useViewModelInstanceTrigger(
      'purchase',
      viewModelInstance,
    );

    const [ready, setReady] = useState(false);
    const readyRef = useRef(false);
    const onReadyRef = useRef(onReady);
    onReadyRef.current = onReady;
    useEffect(() => {
      if (!rive || readyRef.current) return;
      let second = 0;
      const first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => {
          readyRef.current = true;
          setReady(true);
          onReadyRef.current?.();
        });
      });
      return () => {
        cancelAnimationFrame(first);
        cancelAnimationFrame(second);
      };
    }, [rive]);

    useEffect(() => {
      if (!rive) return;
      const el = wrapperRef.current;
      if (!el) return;
      const resize = () => {
        const canvas = el.querySelector('canvas');
        if (!(canvas instanceof HTMLCanvasElement)) return;
        const dpr = riveDevicePixelRatio();
        const w = Math.round(el.clientWidth * dpr);
        const h = Math.round(el.clientHeight * dpr);
        if (!w || !h) return;
        canvas.style.width = `${el.clientWidth}px`;
        canvas.style.height = `${el.clientHeight}px`;
        if (canvas.width === w && canvas.height === h) return;
        canvas.width = w;
        canvas.height = h;
        rive.resizeToCanvas();
        rive.drawFrame();
      };
      resize();
      const raf = requestAnimationFrame(resize);
      const observer = new ResizeObserver(() => resize());
      observer.observe(el);
      return () => {
        cancelAnimationFrame(raf);
        observer.disconnect();
      };
    }, [rive]);

    const stateRef = useRef<MerchantState>('idle');
    const pendingInteractRef = useRef(0);
    const pendingPurchaseRef = useRef(0);

    const canAnimate = () =>
      !!rive && readyRef.current && rive.isPlaying && !useRiveIdlePause.getState().idle;

    const playInteract = () => {
      pendingInteractRef.current = 0;
      triggerInteract();
    };

    const playPurchase = () => {
      pendingPurchaseRef.current = 0;
      pendingInteractRef.current = 0;
      triggerPurchase();
    };

    const flush = () => {
      const now = performance.now();
      if (pendingPurchaseRef.current) {
        if (now - pendingPurchaseRef.current > PENDING_PURCHASE_TTL_MS) {
          pendingPurchaseRef.current = 0;
        } else if (canAnimate()) {
          playPurchase();
          return;
        }
      }
      if (!pendingInteractRef.current) return;
      if (now - pendingInteractRef.current > PENDING_INTERACT_TTL_MS) {
        pendingInteractRef.current = 0;
      } else if (stateRef.current === 'idle' && canAnimate()) {
        playInteract();
      }
    };
    const flushRef = useRef(flush);
    flushRef.current = flush;

    useEffect(() => {
      if (!rive) return;
      const onStateChange = (event: { data?: unknown }) => {
        const states = Array.isArray(event.data) ? (event.data as string[]) : [];
        const next = states.find((state) => STATES.has(state)) as MerchantState | undefined;
        if (!next) return;
        stateRef.current = next;
        if (next === 'idle') flushRef.current();
      };
      const onPlay = () => window.setTimeout(() => flushRef.current(), 0);
      rive.on(EventType.StateChange, onStateChange);
      rive.on(EventType.Play, onPlay);
      return () => {
        rive.off(EventType.StateChange, onStateChange);
        rive.off(EventType.Play, onPlay);
      };
    }, [rive]);

    useEffect(() => {
      if (ready) flushRef.current();
    }, [ready]);

    useEffect(() => {
      if (!rive) return;
      let t = 0;
      const schedule = () => {
        t = window.setTimeout(() => {
          if (
            readyRef.current &&
            rive.isPlaying &&
            !useRiveIdlePause.getState().idle &&
            stateRef.current === 'idle' &&
            !pendingInteractRef.current &&
            !pendingPurchaseRef.current
          ) {
            triggerBreathing();
          }
          schedule();
        }, nextBreathDelayMs());
      };
      schedule();
      return () => window.clearTimeout(t);
    }, [rive, triggerBreathing]);

    const interact = (soft = false) => {
      const state = stateRef.current;
      const live = canAnimate();
      if (live && state === 'idle') {
        playInteract();
        return true;
      }
      if (state === 'purchase') return false;
      if (soft && (!live || state !== 'breathing' || pendingInteractRef.current)) return false;
      pendingInteractRef.current = performance.now();
      return true;
    };

    const purchase = () => {
      if (canAnimate()) playPurchase();
      else pendingPurchaseRef.current = performance.now();
    };

    const interactRef = useRef(interact);
    interactRef.current = interact;

    const hitTest = useCallback((clientX: number, clientY: number) => {
      const canvas = wrapperRef.current?.querySelector('canvas');
      if (!canvas) return false;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      const sx = canvas.width / rect.width;
      const sy = canvas.height / rect.height;
      const cx = Math.round((clientX - rect.left) * sx);
      const cy = Math.round((clientY - rect.top) * sy);
      const rx = Math.max(1, Math.round(HIT_TOLERANCE_PX * sx));
      const ry = Math.max(1, Math.round(HIT_TOLERANCE_PX * sy));
      const x0 = Math.max(0, cx - rx);
      const y0 = Math.max(0, cy - ry);
      const x1 = Math.min(canvas.width, cx + rx + 1);
      const y1 = Math.min(canvas.height, cy + ry + 1);
      if (x1 <= x0 || y1 <= y0) return false;
      try {
        const ctx = canvas.getContext('2d');
        if (!ctx) return true;
        const { data } = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] > HIT_MIN_ALPHA) return true;
        }
        return false;
      } catch {
        return true;
      }
    }, []);

    useEffect(() => {
      if (!pokeable) return;
      return registerPokeable({
        element: () => wrapperRef.current,
        hitTest,
        poke: () => {
          hapticTick();
          interactRef.current();
        },
      });
    }, [pokeable, hitTest]);

    useImperativeHandle(ref, () => ({
      interact: (options) => interact(options?.soft),
      purchase,
    }));

    const height = Math.round(merchantArtHeight(width) * (1 + JUMP_HEADROOM));

    return (
      <div
        ref={wrapperRef}
        className={className}
        style={{ width, height, position: 'relative' }}
      >
        {(file || fallbackSrc) && (
          <RiveComponent
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
              opacity: ready ? 1 : 0,
              transition: 'opacity 150ms ease-out',
            }}
          />
        )}
      </div>
    );
  }),
);

export default MerchantFrog;
