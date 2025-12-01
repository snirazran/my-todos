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

  // Refs to hold drag invariants to avoid effect dependencies
  const dragActiveRef = useRef(false);
  const dragFromDayRef = useRef<number>(0);

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
    if (s) {
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
    }

    // Lock all vertical lists to prevent browser scrolling from stealing the drag
    listRefs.current.forEach((el) => {
      if (el) {
        el.style.overflowY = 'hidden';
        el.style.touchAction = 'none';
        el.style.overscrollBehavior = 'none';
      }
    });
  };

  const unlockScrollerAfterDrag = () => {
    const s = scrollerRef.current as HTMLDivElement | null;
    if (s) {
      const st = s.style as any;
      st.touchAction = prevTouchAction.current || '';
      st.scrollSnapType = prevSnapType.current || '';
      st.webkitOverflowScrolling = prevWebkitOverflow.current || '';
      st.overscrollBehavior = prevOverscroll.current || '';
    }

    // Unlock vertical lists
    listRefs.current.forEach((el) => {
      if (el) {
        el.style.overflowY = '';
        el.style.touchAction = '';
        el.style.overscrollBehavior = '';
      }
    });
  };

  const restoreGlobalInteraction = useCallback(() => {
    document.body.style.userSelect = '';
    document.body.style.touchAction = '';
    document.documentElement.classList.remove('dragging');
    unlockScrollerAfterDrag();
    dragActiveRef.current = false;
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

      dragActiveRef.current = true;
      dragFromDayRef.current = day;

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

  // Unified Loop: Event Tracking + Auto-Scroll + Target Detection
  useEffect(() => {
    if (!dragActiveRef.current) return;

    // Event handlers just update refs
    const handleMove = (ev: PointerEvent | MouseEvent | TouchEvent) => {
      if ((ev as any).cancelable) ev.preventDefault();
      // @ts-ignore
      const pt = 'touches' in ev ? ev.touches?.[0] : ev;
      const x = (pt?.clientX ?? 0) as number;
      const y = (pt?.clientY ?? 0) as number;

      pointerXRef.current = x;
      pointerYRef.current = y;

      // Velocity calc (keep it here or move to tick? Moving to tick is smoother for smoothing)
      // But we need 'fresh' data for velocity. 
      // Let's keep simple ref update here.
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelDrag();
    };

    window.addEventListener('pointermove', handleMove as any, { passive: false });
    window.addEventListener('touchmove', handleMove as any, { passive: false });
    window.addEventListener('keydown', handleKey);

    // Animation Loop
    let raf = 0;
    
    // Responsive constants
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    
    // Mobile needs larger edge zones and faster max speed because screen is smaller relative to finger
    const EDGE_X = isMobile ? 120 : 96;
    const EDGE_Y = 72;
    const VP_EDGE_Y = 80;
    const HYST = 10;
    
    const MIN_V = isMobile ? 4 : 2;
    const MAX_V = isMobile ? 32 : 24;
    
    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
    // Switch to Quadratic easing (t*t) for snappier response than Cubic (t*t*t)
    const easeQuad = (t: number) => t * t; 
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const tick = () => {
      if (!dragActiveRef.current) return;

      const px = pointerXRef.current;
      const py = pointerYRef.current;

      // --- 1. Velocity Calculation ---
      const instV = px - pxPrevRef.current;
      pxPrevRef.current = px;
      pxVelRef.current = instV; 

      // --- 2. Update Drag State (Visuals) ---
      setDrag((d) => {
        if (!d) return null;
        if (d.x === px && d.y === py) return d; 
        return { ...d, x: px, y: py };
      });

      // --- 3. Auto-Scroll Logic ---
      const s = scrollerRef.current;
      if (s) {
        const rect = s.getBoundingClientRect();
        const isNearBottom = py > window.innerHeight - 150; 
        
        let distFactor = 0, dir = 0;
          
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
        
        // Less smoothing on mobile for "instant" feel
        const smoothFactor = isMobile ? 0.3 : 0.18;
        const velSmoothed = lerp(pxVelSmoothedRef.current, pxVelRef.current, smoothFactor);
        pxVelSmoothedRef.current = velSmoothed;
        
        // Lower divisor means velocity has MORE impact on scroll speed
        const velInfluenceDivisor = isMobile ? 12 : 20;
        const speedFactor = clamp(Math.abs(velSmoothed) / velInfluenceDivisor, 0, 1);
        
        // Combine distance (easeQuad) and velocity
        const combined = clamp(easeQuad(distFactor) * 0.85 + speedFactor * 0.35, 0, 1);
        
        const vx = dir * (MIN_V + (MAX_V - MIN_V) * combined);
        
        if (dir !== 0) {
            s.scrollLeft += vx;
        }
      }

      // --- 4. Target Detection ---
      // Find Column
      let newDay: number | null = null;
      for (let day = 0; day < DAYS; day++) {
        const col = slideRefs.current[day];
        if (!col) continue;
        const r = col.getBoundingClientRect();
        // Use center-point check or strict bound?
        // Using bounds is usually fine, but if we scrolled, bounds updated.
        if (px >= r.left && px <= r.right) {
          newDay = day;
          break;
        }
      }
      // Fallback: Closest Column
      if (newDay == null) {
        let minDist = Infinity, best: number | null = null;
        for (let day = 0; day < DAYS; day++) {
          const col = slideRefs.current[day];
          if (!col) continue;
          const r = col.getBoundingClientRect();
          const dist = px < r.left ? r.left - px : px - r.right;
          if (dist < minDist) {
            minDist = dist;
            best = day;
          }
        }
        newDay = best;
      }

      // Find Index (Vertical Auto-Scroll mixed in here usually, but let's separate index logic)
      // First, Vertical Scroll:
      const dayForV = newDay != null ? newDay : dragFromDayRef.current;
      const list = listRefs.current[dayForV];
      
      if (list) {
        const lr = list.getBoundingClientRect();
        let distY = 0, dirY = 0;
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
        // Viewport edge check
        if (dirY === 0) {
           const vpBottom = window.innerHeight;
           const vpTop = 0;
           const VP = VP_EDGE_Y;
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
           const vy = dirY * (MIN_V + (MAX_V - MIN_V) * easeQuad(distY));
           list.scrollTop += vy;
        }

        // Determine Index
        let newIndex = 0;
        const cardEls = Array.from(list.querySelectorAll<HTMLElement>('[data-card-id]'));
        if (cardEls.length > 0) {
           let placed = false;
           // Optimization: Binary search could be better but linear is fine for <100 items
           for (let i = 0; i < cardEls.length; i++) {
             const cr = cardEls[i].getBoundingClientRect();
             const mid = cr.top + cr.height / 2;
             if (py < mid) {
               newIndex = i;
               placed = true;
               break;
             }
           }
           if (!placed) newIndex = cardEls.length;
        }
        
        setTargetIndex(prev => prev === newIndex ? prev : newIndex);
      }

      setTargetDay(prev => prev === newDay ? prev : newDay);

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('pointermove', handleMove as any);
      window.removeEventListener('touchmove', handleMove as any);
      window.removeEventListener('keydown', handleKey);
      cancelAnimationFrame(raf);
    };
  }, [drag?.active, cancelDrag]); // No 'drag' dependency, relies on dragActiveRef and Refs

  // safety nets
  useEffect(() => {
    return () => {
      restoreGlobalInteraction();
    };
  }, [restoreGlobalInteraction]);

  useEffect(() => {
    // Watch for external interruptions
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
  }, [cancelDrag]); // Depend on cancelDrag which is stable

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
