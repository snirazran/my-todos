'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Alignment,
  EventType,
  Fit,
  Layout,
  type RiveFile,
  useRive,
  useViewModel,
  useViewModelInstance,
  useViewModelInstanceTrigger,
} from '@rive-app/react-canvas-lite';
import {
  storeBundleArtboard,
  getStoreBundleFile,
  preloadStoreBundleFile,
  riveDevicePixelRatio,
} from '@/lib/riveLoader';
import { useRiveIdlePause } from '@/lib/riveIdlePause';

const STATE_MACHINE = 'State Machine 1';
const VIEW_MODEL = 'ViewModel1';
const VIEW_MODEL_INSTANCE = 'Instance';
const WINGS_TRIGGER = 'wings';
const WINGS_IDLE_STATE = 'Wings_idle';
const FLAP_PERIOD_MS = 2600;

const flapListeners = new Set<() => void>();
let flapTimer: ReturnType<typeof setInterval> | null = null;

function onSharedFlap(listener: () => void) {
  flapListeners.add(listener);
  flapTimer ??= setInterval(() => {
    flapListeners.forEach((fn) => fn());
  }, FLAP_PERIOD_MS);
  return () => {
    flapListeners.delete(listener);
    if (flapListeners.size === 0 && flapTimer) {
      clearInterval(flapTimer);
      flapTimer = null;
    }
  };
}

/**
 * One fly-pack illustration, drawn from the Bundle1…Bundle6 artboards of the
 * shared store_bundle.riv export (pack 1 is the smallest, pack 6 the largest).
 *
 * The wings are a one-shot data-bound trigger rather than a loop, so JS owns
 * the cadence: one shared interval drives every mounted pack, so the whole
 * shelf flaps and shines on the same beat instead of drifting apart. Between
 * flaps the state machine settles on Wings_idle and the instance pauses
 * itself — six always-advancing artboards in one sheet is exactly the kind of
 * render-loop burn the rest of the app goes out of its way to avoid.
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
  const [file, setFile] = useState<RiveFile | null>(() => getStoreBundleFile());
  const [failed, setFailed] = useState(false);
  const idle = useRiveIdlePause((s) => s.idle);

  useEffect(() => {
    if (file) return;
    let alive = true;
    preloadStoreBundleFile().then((loaded) => {
      if (!alive) return;
      if (loaded) setFile(loaded);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [file]);

  const { rive, RiveComponent } = useRive(
    file && !failed
      ? {
          riveFile: file,
          artboard: storeBundleArtboard(bundle),
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
    return onSharedFlap(() => {
      if (!rive.isPlaying) rive.play();
      flapRef.current?.();
    });
  }, [rive, idle]);

  if (failed) return <>{fallback}</>;

  return <RiveComponent className={className} />;
}
