'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const [tipVisible, setTipVisible] = useState(false);
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
      const vv = window.visualViewport;
      if (vv) {
        setVp({ w: Math.round(vv.width), h: Math.round(vv.height) });
      } else {
        setVp({ w: window.innerWidth, h: window.innerHeight });
      }
    };
    set();
    window.addEventListener('resize', set);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', set);
      window.visualViewport.addEventListener('scroll', set);
    }
    return () => {
      window.removeEventListener('resize', set);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', set);
        window.visualViewport.removeEventListener('scroll', set);
      }
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
      setTipVisible(false);

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

  /* Tongue RAF */
  useEffect(() => {
    if (!grab) return;

    let p0Doc = getMouthDoc();
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

    let { tmp, total, p1: p1Doc } = buildGeom(p0Doc);
    geomRef.current = {
      total,
      getPointAtLength: (s: number) => tmp.getPointAtLength(s),
      hidImpact: false,
      raf: 0,
    };

    const seedViewportPath = () => {
      const vv = window.visualViewport;
      const offX = window.scrollX + (vv?.offsetLeft ?? 0);
      const offY = window.scrollY + (vv?.offsetTop ?? 0);
      const p0V = { x: p0Doc.x - offX, y: p0Doc.y - offY };
      const p1V = { x: p1Doc.x - offX, y: p1Doc.y - offY };
      const p2V = { x: p2.x - offX, y: p2.y - offY };
      tonguePathEl.current?.setAttribute(
        'd',
        `M ${p0V.x} ${p0V.y} Q ${p1V.x} ${p1V.y} ${p2V.x} ${p2V.y}`
      );
    };
    seedViewportPath();

    const settleUntil = grab.startAt + 140;
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const tRaw = (now - grab.startAt) / TONGUE_MS;
      const t = Math.max(0, Math.min(1, tRaw));

      const forward =
        t <= HIT_AT ? t / HIT_AT : 1 - (t - HIT_AT) / (1 - HIT_AT);

      const vv = window.visualViewport;
      const offX = window.scrollX + (vv?.offsetLeft ?? 0);
      const offY = window.scrollY + (vv?.offsetTop ?? 0);
      const p0V = { x: p0Doc.x - offX, y: p0Doc.y - offY };
      const p1V = { x: p1Doc.x - offX, y: p1Doc.y - offY };
      const p2V = { x: p2.x - offX, y: p2.y - offY };
      tonguePathEl.current?.setAttribute(
        'd',
        `M ${p0V.x} ${p0V.y} Q ${p1V.x} ${p1V.y} ${p2V.x} ${p2V.y}`
      );

      const sLen = geomRef.current!.total * forward;
      const pt = geomRef.current!.getPointAtLength(sLen);
      const ahead = geomRef.current!.getPointAtLength(
        Math.min(geomRef.current!.total, sLen + 1)
      );
      const dx = ahead.x - pt.x,
        dy = ahead.y - pt.y;
      const len = Math.hypot(dx, dy) || 1;
      const ox = (dx / len) * (TONGUE_STROKE / 2);
      const oy = (dy / len) * (TONGUE_STROKE / 2);
      setTip({ x: pt.x + ox - offX, y: pt.y + oy - offY });

      if (!geomRef.current!.hidImpact && t >= HIT_AT) {
        geomRef.current!.hidImpact = true;
        setVisuallyDone((prev) => new Set(prev).add(grab.key));
        setTipVisible(true);
      }

      if (grab.follow && now >= grab.camStartAt && t <= HIT_AT) {
        const seg =
          (now - grab.camStartAt) / (TONGUE_MS * HIT_AT - CAM_START_DELAY);
        const clamped = Math.max(0, Math.min(1, seg));
        const eased = FOLLOW_EASE(clamped);
        const camY =
          grab.frogFocusY + (grab.flyFocusY - grab.frogFocusY) * eased;
        window.scrollTo(0, camY);
      }

      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setTip(null);
        setTipVisible(false);
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
      if (geomRef.current?.raf) cancelAnimationFrame(geomRef.current.raf);
    };
  }, [grab, getMouthDoc]);

  return {
    vp,
    cinematic,
    setCinematic,
    grab,
    tip,
    tipVisible,
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
