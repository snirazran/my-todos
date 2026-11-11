'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FROG_ARTBOARD, type FrogHandle } from '@/components/ui/frog';
import {
  hapticCelebrate,
  hapticImpact,
  hapticSuccess,
} from '@/lib/haptics';
import { catchEmote } from '@/lib/frogEmotes';
import {
  playComboChime,
  playGulp,
  playPop,
  playSlurp,
  playThwip,
  primeCatchSounds,
} from '@/lib/catchSounds';
import {
  TONGUE_EDGE,
  TONGUE_EDGE_WIDTH,
  TONGUE_GLOSS,
  TONGUE_ROOT_SHADE,
  TONGUE_WIDTH,
  aimControl,
  bowSideFor,
  extendEase,
  hitPush,
  hitWave,
  impactSquash,
  lightSide,
  retractEase,
  tongueShape,
  tongueTiming,
} from '@/lib/tongueMotion';

export const TONGUE_MS = 1111;
export const OFFSET_MS = 120;
const CHAIN_OFFSET_MS = 70;
const PRE_LINGER_MS = 70;
const FOLLOW_OFFSET_MS = 70;
const FOLLOW_EXTEND_STRETCH = 1.5;
const ORIGIN_Y_ADJ = -2;
export const TONGUE_STROKE = TONGUE_WIDTH;
const COMBO_WINDOW_MS = 8000;
const COMBO_SPEED = [1, 0.92, 0.86, 0.8];
const COMBO_MAX = 7;
const QUEUE_SPEED = 1.45;
const FLINCH_AT = 0.4;
const BULGE_TAIL_MS = 70;
const MOUTH_OPEN_LEAD_MS = 40;
const MOUTH_CLOSE_LEAD_MS = 70;
const BITS_COLORS = ['#fb7185', '#86efac', '#fde68a', '#7dd3fc'];
const GOLDEN_CHANCE = 0.05;
const SVG_NS = 'http://www.w3.org/2000/svg';
const ROOT_SHADE_UNITS = 6.8;
const ROOT_SHADE_STOPS: [number, number][] = [
  [0, 1],
  [0.35, 1],
  [0.7, 0.5],
  [1, 0],
];
let rootShadeSeq = 0;

const FOLLOW_EASE = (t: number) =>
  0.5 * extendEase(t) + 0.5 * t * t * (3 - 2 * t);

const prePanMs = (distance: number) =>
  Math.min(520, Math.max(280, 220 + Math.abs(distance) * 0.35));

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
    hitAt: number;
    holdEnd: number;
    originDoc: { x: number; y: number };
    targetDoc: { x: number; y: number };
    startAt: number;
    follow: boolean;
    frogFocusY: number;
    flyFocusY: number;
    onPersist: () => Promise<void> | void;
  } | null>(null);

  /* Direct-DOM refs — the RAF loop drives these without React re-renders.
   * worldGroupEl wraps the tongue in DOC coordinates, so scrolling only
   * changes its translate. */
  const tipGroupEl = useRef<SVGGElement | null>(null);
  const worldGroupEl = useRef<SVGGElement | null>(null);
  const fxGroupEl = useRef<SVGGElement | null>(null);
  const tonguePathEl = useRef<SVGPathElement | null>(null);

  const [vp, setVp] = useState({ w: 0, h: 0 });

  const runRef = useRef<{
    hidImpact: boolean;
    thwipDone: boolean;
    slurpDone: boolean;
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
      if (completed && !silent) hapticSuccess();
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
        const scrollNow = sc ? sc.scrollTop : window.scrollY;
        await animateScrollTo(
          frogFocusY,
          prePanMs(frogFocusY - scrollNow),
          speedRef,
          sc,
        );
        frogRef.current?.openMouth?.();
        await new Promise((r) =>
          setTimeout(r, PRE_LINGER_MS / speedRef.current),
        );
      }
    }

    const originDoc = getMouthDoc();
    const targetDoc = getFlyDoc(flyEl);
    frogFocusY = Math.max(0, originDoc.y - vh * 0.35);
    flyFocusY = Math.max(0, targetDoc.y - vh * 0.45);

    const follow = needCine && !reduced;
    const timing = tongueTiming(
      Math.hypot(targetDoc.x - originDoc.x, targetDoc.y - originDoc.y),
      (durationMs / TONGUE_MS) *
        COMBO_SPEED[Math.min(combo, COMBO_SPEED.length - 1)],
      follow ? FOLLOW_EXTEND_STRETCH : 1,
    );

    const offset = chained
      ? CHAIN_OFFSET_MS
      : follow
        ? FOLLOW_OFFSET_MS
        : OFFSET_MS;
    frogRef.current?.openMouth?.();
    const startAt = performance.now() + offset;

    flyEl.style.visibility = 'visible';

    if (tipGroupEl.current) {
      tipGroupEl.current.style.visibility = 'hidden';
    }

    if (!reduced) {
      pulseBox(
        frogBoxRef?.current,
        [
          { transform: 'scale(1, 1)' },
          {
            transform: 'scale(1.06, 0.92)',
            offset: (offset * 0.8) / (offset + 130),
          },
          {
            transform: 'scale(0.96, 1.06)',
            offset: (offset + 40) / (offset + 130),
          },
          { transform: 'scale(1, 1)' },
        ],
        { duration: offset + 130, easing: 'ease-out' },
      );
    }

    setGrab({
      key,
      completed,
      silent,
      golden,
      combo,
      reduced,
      duration: timing.total,
      hitAt: timing.hitAt,
      holdEnd: timing.holdEnd,
      originDoc,
      targetDoc,
      startAt,
      follow,
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

    let p0Doc = getMouthDoc();

    let target = grab.targetDoc;
    const bowSide = bowSideFor(p0Doc, target);
    const side = lightSide(p0Doc, target);
    const springy = !grab.silent && !grab.reduced;
    const extendMs = grab.hitAt * grab.duration;
    const holdMs = (grab.holdEnd - grab.hitAt) * grab.duration;
    const retractMs = (1 - grab.holdEnd) * grab.duration;
    const bulgeMs = holdMs + BULGE_TAIL_MS;

    runRef.current = {
      hidImpact: false,
      thwipDone: false,
      slurpDone: false,
      flinched: false,
      raf: 0,
    };

    const pathNode = tonguePathEl.current;
    const world = worldGroupEl.current;
    let glossNode: SVGPathElement | null = null;
    let rootGrad: SVGRadialGradientElement | null = null;
    let rootNode: SVGPathElement | null = null;

    if (pathNode) {
      pathNode.style.fill = pathNode.getAttribute('stroke') || '#f43f5e';
      pathNode.style.stroke = TONGUE_EDGE;
      pathNode.style.strokeWidth = `${TONGUE_EDGE_WIDTH}`;
      pathNode.style.strokeLinejoin = 'round';
      pathNode.style.strokeDasharray = 'none';
      pathNode.setAttribute('d', '');
      pathNode.style.visibility = 'visible';

      glossNode = document.createElementNS(SVG_NS, 'path');
      glossNode.setAttribute('fill', 'none');
      glossNode.setAttribute('stroke', TONGUE_GLOSS);
      glossNode.setAttribute('stroke-linecap', 'round');
      glossNode.setAttribute('stroke-linejoin', 'round');
      pathNode.parentNode?.insertBefore(glossNode, pathNode.nextSibling);

      const frogBox = frogRef.current?.getBoxRect();
      const frogScale =
        frogBox && frogBox.width > 0 && frogBox.height > 0
          ? Math.min(
              frogBox.width / FROG_ARTBOARD.width,
              frogBox.height / FROG_ARTBOARD.height,
            )
          : 1.9;
      const rootId = `tongue-root-shade-${++rootShadeSeq}`;
      rootGrad = document.createElementNS(SVG_NS, 'radialGradient');
      rootGrad.setAttribute('id', rootId);
      rootGrad.setAttribute('gradientUnits', 'userSpaceOnUse');
      rootGrad.setAttribute('r', `${ROOT_SHADE_UNITS * frogScale}`);
      for (const [offset, opacity] of ROOT_SHADE_STOPS) {
        const stop = document.createElementNS(SVG_NS, 'stop');
        stop.setAttribute('offset', `${offset}`);
        stop.setAttribute('stop-color', TONGUE_ROOT_SHADE);
        stop.setAttribute('stop-opacity', `${opacity}`);
        rootGrad.appendChild(stop);
      }
      rootNode = document.createElementNS(SVG_NS, 'path');
      rootNode.setAttribute('fill', `url(#${rootId})`);
      rootNode.setAttribute('stroke', `url(#${rootId})`);
      rootNode.setAttribute('stroke-width', `${TONGUE_EDGE_WIDTH + 0.5}`);
      rootNode.setAttribute('stroke-linejoin', 'round');
      glossNode.parentNode?.insertBefore(rootGrad, glossNode.nextSibling);
      rootGrad.parentNode?.insertBefore(rootNode, rootGrad.nextSibling);
    }

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

      if (
        !run.flinched &&
        t >= grab.hitAt * FLINCH_AT &&
        !grab.silent &&
        !grab.reduced
      ) {
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
              duration: (extendMs * (1 - FLINCH_AT)) / speedRef.current,
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
        if (!grab.silent) {
          playThwip({
            duration: extendMs / 1000 / speedRef.current,
            reach:
              Math.hypot(target.x - p0Doc.x, target.y - p0Doc.y) / 600,
          });
        }
      }

      if (trackMovingTarget && t <= grab.hitAt) {
        const flyEl = flyRefs.current[grab.key];
        if (flyEl?.isConnected) {
          const np2 = getFlyDoc(flyEl);
          if (
            Math.abs(np2.x - target.x) > 0.5 ||
            Math.abs(np2.y - target.y) > 0.5
          ) {
            target = np2;
          }
        }
      }

      const sinceHit = t > grab.hitAt ? (t - grab.hitAt) * grab.duration : -1;
      const retractU =
        t > grab.holdEnd ? (t - grab.holdEnd) / (1 - grab.holdEnd) : 0;

      let forward: number;
      let push = 0;
      if (t <= grab.hitAt) {
        forward = extendEase(t / grab.hitAt);
      } else if (t <= grab.holdEnd) {
        forward = 1;
        if (springy) push = hitPush(sinceHit / Math.max(1, holdMs));
      } else {
        forward = 1 - retractEase(retractU);
      }

      if (!run.slurpDone && t > grab.holdEnd) {
        run.slurpDone = true;
        if (!grab.silent) playSlurp(retractMs / 1000 / speedRef.current);
      }

      if (!grab.reduced) p0Doc = getMouthDoc();
      const control = aimControl(p0Doc, target, bowSide);
      const wave = springy
        ? hitWave(
            sinceHit,
            Math.hypot(target.x - p0Doc.x, target.y - p0Doc.y),
          )
        : 0;

      if (tRaw < 0) {
        frogRef.current?.openMouthIn?.(
          (-tRaw * grab.duration) / speedRef.current - MOUTH_OPEN_LEAD_MS,
        );
      } else {
        frogRef.current?.closeMouthIn?.(
          ((1 - Math.min(1, tRaw)) * grab.duration) / speedRef.current -
            MOUTH_CLOSE_LEAD_MS,
        );
      }

      /* ---------------------------------------------------------------
       * Predict the scroll position the browser will PAINT this frame.
       * ------------------------------------------------------------- */
      let paintScrollY = sc ? sc.scrollTop : window.scrollY;

      if (grab.follow) {
        if (t <= grab.hitAt) {
          paintScrollY =
            grab.frogFocusY +
            (grab.flyFocusY - grab.frogFocusY) * FOLLOW_EASE(t / grab.hitAt);
        } else {
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
      }

      const bulge =
        springy && sinceHit >= 0 && sinceHit < bulgeMs
          ? Math.sin((Math.PI * sinceHit) / bulgeMs)
          : 0;

      const shape = tongueShape(p0Doc, control, target, forward, {
        bulge,
        push,
        wave,
        side,
        ox: world ? 0 : offX,
        oy: world ? 0 : offY,
      });

      if (pathNode) pathNode.setAttribute('d', shape.body);
      if (rootGrad && rootNode) {
        rootGrad.setAttribute('cx', `${p0Doc.x - (world ? 0 : offX)}`);
        rootGrad.setAttribute('cy', `${p0Doc.y - (world ? 0 : offY)}`);
        rootNode.setAttribute('d', shape.body);
      }
      if (glossNode) {
        glossNode.setAttribute('d', shape.gloss);
        glossNode.setAttribute('stroke-width', `${shape.glossWidth}`);
      }

      const tipDocX = world ? shape.tip.x : shape.tip.x + offX;
      const tipDocY = world ? shape.tip.y : shape.tip.y + offY;

      if (tipGroupEl.current) {
        let rot = 0;
        let squashX = 1;
        let squashY = 1;
        let size = 1 + 0.12 * bulge;
        if (!grab.reduced && sinceHit >= 0) {
          const squash = impactSquash(sinceHit);
          squashX = 1 - 0.24 * squash;
          squashY = 1 + 0.2 * squash;
          if (retractU > 0) {
            rot = Math.sin(retractU * Math.PI * 2.5) * 16 * (1 - retractU);
            if (retractU > 0.78) {
              const into = (retractU - 0.78) / 0.22;
              size *= 1 - 0.42 * into * into;
            }
          }
        }
        const heading = (Math.atan2(shape.dir.y, shape.dir.x) * 180) / Math.PI;
        tipGroupEl.current.setAttribute(
          'transform',
          `translate(${shape.tip.x}, ${shape.tip.y}) rotate(${rot}) rotate(${heading}) scale(${squashX}, ${squashY}) rotate(${-heading}) scale(${size})`,
        );
      }

      if (!run.hidImpact && t >= grab.hitAt) {
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
            const pullX = shape.dir.x * 3.5;
            const pullY = shape.dir.y * 3.5;
            pulseFrog(
              [
                { transform: 'translate(0px, 0px)' },
                {
                  transform: `translate(${pullX}px, ${pullY}px)`,
                  offset: 0.4,
                },
                { transform: 'translate(0px, 0px)' },
              ],
              { duration: 150, easing: 'ease-out' },
            );
            try {
              flyEl
                ?.closest<HTMLElement>('[data-tongue-tug]')
                ?.animate(
                  [
                    { transform: 'translate(0px, 0px)' },
                    {
                      transform: `translate(${-shape.dir.x * 3}px, ${
                        -shape.dir.y * 3
                      }px)`,
                      offset: 0.35,
                    },
                    { transform: 'translate(0px, 0px)' },
                  ],
                  { duration: 200, easing: 'ease-out', composite: 'add' },
                );
            } catch {
              // ignore
            }
          }
        }
      }

      if (
        grab.golden &&
        !grab.reduced &&
        t > grab.holdEnd &&
        t < 1 &&
        frame % 3 === 0
      ) {
        spawnFx(tipDocX, tipDocY, 'sparkle', true);
      }

      /* --- camera follow at the END of tick --- */
      if (grab.follow && tRaw >= 0) {
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
          pathNode.setAttribute('d', '');
          pathNode.style.visibility = 'hidden';
        }
        glossNode?.setAttribute('d', '');
        rootNode?.setAttribute('d', '');

        if (!grab.silent) {
          frogRef.current?.fireEmote(catchEmote(grab.combo, grab.golden));
          playGulp(grab.combo, grab.golden);
          if (grab.completed) {
            if (grab.golden) hapticCelebrate();
            else hapticSuccess();
          }
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
                { transform: 'scale(1.07, 0.91)', offset: 0.3 },
                { transform: 'scale(0.96, 1.05)', offset: 0.65 },
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
        pathNode.setAttribute('d', '');
        pathNode.style.visibility = 'hidden';
      }
      glossNode?.remove();
      rootNode?.remove();
      rootGrad?.remove();
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
