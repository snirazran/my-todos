'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FrogHandle } from '@/components/ui/frog';
import { hapticImpact } from '@/lib/haptics';
import {
  playComboChime,
  playGulp,
  playPop,
  playThwip,
  primeCatchSounds,
} from '@/lib/catchSounds';

export const TONGUE_MS = 1111;
export const OFFSET_MS = 160;
const CHAIN_OFFSET_MS = 70;
const PRE_PAN_MS = 600;
const PRE_LINGER_MS = 180;
const CAM_START_DELAY = 140;
const ORIGIN_Y_ADJ = -5;
export const TONGUE_STROKE = 8;
export const HIT_AT = 0.42;
const HOLD_END = 0.5;
const LUT_N = 96;
const COMBO_WINDOW_MS = 8000;
const COMBO_SPEED = [1, 0.85, 0.74, 0.66];
const COMBO_MAX = 7;
const QUEUE_SPEED = 1.45;
const FLINCH_AT = 0.24;
const BITS_COLORS = ['#fb7185', '#86efac', '#fde68a', '#7dd3fc'];
const GOLDEN_CHANCE = 0.05;
const SVG_NS = 'http://www.w3.org/2000/svg';

const FOLLOW_EASE = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const EXTEND_EASE = (x: number) => 1 - Math.pow(1 - x, 4);
const RETRACT_EASE = (x: number) => x * x * (3 - 2 * x);

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export type TongueKey = string;

export interface TongueRequest {
  key: TongueKey;
  completed: boolean;
  /** Skip the love emote at the end (a grab that comes back empty). */
  silent?: boolean;
  /** Allow this grab to roll a rare golden catch. */
  allowGolden?: boolean;
  /** When the tongue is busy, line this catch up instead of dropping it. */
  queueIfBusy?: boolean;
  onPersist: () => Promise<void> | void;
}

export interface UseFrogTongueOptions {
  frogRef: React.RefObject<FrogHandle | null>;
  frogBoxRef?: React.RefObject<HTMLDivElement | null>;
  flyRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  trackMovingTarget?: boolean;
  /** Allow the tongue animation to pan the page when frog/target is offscreen. */
  allowCameraFollow?: boolean;
  durationMs?: number;
  originYOffset?: number;
  keepTargetHiddenUntilPersist?: boolean;
}

interface Geom {
  d: string;
  total: number;
  pts: Float32Array;
  p1: { x: number; y: number };
  p2: { x: number; y: number };
}

export function useFrogTongue({
  frogRef,
  frogBoxRef,
  flyRefs,
  scrollContainerRef,
  trackMovingTarget = false,
  allowCameraFollow = true,
  durationMs = TONGUE_MS,
  originYOffset = ORIGIN_Y_ADJ,
  keepTargetHiddenUntilPersist = false,
}: UseFrogTongueOptions) {
  const cooldownUntil = useRef(0);
  const animatingRef = useRef(false);
  const speedRef = useRef(1);
  const timeOffsetRef = useRef(0);
  const lastTickRef = useRef(0);
  const comboRef = useRef(0);
  const lastCatchEndRef = useRef(-Infinity);
  const busyRef = useRef(false);
  const queueRef = useRef<TongueRequest[]>([]);
  const startRef = useRef<(req: TongueRequest, chained: boolean) => Promise<void>>(
    async () => {},
  );
  const [cinematic, setCinematic] = useState(false);

  const [grab, setGrab] = useState<{
    key: string;
    completed: boolean;
    silent?: boolean;
    golden: boolean;
    combo: number;
    reduced: boolean;
    duration: number;
    originDoc: { x: number; y: number };
    targetDoc: { x: number; y: number };
    startAt: number;
    camStartAt: number;
    follow: boolean;
    frogFocusY: number;
    flyFocusY: number;
    onPersist: () => Promise<void> | void;
  } | null>(null);

  /* Direct-DOM refs — the RAF loop drives these without React re-renders.
   * worldGroupEl wraps the tongue in DOC coordinates: per frame only its
   * translate changes, so the path geometry is never re-parsed for scroll. */
  const tipGroupEl = useRef<SVGGElement | null>(null);
  const worldGroupEl = useRef<SVGGElement | null>(null);
  const fxGroupEl = useRef<SVGGElement | null>(null);
  const tonguePathEl = useRef<SVGPathElement | null>(null);

  const [vp, setVp] = useState({ w: 0, h: 0 });

  const runRef = useRef<{
    geom: Geom;
    hidImpact: boolean;
    thwipDone: boolean;
    flinched: boolean;
    raf: number;
  } | null>(null);

  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      if (animatingRef.current) return;
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

  /* ── Scroll-container helpers ──
   * "Doc" coords = position within the scrollable content.
   *   docY = viewportY - containerTop + scrollTop
   * To convert back:
   *   viewportY = docY - scrollTop + containerTop
   * So the offset to subtract is: scrollTop - containerTop
   *
   * When no container is provided (fallback), these reduce to the
   * original window-based behaviour.
   */

  const getSC = () => scrollContainerRef?.current ?? null;

  const getMouthDoc = useCallback(() => {
    const p = frogRef.current?.getMouthPoint() ?? { x: 0, y: 0 };
    const sc = getSC();
    if (sc) {
      return {
        x: p.x,
        y: p.y - sc.getBoundingClientRect().top + sc.scrollTop + originYOffset,
      };
    }
    const offX = window.pageXOffset || document.documentElement.scrollLeft;
    const offY = window.pageYOffset || document.documentElement.scrollTop;
    return { x: p.x + offX, y: p.y + offY + originYOffset };
  }, [frogRef, originYOffset]);

  const getFlyDoc = useCallback((el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const sc = getSC();
    if (sc) {
      return {
        x: r.left + r.width / 2,
        y: r.top + r.height / 2 - sc.getBoundingClientRect().top + sc.scrollTop,
      };
    }
    const offX = window.pageXOffset || document.documentElement.scrollLeft;
    const offY = window.pageYOffset || document.documentElement.scrollTop;
    return { x: r.left + r.width / 2 + offX, y: r.top + r.height / 2 + offY };
  }, []);

  const visibleRatio = (r: DOMRect) => {
    const sc = getSC();
    let vL: number, vT: number, vR: number, vB: number;
    if (sc) {
      const cr = sc.getBoundingClientRect();
      vL = cr.left; vT = cr.top; vR = cr.right; vB = cr.bottom;
    } else {
      vL = 0; vT = 0; vR = window.innerWidth; vB = window.innerHeight;
    }
    const xOverlap = Math.max(0, Math.min(r.right, vR) - Math.max(r.left, vL));
    const yOverlap = Math.max(0, Math.min(r.bottom, vB) - Math.max(r.top, vT));
    const visArea = xOverlap * yOverlap;
    const totalArea = Math.max(1, r.width * r.height);
    return visArea / totalArea;
  };

  const [visuallyDone, setVisuallyDone] = useState<Set<string>>(new Set());

  const setQueuedMark = (key: string, on: boolean) => {
    const el = flyRefs.current[key];
    if (!el) return;
    if (on) el.dataset.tongueQueued = '';
    else delete el.dataset.tongueQueued;
  };

  const drainNext = useCallback(async () => {
    const next = queueRef.current.shift();
    if (next) {
      await startRef.current(next, true);
      return;
    }
    busyRef.current = false;
  }, []);

  const startGrab = async (
    {
      key,
      completed,
      silent = false,
      allowGolden = false,
      onPersist,
    }: TongueRequest,
    chained: boolean,
  ) => {
    busyRef.current = true;
    setQueuedMark(key, false);

    const flyEl = flyRefs.current[key];
    if (!flyEl || !flyEl.isConnected) {
      await Promise.resolve(onPersist()).catch((error) => {
        console.error('Failed to persist tongue action', error);
      });
      if (chained) {
        await drainNext();
      } else {
        busyRef.current = false;
        void drainNext();
      }
      return;
    }

    if (!silent) primeCatchSounds();

    const reduced = prefersReducedMotion();
    let combo = 0;
    if (!silent) {
      combo =
        chained || performance.now() - lastCatchEndRef.current < COMBO_WINDOW_MS
          ? Math.min(comboRef.current + 1, COMBO_MAX)
          : 0;
      comboRef.current = combo;
    }
    const golden = allowGolden && !silent && Math.random() < GOLDEN_CHANCE;
    const duration =
      durationMs * COMBO_SPEED[Math.min(combo, COMBO_SPEED.length - 1)];

    const sc = getSC();
    const vh = sc ? sc.clientHeight : window.innerHeight;

    const originDoc0 = getMouthDoc();
    const targetDoc0 = getFlyDoc(flyEl);

    let frogFocusY = Math.max(0, originDoc0.y - vh * 0.35);
    let flyFocusY = Math.max(0, targetDoc0.y - vh * 0.45);

    const flyR = flyEl.getBoundingClientRect();
    const frogR = frogBoxRef?.current?.getBoundingClientRect();
    const frogRatio = frogR ? visibleRatio(frogR) : 0;

    let flyVisible: boolean;
    if (sc) {
      const cr = sc.getBoundingClientRect();
      flyVisible =
        flyR.top < cr.bottom && flyR.bottom > cr.top &&
        flyR.left < cr.right && flyR.right > cr.left;
    } else {
      flyVisible =
        flyR.top < window.innerHeight && flyR.bottom > 0 &&
        flyR.left < window.innerWidth && flyR.right > 0;
    }

    const needCine = allowCameraFollow && (frogRatio < 0.75 || !flyVisible);
    speedRef.current = queueRef.current.length > 0 ? QUEUE_SPEED : 1;
    setCinematic(true);

    if (needCine) {
      if (reduced) {
        if (sc) sc.scrollTop = flyFocusY;
        else window.scrollTo(0, flyFocusY);
      } else {
        await animateScrollTo(frogFocusY, PRE_PAN_MS, speedRef, sc);
        await new Promise((r) =>
          setTimeout(r, PRE_LINGER_MS / speedRef.current),
        );
      }
    }

    const originDoc = getMouthDoc();
    const targetDoc = getFlyDoc(flyEl);
    frogFocusY = Math.max(0, originDoc.y - vh * 0.35);
    flyFocusY = Math.max(0, targetDoc.y - vh * 0.45);

    const offset = chained ? CHAIN_OFFSET_MS : OFFSET_MS;
    const startAt = performance.now() + offset;
    const camStartAt = startAt + CAM_START_DELAY;

    flyEl.style.visibility = 'visible';

    if (tipGroupEl.current) {
      tipGroupEl.current.style.visibility = 'hidden';
    }

    if (!reduced) {
      pulseBox(
        frogBoxRef?.current,
        [
          { transform: 'scale(1, 1)' },
          { transform: 'scale(1.05, 0.93)', offset: 0.7 },
          { transform: 'scale(0.97, 1.05)', offset: 0.88 },
          { transform: 'scale(1, 1)' },
        ],
        { duration: offset + 90, easing: 'ease-out' },
      );
    }

    setGrab({
      key,
      completed,
      silent,
      golden,
      combo,
      reduced,
      duration,
      originDoc,
      targetDoc,
      startAt,
      camStartAt,
      follow: needCine && !reduced,
      frogFocusY,
      flyFocusY,
      onPersist,
    });
  };
  startRef.current = startGrab;

  const triggerTongue = useCallback(
    async (req: TongueRequest) => {
      const { key, completed, silent = false, queueIfBusy = false, onPersist } =
        req;
      if (
        busyRef.current ||
        cinematic ||
        grab ||
        performance.now() < cooldownUntil.current
      ) {
        if (!completed) {
          await onPersist();
          return;
        }
        if (
          queueIfBusy &&
          !silent &&
          busyRef.current &&
          grab?.key !== key &&
          !queueRef.current.some((q) => q.key === key) &&
          flyRefs.current[key]
        ) {
          queueRef.current.push(req);
          setQueuedMark(key, true);
          speedRef.current = Math.max(speedRef.current, QUEUE_SPEED);
        }
        return;
      }

      await startRef.current(req, false);
    },
    [cinematic, grab, flyRefs],
  );

  useEffect(
    () => () => {
      const pending = queueRef.current;
      queueRef.current = [];
      for (const req of pending) {
        void Promise.resolve(req.onPersist()).catch(() => {});
      }
    },
    [],
  );

  /* ================================================================= */
  /*  Tongue RAF – single source of truth for stroke + tip position    */
  /* ================================================================= */
  useEffect(() => {
    if (!grab) return;

    animatingRef.current = true;

    const sc = getSC();
    const scTop = sc ? sc.getBoundingClientRect().top : 0;

    const p0Doc = getMouthDoc();

    const tmp = document.createElementNS(SVG_NS, 'path');

    const buildGeom = (
      p0: { x: number; y: number },
      p2: { x: number; y: number },
    ): Geom => {
      const p1 = { x: (p0.x + p2.x) / 2, y: p0.y - 120 };
      const d = `M ${p0.x} ${p0.y} Q ${p1.x} ${p1.y} ${p2.x} ${p2.y}`;
      tmp.setAttribute('d', d);
      const total = tmp.getTotalLength();
      const pts = new Float32Array((LUT_N + 1) * 2);
      for (let i = 0; i <= LUT_N; i++) {
        const pt = tmp.getPointAtLength((total * i) / LUT_N);
        pts[i * 2] = pt.x;
        pts[i * 2 + 1] = pt.y;
      }
      return { d, total, pts, p1, p2 };
    };

    const pointAt = (g: Geom, s: number) => {
      const f = Math.min(1, Math.max(0, s / g.total)) * LUT_N;
      const i = Math.min(LUT_N - 1, Math.floor(f));
      const fr = f - i;
      return {
        x: g.pts[i * 2] + (g.pts[i * 2 + 2] - g.pts[i * 2]) * fr,
        y: g.pts[i * 2 + 1] + (g.pts[i * 2 + 3] - g.pts[i * 2 + 1]) * fr,
      };
    };

    let geom = buildGeom(p0Doc, grab.targetDoc);
    runRef.current = {
      geom,
      hidImpact: false,
      thwipDone: false,
      flinched: false,
      raf: 0,
    };

    const pathNode = tonguePathEl.current;
    const world = worldGroupEl.current;

    if (pathNode) {
      pathNode.style.visibility = 'visible';
      pathNode.style.strokeDasharray = `0 ${geom.total}`;
      pathNode.style.strokeDashoffset = '0';
      if (world) pathNode.setAttribute('d', geom.d);
    }

    const setViewportPath = (offX: number, offY: number) => {
      pathNode?.setAttribute(
        'd',
        `M ${geom.pts[0] - offX} ${geom.pts[1] - offY} Q ${
          geom.p1.x - offX
        } ${geom.p1.y - offY} ${geom.p2.x - offX} ${geom.p2.y - offY}`,
      );
    };

    const pulseFrog = (
      keyframes: Keyframe[],
      options: KeyframeAnimationOptions,
    ) => pulseBox(frogBoxRef?.current, keyframes, options);

    const spawnFx = (
      x: number,
      y: number,
      kind: 'ring' | 'sparkle' | 'bit',
      golden: boolean,
    ) => {
      const g = fxGroupEl.current;
      if (!g) return;
      const c = document.createElementNS(SVG_NS, 'circle');
      let bitDx = 0;
      let bitDy = 0;
      if (kind === 'bit') {
        const angle = Math.random() * Math.PI * 2;
        const dist = 16 + Math.random() * 12;
        bitDx = Math.cos(angle) * dist;
        bitDy = Math.sin(angle) * dist;
        c.setAttribute('cx', `${x}`);
        c.setAttribute('cy', `${y}`);
        c.setAttribute('r', `${1.8 + Math.random() * 1.6}`);
        c.setAttribute(
          'fill',
          golden
            ? '#fbbf24'
            : BITS_COLORS[Math.floor(Math.random() * BITS_COLORS.length)],
        );
      } else if (kind === 'ring') {
        c.setAttribute('cx', `${x}`);
        c.setAttribute('cy', `${y}`);
        c.setAttribute('r', '7');
        c.setAttribute('fill', 'none');
        c.setAttribute('stroke', golden ? '#fbbf24' : '#fb7185');
        c.setAttribute('stroke-width', '3');
      } else {
        c.setAttribute('cx', `${x + (Math.random() - 0.5) * 16}`);
        c.setAttribute('cy', `${y + (Math.random() - 0.5) * 16}`);
        c.setAttribute('r', `${1.5 + Math.random() * 1.5}`);
        c.setAttribute('fill', '#fde68a');
      }
      c.style.transformBox = 'fill-box';
      c.style.transformOrigin = 'center';
      g.appendChild(c);
      try {
        const anim =
          kind === 'bit'
            ? c.animate(
                [
                  { opacity: 1, transform: 'translate(0px, 0px) scale(1)' },
                  {
                    opacity: 0,
                    transform: `translate(${bitDx}px, ${bitDy}px) scale(0.4)`,
                  },
                ],
                { duration: 360, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
              )
            : kind === 'ring'
            ? c.animate(
                [
                  { opacity: 0.9, transform: 'scale(0.4)' },
                  { opacity: 0, transform: 'scale(2.8)' },
                ],
                { duration: 380, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
              )
            : c.animate(
                [
                  { opacity: 1, transform: 'translateY(0)' },
                  { opacity: 0, transform: 'translateY(-9px)' },
                ],
                { duration: 450, easing: 'ease-out' },
              );
        anim.onfinish = () => c.remove();
        anim.oncancel = () => c.remove();
      } catch {
        c.remove();
      }
    };

    let raf = 0;
    let frame = 0;
    timeOffsetRef.current = 0;
    lastTickRef.current = 0;

    const tick = () => {
      frame++;
      const realNow = performance.now();
      if (lastTickRef.current > 0 && speedRef.current > 1) {
        const dt = realNow - lastTickRef.current;
        timeOffsetRef.current += dt * (speedRef.current - 1);
      }
      lastTickRef.current = realNow;
      const now = realNow + timeOffsetRef.current;

      const tRaw = (now - grab.startAt) / grab.duration;
      const t = Math.max(0, Math.min(1, tRaw));

      const run = runRef.current!;

      if (!run.flinched && t >= FLINCH_AT && !grab.silent && !grab.reduced) {
        run.flinched = true;
        const flyEl = flyRefs.current[grab.key];
        try {
          flyEl?.animate(
            [
              { transform: 'scale(1) rotate(0deg)' },
              { transform: 'scale(1.16) rotate(-9deg)', offset: 0.45 },
              { transform: 'scale(1.1) rotate(7deg)' },
            ],
            {
              duration: ((HIT_AT - FLINCH_AT) * grab.duration) / speedRef.current,
              easing: 'ease-out',
              composite: 'add',
            },
          );
        } catch {
          // ignore
        }
      }

      if (!run.thwipDone && t > 0) {
        run.thwipDone = true;
        if (!grab.silent) playThwip();
      }

      if (trackMovingTarget && t <= HIT_AT) {
        const flyEl = flyRefs.current[grab.key];
        if (flyEl?.isConnected) {
          const np2 = getFlyDoc(flyEl);
          if (
            Math.abs(np2.x - geom.p2.x) > 0.5 ||
            Math.abs(np2.y - geom.p2.y) > 0.5
          ) {
            geom = buildGeom(p0Doc, np2);
            run.geom = geom;
            if (world && pathNode) pathNode.setAttribute('d', geom.d);
          }
        }
      }

      let forward: number;
      if (t <= HIT_AT) {
        forward = EXTEND_EASE(t / HIT_AT);
      } else if (t <= HOLD_END) {
        forward = 1;
      } else {
        forward = 1 - RETRACT_EASE((t - HOLD_END) / (1 - HOLD_END));
      }

      /* ---------------------------------------------------------------
       * Predict the scroll position the browser will PAINT this frame.
       * ------------------------------------------------------------- */
      let paintScrollY = sc ? sc.scrollTop : window.scrollY;

      if (grab.follow) {
        if (now >= grab.camStartAt && t <= HIT_AT) {
          const seg =
            (now - grab.camStartAt) /
            Math.max(1, grab.duration * HIT_AT - CAM_START_DELAY);
          const clamped = Math.max(0, Math.min(1, seg));
          const eased = FOLLOW_EASE(clamped);
          paintScrollY =
            grab.frogFocusY + (grab.flyFocusY - grab.frogFocusY) * eased;
        } else if (t > HIT_AT) {
          paintScrollY = grab.flyFocusY;
        }
        const maxScroll = sc
          ? Math.max(0, sc.scrollHeight - sc.clientHeight)
          : Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        paintScrollY = Math.max(0, Math.min(paintScrollY, maxScroll));
      }

      const offX = sc ? 0 : window.scrollX;
      const offY = paintScrollY - scTop;

      if (world) {
        world.setAttribute('transform', `translate(${-offX} ${-offY})`);
      } else {
        setViewportPath(offX, offY);
      }

      const bulgeEnd = HOLD_END + 0.08;
      const bulge =
        !grab.reduced && !grab.silent && t > HIT_AT && t < bulgeEnd
          ? Math.sin((Math.PI * (t - HIT_AT)) / (bulgeEnd - HIT_AT))
          : 0;

      if (pathNode) {
        pathNode.style.strokeDasharray = `${geom.total * forward} ${geom.total}`;
        pathNode.style.strokeWidth = `${TONGUE_STROKE * (1 + 0.32 * bulge)}`;
      }

      const sLen = geom.total * forward;
      const pt = pointAt(geom, sLen);
      const ahead = pointAt(geom, Math.min(geom.total, sLen + 2));
      const dx = ahead.x - pt.x,
        dy = ahead.y - pt.y;
      const len = Math.hypot(dx, dy) || 1;
      const tipDocX = pt.x + (dx / len) * (TONGUE_STROKE / 2);
      const tipDocY = pt.y + (dy / len) * (TONGUE_STROKE / 2);

      if (tipGroupEl.current) {
        const tx = world ? tipDocX : tipDocX - offX;
        const ty = world ? tipDocY : tipDocY - offY;
        let rot = 0;
        if (!grab.reduced && t > HOLD_END) {
          const u = (t - HOLD_END) / (1 - HOLD_END);
          rot = Math.sin(u * Math.PI * 2.5) * 16 * (1 - u);
        }
        const sc2 = 1 + 0.2 * bulge;
        tipGroupEl.current.setAttribute(
          'transform',
          `translate(${tx}, ${ty}) rotate(${rot}) scale(${sc2})`,
        );
      }

      if (!run.hidImpact && t >= HIT_AT) {
        run.hidImpact = true;
        const flyEl = flyRefs.current[grab.key];
        if (flyEl) flyEl.style.visibility = 'hidden';
        window.setTimeout(() => {
          setVisuallyDone((prev) => new Set(prev).add(grab.key));
        }, 30);
        if (tipGroupEl.current) {
          tipGroupEl.current.style.visibility = 'visible';
        }
        if (!grab.silent) {
          hapticImpact();
          playPop(grab.combo);
          if (!grab.reduced) {
            spawnFx(tipDocX, tipDocY, 'ring', grab.golden);
            const bits = 5 + Math.min(grab.combo, 4);
            for (let i = 0; i < bits; i++) {
              spawnFx(tipDocX, tipDocY, 'bit', grab.golden);
            }
            pulseFrog(
              [
                { transform: 'translateY(0)' },
                { transform: 'translateY(3px)', offset: 0.45 },
                { transform: 'translateY(0)' },
              ],
              { duration: 130, easing: 'ease-out' },
            );
          }
        }
      }

      if (
        grab.golden &&
        !grab.reduced &&
        t > HOLD_END &&
        t < 1 &&
        frame % 3 === 0
      ) {
        spawnFx(tipDocX, tipDocY, 'sparkle', true);
      }

      /* --- camera follow at the END of tick --- */
      if (grab.follow && (now >= grab.camStartAt || t > HIT_AT)) {
        if (sc) sc.scrollTop = paintScrollY;
        else window.scrollTo(0, paintScrollY);
      }

      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        if (tipGroupEl.current) {
          tipGroupEl.current.style.visibility = 'hidden';
        }
        if (pathNode) {
          pathNode.style.strokeDasharray = `0 ${geom.total}`;
          pathNode.style.visibility = 'hidden';
        }

        if (!grab.silent) {
          frogRef.current?.fireEmote('love');
          playGulp(grab.combo, grab.golden);
          if (grab.combo > 0) {
            window.setTimeout(() => playComboChime(grab.combo), 70);
            const mouth = frogRef.current?.getMouthPoint();
            if (mouth) showComboLabel(mouth.x, mouth.y, grab.combo, grab.reduced);
          }
          lastCatchEndRef.current = performance.now();
          if (!grab.reduced) {
            pulseFrog(
              [
                { transform: 'scale(1, 1)' },
                { transform: 'scale(1.05, 0.93)', offset: 0.35 },
                { transform: 'scale(0.97, 1.04)', offset: 0.7 },
                { transform: 'scale(1, 1)' },
              ],
              { duration: 280, easing: 'ease-out' },
            );
          }
        }

        const persist = Promise.resolve(grab.onPersist()).catch((error) => {
          console.error('Failed to persist tongue action', error);
        });

        const finishAnimation = () => {
          setVisuallyDone((prev) => {
            const s = new Set(prev);
            s.delete(grab.key);
            return s;
          });
          if (queueRef.current.length > 0) {
            void drainNext();
            return;
          }
          cooldownUntil.current = performance.now() + 220;
          setTimeout(() => {
            if (queueRef.current.length > 0) {
              void drainNext();
              return;
            }
            busyRef.current = false;
            setCinematic(false);
            setGrab(null);
          }, 140);
        };

        if (keepTargetHiddenUntilPersist) {
          void persist.finally(finishAnimation);
        } else {
          void persist;
          finishAnimation();
        }
      }
    };

    setCinematic(true);
    raf = requestAnimationFrame(tick);
    if (runRef.current) runRef.current.raf = raf;
    return () => {
      cancelAnimationFrame(raf);
      animatingRef.current = false;
      if (tipGroupEl.current) {
        tipGroupEl.current.style.visibility = 'hidden';
      }
      if (pathNode) {
        pathNode.style.strokeDasharray = `0 ${geom.total}`;
        pathNode.style.strokeWidth = `${TONGUE_STROKE}`;
        pathNode.style.visibility = 'hidden';
      }
      if (fxGroupEl.current) {
        fxGroupEl.current.replaceChildren();
      }
    };
  }, [
    drainNext,
    flyRefs,
    frogBoxRef,
    frogRef,
    getFlyDoc,
    getMouthDoc,
    grab,
    keepTargetHiddenUntilPersist,
    trackMovingTarget,
  ]);

  const speedUpTongue = useCallback(() => {
    speedRef.current = 2;
  }, []);

  return {
    vp,
    cinematic,
    setCinematic,
    grab,
    tipGroupEl,
    tonguePathEl,
    worldGroupEl,
    fxGroupEl,
    triggerTongue,
    visuallyDone,
    speedUpTongue,
  };
}

function pulseBox(
  box: HTMLElement | null | undefined,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
) {
  if (!box) return;
  try {
    const prevOrigin = box.style.transformOrigin;
    box.style.transformOrigin = '50% 88%';
    const anim = box.animate(keyframes, {
      ...options,
      composite: 'add',
    });
    const restore = () => {
      box.style.transformOrigin = prevOrigin;
    };
    anim.onfinish = restore;
    anim.oncancel = restore;
  } catch {
    // ignore
  }
}

function showComboLabel(x: number, y: number, combo: number, reduced: boolean) {
  if (typeof document === 'undefined') return;
  const el = document.createElement('div');
  const hot = combo >= 3;
  el.textContent = `Combo ×${combo + 1}`;
  el.setAttribute('aria-hidden', 'true');
  Object.assign(el.style, {
    position: 'fixed',
    left: `${x}px`,
    top: `${y - 34}px`,
    zIndex: '60',
    pointerEvents: 'none',
    padding: '4px 10px',
    borderRadius: '999px',
    font: '900 13px/1.1 system-ui, -apple-system, sans-serif',
    letterSpacing: '0.02em',
    whiteSpace: 'nowrap',
    color: '#fff',
    background: hot
      ? 'linear-gradient(180deg, #fcd34d, #f59e0b)'
      : 'linear-gradient(180deg, #fb7185, #f43f5e)',
    boxShadow: hot
      ? '0 4px 14px -4px rgba(245, 158, 11, 0.7)'
      : '0 4px 14px -4px rgba(244, 63, 94, 0.6)',
    transform: 'translate(-50%, -50%)',
  });
  document.body.appendChild(el);
  try {
    const anim = el.animate(
      reduced
        ? [{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }]
        : [
            { opacity: 0, transform: 'translate(-50%, -50%) scale(0.4)' },
            {
              opacity: 1,
              transform: 'translate(-50%, -60%) scale(1.15) rotate(-4deg)',
              offset: 0.18,
            },
            {
              opacity: 1,
              transform: 'translate(-50%, -80%) scale(1) rotate(0deg)',
              offset: 0.65,
            },
            { opacity: 0, transform: 'translate(-50%, -150%) scale(0.95)' },
          ],
      { duration: 950, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
    anim.onfinish = () => el.remove();
    anim.oncancel = () => el.remove();
  } catch {
    window.setTimeout(() => el.remove(), 950);
  }
}

function easeOutQuad(t: number) {
  return 1 - (1 - t) * (1 - t);
}

function animateScrollTo(
  targetY: number,
  duration: number,
  speedRef?: React.MutableRefObject<number>,
  container?: HTMLElement | null,
) {
  return new Promise<void>((resolve) => {
    const start = container ? container.scrollTop : window.scrollY;
    const dy = targetY - start;
    let progress = 0;
    let lastT = 0;

    function frame(t: number) {
      if (lastT === 0) lastT = t;
      const dt = t - lastT;
      lastT = t;
      progress += (dt / duration) * (speedRef?.current ?? 1);
      const p = Math.min(1, progress);
      const y = start + dy * easeOutQuad(p);
      if (container) container.scrollTop = y;
      else window.scrollTo(0, y);
      if (p < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}
