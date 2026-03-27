import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SideOpenTrayProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  headerActions?: React.ReactNode;
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

    useEffect(() => {
      const checkDesktop = () =>
        setIsDesktop(window.matchMedia('(min-width: 768px)').matches);
      checkDesktop();
      window.addEventListener('resize', checkDesktop);
      return () => window.removeEventListener('resize', checkDesktop);
    }, []);

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
      initial: { y: '100%', opacity: 0 },
      animate: {
        y: `${closeProgress * 100}%`,
        opacity: isDraggingAny ? 0 : 1,
        scale: isDraggingAny ? 0.95 : 1,
      },
      exit: { y: '100%', opacity: 0 },
    };

    const desktopVariants = {
      initial: { x: '-100%', opacity: 0 },
      animate: {
        x: '0%',
        opacity: isDraggingAny ? 0 : 1,
        scale: isDraggingAny ? 0.95 : 1,
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
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[80] bg-background/60 backdrop-blur-sm"
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
              dragElastic={{ top: 0, bottom: 0.8 }}
              onDragEnd={(e, { offset, velocity }) => {
                if (offset.y > 150 || velocity.y > 500) {
                  onClose();
                }
              }}
              transition={{
                type: 'spring',
                damping: 30,
                stiffness: 300,
                mass: 0.8,
              }}
              className={cn(
                "fixed z-[90] flex flex-col bg-card/95 border-r border-border/50 shadow-2xl backdrop-blur-3xl overflow-hidden",
                "inset-x-0 bottom-0 top-[15vh] rounded-t-[32px] border-t",
                "md:inset-y-0 md:left-0 md:right-auto md:w-[420px] md:top-0 md:bottom-0 md:rounded-none md:border-t-0",
                className
              )}
              onClick={(e) => e.stopPropagation()}
              style={{ pointerEvents: isDraggingAny ? 'none' : 'auto' }}
            >
              {/* Drag Handle (Mobile Only) */}
              {!isDesktop && (
                <div 
                  onPointerDown={(e) => dragControls.start(e)}
                  className="absolute top-0 left-0 right-0 h-10 z-50 flex items-start justify-center pt-3 touch-none cursor-grab active:cursor-grabbing"
                >
                  <div className="w-12 h-1.5 bg-muted-foreground/20 rounded-full" />
                </div>
              )}

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-8 md:px-8 shrink-0">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "flex items-center justify-center w-12 h-12 rounded-2xl shadow-sm",
                    iconContainerClassName
                  )}>
                    {icon}
                  </div>
                  <div>
                    <h3 className="text-2xl font-black tracking-tight text-foreground uppercase">
                      {title}
                    </h3>
                    {subtitle && (
                      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest opacity-70">
                        {subtitle}
                      </p>
                    )}
                    {headerActions}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="flex items-center justify-center w-10 h-10 rounded-xl bg-muted/50 hover:bg-muted text-muted-foreground transition-all active:scale-95"
                >
                  <X size={20} strokeWidth={2.5} />
                </button>
              </div>

              {/* Vertical Scroll Content */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 px-4 md:px-6 pb-24 flex flex-col gap-3">
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
