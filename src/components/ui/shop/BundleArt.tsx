'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Alignment,
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
import { cn } from '@/lib/utils';

const STATE_MACHINE = 'State Machine 1';
const VIEW_MODEL = 'ViewModel1';
const VIEW_MODEL_INSTANCE = 'Instance';
const WINGS_TRIGGER = 'wings';

/** One beat every 1.3s, fired for every mounted pack on the same tick. */
const FLAP_INTERVAL_MS = 1300;

const flapListeners = new Set<() => void>();
let flapTimer: ReturnType<typeof setInterval> | null = null;

function onSharedFlap(listener: () => void) {
  const starting = flapListeners.size === 0;
  flapListeners.add(listener);
  if (starting) {
    flapListeners.forEach((fn) => fn());
    flapTimer = setInterval(() => {
      flapListeners.forEach((fn) => fn());
    }, FLAP_INTERVAL_MS);
  }
  return () => {
    flapListeners.delete(listener);
    if (flapListeners.size === 0 && flapTimer !== null) {
      clearInterval(flapTimer);
      flapTimer = null;
    }
  };
}

/**
 * One fly-pack illustration, drawn from the Bundle4…Bundle9 artboards of the
 * shared store_bundle.riv export (pack 1 is the smallest, pack 6 the largest).
 *
 * One shared beat drives every mounted pack, so the whole shelf flies on the
 * same rhythm instead of drifting apart. Six always-advancing artboards is
 * exactly the kind of render-loop burn the rest of the app avoids, so the beat
 * only reaches packs that are on screen, and stops entirely once the screen
 * goes idle — a pack that scrolls out of the sheet is paused, not merely
 * unwatched.
 */
export function BundleArt({
  bundle,
  className,
  fallback = null,
}: {
  /** 1-based pack position, mapped to the Bundle4…Bundle9 artboards. */
  bundle: number;
  className?: string;
  /** Rendered instead when the artboard is missing from the export. */
  fallback?: React.ReactNode;
}) {
  const [file, setFile] = useState<RiveFile | null>(() => getStoreBundleFile());
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(true);
  const hostRef = useRef<HTMLSpanElement>(null);
  const idle = useRiveIdlePause((s) => s.idle);
  const active = visible && !idle;

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
    const el = hostRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setVisible(entry.isIntersecting);
      },
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!rive) return;
    if (!active) {
      rive.pause();
      return;
    }
    if (!rive.isPlaying) rive.play();
    return onSharedFlap(() => flapRef.current?.());
  }, [rive, active]);

  if (failed) return <>{fallback}</>;

  return (
    <span ref={hostRef} className={cn('block', className)}>
      <RiveComponent className="h-full w-full" />
    </span>
  );
}
