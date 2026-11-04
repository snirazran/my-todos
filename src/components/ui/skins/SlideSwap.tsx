'use client';

import { useRef, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import { cn } from '@/lib/utils';

const SHIFT = 36;
const shift = (px: number) => `translateX(${px}px)`;

const variants: Variants = {
  enter: (dir: number) => ({ transform: shift(dir * SHIFT), opacity: 0 }),
  center: {
    transform: shift(0),
    opacity: 1,
    transition: {
      transform: { type: 'spring', visualDuration: 0.36, bounce: 0.18 },
      opacity: { duration: 0.2, delay: 0.06, ease: [0.2, 0, 0, 1] },
    },
  },
  exit: (dir: number) => ({
    transform: shift(dir * -SHIFT),
    opacity: 0,
    pointerEvents: 'none',
    transition: {
      transform: { duration: 0.2, ease: [0.3, 0, 1, 1] },
      opacity: { duration: 0.09, ease: 'linear' },
    },
  }),
};

export function SlideSwap({
  id,
  order,
  children,
  className,
}: {
  id: string;
  order: readonly string[];
  children: ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const prevId = useRef(id);
  const dir = useRef(0);
  if (prevId.current !== id) {
    const from = order.indexOf(prevId.current);
    const to = order.indexOf(id);
    dir.current = reduceMotion ? 0 : to >= from ? 1 : -1;
    prevId.current = id;
  }

  return (
    <div className={cn('relative', className)}>
      <AnimatePresence mode="popLayout" initial={false} custom={dir.current}>
        <motion.div
          key={id}
          custom={dir.current}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
