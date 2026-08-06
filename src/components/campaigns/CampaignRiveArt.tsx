'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alignment,
  EventType,
  Fit,
  Layout,
  RiveEventType,
  useRive,
  useViewModelInstanceTrigger,
  type Rive,
  type ViewModelInstance,
} from '@rive-app/react-canvas-lite';
import { riveDevicePixelRatio } from '@/lib/riveLoader';
import { cn } from '@/lib/utils';
import { useRiveIdlePause } from '@/lib/riveIdlePause';
import type { CampaignRiveButton, RiveSignalSource } from '@/lib/campaigns/types';

export type RiveContents = {
  artboards: { name: string; stateMachines: string[] }[];
};

export type RiveSignal = {
  name: string;
  source: RiveSignalSource;
  /** Custom properties the Rive event carried, if any. */
  properties?: Record<string, number | boolean | string>;
  /** Set for OpenUrl events. */
  url?: string;
};

type Props = {
  url: string;
  artboard?: string;
  stateMachine?: string;
  fit?: 'contain' | 'cover';
  className?: string;
  style?: React.CSSProperties;
  buttons?: CampaignRiveButton[];
  /** Every signal the file reports, mapped or not. */
  onSignal?: (signal: RiveSignal) => void;
  /** Artboard and state machine names, once the file parses. */
  onContents?: (contents: RiveContents) => void;
  onLoadError?: () => void;
};

/**
 * The animation half of a campaign, and the bridge that turns a button drawn
 * in Rive into an action in the app.
 *
 * Two ways in, because Rive offers two and files in the wild use both: a
 * General Rive Event fired from a listener (self-describing — the editor can
 * discover the names just by watching), and a data-bound trigger property
 * (named by hand, since the runtime can't enumerate them).
 */
export function CampaignRiveArt({
  url,
  artboard,
  stateMachine,
  fit = 'contain',
  className,
  style,
  buttons = [],
  onSignal,
  onContents,
  onLoadError,
}: Props) {
  const idle = useRiveIdlePause((s) => s.idle);
  const [instance, setInstance] = useState<ViewModelInstance | null>(null);

  const { rive, RiveComponent } = useRive(
    url
      ? {
          src: url,
          artboard: artboard || undefined,
          stateMachines: stateMachine || undefined,
          autoplay: true,
          autoBind: true,
          // OpenUrl is handled here instead, so a campaign can't navigate the
          // browser on its own.
          automaticallyHandleEvents: false,
          layout: new Layout({
            fit: fit === 'cover' ? Fit.Cover : Fit.Contain,
            alignment: Alignment.Center,
          }),
          onLoadError,
        }
      : null,
    {
      shouldResizeCanvasToContainer: true,
      useDevicePixelRatio: true,
      customDevicePixelRatio: riveDevicePixelRatio(),
    },
  );

  useEffect(() => {
    if (!rive) return;
    setInstance(rive.viewModelInstance ?? null);
    onContents?.(readContents(rive));
  }, [rive, onContents]);

  useEffect(() => {
    if (!rive || !onSignal) return;
    const handler = (event: { data?: unknown }) => {
      const data = event.data as
        | { name?: string; type?: number; url?: string; properties?: RiveSignal['properties'] }
        | undefined;
      if (!data?.name && !data?.url) return;
      onSignal({
        name: data.name ?? '',
        source: 'event',
        properties: data.properties,
        url: data.type === RiveEventType.OpenUrl ? data.url : undefined,
      });
    };
    rive.on(EventType.RiveEvent, handler);
    return () => rive.off(EventType.RiveEvent, handler);
  }, [rive, onSignal]);

  useEffect(() => {
    if (!rive) return;
    if (idle) rive.pause();
    else if (!rive.isPlaying) rive.play();
  }, [rive, idle]);

  // The art box changes shape when the template changes — from a full-bleed
  // hero to an 80px circle — and the drawing surface has to follow it or the
  // canvas keeps drawing at its old size.
  const holderRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const holder = holderRef.current;
    if (!holder || !rive) return;
    const observer = new ResizeObserver(() => {
      rive.resizeDrawingSurfaceToCanvas(riveDevicePixelRatio());
    });
    observer.observe(holder);
    return () => observer.disconnect();
  }, [rive]);

  const triggerNames = useMemo(
    () =>
      Array.from(
        new Set(
          buttons.filter((b) => b.source === 'trigger' && b.signal).map((b) => b.signal),
        ),
      ),
    [buttons],
  );

  return (
    <div ref={holderRef} className={cn('h-full w-full', className)} style={style}>
      <RiveComponent className="h-full w-full" />
      {triggerNames.map((name) => (
        <TriggerBridge
          key={name}
          name={name}
          instance={instance}
          onFire={() => onSignal?.({ name, source: 'trigger' })}
        />
      ))}
    </div>
  );
}

/** One hook per trigger name, since hook count has to stay stable. */
function TriggerBridge({
  name,
  instance,
  onFire,
}: {
  name: string;
  instance: ViewModelInstance | null;
  onFire: () => void;
}) {
  useViewModelInstanceTrigger(name, instance, { onTrigger: onFire });
  return null;
}

function readContents(rive: Rive): RiveContents {
  const artboards = rive.contents?.artboards ?? [];
  return {
    artboards: artboards.map((board) => ({
      name: board.name,
      stateMachines: (board.stateMachines ?? []).map((machine) => machine.name),
    })),
  };
}
