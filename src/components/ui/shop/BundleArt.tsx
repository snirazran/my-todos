'use client';

import React, { useEffect, useRef, useState } from 'react';
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
import {
  storeBundleRiveUrl,
  preloadRiveAsset,
  riveDevicePixelRatio,
} from '@/lib/riveLoader';
import { useRiveIdlePause } from '@/lib/riveIdlePause';

const STATE_MACHINE = 'State Machine 1';
const VIEW_MODEL = 'ViewModel1';
const VIEW_MODEL_INSTANCE = 'Instance';
const WINGS_TRIGGER = 'wings';
const WINGS_IDLE_STATE = 'Wings_idle';
const FLAP_MIN_MS = 1000;
const FLAP_MAX_MS = 3000;

const flapDelay = () => FLAP_MIN_MS + Math.random() * (FLAP_MAX_MS - FLAP_MIN_MS);

/**
 * One fly-pack illustration, loaded from that pack's own .riv export.
 *
 * The wings are a one-shot data-bound trigger rather than a loop, so JS owns
 * the cadence: each pack flaps on its own randomized 1–3s timer (a shared
 * interval would make them all beat in lockstep, which reads as one animation
 * rather than five jars of flies). Between flaps the state machine settles on
 * Wings_idle and the instance pauses itself — five always-advancing artboards
 * in one sheet is exactly the kind of render-loop burn the rest of the app
 * goes out of its way to avoid.
 *
 * No artboard is named explicitly: each file's default artboard is the one it
 * was exported for, so this survives whatever the artboards end up called.
 */
export function BundleArt({
  bundle,
  className,
  fallback = null,
}: {
  /** 1-based pack position, mapped to the Bundle1…Bundle6 artboards. */
  bundle: number;
  className?: string;
  /** Rendered instead when the artboard is missing from the export. */
  fallback?: React.ReactNode;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const idle = useRiveIdlePause((s) => s.idle);

  useEffect(() => {
    let alive = true;
    setSrc(null);
    setFailed(false);
    preloadRiveAsset(storeBundleRiveUrl(bundle)).then((url) => {
      if (alive) setSrc(url);
    });
    return () => {
      alive = false;
    };
  }, [bundle]);

  const { rive, RiveComponent } = useRive(
    src && !failed
      ? {
          src,
          stateMachines: STATE_MACHINE,
          autoplay: true,
          autoBind: false,
          shouldDisableRiveListeners: true,
          layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
          onLoadError: () => setFailed(true),
        }
      : null,
    {
      shouldResizeCanvasToContainer: true,
      useDevicePixelRatio: true,
      customDevicePixelRatio: riveDevicePixelRatio(),
    },
  );

  const viewModel = useViewModel(rive, { name: VIEW_MODEL });
  const viewModelInstance = useViewModelInstance(viewModel, {
    name: VIEW_MODEL_INSTANCE,
    rive,
  });
  const { trigger: flap } = useViewModelInstanceTrigger(
    WINGS_TRIGGER,
    viewModelInstance,
  );

  const flapRef = useRef(flap);
  flapRef.current = flap;

  useEffect(() => {
    if (!rive) return;
    const onStateChange = (event: { data?: unknown }) => {
      if (!Array.isArray(event.data)) return;
      if (event.data.includes(WINGS_IDLE_STATE)) rive.pause();
    };
    rive.on(EventType.StateChange, onStateChange);
    return () => rive.off(EventType.StateChange, onStateChange);
  }, [rive]);

  useEffect(() => {
    if (!rive || idle) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (!rive.isPlaying) rive.play();
      flapRef.current?.();
      timer = setTimeout(tick, flapDelay());
    };
    // Stagger the first flap so cards don't sync up on mount.
    timer = setTimeout(tick, Math.random() * FLAP_MAX_MS);
    return () => clearTimeout(timer);
  }, [rive, idle]);

  if (failed) return <>{fallback}</>;

  return <RiveComponent className={className} />;
}
