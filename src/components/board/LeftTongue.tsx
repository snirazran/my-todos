'use client';

/**
 * LeftTongue — planner-board cousin of the home page's frog tongue.
 *
 * On the home page a tongue shoots from the frog's mouth, grabs a fly and
 * pulls it back to be swallowed (see useFrogTongue). The planner has no frog,
 * so here the tongue instead reaches in from OFF-SCREEN LEFT at the fly's
 * height, snaps onto the fly, then retracts all the way back out the left edge
 * of the screen — carrying the fly off with it.
 *
 * Timing, easing and the tongue's shape come from the same tongueMotion module
 * as the home animation, minus the camera/scroll-follow and frog-mood
 * machinery that the home version needs.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { hapticImpact } from '@/lib/haptics';
import {
  playPop,
  playSlurp,
  playThwip,
  primeCatchSounds,
} from '@/lib/catchSounds';
import {
  TONGUE_EDGE,
  TONGUE_GLOSS,
  extendEase,
  hitPush,
  hitWave,
  impactSquash,
  lightSide,
  retractEase,
  tongueShape,
  tongueTiming,
  type TongueTiming,
} from '@/lib/tongueMotion';

const ORIGIN_PAD = 72; // how far past the left edge the tongue is anchored
const ORIGIN_RISE = 140; // how much higher than the fly the tongue enters
const ARC_LIFT = 56; // upward bow of the tongue's curve
const BULGE_TAIL_MS = 70;
const FLY_PX = 40;
const COOLDOWN_MS = 200;

type Pt = { x: number; y: number };

interface TriggerRequest {
  key: string;
  onPersist: () => unknown;
}

interface LeftTongueCtx {
  /** Register (or clear) the fly element for a task so the tongue can target it. */
  registerFly: (key: string, el: HTMLElement | null) => void;
  /** Start the grab. Returns false if it couldn't run (no fly on screen / busy). */
  triggerTongue: (req: TriggerRequest) => boolean;
  /** True while the given task's fly is mid-grab and should be hidden in its card. */
  isHidden: (key: string) => boolean;
  /** True while a grab is animating (or in its post-grab cooldown). */
  isBusy: () => boolean;
}

const noop: LeftTongueCtx = {
  registerFly: () => {},
  triggerTongue: () => false,
  isHidden: () => false,
  isBusy: () => false,
};

const Ctx = createContext<LeftTongueCtx>(noop);

export const useLeftTongue = () => useContext(Ctx);

interface Grab {
  key: string;
  origin: Pt; // off-screen left
  target: Pt; // the fly
  timing: TongueTiming;
  startAt: number;
  onPersist: () => unknown;
}

const aimFor = (origin: Pt, target: Pt): Pt => ({
  x: (origin.x + target.x) / 2,
  y: target.y - ARC_LIFT,
});

export function LeftTongueProvider({ children }: { children: React.ReactNode }) {
  const flyRefs = useRef<Record<string, HTMLElement | null>>({});
  const busyRef = useRef(false);
  const cooldownUntil = useRef(0);

  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [grab, setGrab] = useState<Grab | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const pathEl = useRef<SVGPathElement | null>(null);
  const glossEl = useRef<SVGPathElement | null>(null);
  const tipEl = useRef<SVGGElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      setVp((prev) => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        return prev.w === w && prev.h === h ? prev : { w, h };
      });
    };
    const onResize = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('resize', onResize);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const registerFly = useCallback((key: string, el: HTMLElement | null) => {
    if (el) flyRefs.current[key] = el;
    else delete flyRefs.current[key];
  }, []);

  const triggerTongue = useCallback(({ key, onPersist }: TriggerRequest) => {
    if (busyRef.current || performance.now() < cooldownUntil.current) return false;

    const flyEl = flyRefs.current[key];
    if (!flyEl) return false;
    const r = flyEl.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;

    const target: Pt = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const origin: Pt = { x: -ORIGIN_PAD, y: target.y - ORIGIN_RISE };
    const distance = Math.hypot(target.x - origin.x, target.y - origin.y);
    const timing = tongueTiming(distance);

    primeCatchSounds();
    playThwip({ duration: timing.extend / 1000, reach: distance / 600 });
    busyRef.current = true;
    setGrab({
      key,
      origin,
      target,
      timing,
      startAt: performance.now(),
      onPersist,
    });
    return true;
  }, []);

  const isHidden = useCallback((key: string) => hidden.has(key), [hidden]);

  const isBusy = useCallback(
    () => busyRef.current || performance.now() < cooldownUntil.current,
    [],
  );

  /* ── RAF loop ──────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!grab) return;

    const p0 = grab.origin;
    const { timing } = grab;
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const bulgeMs = timing.hold + BULGE_TAIL_MS;

    let target = grab.target;
    let aim = aimFor(p0, target);
    const side = lightSide(p0, target);

    const node = pathEl.current;
    const gloss = glossEl.current;
    if (node) {
      node.setAttribute('d', '');
      node.style.visibility = 'visible';
    }

    let hitDone = false;
    let slurpDone = false;
    let raf = 0;

    const tick = () => {
      const t = Math.max(
        0,
        Math.min(1, (performance.now() - grab.startAt) / timing.total),
      );

      if (!hitDone && t <= timing.hitAt) {
        const el = flyRefs.current[grab.key];
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            const nx = r.left + r.width / 2;
            const ny = r.top + r.height / 2;
            if (Math.abs(nx - target.x) > 0.5 || Math.abs(ny - target.y) > 0.5) {
              target = { x: nx, y: ny };
              aim = aimFor(p0, target);
            }
          }
        }
      }

      const sinceHit =
        t > timing.hitAt ? (t - timing.hitAt) * timing.total : -1;
      const retractU =
        t > timing.holdEnd ? (t - timing.holdEnd) / (1 - timing.holdEnd) : 0;

      let forward: number;
      let push = 0;
      if (t <= timing.hitAt) {
        forward = extendEase(t / timing.hitAt);
      } else if (t <= timing.holdEnd) {
        forward = 1;
        if (!reduced) push = hitPush(sinceHit / timing.hold);
      } else {
        forward = 1 - retractEase(retractU);
      }

      if (!slurpDone && t > timing.holdEnd) {
        slurpDone = true;
        playSlurp(timing.retract / 1000);
      }

      const wave = reduced
        ? 0
        : hitWave(sinceHit, Math.hypot(target.x - p0.x, target.y - p0.y));
      const bulge =
        !reduced && sinceHit >= 0 && sinceHit < bulgeMs
          ? Math.sin((Math.PI * sinceHit) / bulgeMs)
          : 0;

      const shape = tongueShape(p0, aim, target, forward, {
        bulge,
        push,
        wave,
        side,
      });

      if (node) node.setAttribute('d', shape.body);
      if (gloss) {
        gloss.setAttribute('d', shape.gloss);
        gloss.setAttribute('stroke-width', `${shape.glossWidth}`);
      }

      if (tipEl.current) {
        let rot = 0;
        let squashX = 1;
        let squashY = 1;
        if (!reduced && sinceHit >= 0) {
          const squash = impactSquash(sinceHit);
          squashX = 1 - 0.24 * squash;
          squashY = 1 + 0.2 * squash;
          if (retractU > 0) {
            rot = Math.sin(retractU * Math.PI * 2.5) * 16 * (1 - retractU);
          }
        }
        const heading = (Math.atan2(shape.dir.y, shape.dir.x) * 180) / Math.PI;
        tipEl.current.setAttribute(
          'transform',
          `translate(${shape.tip.x}, ${shape.tip.y}) rotate(${rot}) rotate(${heading}) scale(${squashX}, ${squashY}) rotate(${-heading}) scale(${
            1 + 0.12 * bulge
          })`,
        );
      }

      // Hand-off: at impact, hide the real fly in the card and reveal the
      // tongue's fly so it rides back out with the retracting tip.
      if (!hitDone && t >= timing.hitAt) {
        hitDone = true;
        hapticImpact();
        playPop();
        setHidden((prev) => new Set(prev).add(grab.key));
        if (tipEl.current) tipEl.current.style.visibility = 'visible';
      }

      if (t < 1) {
        raf = requestAnimationFrame(tick);
        return;
      }

      // Done — clean up visuals, persist, then clear hidden state.
      if (tipEl.current) tipEl.current.style.visibility = 'hidden';
      if (node) {
        node.setAttribute('d', '');
        node.style.visibility = 'hidden';
      }
      gloss?.setAttribute('d', '');

      void Promise.resolve(grab.onPersist())
        .catch((e) => console.error('LeftTongue persist failed', e))
        .finally(() => {
          setHidden((prev) => {
            const s = new Set(prev);
            s.delete(grab.key);
            return s;
          });
          cooldownUntil.current = performance.now() + COOLDOWN_MS;
          busyRef.current = false;
          setGrab(null);
        });
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (tipEl.current) tipEl.current.style.visibility = 'hidden';
      if (node) {
        node.setAttribute('d', '');
        node.style.visibility = 'hidden';
      }
      gloss?.setAttribute('d', '');
    };
  }, [grab]);

  return (
    <Ctx.Provider value={{ registerFly, triggerTongue, isHidden, isBusy }}>
      {children}
      {grab && (
        <svg
          key={grab.startAt}
          className="fixed inset-0 z-[60] pointer-events-none"
          width={vp.w}
          height={vp.h}
          viewBox={`0 0 ${vp.w} ${vp.h}`}
          preserveAspectRatio="none"
          style={{ width: vp.w, height: vp.h }}
        >
          <defs>
            <linearGradient id="left-tongue-grad" x1="0" y1="0" x2="1" y2="0">
              <stop stopColor="#f43f5e" />
              <stop offset="1" stopColor="#ff6b6b" />
            </linearGradient>
          </defs>

          <path
            ref={pathEl}
            d=""
            fill="url(#left-tongue-grad)"
            stroke={TONGUE_EDGE}
            strokeWidth={1}
            strokeLinejoin="round"
          />
          <path
            ref={glossEl}
            d=""
            fill="none"
            stroke={TONGUE_GLOSS}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <g ref={tipEl} style={{ visibility: 'hidden' }}>
            <circle r={10} fill="transparent" />
            <image
              href="/fly.svg"
              x={-FLY_PX / 2}
              y={-FLY_PX / 2}
              width={FLY_PX}
              height={FLY_PX}
            />
          </g>
        </svg>
      )}
    </Ctx.Provider>
  );
}
