'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DAYS } from '../helpers';

export type DragState = {
  active: boolean;
  fromDay: number;
  fromIndex: number;
  taskId: string;
  taskText: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  width: number;
  height: number;
};

export function useDragManager() {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);
  const listRefs = useRef<Array<HTMLDivElement | null>>([]);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const [drag, setDrag] = useState<DragState | null>(null);
  const [targetDay, setTargetDay] = useState<number | null>(null);
  const [targetIndex, setTargetIndex] = useState<number | null>(null);

  // pointer tracking
  const pointerXRef = useRef(0);
  const pointerYRef = useRef(0);
  const pxPrevRef = useRef(0);
  const pxVelRef = useRef(0);
  const pxVelSmoothedRef = useRef(0);

  // remember scroller inline styles so we can restore after drag
  const prevTouchAction = useRef<string>('');
  const prevSnapType = useRef<string>('');
  const prevWebkitOverflow = useRef<string>('');
  const prevOverscroll = useRef<string>('');

  const setSlideRef =
    (day: number) =>
    (el: HTMLDivElement | null): void => {
      slideRefs.current[day] = el;
    };
  const setListRef =
    (day: number) =>
    (el: HTMLDivElement | null): void => {
      listRefs.current[day] = el;
    };
  const setCardRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (!el) cardRefs.current.delete(id);
    else cardRefs.current.set(id, el);
  }, []);

  const lockScrollerForDrag = () => {
    const s = scrollerRef.current as HTMLDivElement | null;
    if (!s) return;
    // save
    const st = s.style as any;
    prevTouchAction.current = st.touchAction || '';
    prevSnapType.current = st.scrollSnapType || '';
    prevWebkitOverflow.current = st.webkitOverflowScrolling || '';
    prevOverscroll.current = st.overscrollBehavior || '';
    // lock
    st.touchAction = 'none'; // block UA panning on both axes
    st.scrollSnapType = 'none'; // avoid snap fights during drag
    st.webkitOverflowScrolling = 'auto'; // iOS: disable momentum
    st.overscrollBehavior = 'contain'; // avoid nav gestures / PTR
  };

  const unlockScrollerAfterDrag = () => {
    const s = scrollerRef.current as HTMLDivElement | null;
    if (!s) return;
    const st = s.style as any;
    st.touchAction = prevTouchAction.current || '';
    st.scrollSnapType = prevSnapType.current || '';
    st.webkitOverflowScrolling = prevWebkitOverflow.current || '';
    st.overscrollBehavior = prevOverscroll.current || '';
  };

  const restoreGlobalInteraction = useCallback(() => {
    document.body.style.userSelect = '';
    document.body.style.touchAction = '';
    document.documentElement.classList.remove('dragging');
    unlockScrollerAfterDrag();
  }, []);

  const beginDragFromCard = useCallback(
    (
      day: number,
      index: number,
      taskId: string,
      taskText: string,
      clientX: number,
      clientY: number,
      rect: DOMRect
    ) => {
      document.body.style.userSelect = 'none';
      document.body.style.touchAction = 'none'; // block body scroll
      document.documentElement.classList.add('dragging');

      // CRITICAL: lock the actual scroller that would normally pan horizontally.
      lockScrollerForDrag();

      pointerXRef.current = clientX;
      pointerYRef.current = clientY;
      pxPrevRef.current = clientX;
      pxVelRef.current = 0;
      pxVelSmoothedRef.current = 0;

      setDrag({
        active: true,
        fromDay: day,
        fromIndex: index,
        taskId,
        taskText,
        x: clientX,
        y: clientY,
        dx: clientX - rect.left,
        dy: clientY - rect.top,
        width: rect.width,
        height: rect.height,
      });
      setTargetDay(day);
      setTargetIndex(index);
    },
    []
  );

  const onGrab = useCallback(
    (params: {
      day: number;
      index: number;
      taskId: string;
      taskText: string;
      clientX: number;
      clientY: number;
      rectGetter: () => DOMRect;
    }) => {
      const { day, index, taskId, taskText, clientX, clientY, rectGetter } =
        params;

      const rect = rectGetter();
      beginDragFromCard(day, index, taskId, taskText, clientX, clientY, rect);
    },
    [beginDragFromCard]
  );

  const endDrag = useCallback(() => {
    restoreGlobalInteraction();
    setDrag(null);
    setTargetDay(null);
    setTargetIndex(null);
  }, [restoreGlobalInteraction]);

  const cancelDrag = useCallback(() => {
    restoreGlobalInteraction();
    setDrag(null);
    setTargetDay(null);
    setTargetIndex(null);
  }, [restoreGlobalInteraction]);

  // movement + target computation
  useEffect(() => {
    if (!drag) return;

    const handleMove = (ev: PointerEvent | MouseEvent | TouchEvent) => {
      if ((ev as any).cancelable) ev.preventDefault(); // keep UA from hijacking
      // @ts-ignore
      const pt = 'touches' in ev ? ev.touches?.[0] : ev;
      const x = (pt?.clientX ?? 0) as number;
      const y = (pt?.clientY ?? 0) as number;

      pointerXRef.current = x;
      pointerYRef.current = y;

      const instV = x - pxPrevRef.current;
      pxPrevRef.current = x;
      pxVelRef.current = instV;

      setDrag((d) => (d ? { ...d, x, y } : d));

      // find column
      let newDay: number | null = null;
      for (let day = 0; day < DAYS; day++) {
        const col = slideRefs.current[day];
        if (!col) continue;
        const r = col.getBoundingClientRect();
        if (x >= r.left && x <= r.right) {
          newDay = day;
          break;
        }
      }
      if (newDay == null) {
        let minDist = Infinity,
          best: number | null = null;
        for (let day = 0; day < DAYS; day++) {
          const col = slideRefs.current[day];
          if (!col) continue;
          const r = col.getBoundingClientRect();
          const dist = x < r.left ? r.left - x : x - r.right;
          if (dist < minDist) {
            minDist = dist;
            best = day;
          }
        }
        newDay = best;
      }

      // compute index (cards only)
      let newIndex = 0;
      if (newDay != null) {
        const list = listRefs.current[newDay];
        if (list) {
          const cardEls = Array.from(
            list.querySelectorAll<HTMLElement>('[data-card-id]')
          );
          if (cardEls.length === 0) newIndex = 0;
          else {
            let placed = false;
            for (let i = 0; i < cardEls.length; i++) {
              const cr = cardEls[i].getBoundingClientRect();
              const mid = cr.top + cr.height / 2;
              if (y < mid) {
                newIndex = i;
                placed = true;
                break;
              }
            }
            if (!placed) newIndex = cardEls.length;
          }
        }
      }
      setTargetDay(newDay);
      setTargetIndex(newIndex);
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelDrag();
    };

    window.addEventListener('pointermove', handleMove as any, {
      passive: false,
    });
    window.addEventListener('touchmove', handleMove as any, { passive: false });
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('pointermove', handleMove as any);
      window.removeEventListener('touchmove', handleMove as any);
      window.removeEventListener('keydown', handleKey);
    };
  }, [drag, cancelDrag]);

  // edge auto-scroll (unchanged)
  useEffect(() => {
    if (!drag) return;
    const s = scrollerRef.current;
    if (!s) return;

    let raf = 0;
    const EDGE_X = 96,
      EDGE_Y = 72,
      VP_EDGE_Y = 80,
      HYST = 10;
    const MIN_V = 2,
      MAX_V = 24;
    const clamp = (v: number, a: number, b: number) =>
      Math.max(a, Math.min(b, v));
    const easeCubic = (t: number) => t * t * t;
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const tick = () => {
      const px = pointerXRef.current;
      const py = pointerYRef.current;

      // horizontal autoscroll near edges (only if not near bottom)
      const rect = s.getBoundingClientRect();
      const isNearBottom = py > window.innerHeight - 150; // Disable H-scroll if near bottom buttons
      
      let distFactor = 0,
        dir = 0;
        
      if (!isNearBottom) {
        if (px > rect.right - EDGE_X) {
          const d = px - (rect.right - EDGE_X);
          if (d > HYST) {
            distFactor = clamp((d - HYST) / (EDGE_X - HYST), 0, 1);
            dir = +1;
          }
        } else if (px < rect.left + EDGE_X) {
          const d = rect.left + EDGE_X - px;
          if (d > HYST) {
            distFactor = clamp((d - HYST) / (EDGE_X - HYST), 0, 1);
            dir = -1;
          }
        }
      }
      
      const inst = pxVelRef.current;
      const velSmoothed = lerp(pxVelSmoothedRef.current, inst, 0.18);
      pxVelSmoothedRef.current = velSmoothed;
      const speedFactor = clamp(Math.abs(velSmoothed) / 20, 0, 1);
      const combined = clamp(
        easeCubic(distFactor) * 0.85 + speedFactor * 0.35,
        0,
        1
      );
      const vx = dir * (MIN_V + (MAX_V - MIN_V) * combined);
      if (dir !== 0) s.scrollLeft += vx;

      // vertical autoscroll inside the list (unchanged)
      const dayForV = targetDay != null ? targetDay : drag.fromDay;
      const list = listRefs.current[dayForV];
      if (list) {
        const lr = list.getBoundingClientRect();
        let distY = 0,
          dirY = 0;
        if (py > lr.bottom - EDGE_Y) {
          const d = py - (lr.bottom - EDGE_Y);
          if (d > HYST) {
            distY = clamp((d - HYST) / (EDGE_Y - HYST), 0, 1);
            dirY = +1;
          }
        } else if (py < lr.top + EDGE_Y) {
          const d = lr.top + EDGE_Y - py;
          if (d > HYST) {
            distY = clamp((d - HYST) / (EDGE_Y - HYST), 0, 1);
            dirY = -1;
          }
        }
        if (dirY === 0) {
          const vpBottom = window.innerHeight,
            vpTop = 0,
            VP = VP_EDGE_Y;
          if (py > vpBottom - VP) {
            const d = py - (vpBottom - VP);
            if (d > HYST) {
              distY = clamp((d - HYST) / (VP - HYST), 0, 1);
              dirY = +1;
            }
          } else if (py < vpTop + VP) {
            const d = vpTop + VP - py;
            if (d > HYST) {
              distY = clamp((d - HYST) / (VP - HYST), 0, 1);
              dirY = -1;
            }
          }
        }
        if (dirY !== 0) {
          const vy = dirY * (MIN_V + (MAX_V - MIN_V) * easeCubic(distY));
          list.scrollTop += vy;
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [drag, targetDay]);

  // safety nets
  useEffect(() => {
    return () => {
      restoreGlobalInteraction();
    };
  }, [restoreGlobalInteraction]);

  useEffect(() => {
    if (!drag?.active) return;

    const abort = () => cancelDrag();
    const onVis = () => {
      if (document.hidden) cancelDrag();
    };

    window.addEventListener('pointercancel', abort, { passive: true });
    window.addEventListener('blur', abort, { passive: true });
    window.addEventListener('pagehide', abort, { passive: true });
    document.addEventListener('visibilitychange', onVis);

    return () => {
      window.removeEventListener('pointercancel', abort as any);
      window.removeEventListener('blur', abort as any);
      window.removeEventListener('pagehide', abort as any);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [drag?.active, cancelDrag]);

  return {
    scrollerRef,
    slideRefs,
    listRefs,
    cardRefs,
    setSlideRef,
    setListRef,
    setCardRef,
    drag,
    setDrag,
    targetDay,
    setTargetDay,
    targetIndex,
    setTargetIndex,
    onGrab,
    endDrag,
    cancelDrag,
  };
}
