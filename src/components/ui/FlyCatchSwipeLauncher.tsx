'use client';

import type { PointerEvent, ReactNode } from 'react';
import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticImpact, hapticTick } from '@/lib/haptics';

const RELEASE_DISTANCE = 72;
const FAST_RELEASE_DISTANCE = 42;

type Props = {
  children: ReactNode;
  source: 'home' | 'wardrobe' | 'friends';
  className?: string;
  disabled?: boolean;
};

export function FlyCatchSwipeLauncher({
  children,
  source,
  className,
  disabled = false,
}: Props) {
  const router = useRouter();
  const contentRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const startAtRef = useRef(0);
  const pullRef = useRef(0);
  const pointerRef = useRef<number | null>(null);
  const armedRef = useRef(false);
  const launchingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [launching, setLaunching] = useState(false);

  const gameHref = `/fly-catch?entry=swipe&start=1&source=${source}`;

  const resetVisuals = useCallback(() => {
    const content = contentRef.current;
    if (!content) return;
    content.style.transition = 'transform 220ms cubic-bezier(.22,1,.36,1), opacity 180ms ease-out';
    content.style.transform = '';
    content.style.opacity = '';
    window.setTimeout(() => {
      if (!launchingRef.current && contentRef.current) {
        contentRef.current.style.transition = '';
      }
    }, 230);
  }, []);

  const launch = useCallback(() => {
    if (disabled || launchingRef.current) return;
    launchingRef.current = true;
    suppressClickRef.current = true;
    setDragging(false);
    setLaunching(true);
    hapticImpact();
    router.prefetch('/fly-catch');

    const content = contentRef.current;
    if (content) {
      content.style.transition = 'transform 300ms cubic-bezier(.32,.72,0,1), opacity 220ms ease-out';
      content.style.transform = 'translate3d(0,-150px,0) scale(.95)';
      content.style.opacity = '0';
    }

    window.setTimeout(() => router.push(gameHref), 260);
  }, [disabled, gameHref, router]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || launchingRef.current || event.button !== 0) return;
    pointerRef.current = event.pointerId;
    startYRef.current = event.clientY;
    startAtRef.current = performance.now();
    pullRef.current = 0;
    armedRef.current = false;
    suppressClickRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    router.prefetch('/fly-catch');
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (pointerRef.current !== event.pointerId || launchingRef.current) return;
    const pull = Math.min(112, Math.max(0, startYRef.current - event.clientY));
    pullRef.current = pull;
    if (pull < 3) return;
    suppressClickRef.current = pull > 10;
    setDragging(true);

    const content = contentRef.current;
    if (content) {
      content.style.transition = 'none';
      content.style.transform = `translate3d(0,${-pull * 0.58}px,0) scale(${1 - pull * 0.00055})`;
      content.style.opacity = String(1 - pull / 360);
    }

    if (pull >= RELEASE_DISTANCE && !armedRef.current) {
      armedRef.current = true;
      hapticTick();
    } else if (pull < RELEASE_DISTANCE && armedRef.current) {
      armedRef.current = false;
    }
  };

  const finishPointer = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    if (pointerRef.current !== event.pointerId) return;
    pointerRef.current = null;
    const elapsed = Math.max(1, performance.now() - startAtRef.current);
    const velocity = pullRef.current / elapsed;
    const shouldLaunch =
      !cancelled &&
      (pullRef.current >= RELEASE_DISTANCE ||
        (pullRef.current >= FAST_RELEASE_DISTANCE && velocity >= 0.65));

    if (shouldLaunch) launch();
    else {
      setDragging(false);
      resetVisuals();
    }
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
      <div ref={contentRef} className="relative will-change-transform">
        {children}
      </div>

      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute bottom-0 left-1/2 z-[65] flex -translate-x-1/2 translate-y-2 items-center gap-1 rounded-full border border-white/50 bg-card/90 px-3 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-primary opacity-0 shadow-md backdrop-blur-md transition-all',
          dragging && '-translate-y-1 scale-105 opacity-100',
          launching && '-translate-y-8 scale-110 opacity-0',
        )}
      >
        <ChevronUp className={cn('h-3.5 w-3.5', dragging && 'animate-bounce')} strokeWidth={3} />
        Release the swarm
      </div>
    </div>
  );
}
