import { useCallback, useRef } from 'react';
import type { DragControls } from 'framer-motion';

type Cleanup = () => void;

export function useSheetOverscrollDrag() {
  const dragControlsRef = useRef<DragControls | null>(null);
  const enabledRef = useRef(false);
  const cleanupsRef = useRef(new Map<HTMLElement, Cleanup>());

  const setContext = useCallback(
    (dragControls: DragControls, enabled: boolean) => {
      dragControlsRef.current = dragControls;
      enabledRef.current = enabled;
    },
    [],
  );

  const attach = useCallback((el: HTMLElement) => {
    if (cleanupsRef.current.has(el)) return;

    let startY = 0;
    let handedOff = false;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      startY = e.touches[0].clientY;
      handedOff = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (handedOff || !enabledRef.current || e.touches.length !== 1) return;
      const deltaY = e.touches[0].clientY - startY;
      if (el.scrollTop <= 0 && deltaY > 6) {
        handedOff = true;
        e.preventDefault();
        // Framer Motion's drag handlers read clientX/clientY on any event-like
        // input; touch events work at runtime even though the types only list
        // PointerEvent.
        dragControlsRef.current?.start(e as unknown as PointerEvent);
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });

    cleanupsRef.current.set(el, () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
    });
  }, []);

  const bind = useCallback(
    (el: HTMLElement | null) => {
      if (!el) return;
      attach(el);
    },
    [attach],
  );

  return { bind, setContext };
}
