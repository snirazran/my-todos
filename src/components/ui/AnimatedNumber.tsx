'use client';

import { useSpring } from 'framer-motion';
import { useEffect, useRef, memo } from 'react';
import { hapticTick } from '@/lib/haptics';

export const AnimatedNumber = memo(function AnimatedNumber({
  value,
  className,
  haptics = false,
}: {
  value: number;
  className?: string;
  haptics?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(Math.round(value));
  const spring = useSpring(value, { mass: 0.8, stiffness: 75, damping: 15 });

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  useEffect(() => {
    return spring.on('change', (latest) => {
      const next = Math.round(latest);
      if (haptics && next !== shown.current) hapticTick();
      shown.current = next;
      if (ref.current) {
        ref.current.textContent = next.toLocaleString();
      }
    });
  }, [spring, haptics]);

  return <span className={className} ref={ref}>{Math.round(value).toLocaleString()}</span>;
});
