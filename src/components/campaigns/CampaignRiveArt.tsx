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
import {
  applyRiveInputs,
  fireRiveTrigger,
  introspectRive,
  wakeRive,
} from '@/lib/campaigns/riveBindings';
import type {
  CampaignRiveButton,
  RiveArtboardInfo,
  RiveInputInfo,
  RiveInputValue,
  RiveSignalSource,
  RiveTicker,
} from '@/lib/campaigns/types';

export type RiveContents = {
  /** Which file this describes, so an editor with several animations on one
   *  canvas can tell them apart. */
  source: string;
  artboards: RiveArtboardInfo[];
  /** Every value the file exposes, so the editor can offer a real list. */
  inputs: RiveInputInfo[];
};

/** Identity of a loaded animation: change any part and it is a different file. */
export const riveSourceKey = (
  url: string,
  artboard?: string,
  stateMachine?: string,
) => `${url}|${artboard ?? ''}|${stateMachine ?? ''}`;

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
  /** Values written into the file once it has loaded. */
  inputs?: RiveInputValue[];
  /** Triggers fired on a repeating beat. */
  tickers?: RiveTicker[];
  /** Every signal the file reports, mapped or not. */
  onSignal?: (signal: RiveSignal) => void;
  /** What the file offers, once it parses. */
  onContents?: (contents: RiveContents) => void;
  onLoadError?: () => void;
};

/**
 * The animation half of a campaign, and the bridge between a Rive file and the
 * app: buttons drawn in Rive become actions, values an admin typed become
 * data-bind properties, and a one-shot timeline becomes a loop.
 *
 * Two ways in for signals, because Rive offers two and files in the wild use
 * both: a General Rive Event fired from a listener (self-describing — the
 * editor can discover the names just by watching), and a data-bound trigger
 * property (named by hand, since the runtime can't enumerate them).
 */
export function CampaignRiveArt(props: Props) {
  // `useRive` only builds its Rive instance once: its effect depends on the
  // canvas element and whether params exist, never on `src`, `artboard` or
  // `stateMachines`. Pointing it at a different file is silently ignored, so a
  // new source has to arrive as a new component instance.
  return (
    <RiveArt
      key={riveSourceKey(props.url, props.artboard, props.stateMachine)}
      {...props}
    />
  );
}

function RiveArt({
  url,
  artboard,
  stateMachine,
  fit = 'contain',
  className,
  style,
  buttons = [],
  inputs = [],
  tickers = [],
  onSignal,
  onContents,
  onLoadError,
}: Props) {
  const idle = useRiveIdlePause((s) => s.idle);
  const [instance, setInstance] = useState<ViewModelInstance | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [url]);

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
          onLoadError: () => {
            setFailed(true);
            onLoadError?.();
          },
        }
      : null,
    {
      shouldResizeCanvasToContainer: true,
      useDevicePixelRatio: true,
      customDevicePixelRatio: riveDevicePixelRatio(),
    },
  );

  const activeStateMachine = stateMachine ?? '';

  useEffect(() => {
    if (!rive) return;
    setInstance(rive.viewModelInstance ?? null);
    onContents?.({
      source: riveSourceKey(url, artboard, stateMachine),
      ...introspectRive(rive, activeStateMachine),
    });
  }, [rive, url, artboard, stateMachine, activeStateMachine, onContents]);

  // Values are re-applied whenever they change so the editor's preview tracks
  // the inspector live, not only on the next reload.
  const inputsKey = useMemo(() => JSON.stringify(inputs), [inputs]);
  useEffect(() => {
    if (!rive) return;
    applyRiveInputs(rive, activeStateMachine, inputs);
    // A settled artboard has stopped drawing, so the new value would sit in the
    // file unseen until something else happened to wake it.
    if (!idle) wakeRive(rive);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rive, activeStateMachine, inputsKey, idle]);

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
      {failed ? (
        <div className="flex h-full w-full items-center justify-center rounded-xl bg-black/20 p-2 text-center text-[10px] font-black uppercase tracking-wide text-white/70">
          Animation failed to load
        </div>
      ) : (
        <RiveComponent className="h-full w-full" />
      )}
      {tickers.map((ticker) => (
        <Ticker
          key={`${ticker.target}:${ticker.name}`}
          rive={rive}
          stateMachine={activeStateMachine}
          ticker={ticker}
          paused={idle}
        />
      ))}
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

/**
 * A one-shot timeline made to loop. Each beat is scheduled from the end of the
 * last one rather than on an interval, so a tab that was backgrounded resumes
 * on its own rhythm instead of firing a burst of catch-up triggers.
 */
function Ticker({
  rive,
  stateMachine,
  ticker,
  paused,
}: {
  rive: Rive | null;
  stateMachine: string;
  ticker: RiveTicker;
  paused: boolean;
}) {
  const { name, target, everyMs, jitterMs, onShow } = ticker;

  useEffect(() => {
    if (!rive || !name || paused) return;

    let timer = 0;
    let cancelled = false;

    const beat = () => {
      if (cancelled) return;
      fireRiveTrigger(rive, stateMachine, name, target);
      // The previous beat let the artboard settle, which stopped the render
      // loop; without this the trigger fires into a frozen canvas.
      wakeRive(rive);
      schedule();
    };

    const schedule = () => {
      const period = Math.max(250, everyMs) + Math.random() * Math.max(0, jitterMs);
      timer = window.setTimeout(beat, period);
    };

    if (onShow) {
      fireRiveTrigger(rive, stateMachine, name, target);
      wakeRive(rive);
    }
    schedule();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [rive, stateMachine, name, target, everyMs, jitterMs, onShow, paused]);

  return null;
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
