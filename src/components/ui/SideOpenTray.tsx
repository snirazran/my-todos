import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSheetOverscrollDrag } from './useSheetOverscrollDrag';

interface SideOpenTrayProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  headerActions?: React.ReactNode;
  rightActions?: React.ReactNode;
  isDraggingAny?: boolean;
  closeProgress?: number;
  className?: string;
  iconContainerClassName?: string;
  lockScroll?: boolean;
}

export const SideOpenTray = React.forwardRef<HTMLDivElement, SideOpenTrayProps>(
  (
    {
      isOpen,
      onClose,
      title,
      subtitle,
      icon,
      children,
      headerActions,
      rightActions,
      isDraggingAny = false,
      closeProgress = 0,
      className,
      iconContainerClassName,
      lockScroll = true,
    },
    ref
  ) => {
    const [isDesktop, setIsDesktop] = useState(false);
    const dragControls = useDragControls();
    const overscrollDrag = useSheetOverscrollDrag();

    useEffect(() => {
      const checkDesktop = () => {
        const desktop = window.matchMedia('(min-width: 768px)').matches;
        setIsDesktop(desktop);
        overscrollDrag.setContext(dragControls, !desktop);
      };
      checkDesktop();
      window.addEventListener('resize', checkDesktop);
      return () => window.removeEventListener('resize', checkDesktop);
    }, [dragControls, overscrollDrag]);

    // Lock body scroll when open
    useEffect(() => {
      if (isOpen && lockScroll) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
      }
      return () => {
        document.body.style.overflow = '';
      };
    }, [isOpen, lockScroll]);

    // Close on Escape
    useEffect(() => {
      const handleKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && isOpen) onClose();
      };
      window.addEventListener('keydown', handleKey);
      return () => window.removeEventListener('keydown', handleKey);
    }, [isOpen, onClose]);

    const mobileVariants = {
      initial: { y: '100%' },
      animate: {
        y: `${closeProgress * 100}%`,
        opacity: isDraggingAny ? 0 : 1,
      },
      exit: { y: '100%' },
    };

    const desktopVariants = {
      initial: { x: '-100%', opacity: 0 },
      animate: {
        x: '0%',
        opacity: isDraggingAny ? 0 : 1,
      },
      exit: { x: '-100%', opacity: 0 },
    };

    return (
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: isDraggingAny ? 0 : 1 - closeProgress }}
              exit={{ opacity: 0 }}
              transition={{ type: 'tween', duration: 0.15, ease: 'easeOut' }}
              className="fixed inset-0 z-[80] bg-background/60 will-change-[opacity]"
              onClick={onClose}
              style={{
                pointerEvents:
                  closeProgress > 0.5 || isDraggingAny ? 'none' : 'auto',
              }}
            />

            {/* The Vertical Tray/Drawer */}
            <motion.div
              ref={ref}
              variants={isDesktop ? desktopVariants : mobileVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              drag={!isDesktop && !isDraggingAny ? 'y' : false}
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              dragMomentum={false}
              onDragEnd={(e, { offset, velocity }) => {
                if (offset.y > 120 || velocity.y > 400) {
                  onClose();
                }
              }}
              transition={isDesktop
                ? { type: 'tween', duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }
                : { type: 'tween', duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }
              }
              className={cn(
                "fixed z-[90] flex flex-col bg-card border-r border-border/50 shadow-2xl overflow-hidden",
                "inset-x-0 bottom-0 top-[15vh] rounded-t-[32px] border-t",
                "md:inset-y-0 md:left-0 md:right-auto md:w-[420px] md:top-0 md:bottom-0 md:rounded-none md:border-t-0",
                className
              )}
              onClick={(e) => e.stopPropagation()}
              style={{ pointerEvents: isDraggingAny ? 'none' : 'auto', willChange: 'transform, opacity' }}
            >
              {/* Drag Handle (Mobile Only) */}
              {!isDesktop && (
                <div
                  onPointerDown={(e) => dragControls.start(e)}
                  className="flex-none h-7 flex items-center justify-center touch-none cursor-grab active:cursor-grabbing shrink-0"
                >
                  <div className="w-12 h-1.5 bg-muted-foreground/20 rounded-full" />
                </div>
              )}

              {/* Header */}
              <div
                onPointerDown={(e) => !isDesktop && dragControls.start(e)}
                className="flex items-center justify-between px-4 py-4 md:px-6 border-b border-border/50 shrink-0 gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn(
                    "flex items-center justify-center w-11 h-11 rounded-2xl shrink-0",
                    iconContainerClassName
                  )}>
                    {icon}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xl font-black tracking-tight text-foreground leading-none">
                      {title}
                    </h3>
                    {subtitle && (
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mt-0.5 opacity-70">
                        {subtitle}
                      </p>
                    )}
                    {headerActions && (
                      <div className="mt-0.5">
                        {headerActions}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {rightActions}
                  <button
                    onClick={onClose}
                    className="flex items-center justify-center w-9 h-9 rounded-full bg-muted/60 hover:bg-muted text-muted-foreground transition-all active:scale-95 shrink-0"
                  >
                    <X size={16} strokeWidth={2.5} />
                  </button>
                </div>
              </div>

              {/* Vertical Scroll Content */}
              <div
                ref={overscrollDrag.bind}
                className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 px-4 md:px-6 pb-24 flex flex-col gap-3 overscroll-none"
              >
                {children}
              </div>

              {/* Footer gradient */}
              <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-card to-transparent pointer-events-none" />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }
);

SideOpenTray.displayName = 'SideOpenTray';
