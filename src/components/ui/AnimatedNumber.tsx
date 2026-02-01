'use client';

import { useSpring } from 'framer-motion';
import { useEffect, useRef, memo } from 'react';

export const AnimatedNumber = memo(function AnimatedNumber({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const spring = useSpring(value, { mass: 0.8, stiffness: 75, damping: 15 });

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  useEffect(() => {
    return spring.on('change', (latest) => {
      if (ref.current) {
        ref.current.textContent = Math.round(latest).toLocaleString();
      }
    });
  }, [spring]);

  return <span className={className} ref={ref}>{Math.round(value).toLocaleString()}</span>;
});
