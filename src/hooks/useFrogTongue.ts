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
  frogRef: React.RefObject<FrogHandle>;
  frogBoxRef?: React.RefObject<HTMLDivElement | null>;
  flyRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
}

export function useFrogTongue({
  frogRef,
  frogBoxRef,
  flyRefs,
}: UseFrogTongueOptions) {
  const cooldownUntil = useRef(0);
  const animatingRef = useRef(false);
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
      // Freeze viewport dimensions while the tongue animation is running.
      // On mobile the URL-bar show/hide fires visualViewport resize events
      // which would change the SVG viewBox mid-animation, causing the
      // tongue to jump/jitter.
      if (animatingRef.current) return;
      setVp({ w: window.innerWidth, h: window.innerHeight });
    };
    set();
    window.addEventListener('resize', set);
    return () => {
      window.removeEventListener('resize', set);
    };
  }, []);

  const getMouthDoc = useCallback(() => {
    const p = frogRef.current?.getMouthPoint() ?? { x: 0, y: 0 };
    // Use pageXOffset/pageYOffset for better PWA/mobile support
    const offX = window.pageXOffset || document.documentElement.scrollLeft;
    const offY = window.pageYOffset || document.documentElement.scrollTop;
    return { x: p.x + offX, y: p.y + offY + ORIGIN_Y_ADJ };
  }, [frogRef]);

  const getFlyDoc = useCallback((el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    // Use pageXOffset/pageYOffset for better PWA/mobile support
    const offX = window.pageXOffset || document.documentElement.scrollLeft;
    const offY = window.pageYOffset || document.documentElement.scrollTop;
    return { x: r.left + r.width / 2 + offX, y: r.top + r.height / 2 + offY };
  }, []);

  const visibleRatio = (r: DOMRect) => {
    const vw = window.innerWidth,
      vh = window.innerHeight;
    const xOverlap = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
    const yOverlap = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
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

      if (!completed) {
        await onPersist();
        return;
      }

      const flyEl = flyRefs.current[key];
      if (!flyEl) {
        await onPersist();
        return;
      }

      const startY = window.scrollY;
      const originDoc0 = getMouthDoc();
      const targetDoc0 = getFlyDoc(flyEl);

      let frogFocusY = Math.max(0, originDoc0.y - window.innerHeight * 0.35);
      let flyFocusY = Math.max(0, targetDoc0.y - window.innerHeight * 0.45);

      const flyR = flyEl.getBoundingClientRect();
      const frogR = frogBoxRef?.current?.getBoundingClientRect();
      const frogRatio = frogR ? visibleRatio(frogR) : 0;
      const flyVisible =
        flyR.top < window.innerHeight &&
        flyR.bottom > 0 &&
        flyR.left < window.innerWidth &&
        flyR.right > 0;

      const needCine = frogRatio < 0.75 || !flyVisible;
      setCinematic(true);

      if (needCine) {
        await animateScrollTo(frogFocusY, PRE_PAN_MS);
        await new Promise((r) => setTimeout(r, PRE_LINGER_MS));
      }

      const originDoc = getMouthDoc();
      const targetDoc = getFlyDoc(flyEl);
      frogFocusY = Math.max(0, originDoc.y - window.innerHeight * 0.35);
      flyFocusY = Math.max(0, targetDoc.y - window.innerHeight * 0.45);

      const startAt = performance.now() + OFFSET_MS;
      const camStartAt = startAt + CAM_START_DELAY;

      flyEl.style.visibility = 'visible';

      // Ensure tip is hidden before the new animation starts
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
    [cinematic, grab, flyRefs, frogBoxRef, getFlyDoc, getMouthDoc]
  );

  /* ================================================================= */
  /*  Tongue RAF – single source of truth for stroke + tip position    */
  /* ================================================================= */
  useEffect(() => {
    if (!grab) return;

    animatingRef.current = true;

    /* ------------------------------------------------------------------
     * Anchor timing to when this effect fires, NOT to when setGrab() was
     * called in triggerTongue().  On slow mobile devices the React
     * re-render between setGrab() and this useEffect can take longer than
     * OFFSET_MS, which would cause the tongue to "jump ahead" on the
     * first painted frame instead of starting smoothly from t = 0.
     * ---------------------------------------------------------------- */
    const startAt = performance.now() + OFFSET_MS;
    const camStartAt = startAt + CAM_START_DELAY;

    const p0Doc = getMouthDoc();
    const p2 = grab.targetDoc;

    const buildGeom = (p0: { x: number; y: number }) => {
      const p1 = { x: (p0.x + p2.x) / 2, y: p0.y - 120 };
      const tmp = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'path'
      );
      tmp.setAttribute(
        'd',
        `M ${p0.x} ${p0.y} Q ${p1.x} ${p1.y} ${p2.x} ${p2.y}`
      );
      const total = tmp.getTotalLength();
      return { tmp, total, p1 };
    };

    const { tmp, total, p1: p1Doc } = buildGeom(p0Doc);
    geomRef.current = {
      total,
      getPointAtLength: (s: number) => tmp.getPointAtLength(s),
      hidImpact: false,
      raf: 0,
    };

    /* -- initialise the rendered <path> so the tongue is invisible -- */
    const pathNode = tonguePathEl.current;
    if (pathNode) {
      pathNode.style.strokeDasharray = `0 ${total}`;
      pathNode.style.strokeDashoffset = '0';
    }

    /* ------------------------------------------------------------------
     * Use plain window.scrollX / scrollY for coordinate conversion
     * (layout-viewport space).  Do NOT include visualViewport.offsetTop/
     * offsetLeft – those shift when the mobile URL-bar shows/hides during
     * the programmatic scroll, causing the tongue to jump.  The fixed SVG
     * overlay and getBoundingClientRect() both operate in layout-viewport
     * space, so plain scroll offsets are the correct conversion.
     * ---------------------------------------------------------------- */
    const seedViewportPath = () => {
      const offX = window.scrollX;
      const offY = window.scrollY;
      const p0V = { x: p0Doc.x - offX, y: p0Doc.y - offY };
      const p1V = { x: p1Doc.x - offX, y: p1Doc.y - offY };
      const p2V = { x: p2.x - offX, y: p2.y - offY };
      pathNode?.setAttribute(
        'd',
        `M ${p0V.x} ${p0V.y} Q ${p1V.x} ${p1V.y} ${p2V.x} ${p2V.y}`
      );
    };
    seedViewportPath();

    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const tRaw = (now - startAt) / TONGUE_MS;
      const t = Math.max(0, Math.min(1, tRaw));

      const forward =
        t <= HIT_AT ? t / HIT_AT : 1 - (t - HIT_AT) / (1 - HIT_AT);

      /* --- camera follow ---
       *  Track the intended scroll position in a local variable rather than
       *  reading window.scrollY back after scrollTo().  On mobile browsers
       *  the read-back can be slightly off (sub-pixel rounding, URL-bar
       *  adjustments, compositing lag) which causes the tongue to jump when
       *  the camera follow stops.  Using the computed value directly keeps
       *  the path coordinates perfectly consistent frame-to-frame.
       *
       *  After HIT_AT the camera holds at flyFocusY so the scroll doesn't
       *  drift while the tongue retracts.
       * ---------------------------------------------------------------- */
      let frameScrollY = window.scrollY;

      if (grab.follow) {
        if (now >= camStartAt && t <= HIT_AT) {
          const seg =
            (now - camStartAt) / (TONGUE_MS * HIT_AT - CAM_START_DELAY);
          const clamped = Math.max(0, Math.min(1, seg));
          const eased = FOLLOW_EASE(clamped);
          frameScrollY =
            grab.frogFocusY + (grab.flyFocusY - grab.frogFocusY) * eased;
        } else if (t > HIT_AT) {
          frameScrollY = grab.flyFocusY;
        }
        window.scrollTo(0, frameScrollY);
      }

      const offX = window.scrollX;
      const offY = frameScrollY;
      const p0V = { x: p0Doc.x - offX, y: p0Doc.y - offY };
      const p1V = { x: p1Doc.x - offX, y: p1Doc.y - offY };
      const p2V = { x: p2.x - offX, y: p2.y - offY };

      /* --- update path shape + stroke visibility (replaces framer-motion) --- */
      if (pathNode) {
        pathNode.setAttribute(
          'd',
          `M ${p0V.x} ${p0V.y} Q ${p1V.x} ${p1V.y} ${p2V.x} ${p2V.y}`
        );
        const visibleLen = total * forward;
        pathNode.style.strokeDasharray = `${visibleLen} ${total}`;
      }

      /* --- update tip position directly (replaces setTip React state) --- */
      const sLen = total * forward;
      const pt = geomRef.current!.getPointAtLength(sLen);
      const ahead = geomRef.current!.getPointAtLength(
        Math.min(total, sLen + 1)
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
          `translate(${tipX}, ${tipY})`
        );
      }

      /* --- show the fly-on-tongue at impact --- */
      if (!geomRef.current!.hidImpact && t >= HIT_AT) {
        geomRef.current!.hidImpact = true;
        setVisuallyDone((prev) => new Set(prev).add(grab.key));
        if (tipGroupEl.current) {
          tipGroupEl.current.style.visibility = 'visible';
        }
      }

      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        /* ---- animation complete: hide everything immediately ---- */
        if (tipGroupEl.current) {
          tipGroupEl.current.style.visibility = 'hidden';
        }
        if (pathNode) {
          pathNode.style.strokeDasharray = `0 ${total}`;
        }

        grab.onPersist();
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
      }
    };

    setCinematic(true);
    raf = requestAnimationFrame(tick);
    if (geomRef.current) geomRef.current.raf = raf;
    return () => {
      cancelAnimationFrame(raf);
      animatingRef.current = false;
      /* Ensure visuals are hidden if effect is torn down early */
      if (tipGroupEl.current) {
        tipGroupEl.current.style.visibility = 'hidden';
      }
      if (pathNode) {
        pathNode.style.strokeDasharray = `0 ${total}`;
      }
    };
  }, [grab, getMouthDoc]);

  return {
    vp,
    cinematic,
    setCinematic,
    grab,
    tipGroupEl,
    tonguePathEl,
    triggerTongue,
    visuallyDone,
  };
}

function easeOutQuad(t: number) {
  return 1 - (1 - t) * (1 - t);
}

function animateScrollTo(targetY: number, duration: number) {
  return new Promise<void>((resolve) => {
    const start = window.scrollY;
    const dy = targetY - start;
    const t0 = performance.now();

    function frame(t: number) {
      const p = Math.min(1, (t - t0) / duration);
      const y = start + dy * easeOutQuad(p);
      window.scrollTo(0, y);
      if (p < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}
