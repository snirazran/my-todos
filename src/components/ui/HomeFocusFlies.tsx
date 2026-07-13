'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FrogHandle } from '@/components/ui/frog';
import type { TongueRequest } from '@/hooks/useFrogTongue';
import { DriftFly, FOCUS_DRIFTS } from '@/components/ui/FocusFlyLayer';
import { entrySideFor } from '@/components/ui/FocusScene';
import { useFrogodoroStore } from '@/lib/frogodoroStore';
import { fliesCaughtFor, sceneFlyCount } from '@/lib/focusFlies';
import { onFocusHunt } from '@/lib/focusHuntBus';
import { markFlyEarn } from '@/lib/flyEarn';
import { mutateInventoryCaches } from '@/hooks/useInventory';

export const HOME_FOCUS_FLY_PREFIX = 'home-focus-fly-';
const MISS_KEY = 'home-focus-miss';
const BAND_H = 176;

function visibleRatio(rect: DOMRect): number {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0));
  const h = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
  const area = rect.width * rect.height;
  return area > 0 ? (w * h) / area : 0;
}

/**
 * Live focus-session presence on the home hero, mirroring the timer sheet's
 * FocusScene exactly: same drift choreography (shared FOCUS_DRIFTS), same
 * swarm size, flies freeze in place on pause, and — while the Frogodoro sheet
 * is open — every hunt event the sheet's scene broadcasts (miss lunges and
 * real catches) replays here on the same fly index in the same frame, through
 * the page's task tongue (one shared tongue per frog, so task grabs and focus
 * grabs can never overlap).
 *
 * These flies ignore the global slide/sheet Rive pause — this layer and the
 * premium companion are the only deliberate exemptions.
 */
export function HomeFocusFlies({
  frogRef,
  frogBoxRef,
  flyRefs,
  triggerTongue,
  visuallyDone,
  tongueEnabled = false,
  onSpeech,
  hidden = false,
}: {
  frogRef: React.RefObject<FrogHandle | null>;
  frogBoxRef?: React.RefObject<HTMLDivElement | null>;
  /** The page tongue's shared fly-ref map — this layer registers into it. */
  flyRefs?: React.MutableRefObject<Record<string, HTMLElement | null>>;
  triggerTongue?: (req: TongueRequest) => Promise<void>;
  visuallyDone?: Set<string>;
  /** Frogodoro sheet is open — hunt events mirror through the real tongue. */
  tongueEnabled?: boolean;
  /** Receives the shared catch line so this surface's bubble matches. */
  onSpeech?: (line: string) => void;
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

  // Root anchor: the band tracks the FROG's live viewport geometry (via its
  // handle), portaled to <body>. Each page wraps its frog in a different
  // container (full-width hero, bare frog box…), so anchoring to the frog
  // itself is the only placement that renders identically everywhere.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = bandRef.current;
      const box = frogRef.current?.getBoxRect?.();
      const mouth = frogRef.current?.getMouthPoint?.();
      if (el && box && mouth && box.width > 0) {
        const bandW = Math.min(470, window.innerWidth * 0.92);
        const left = box.left + box.width / 2 - bandW / 2;
        const top = mouth.y - BAND_H + 42;
        el.style.width = `${bandW}px`;
        el.style.transform = `translate(${left}px, ${top}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [frogRef]);

  const sessionOnFocus = timerActive && phase === 'focus';
  const running = sessionOnFocus && isRunning;
  const phaseFull = Math.max(1, Math.round(settings.focusDuration * 60));
  const liveElapsed = Math.max(0, phaseFull - timeLeft);
  const focusLive =
    sessionStats.focusTime +
    (phase === 'focus' ? Math.max(0, liveElapsed - phaseElapsed) : 0);
  const caught = fliesCaughtFor(focusLive);
  const flyCount = sceneFlyCount(phaseFull);

  const stateRef = useRef({ tongueEnabled, hidden, running });
  stateRef.current = { tongueEnabled, hidden, running };

  const frogVisibleEnough = () => {
    const rect = frogBoxRef?.current?.getBoundingClientRect();
    // Stricter than the tongue hook's 0.75 cinematic threshold, so a
    // background grab can never trigger the camera scroll behind the sheet.
    return rect ? visibleRatio(rect) >= 0.85 : false;
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

  // Economy bookkeeping on every real catch (regardless of visuals): the
  // server credits the fly on the next progress flush (≤60s away), so open
  // the earn window and nudge the balance caches so the standard
  // currency-gain animation fires as soon as the credit lands. When the
  // sheet is closed the tongue can't mirror, so a love emote reacts instead.
  const prevCaughtRef = useRef(caught);
  useEffect(() => {
    if (caught > prevCaughtRef.current && running) {
      markFlyEarn(120_000);
      mutateInventoryCaches();
      const t1 = window.setTimeout(mutateInventoryCaches, 20_000);
      const t2 = window.setTimeout(mutateInventoryCaches, 70_000);
      if (!tongueEnabled && !hidden) {
        frogRef.current?.fireEmote('love');
      }
      prevCaughtRef.current = caught;
      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
      };
    }
    prevCaughtRef.current = caught;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caught, running, hidden]);

  // Mirror the sheet scene's hunt: same fly index, same overshoot, same frame.
  useEffect(() => {
    if (!triggerTongue || !flyRefs) return;
    return onFocusHunt((event) => {
      const { tongueEnabled: enabled, hidden: isHidden, running: isLive } =
        stateRef.current;
      if (!enabled || isHidden || !isLive || !frogVisibleEnough()) return;
      const key = `${HOME_FOCUS_FLY_PREFIX}${event.flyIndex}`;
      const el = flyRefs.current[key];
      if (!el) return;

      if (event.type === 'catch') {
        onSpeech?.(event.line);
        void triggerTongue({
          key,
          completed: false,
          onPersist: () => eatAndRespawn(key),
        });
        return;
      }

      const mouth = frogRef.current?.getMouthPoint();
      if (!mouth) return;
      const rect = el.getBoundingClientRect();
      const fx = rect.left + rect.width / 2;
      const fy = rect.top + rect.height / 2;
      const dx = fx - mouth.x;
      const dy = fy - mouth.y;
      const len = Math.hypot(dx, dy) || 1;
      setMissPos({
        x: fx + (dx / len) * event.overshoot + event.jitterX,
        y: fy + (dy / len) * event.overshoot,
      });
      requestAnimationFrame(() => {
        void triggerTongue({
          key: MISS_KEY,
          completed: false,
          silent: true,
          onPersist: () => setMissPos(null),
        });
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerTongue, flyRefs]);

  if (!sessionOnFocus) return null;

  return (
    <>
      {/* `hidden` only hides visually — unmounting would replay the fly
          entry and lose the shared drift phase on every panel open/close.
          The band is fixed + body-portaled and follows the frog each frame,
          so placement is frog-relative on every page. */}
      {createPortal(
        <div
          ref={bandRef}
          aria-hidden
          className="pointer-events-none fixed left-0 top-0 z-30 h-44"
          style={{ visibility: hidden ? 'hidden' : 'visible' }}
        >
          {FOCUS_DRIFTS.slice(0, flyCount).map((drift, i) => {
            const key = `${HOME_FOCUS_FLY_PREFIX}${i}`;
            const isHidden = eaten.has(key) || (visuallyDone?.has(key) ?? false);
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
                  if (flyRefs) flyRefs.current[key] = el;
                }}
              />
            );
          })}
        </div>,
        document.body,
      )}

      {/* Invisible aim point for missed grabs — just past the fly, away from
          the frog */}
      {missPos &&
        createPortal(
          <span
            ref={(el) => {
              if (flyRefs) flyRefs.current[MISS_KEY] = el;
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
    </>
  );
}
