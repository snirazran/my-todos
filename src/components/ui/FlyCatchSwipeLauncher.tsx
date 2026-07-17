'use client';

import type { PointerEvent, ReactNode } from 'react';
import { useRef } from 'react';
import { cn } from '@/lib/utils';
import { hapticImpact, hapticTick } from '@/lib/haptics';
import {
  useFlyCatchOverlay,
  type FlyCatchSource,
} from '@/lib/flyCatchOverlayStore';

const RELEASE_DISTANCE = 96;
const FAST_RELEASE_DISTANCE = 52;
const FAST_RELEASE_VELOCITY = 0.55;
const DRAG_START_DISTANCE = 8;

type Props = {
  children: ReactNode;
  source: FlyCatchSource;
  className?: string;
  disabled?: boolean;
};

export function FlyCatchSwipeLauncher({
  children,
  source,
  className,
  disabled = false,
}: Props) {
  const pointerRef = useRef<number | null>(null);
  const startYRef = useRef(0);
  const lastYRef = useRef(0);
  const lastTRef = useRef(0);
  const velocityRef = useRef(0);
  const pullRef = useRef(0);
  const armedRef = useRef(false);
  const draggingRef = useRef(false);
  const suppressClickRef = useRef(false);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return;
    const overlay = useFlyCatchOverlay.getState();
    if (overlay.open || overlay.active) return;
    pointerRef.current = event.pointerId;
    startYRef.current = event.clientY;
    lastYRef.current = event.clientY;
    lastTRef.current = performance.now();
    velocityRef.current = 0;
    pullRef.current = 0;
    armedRef.current = false;
    draggingRef.current = false;
    suppressClickRef.current = false;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (pointerRef.current !== event.pointerId) return;
    const now = performance.now();
    const dt = Math.max(1, now - lastTRef.current);
    const instant = (event.clientY - lastYRef.current) / dt;
    velocityRef.current = velocityRef.current * 0.3 + instant * 0.7;
    lastYRef.current = event.clientY;
    lastTRef.current = now;

    const pull = Math.max(0, event.clientY - startYRef.current);
    pullRef.current = pull;
    if (!draggingRef.current) {
      if (pull < DRAG_START_DISTANCE) return;
      draggingRef.current = true;
      useFlyCatchOverlay.getState().activate(source);
    }
    if (pull > 10) suppressClickRef.current = true;

    const armed = pull >= RELEASE_DISTANCE;
    if (armed !== armedRef.current) {
      armedRef.current = armed;
      if (armed) hapticTick();
    }
    useFlyCatchOverlay.getState().controller?.drag(pull, armed);
  };

  const finishPointer = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    if (pointerRef.current !== event.pointerId) return;
    pointerRef.current = null;
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const velocity = Math.max(0, velocityRef.current);
    const shouldOpen =
      !cancelled &&
      !disabled &&
      (pullRef.current >= RELEASE_DISTANCE ||
        (pullRef.current >= FAST_RELEASE_DISTANCE &&
          velocity >= FAST_RELEASE_VELOCITY));
    if (shouldOpen) hapticImpact();
    useFlyCatchOverlay.getState().controller?.settle(shouldOpen, velocity);
  };

  return (
    <div
      className={cn('relative touch-pan-x select-none', className)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => finishPointer(event)}
      onPointerCancel={(event) => finishPointer(event, true)}
      onClickCapture={(event) => {
        if (!suppressClickRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        suppressClickRef.current = false;
      }}
      data-fly-catch-swipe
    >
      {children}
    </div>
  );
}
