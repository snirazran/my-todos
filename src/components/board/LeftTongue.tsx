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
 * Mechanically it's the same trick as the home animation (a quadratic SVG path
 * whose visible length is driven by stroke-dasharray every frame, with a
 * fly-image "tip" riding the leading edge), minus the camera/scroll-follow and
 * frog-mood machinery that the home version needs.
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
import { playPop, playThwip, primeCatchSounds } from '@/lib/catchSounds';

const DURATION_MS = 850; // full extend + retract
const HIT_AT = 0.42; // fraction of the run where the tongue reaches the fly
const HOLD_END = 0.5; // short hit-stop: the tongue sticks to the fly briefly
const EXTEND_EASE = (x: number) => 1 - Math.pow(1 - x, 4);
const RETRACT_EASE = (x: number) => x * x * (3 - 2 * x);
const ORIGIN_PAD = 72; // how far past the left edge the tongue is anchored
const ORIGIN_RISE = 140; // how much higher than the fly the tongue enters
const ARC_LIFT = 56; // upward bow of the tongue's curve
const STROKE = 8;
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
  control: Pt; // quadratic control point
  target: Pt; // the fly
  startAt: number;
  onPersist: () => unknown;
}

export function LeftTongueProvider({ children }: { children: React.ReactNode }) {
  const flyRefs = useRef<Record<string, HTMLElement | null>>({});
  const busyRef = useRef(false);
  const cooldownUntil = useRef(0);

  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [grab, setGrab] = useState<Grab | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const pathEl = useRef<SVGPathElement | null>(null);
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
    const control: Pt = {
      x: (origin.x + target.x) / 2,
      y: target.y - ARC_LIFT,
    };

    primeCatchSounds();
    playThwip();
    busyRef.current = true;
    setGrab({
      key,
      origin,
      control,
      target,
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

    // Temp path used purely for getPointAtLength sampling.
    const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'path');

    const applyTarget = (target: Pt) => {
      const control: Pt = {
        x: (p0.x + target.x) / 2,
        y: target.y - ARC_LIFT,
      };
      const d = `M ${p0.x} ${p0.y} Q ${control.x} ${control.y} ${target.x} ${target.y}`;
      tmp.setAttribute('d', d);
      return { d, total: tmp.getTotalLength() };
    };

    let target = grab.target;
    let { d, total } = applyTarget(target);

    const node = pathEl.current;
    if (node) {
      node.setAttribute('d', d);
      node.style.visibility = 'visible';
      node.style.strokeDasharray = `0 ${total}`;
      node.style.strokeDashoffset = '0';
    }

    let hitDone = false;
    let raf = 0;

    const tick = () => {
      const t = Math.max(0, Math.min(1, (performance.now() - grab.startAt) / DURATION_MS));

      if (!hitDone && t <= HIT_AT) {
        const el = flyRefs.current[grab.key];
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            const nx = r.left + r.width / 2;
            const ny = r.top + r.height / 2;
            if (Math.abs(nx - target.x) > 0.5 || Math.abs(ny - target.y) > 0.5) {
              target = { x: nx, y: ny };
              ({ d, total } = applyTarget(target));
              if (node) node.setAttribute('d', d);
            }
          }
        }
      }

      let forward: number;
      if (t <= HIT_AT) forward = EXTEND_EASE(t / HIT_AT);
      else if (t <= HOLD_END) forward = 1;
      else forward = 1 - RETRACT_EASE((t - HOLD_END) / (1 - HOLD_END));
      const len = total * forward;

      if (node) node.style.strokeDasharray = `${len} ${total}`;

      const pt = tmp.getPointAtLength(len);
      if (tipEl.current) {
        tipEl.current.setAttribute('transform', `translate(${pt.x}, ${pt.y})`);
      }

      // Hand-off: at impact, hide the real fly in the card and reveal the
      // tongue's fly so it rides back out with the retracting tip.
      if (!hitDone && t >= HIT_AT) {
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
        node.style.strokeDasharray = `0 ${total}`;
        node.style.visibility = 'hidden';
      }

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
        node.style.strokeDasharray = `0 ${total}`;
        node.style.visibility = 'hidden';
      }
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
            d="M0 0 L0 0"
            fill="none"
            stroke="url(#left-tongue-grad)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
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
