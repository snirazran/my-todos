'use client';

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

function isScrollable(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement) || el.scrollHeight <= el.clientHeight + 1) return false;
  const { overflowY } = getComputedStyle(el);
  return overflowY === 'auto' || overflowY === 'scroll';
}

function findScroller(): HTMLElement | null {
  let el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
  while (el && el !== document.body) {
    if (isScrollable(el) && el.scrollTop > 0) return el;
    el = el.parentElement;
  }
  return document.getElementById('main-scroll');
}

export function StatusTapScroll() {
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'ios') return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onStatusTap = () => {
      const scroller = findScroller();
      if (!scroller || scroller.scrollTop <= 0) return;
      scroller.style.overflowY = 'hidden';
      requestAnimationFrame(() => {
        scroller.style.overflowY = '';
        scroller.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      });
    };
    window.addEventListener('statusTap', onStatusTap);
    return () => window.removeEventListener('statusTap', onStatusTap);
  }, []);

  return null;
}
