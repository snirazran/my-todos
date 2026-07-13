'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FrogHandle } from '@/components/ui/frog';
import { useFrogTongue, TONGUE_STROKE } from '@/hooks/useFrogTongue';
import { DriftFly, FOCUS_DRIFTS } from '@/components/ui/FocusFlyLayer';

/**
 * Decorative "they're focusing right now" scene for a friend's frog (the
 * friend-detail banner): a couple of flies drift overhead and the frog
 * periodically lunges with its tongue and misses. Pure theater — the friend's
 * real catches happen on their device; here it just sells that they're mid-
 * session. No rewards, no join.
 */
export function FriendFocusScene({
  frogRef,
  frogBoxRef,
  active,
  onGrabActive,
}: {
  frogRef: React.RefObject<FrogHandle | null>;
  frogBoxRef: React.RefObject<HTMLDivElement | null>;
  active: boolean;
  /** Mirrors whether a tongue is in flight, so the host can open the mouth. */
  onGrabActive?: (active: boolean) => void;
}) {
  const flyRefs = useRef<Record<string, HTMLElement | null>>({});
  const [missPos, setMissPos] = useState<{ x: number; y: number } | null>(null);

  const { grab, vp, tonguePathEl, tipGroupEl, triggerTongue } = useFrogTongue({
    frogRef,
    frogBoxRef,
    flyRefs,
    durationMs: 950,
  });

  const grabActive = !!grab;
  useEffect(() => {
    onGrabActive?.(grabActive);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grabActive]);

  // Lunge-and-miss on a short rhythm — the viewer is only peeking for a few
  // seconds, so the first attempt comes quickly.
  useEffect(() => {
    if (!active) return;
    let timer = 0;
    const attempt = () => {
      const keys = ['friend-fly-0', 'friend-fly-1'];
      const key = keys[Math.floor(Math.random() * keys.length)];
      const el = flyRefs.current[key];
      const mouth = frogRef.current?.getMouthPoint();
      if (!el || !mouth) return;
      const rect = el.getBoundingClientRect();
      const fx = rect.left + rect.width / 2;
      const fy = rect.top + rect.height / 2;
      const dx = fx - mouth.x;
      const dy = fy - mouth.y;
      const len = Math.hypot(dx, dy) || 1;
      const overshoot = 40 + Math.random() * 24;
      setMissPos({
        x: fx + (dx / len) * overshoot + (Math.random() * 24 - 12),
        y: fy + (dy / len) * overshoot,
      });
      requestAnimationFrame(() => {
        void triggerTongue({
          key: 'friend-miss',
          completed: false,
          silent: true,
          onPersist: () => setMissPos(null),
        });
      });
    };
    const schedule = (delay: number) => {
      timer = window.setTimeout(() => {
        attempt();
        schedule(10000 + Math.random() * 12000);
      }, delay);
    };
    schedule(2500 + Math.random() * 3000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, triggerTongue]);

  if (!active) return null;

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-6 z-10 h-32"
      >
        {FOCUS_DRIFTS.slice(0, 2).map((drift, i) => (
          <DriftFly
            key={`friend-fly-${i}`}
            drift={drift}
            running
            localClock
            size={30}
            flyRef={(el) => {
              flyRefs.current[`friend-fly-${i}`] = el;
            }}
          />
        ))}
      </div>

      {missPos &&
        createPortal(
          <span
            ref={(el) => {
              flyRefs.current['friend-miss'] = el;
            }}
            aria-hidden
            style={{
              position: 'fixed',
              left: missPos.x,
              top: missPos.y,
              width: 1,
              height: 1,
              pointerEvents: 'none',
            }}
          />,
          document.body,
        )}

      {grab &&
        createPortal(
          <svg
            key={grab.startAt}
            className="pointer-events-none fixed inset-0 z-[1600]"
            width={vp.w}
            height={vp.h}
            viewBox={`0 0 ${vp.w} ${vp.h}`}
            preserveAspectRatio="none"
            style={{ width: vp.w, height: vp.h }}
          >
            <defs>
              <linearGradient id="friend-tongue-grad" x1="0" y1="0" x2="0" y2="1">
                <stop stopColor="#ff6b6b" />
                <stop offset="1" stopColor="#f43f5e" />
              </linearGradient>
            </defs>
            <path
              ref={tonguePathEl}
              d="M0 0 L0 0"
              fill="none"
              stroke="url(#friend-tongue-grad)"
              strokeWidth={TONGUE_STROKE}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            <g ref={tipGroupEl} style={{ visibility: 'hidden' }}>
              <circle r={10} fill="transparent" />
            </g>
          </svg>,
          document.body,
        )}
    </>
  );
}
