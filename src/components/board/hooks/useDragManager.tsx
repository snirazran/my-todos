'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DAYS } from '../helpers'; // adjust path if different

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
  const needsFirstAlignRef = useRef(false);
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

  // long-press on touch
  const longPressTimer = useRef<number | null>(null);
  const pressStartXY = useRef<{ x: number; y: number } | null>(null);
  const LONG_MS = 230;
  const MOVE_TOL = 8;

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
      document.body.style.touchAction = 'none';
      document.documentElement.classList.add('dragging');

      // also blur any focused control (prevents focus-induced jumps)
      const ae = document.activeElement as HTMLElement | null;
      if (ae && typeof ae.blur === 'function') ae.blur();

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

      // ⬅️ tell the mover to align once on the next frame
      needsFirstAlignRef.current = true;

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
      pointerType: 'mouse' | 'touch';
      rectGetter: () => DOMRect; // ⬅️ fresh rect provider
    }) => {
      const {
        day,
        index,
        taskId,
        taskText,
        clientX,
        clientY,
        pointerType,
        rectGetter,
      } = params;

      if (pointerType === 'mouse') {
        const rect = rectGetter();
        beginDragFromCard(day, index, taskId, taskText, clientX, clientY, rect);
        return;
      }

      // long-press on touch
      pressStartXY.current = { x: clientX, y: clientY };
      if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
      longPressTimer.current = window.setTimeout(() => {
        const rect = rectGetter(); // ⬅️ recompute at the exact start moment
        beginDragFromCard(
          day,
          index,
          taskId,
          taskText,
          pointerXRef.current,
          pointerYRef.current,
          rect
        );
      }, LONG_MS);
    },
    [beginDragFromCard]
  );

  // cancel long-press if the finger moves too much before timeout
  useEffect(() => {
    const cancelLP = () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    };
    const move = (ev: TouchEvent | PointerEvent | MouseEvent) => {
      // @ts-ignore
      const pt = 'touches' in ev ? ev.touches?.[0] : ev;
      const x = (pt?.clientX ?? 0) as number;
      const y = (pt?.clientY ?? 0) as number;
      pointerXRef.current = x;
      pointerYRef.current = y;
      const s = pressStartXY.current;
      if (s && (Math.abs(x - s.x) > MOVE_TOL || Math.abs(y - s.y) > MOVE_TOL))
        cancelLP();
    };
    window.addEventListener('pointermove', move as any, { passive: true });
    window.addEventListener('touchmove', move as any, { passive: true });
    window.addEventListener('pointerup', cancelLP as any, { passive: true });
    window.addEventListener('touchend', cancelLP as any, { passive: true });
    return () => {
      window.removeEventListener('pointermove', move as any);
      window.removeEventListener('touchmove', move as any);
      window.removeEventListener('pointerup', cancelLP as any);
      window.removeEventListener('touchend', cancelLP as any);
    };
  }, []);

  const endDrag = useCallback(() => {
    document.body.style.userSelect = '';
    document.body.style.touchAction = '';
    document.documentElement.classList.remove('dragging');
    setDrag(null);
    setTargetDay(null);
    setTargetIndex(null);
  }, []);

  const cancelDrag = useCallback(() => {
    document.body.style.userSelect = '';
    document.body.style.touchAction = '';
    document.documentElement.classList.remove('dragging');
    setDrag(null);
    setTargetDay(null);
    setTargetIndex(null);
  }, []);

  // Update drag position, compute target day/index
  useEffect(() => {
    if (!drag) return;

    const handleMove = (ev: PointerEvent | MouseEvent | TouchEvent) => {
      // ⬅️ prevent native scroll/selection while dragging (mobile)
      if ((ev as any).cancelable) ev.preventDefault();

      // @ts-ignore
      const pt = 'touches' in ev ? ev.touches?.[0] : ev;
      const x = (pt?.clientX ?? 0) as number;
      const y = (pt?.clientY ?? 0) as number;

      pointerXRef.current = x;
      pointerYRef.current = y;

      if (needsFirstAlignRef.current) {
        const el =
          cardRefs.current.get(drag.taskId) ||
          // if you map by draggableId, adapt here:
          // const el = cardRefs.current.get(draggableIdFor(drag.fromDay, drag.taskId))
          null;
        const r = el?.getBoundingClientRect();
        if (r) {
          setDrag((d) => (d ? { ...d, dx: x - r.left, dy: y - r.top } : d));
        }
        needsFirstAlignRef.current = false;
      }

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

      // index using only cards
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

    // ⬅️ IMPORTANT: non-passive so preventDefault works on iOS/Android
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

  // Edge auto-scroll
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

      // horizontal
      const rect = s.getBoundingClientRect();
      let distFactor = 0,
        dir = 0;
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

      // vertical
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

  return {
    // refs
    scrollerRef,
    slideRefs,
    listRefs,
    cardRefs,
    setSlideRef,
    setListRef,
    setCardRef,
    // drag state
    drag,
    setDrag,
    targetDay,
    setTargetDay,
    targetIndex,
    setTargetIndex,
    // handlers
    onGrab,
    endDrag,
    cancelDrag,
  };
}
