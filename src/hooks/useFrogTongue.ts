'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FrogHandle } from '@/components/ui/frog';

export const TONGUE_MS = 1111;
export const OFFSET_MS = 160;
const PRE_PAN_MS = 600;
const PRE_LINGER_MS = 180;
const CAM_START_DELAY = 140;
const ORIGIN_Y_ADJ = -5;
export const TONGUE_STROKE = 8;
export const HIT_AT = 0.5;
const FOLLOW_EASE = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export type TongueKey = string;

export interface TongueRequest {
  key: TongueKey;
  completed: boolean;
  onPersist: () => Promise<void> | void;
}

export interface UseFrogTongueOptions {
  frogRef: React.RefObject<FrogHandle | null>;
  frogBoxRef?: React.RefObject<HTMLDivElement | null>;
  flyRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  trackMovingTarget?: boolean;
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
  durationMs = TONGUE_MS,
  originYOffset = ORIGIN_Y_ADJ,
  keepTargetHiddenUntilPersist = false,
}: UseFrogTongueOptions) {
  const cooldownUntil = useRef(0);
  const animatingRef = useRef(false);
  const speedRef = useRef(1);
  const timeOffsetRef = useRef(0);
  const lastTickRef = useRef(0);
  const [cinematic, setCinematic] = useState(false);

  const [grab, setGrab] = useState<{
    key: string;
    completed: boolean;
    originDoc: { x: number; y: number };
    targetDoc: { x: number; y: number };
    returnToY: number;
    startAt: number;
    camStartAt: number;
    follow: boolean;
    frogFocusY: number;
    flyFocusY: number;
    onPersist: () => Promise<void> | void;
  } | null>(null);

  /* ------------------------------------------------------------------ */
  /*  Direct-DOM refs for the tongue tip group                          */
  /*  (replaces tip / tipVisible React state → zero re-renders / frame) */
  /* ------------------------------------------------------------------ */
  const tipGroupEl = useRef<SVGGElement | null>(null);

  const [vp, setVp] = useState({ w: 0, h: 0 });

  const tonguePathEl = useRef<SVGPathElement | null>(null);
  const geomRef = useRef<{
    total: number;
    getPointAtLength: (s: number) => DOMPoint;
    hidImpact: boolean;
    raf: number;
  } | null>(null);

  useEffect(() => {
    const set = () => {
      if (animatingRef.current) return;
      setVp({ w: window.innerWidth, h: window.innerHeight });
    };
    set();
    window.addEventListener('resize', set);
    return () => {
      window.removeEventListener('resize', set);
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

  const triggerTongue = useCallback(
    async ({ key, completed, onPersist }: TongueRequest) => {
      if (cinematic || grab || performance.now() < cooldownUntil.current) {
        if (!completed) await onPersist();
        return;
      }

      const flyEl = flyRefs.current[key];
      if (!flyEl) {
        await onPersist();
        return;
      }

      const sc = getSC();
      const startY = sc ? sc.scrollTop : window.scrollY;
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

      const needCine = frogRatio < 0.75 || !flyVisible;
      speedRef.current = 1;
      setCinematic(true);

      if (needCine) {
        await animateScrollTo(frogFocusY, PRE_PAN_MS, speedRef, sc);
        await new Promise((r) =>
          setTimeout(r, PRE_LINGER_MS / speedRef.current),
        );
      }

      const originDoc = getMouthDoc();
      const targetDoc = getFlyDoc(flyEl);
      frogFocusY = Math.max(0, originDoc.y - vh * 0.35);
      flyFocusY = Math.max(0, targetDoc.y - vh * 0.45);

      const startAt = performance.now() + OFFSET_MS;
      const camStartAt = startAt + CAM_START_DELAY;

      flyEl.style.visibility = 'visible';

      if (tipGroupEl.current) {
        tipGroupEl.current.style.visibility = 'hidden';
      }

      setGrab({
        key,
        completed,
        originDoc,
        targetDoc,
        returnToY: startY,
        startAt,
        camStartAt,
        follow: needCine,
        frogFocusY,
        flyFocusY,
        onPersist,
      });
    },
    [cinematic, grab, flyRefs, frogBoxRef, getFlyDoc, getMouthDoc],
  );

  /* ================================================================= */
  /*  Tongue RAF – single source of truth for stroke + tip position    */
  /* ================================================================= */
  useEffect(() => {
    if (!grab) return;

    animatingRef.current = true;

    const sc = getSC();
    const scTop = sc ? sc.getBoundingClientRect().top : 0;

    /* Use grab.targetDoc directly – these coordinates were captured in
       triggerTongue at the correct scroll position. Moving targets
       explicitly opt in to live DOM tracking until impact. */
    const p0Doc = getMouthDoc();
    let p2Doc = grab.targetDoc;

    const buildGeom = (
      p0: { x: number; y: number },
      p2: { x: number; y: number },
    ) => {
      const p1 = { x: (p0.x + p2.x) / 2, y: p0.y - 120 };
      const tmp = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'path',
      );
      tmp.setAttribute(
        'd',
        `M ${p0.x} ${p0.y} Q ${p1.x} ${p1.y} ${p2.x} ${p2.y}`,
      );
      const total = tmp.getTotalLength();
      return { tmp, total, p1 };
    };

    let { tmp, total, p1: p1Doc } = buildGeom(p0Doc, p2Doc);
    geomRef.current = {
      total,
      getPointAtLength: (s: number) => tmp.getPointAtLength(s),
      hidImpact: false,
      raf: 0,
    };

    const pathNode = tonguePathEl.current;
    if (pathNode) {
      pathNode.style.visibility = 'visible';
      pathNode.style.strokeDasharray = `0 ${total}`;
      pathNode.style.strokeDashoffset = '0';
    }

    const seedViewportPath = () => {
      const offX = sc ? 0 : window.scrollX;
      const offY = (sc ? sc.scrollTop : window.scrollY) - scTop;
      const p0V = { x: p0Doc.x - offX, y: p0Doc.y - offY };
      const p1V = { x: p1Doc.x - offX, y: p1Doc.y - offY };
      const p2V = { x: p2Doc.x - offX, y: p2Doc.y - offY };
      pathNode?.setAttribute(
        'd',
        `M ${p0V.x} ${p0V.y} Q ${p1V.x} ${p1V.y} ${p2V.x} ${p2V.y}`,
      );
    };
    seedViewportPath();

    let raf = 0;
    timeOffsetRef.current = 0;
    lastTickRef.current = 0;

    const tick = () => {
      const realNow = performance.now();
      if (lastTickRef.current > 0 && speedRef.current > 1) {
        const dt = realNow - lastTickRef.current;
        timeOffsetRef.current += dt * (speedRef.current - 1);
      }
      lastTickRef.current = realNow;
      const now = realNow + timeOffsetRef.current;

      const tRaw = (now - grab.startAt) / durationMs;
      const t = Math.max(0, Math.min(1, tRaw));

      if (trackMovingTarget && t <= HIT_AT) {
        const flyEl = flyRefs.current[grab.key];
        if (flyEl?.isConnected) {
          p2Doc = getFlyDoc(flyEl);
          ({ tmp, total, p1: p1Doc } = buildGeom(p0Doc, p2Doc));
          geomRef.current!.total = total;
          geomRef.current!.getPointAtLength = (s: number) =>
            tmp.getPointAtLength(s);
        }
      }

      const forward =
        t <= HIT_AT ? t / HIT_AT : 1 - (t - HIT_AT) / (1 - HIT_AT);

      /* ---------------------------------------------------------------
       * Predict the scroll position the browser will PAINT this frame.
       * ------------------------------------------------------------- */
      let paintScrollY = sc ? sc.scrollTop : window.scrollY;

      if (grab.follow) {
        if (now >= grab.camStartAt && t <= HIT_AT) {
          const seg =
            (now - grab.camStartAt) / (durationMs * HIT_AT - CAM_START_DELAY);
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
      const p0V = { x: p0Doc.x - offX, y: p0Doc.y - offY };
      const p1V = { x: p1Doc.x - offX, y: p1Doc.y - offY };
      const p2V = { x: p2Doc.x - offX, y: p2Doc.y - offY };

      if (pathNode) {
        pathNode.setAttribute(
          'd',
          `M ${p0V.x} ${p0V.y} Q ${p1V.x} ${p1V.y} ${p2V.x} ${p2V.y}`,
        );
        const visibleLen = total * forward;
        pathNode.style.strokeDasharray = `${visibleLen} ${total}`;
      }

      const sLen = total * forward;
      const pt = geomRef.current!.getPointAtLength(sLen);
      const ahead = geomRef.current!.getPointAtLength(
        Math.min(total, sLen + 1),
      );
      const dx = ahead.x - pt.x,
        dy = ahead.y - pt.y;
      const len = Math.hypot(dx, dy) || 1;
      const ox = (dx / len) * (TONGUE_STROKE / 2);
      const oy = (dy / len) * (TONGUE_STROKE / 2);
      const tipX = pt.x + ox - offX;
      const tipY = pt.y + oy - offY;

      if (tipGroupEl.current) {
        tipGroupEl.current.setAttribute(
          'transform',
          `translate(${tipX}, ${tipY})`,
        );
      }

      if (!geomRef.current!.hidImpact && t >= HIT_AT) {
        geomRef.current!.hidImpact = true;
        setVisuallyDone((prev) => new Set(prev).add(grab.key));
        if (tipGroupEl.current) {
          tipGroupEl.current.style.visibility = 'visible';
        }
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
          pathNode.style.strokeDasharray = `0 ${total}`;
          pathNode.style.visibility = 'hidden';
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
          cooldownUntil.current = performance.now() + 220;
          setTimeout(() => {
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
    if (geomRef.current) geomRef.current.raf = raf;
    return () => {
      cancelAnimationFrame(raf);
      animatingRef.current = false;
      if (tipGroupEl.current) {
        tipGroupEl.current.style.visibility = 'hidden';
      }
      if (pathNode) {
        pathNode.style.strokeDasharray = `0 ${total}`;
        pathNode.style.visibility = 'hidden';
      }
    };
  }, [
    durationMs,
    flyRefs,
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
    triggerTongue,
    visuallyDone,
    speedUpTongue,
  };
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
