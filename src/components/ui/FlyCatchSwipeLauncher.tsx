'use client';

import type { PointerEvent, ReactNode } from 'react';
import { useEffect, useRef } from 'react';
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
  const dragRafRef = useRef(0);
  const pendingArmedRef = useRef(false);
  const scrollLockRef = useRef<{
    element: HTMLElement;
    overflowY: string;
    overscrollBehavior: string;
  } | null>(null);

  const restoreScroll = () => {
    const lock = scrollLockRef.current;
    if (!lock) return;
    lock.element.style.overflowY = lock.overflowY;
    lock.element.style.overscrollBehavior = lock.overscrollBehavior;
    scrollLockRef.current = null;
  };

  const flushDrag = () => {
    dragRafRef.current = 0;
    useFlyCatchOverlay
      .getState()
      .controller?.drag(pullRef.current, pendingArmedRef.current);
  };

  const queueDrag = (armed: boolean) => {
    pendingArmedRef.current = armed;
    if (dragRafRef.current) return;
    dragRafRef.current = requestAnimationFrame(flushDrag);
  };

  const lockScroll = () => {
    if (scrollLockRef.current) return;
    const element = document.getElementById('main-scroll');
    if (!element) return;
    scrollLockRef.current = {
      element,
      overflowY: element.style.overflowY,
      overscrollBehavior: element.style.overscrollBehavior,
    };
    element.style.overflowY = 'hidden';
    element.style.overscrollBehavior = 'none';
  };

  useEffect(
    () => () => {
      cancelAnimationFrame(dragRafRef.current);
      restoreScroll();
      const overlay = useFlyCatchOverlay.getState();
      if (!overlay.open) overlay.deactivate();
    },
    [],
  );

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
    pendingArmedRef.current = false;
    // Mount the invisible game before the first drag frame. Previously it was
    // mounted at the threshold-crossing move, which made mobile WebViews flash
    // and drop frames while the finger was already moving.
    overlay.activate(source);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (pointerRef.current !== event.pointerId) return;
    if (event.cancelable) event.preventDefault();
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
      lockScroll();
    }
    if (pull > 10) suppressClickRef.current = true;

    const armed = pull >= RELEASE_DISTANCE;
    if (armed !== armedRef.current) {
      armedRef.current = armed;
      if (armed) hapticTick();
    }
    queueDrag(armed);
  };

  const finishPointer = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    if (pointerRef.current !== event.pointerId) return;
    pointerRef.current = null;
    if (!draggingRef.current) {
      useFlyCatchOverlay.getState().deactivate();
      return;
    }
    draggingRef.current = false;
    restoreScroll();
    // Settle from the finger's final position, even if its last move was still
    // waiting for the next animation frame.
    if (dragRafRef.current) {
      cancelAnimationFrame(dragRafRef.current);
      flushDrag();
    }
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
      className={cn(
        'relative touch-none select-none overscroll-none [-webkit-tap-highlight-color:transparent]',
        className,
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => finishPointer(event)}
      onPointerCancel={(event) => finishPointer(event, true)}
      onLostPointerCapture={(event) => finishPointer(event, true)}
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
