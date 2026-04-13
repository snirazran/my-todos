'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface BaseSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: (props: { isDesktop: boolean; dragControls: any }) => React.ReactNode;
  /** Extra classes on the sheet panel itself */
  className?: string;
  /** Extra classes on the backdrop */
  backdropClassName?: string;
  /** z-index for the backdrop (sheet is +1). Default 1050 */
  zIndex?: number;
}

const transition = { type: 'spring' as const, damping: 26, stiffness: 260 };

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
              'fixed inset-0 bg-background/70 backdrop-blur-md',
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
              transition={transition}
              drag={!isDesktop ? 'y' : false}
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.45 }}
              dragMomentum={false}
              dragSnapToOrigin
              onDragEnd={(_e, { offset, velocity }) => {
                if (offset.y > 120 || velocity.y > 650) onOpenChange(false);
              }}
              className={cn(
                'pointer-events-auto flex w-full flex-col overflow-hidden rounded-t-[32px] border border-border/50 bg-card/95 text-card-foreground shadow-2xl backdrop-blur-2xl sm:rounded-[34px]',
                className,
              )}
            >
              {children({ isDesktop, dragControls })}

              {/* Drag handle – mobile only */}
              {!isDesktop && (
                <div
                  className="absolute inset-x-0 top-0 z-[60] h-10 pointer-events-none flex items-center justify-center"
                >
                   <div 
                    className="w-12 h-1.5 rounded-full bg-border/60 pointer-events-auto touch-none" 
                    onPointerDown={(e) => dragControls.start(e)}
                   />
                </div>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
