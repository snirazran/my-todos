'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface BaseSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: (props: {
    isDesktop: boolean;
    dragControls: any;
    isDragging: boolean;
  }) => React.ReactNode;
  /** Extra classes on the sheet panel itself */
  className?: string;
  /** Extra classes on the backdrop */
  backdropClassName?: string;
  /** z-index for the backdrop (sheet is +1). Default 1050 */
  zIndex?: number;
}

const desktopTransition = {
  type: 'tween' as const,
  duration: 0.18,
  ease: [0.25, 0.1, 0.25, 1] as const,
};
const mobileTransition = {
  type: 'tween' as const,
  duration: 0.14,
  ease: [0.25, 0.1, 0.25, 1] as const,
};

export function BaseSheet({
  open,
  onOpenChange,
  children,
  className,
  backdropClassName,
  zIndex = 1050,
}: BaseSheetProps) {
  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragControls = useDragControls();

  useEffect(() => {
    setMounted(true);
    const check = () =>
      setIsDesktop(window.matchMedia('(min-width: 640px)').matches);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
            className={cn(
              'fixed inset-0 bg-background/55 sm:bg-background/70 sm:backdrop-blur-md will-change-[opacity]',
              backdropClassName,
            )}
            style={{ zIndex }}
          />

          {/* Sheet wrapper */}
          <div
            className="pointer-events-none fixed inset-0 flex items-end justify-center p-0 sm:items-center sm:p-6"
            style={{ zIndex: zIndex + 1 }}
          >
            <motion.div
              initial={
                isDesktop ? { opacity: 0, scale: 0.98 } : { y: '100%' }
              }
              animate={isDesktop ? { opacity: 1, scale: 1 } : { y: 0 }}
              exit={
                isDesktop ? { opacity: 0, scale: 0.98 } : { y: '100%' }
              }
              transition={isDesktop ? desktopTransition : mobileTransition}
              drag={!isDesktop ? 'y' : false}
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              dragMomentum={false}
              onDragStart={() => setIsDragging(true)}
              onDragEnd={(_e, { offset, velocity }) => {
                setIsDragging(false);
                if (offset.y > 120 || velocity.y > 400) onOpenChange(false);
              }}
              style={{ willChange: 'transform' }}
              className={cn(
                'pointer-events-auto flex w-full flex-col overflow-hidden rounded-t-[24px] border border-border/50 bg-card text-card-foreground shadow-lg will-change-transform sm:rounded-[34px] sm:shadow-2xl',
                className,
              )}
            >
              {/* Drag handle – mobile only */}
              {!isDesktop && (
                <div
                  className="flex-none h-7 flex items-center justify-center touch-none cursor-grab active:cursor-grabbing shrink-0"
                  onPointerDown={(e) => dragControls.start(e)}
                >
                  <div className="w-12 h-1.5 rounded-full bg-border/60" />
                </div>
              )}

              {children({ isDesktop, dragControls, isDragging })}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
