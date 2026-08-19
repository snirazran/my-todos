'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  // A lingering `transform` makes this element the containing block for any
  // `position: fixed` descendant (the board's drag overlay is one), so the
  // transform is dropped for good once the reveal has played.
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      setSettled(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShown(true);
        observer.disconnect();
      },
      {
        root: document.getElementById('main-scroll'),
        rootMargin: '0px 0px -10% 0px',
        threshold: 0.01,
      },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shown || settled) return;
    const timer = window.setTimeout(() => setSettled(true), delay + 1100);
    return () => window.clearTimeout(timer);
  }, [shown, settled, delay]);

  return (
    <div
      ref={ref}
      data-reveal
      style={delay && !settled ? { transitionDelay: `${delay}ms` } : undefined}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget) setSettled(true);
      }}
      className={cn(
        // As a grid/flex child this wrapper defaults to min-width:auto, which
        // would let a horizontally scrollable child (the planner rail) push the
        // whole column wider than the viewport instead of scrolling.
        'min-w-0 transition-[opacity,transform] duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
        settled
          ? 'transform-none opacity-100'
          : shown
            ? 'translate-y-0 opacity-100'
            : 'translate-y-6 opacity-0',
        className,
      )}
    >
      {children}
    </div>
  );
}
