'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FrogHandle } from '@/components/ui/frog';
import type { TongueRequest } from '@/hooks/useFrogTongue';
import { useFrogTongue, TONGUE_STROKE } from '@/hooks/useFrogTongue';
import { DriftFly, FOCUS_DRIFTS } from '@/components/ui/FocusFlyLayer';
import { entrySideFor } from '@/components/ui/FocusScene';
import { useFrogodoroStore } from '@/lib/frogodoroStore';
import { fliesCaughtFor, sceneFlyCount } from '@/lib/focusFlies';

export const HOME_FOCUS_FLY_PREFIX = 'home-focus-fly-';
const MISS_KEY = 'home-focus-miss';
const BAND_H = 176;
const FLY_PX = 34;

function visibleRatio(rect: DOMRect): number {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0));
  const h = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
  const area = rect.width * rect.height;
  return area > 0 ? (w * h) / area : 0;
}

/**
 * Live focus-session presence around a page's own frog (home hero, wardrobe,
 * friends), matching the timer sheet's scene: same drift choreography, same
 * swarm size, flies freeze in place on pause.
 *
 * While the Frogodoro sheet is open this layer is fully suppressed — the
 * sheet's own scene is the one on screen, so animating a copy behind the
 * backdrop only burns frames. Positions never diverge: the shared drift
 * clock is absolute (elapsed % duration), so when the sheet closes the flies
 * reappear exactly where the sheet's scene showed them. When the sheet is
 * closed, this layer runs its own miss/catch lunges through the page tongue
 * (home) or an internal tongue instance (wardrobe/friends).
 *
 * The fly band is positioned INSIDE the page's frog container (measured once
 * against the frog's live geometry, like the premium companion fly) so it
 * scrolls natively with the content — a fixed, per-frame-tracked band
 * flickers under mobile scrolling.
 */
export function HomeFocusFlies({
  frogRef,
  frogBoxRef,
  flyRefs,
  triggerTongue,
  visuallyDone,
  sheetOpen = false,
  onGrabActive,
  hidden = false,
}: {
  frogRef: React.RefObject<FrogHandle | null>;
  frogBoxRef?: React.RefObject<HTMLDivElement | null>;
  /** The page tongue's shared fly-ref map — provided on home, absent on
   *  wardrobe/friends (an internal tongue instance takes over there). */
  flyRefs?: React.MutableRefObject<Record<string, HTMLElement | null>>;
  triggerTongue?: (req: TongueRequest) => Promise<void>;
  visuallyDone?: Set<string>;
  /** Frogodoro sheet is open — its scene owns the show; suppress this layer. */
  sheetOpen?: boolean;
  /** Mirrors whether the internal tongue is in flight (host opens the mouth). */
  onGrabActive?: (active: boolean) => void;
  /** Visually suppressed (task-grab cinematic, other panel) — the catch
   *  bookkeeping keeps running so no fly-gain celebration is lost. */
  hidden?: boolean;
}) {
  const { timerActive, isRunning, phase, sessionStats, timeLeft, settings, phaseElapsed } =
    useFrogodoroStore();
  const [eaten, setEaten] = useState<Set<string>>(new Set());
  const [respawn, setRespawn] = useState<Record<string, number>>({});
  const [missPos, setMissPos] = useState<{ x: number; y: number } | null>(null);
  const bandRef = useRef<HTMLDivElement | null>(null);

  const internalFlyRefs = useRef<Record<string, HTMLElement | null>>({});
  const ownTongue = useFrogTongue({
    frogRef,
    frogBoxRef,
    flyRefs: internalFlyRefs,
    durationMs: 950,
  });
  const usingOwnTongue = !triggerTongue;
  const effTrigger = triggerTongue ?? ownTongue.triggerTongue;
  const effFlyRefs = flyRefs ?? internalFlyRefs;
  const effVisuallyDone = visuallyDone ?? ownTongue.visuallyDone;

  const ownGrabActive = usingOwnTongue && !!ownTongue.grab;
  useEffect(() => {
    if (usingOwnTongue) onGrabActive?.(ownGrabActive);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownGrabActive, usingOwnTongue]);

  const sessionOnFocus = timerActive && phase === 'focus';
  const running = sessionOnFocus && isRunning;
  const phaseFull = Math.max(1, Math.round(settings.focusDuration * 60));
  const liveElapsed = Math.max(0, phaseFull - timeLeft);
  const focusLive =
    sessionStats.focusTime +
    (phase === 'focus' ? Math.max(0, liveElapsed - phaseElapsed) : 0);
  const caught = fliesCaughtFor(focusLive);
  const flyCount = sceneFlyCount(phaseFull);
  const suppressed = hidden || sheetOpen;

  // Positioned inside the frog container, measured against the frog's live
  // geometry — no per-frame viewport tracking, so scrolling can't flicker it.
  useEffect(() => {
    let raf = 0;
    let tries = 0;
    const measure = () => {
      const el = bandRef.current;
      const host = el?.offsetParent as HTMLElement | null;
      const box = frogRef.current?.getBoxRect?.();
      const mouth = frogRef.current?.getMouthPoint?.();
      if (!el || !host || !box || !mouth || box.width === 0) {
        if (tries++ < 30) raf = requestAnimationFrame(measure);
        return;
      }
      const hostRect = host.getBoundingClientRect();
      const bandW = Math.min(470, window.innerWidth * 0.92);
      el.style.width = `${bandW}px`;
      el.style.left = `${box.left + box.width / 2 - hostRect.left - bandW / 2}px`;
      el.style.top = `${mouth.y - hostRect.top - BAND_H + 8}px`;
    };
    measure();
    const onResize = () => {
      tries = 0;
      measure();
    };
    window.addEventListener('resize', onResize);
    const interval = window.setInterval(measure, 2500);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.clearInterval(interval);
    };
  }, [frogRef, sessionOnFocus]);

  const frogVisibleEnough = () => {
    const rect =
      frogBoxRef?.current?.getBoundingClientRect() ??
      frogRef.current?.getBoxRect?.();
    // Stricter than the tongue hook's 0.75 cinematic threshold, so a grab
    // from this layer can never trigger the camera scroll.
    return rect ? visibleRatio(rect as DOMRect) >= 0.85 : false;
  };

  const pickLiveFly = () => {
    for (let i = 0; i < flyCount; i++) {
      const k = `${HOME_FOCUS_FLY_PREFIX}${i}`;
      if (!eaten.has(k) && effFlyRefs.current[k]) return k;
    }
    return null;
  };

  const eatAndRespawn = (key: string) => {
    setEaten((prev) => new Set(prev).add(key));
    window.setTimeout(() => {
      setRespawn((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
      setEaten((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, 4000);
  };

  // Catch visuals when the sheet is closed (the bus mirror owns them when
  // it's open; the wallet/economy side lives app-wide in GlobalTimer): lunge
  // at the fly, or fall back to a love emote if the frog isn't in view.
  const prevCaughtRef = useRef(caught);
  useEffect(() => {
    if (caught > prevCaughtRef.current && running && !suppressed) {
      const key = pickLiveFly();
      if (key && frogVisibleEnough()) {
        void effTrigger({
          key,
          completed: false,
          onPersist: () => eatAndRespawn(key),
        });
      } else {
        frogRef.current?.fireEmote('love');
      }
    }
    prevCaughtRef.current = caught;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caught, running, suppressed]);

  const lungeMiss = (overshoot: number, jitterX: number, flyIndex?: number): boolean => {
    const key =
      flyIndex !== undefined ? `${HOME_FOCUS_FLY_PREFIX}${flyIndex}` : pickLiveFly();
    const el = key ? effFlyRefs.current[key] : null;
    const mouth = frogRef.current?.getMouthPoint();
    if (!el || !mouth || !frogVisibleEnough()) return false;
    const rect = el.getBoundingClientRect();
    const fx = rect.left + rect.width / 2;
    const fy = rect.top + rect.height / 2;
    const dx = fx - mouth.x;
    const dy = fy - mouth.y;
    const len = Math.hypot(dx, dy) || 1;
    setMissPos({
      x: fx + (dx / len) * overshoot + jitterX,
      y: fy + (dy / len) * overshoot,
    });
    requestAnimationFrame(() => {
      void effTrigger({
        key: MISS_KEY,
        completed: false,
        silent: true,
        onPersist: () => setMissPos(null),
      });
    });
    return true;
  };

  // Sheet closed: this layer is its own conductor for misses — same rhythm
  // as the sheet scene (first lunge early, then a loose 45–90s beat). A
  // skipped attempt (frog scrolled out of view, fly mid-respawn) retries in
  // seconds instead of waiting out the full interval, so the cadence FEELS
  // the same as the popup's.
  useEffect(() => {
    if (!running || suppressed) return;
    let timer = 0;
    const schedule = (delay: number) => {
      timer = window.setTimeout(() => {
        const fired = lungeMiss(44 + Math.random() * 26, Math.random() * 28 - 14);
        schedule(fired ? 45000 + Math.random() * 45000 : 8000 + Math.random() * 7000);
      }, delay);
    };
    schedule(9000 + Math.random() * 5000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, suppressed]);

  if (!sessionOnFocus) return null;

  return (
    <>
      {/* Suppression only hides — unmounting would drop the eaten/respawn
          state on every panel open/close. Hidden DriftFlies stop their rAF
          and canvas playback, and re-derive their position from the shared
          drift clock the moment they're shown again. */}
      <div
        ref={bandRef}
        aria-hidden
        data-fly-fade
        className="pointer-events-none absolute z-30"
        style={{
          height: BAND_H,
          visibility: suppressed ? 'hidden' : 'visible',
        }}
      >
        {FOCUS_DRIFTS.slice(0, flyCount).map((drift, i) => {
          const key = `${HOME_FOCUS_FLY_PREFIX}${i}`;
          const isHidden =
            suppressed || eaten.has(key) || effVisuallyDone.has(key);
          const epoch = respawn[key] ?? 0;
          return (
            <DriftFly
              key={`${key}-${epoch}`}
              drift={drift}
              running={running}
              hidden={isHidden}
              size={38}
              entryFromX={entrySideFor(drift)}
              forceEntry={epoch > 0}
              flyRef={(el) => {
                effFlyRefs.current[key] = el;
              }}
            />
          );
        })}
      </div>

      {/* Invisible aim point for missed grabs — just past the fly, away from
          the frog */}
      {missPos &&
        createPortal(
          <span
            ref={(el) => {
              effFlyRefs.current[MISS_KEY] = el;
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

      {/* Internal tongue overlay — pages without their own tongue (wardrobe,
          friends). Empty tip on silent misses. */}
      {usingOwnTongue &&
        ownTongue.grab &&
        createPortal(
          <svg
            key={ownTongue.grab.startAt}
            className="pointer-events-none fixed inset-0 z-40"
            width={ownTongue.vp.w}
            height={ownTongue.vp.h}
            viewBox={`0 0 ${ownTongue.vp.w} ${ownTongue.vp.h}`}
            preserveAspectRatio="none"
            style={{ width: ownTongue.vp.w, height: ownTongue.vp.h }}
          >
            <defs>
              <linearGradient id="home-focus-tongue-grad" x1="0" y1="0" x2="0" y2="1">
                <stop stopColor="#ff6b6b" />
                <stop offset="1" stopColor="#f43f5e" />
              </linearGradient>
            </defs>
            <g ref={ownTongue.worldGroupEl}>
              <path
                ref={ownTongue.tonguePathEl}
                d="M0 0 L0 0"
                fill="none"
                stroke="url(#home-focus-tongue-grad)"
                strokeWidth={TONGUE_STROKE}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              <g ref={ownTongue.fxGroupEl} />
              <g ref={ownTongue.tipGroupEl} style={{ visibility: 'hidden' }}>
                <circle r={10} fill="transparent" />
                {!ownTongue.grab.silent && (
                  <image
                    href="/fly.svg"
                    x={-FLY_PX / 2}
                    y={-FLY_PX / 2}
                    width={FLY_PX}
                    height={FLY_PX}
                  />
                )}
              </g>
            </g>
          </svg>,
          document.body,
        )}
    </>
  );
}
