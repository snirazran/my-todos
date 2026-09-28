'use client';

import { useEffect, useState } from 'react';

export function useHideOnScroll(threshold = 12): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const scroller = document.getElementById('main-scroll');
    const readY = () => (scroller ? scroller.scrollTop : window.scrollY);
    const target: HTMLElement | Window = scroller ?? window;
    let lastY = readY();
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const y = readY();
        const delta = y - lastY;
        if (y <= 80) {
          setHidden(false);
          lastY = y;
        } else if (Math.abs(delta) >= threshold) {
          setHidden(delta > 0);
          lastY = y;
        }
      });
    };
    target.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      target.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [threshold]);

  return hidden;
}
