'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AnimatePresence,
  animate,
  motion,
  useDragControls,
  useMotionValue,
  type Transition,
} from 'framer-motion';
import { cn } from '@/lib/utils';
import { useSheetOverscrollDrag } from '@/components/ui/useSheetOverscrollDrag';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import { CloseButton } from '@/components/ui/CloseButton';

export interface BaseSheetRenderProps {
  isDesktop: boolean;
  dragControls: ReturnType<typeof useDragControls>;
  isDragging: boolean;
  /**
   * True once the sheet's entrance animation has finished. Use it to defer
   * mounting heavy content (Rive canvases, images) so the slide-in stays
   * smooth.
   */
  entered: boolean;
  /**
   * Attach to the sheet's scrollable body. When the body is scrolled to the
   * top and the user keeps dragging down, the drag is handed off to the sheet
   * so it can be dragged closed (native "overscroll to dismiss").
   */
  bindScroll: (el: HTMLElement | null) => void;
}

export interface BaseSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: (props: BaseSheetRenderProps) => React.ReactNode;
  /** Extra classes on the sheet panel itself */
  className?: string;
  /** Extra classes on the backdrop */
  backdropClassName?: string;
  /** z-index for the backdrop (sheet is +1). Default 1050 */
  zIndex?: number;
  /** Override the mobile slide-in/out transition */
  mobileTransition?: Transition;
  /** Hide the default grab handle (e.g. when the sheet renders its own) */
  hideHandle?: boolean;
  /** Show the standard top-right close button (default true). */
  showClose?: boolean;
  /** Accessible label for the close button. */
  closeAriaLabel?: string;
  /**
   * Lift the sheet above the on-screen keyboard (mobile only). Pass the
   * visualViewport inset from useKeyboardInset.
   */
  bottomInset?: number;
  /** Extra inline styles for the sheet panel (e.g. keyboard-aware maxHeight). */
  panelStyle?: React.CSSProperties;
}

const defaultDesktopTransition: Transition = {
  type: 'tween',
  duration: 0.2,
  ease: [0.25, 0.1, 0.25, 1],
};
// Smooth iOS-style curve shared by every sheet (matches FrogodoroSheet feel).
const defaultMobileTransition: Transition = {
  type: 'tween',
  ease: [0.32, 0.72, 0, 1],
  duration: 0.4,
};
const exitMobileTransition: Transition = {
  type: 'tween',
  ease: [0.32, 0.72, 0, 1],
  duration: 0.3,
};

// Drag-to-dismiss tuning.
const DISMISS_PROJECTION = 0.15; // weight of fling velocity when projecting
const DISMISS_DISTANCE = 130; // px of projected travel that triggers dismiss
const DISMISS_VELOCITY = 800; // hard fling velocity that always dismisses
const FLING_EXIT_MIN_VELOCITY = 40;

const snapBackDragTransition = { bounceStiffness: 400, bounceDamping: 40 };
const snapBackSpring: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 40,
};

interface DragExitInfo {
  velocity: number;
  offset: number;
}

export function BaseSheet({
  open,
  onOpenChange,
  children,
  className,
  backdropClassName,
  zIndex = 1050,
  mobileTransition,
  hideHandle = false,
  showClose = true,
  closeAriaLabel,
  bottomInset = 0,
  panelStyle,
}: BaseSheetProps) {
  const resolvedMobileTransition = mobileTransition ?? defaultMobileTransition;
  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [entered, setEntered] = useState(false);
  const dragControls = useDragControls();
  const overscroll = useSheetOverscrollDrag();

  // Backdrop opacity is a shared motion value: enter/exit are animated via the
  // `animate`/`exit` props, while an active drag overrides it so the scrim dims
  // proportionally as the sheet is pulled down (native feel).
  const backdropOpacity = useMotionValue(0);
  const sheetHeightRef = useRef(0);
  const dragExitRef = useRef<DragExitInfo>({ velocity: 0, offset: 0 });

  useEffect(() => {
    if (open) dragExitRef.current = { velocity: 0, offset: 0 };
    else setEntered(false);
  }, [open]);

  useEffect(() => {
    setMounted(true);
    const check = () =>
      setIsDesktop(window.matchMedia('(min-width: 640px)').matches);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Keep the overscroll handoff pointed at this sheet's drag controls, and only
  // enabled on mobile.
  useEffect(() => {
    overscroll.setContext(dragControls, open && !isDesktop);
  }, [overscroll, dragControls, open, isDesktop]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // While open, register globally so background Rives (frog, flies) pause.
  useRegisterOpenSheet(open);

  if (!mounted) return null;

  const sheetVariants = {
    hidden: isDesktop ? { opacity: 0, scale: 0.98 } : { y: '100%' },
    visible: isDesktop ? { opacity: 1, scale: 1 } : { y: 0 },
    exit: ({ velocity, offset }: DragExitInfo) => {
      if (isDesktop) {
        return {
          opacity: 0,
          scale: 0.98,
          transition: defaultDesktopTransition,
        };
      }
      if (velocity > FLING_EXIT_MIN_VELOCITY) {
        const h = sheetHeightRef.current || 480;
        const remaining = Math.max(h - offset, 60);
        const duration = Math.min(Math.max(remaining / velocity, 0.12), 0.3);
        return {
          y: '100%',
          transition: { type: 'tween' as const, duration, ease: 'easeOut' as const },
        };
      }
      return { y: '100%', transition: exitMobileTransition };
    },
  };

  return createPortal(
    <AnimatePresence custom={dragExitRef.current}>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.2 } }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            onClick={() => onOpenChange(false)}
            onPointerDown={(e) => {
              // Belt-and-suspenders: close on press-down too, in case the
              // synthetic click never fires (mobile, animation overlap, etc).
              if (e.target === e.currentTarget) onOpenChange(false);
            }}
            className={cn(
              'fixed inset-0 bg-black/80 will-change-[opacity]',
              backdropClassName,
            )}
            style={{ zIndex, opacity: backdropOpacity }}
          />

          {/* Sheet wrapper */}
          <div
            className="pointer-events-none fixed inset-0 flex items-end justify-center p-0 sm:items-center sm:p-6"
            style={{
              zIndex: zIndex + 1,
              bottom: isDesktop ? 0 : bottomInset,
              transition: 'bottom 280ms cubic-bezier(0.32,0.72,0,1)',
            }}
          >
            <motion.div
              variants={sheetVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              custom={dragExitRef.current}
              transition={
                isDesktop ? defaultDesktopTransition : resolvedMobileTransition
              }
              ref={(el) => {
                if (el) sheetHeightRef.current = el.offsetHeight;
              }}
              drag={!isDesktop ? 'y' : false}
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0.05, bottom: 1 }}
              dragMomentum={false}
              dragTransition={snapBackDragTransition}
              onAnimationComplete={(definition) => {
                if (definition === 'visible') setEntered(true);
              }}
              onDragStart={() => {
                setIsDragging(true);
                setEntered(true);
              }}
              onDrag={(_e, info) => {
                const h = sheetHeightRef.current || 400;
                const progress = Math.min(1, Math.max(0, info.offset.y / h));
                // Dim from full down to ~25% as the sheet is pulled away.
                backdropOpacity.set(1 - progress * 0.75);
              }}
              onDragEnd={(_e, { offset, velocity }) => {
                setIsDragging(false);
                const projected = offset.y + velocity.y * DISMISS_PROJECTION;
                if (projected > DISMISS_DISTANCE || velocity.y > DISMISS_VELOCITY) {
                  dragExitRef.current = {
                    velocity: Math.max(velocity.y, 0),
                    offset: Math.max(offset.y, 0),
                  };
                  onOpenChange(false);
                } else {
                  dragExitRef.current = { velocity: 0, offset: 0 };
                  animate(backdropOpacity, 1, snapBackSpring);
                }
              }}
              style={{ willChange: 'transform', ...panelStyle }}
              className={cn(
                'pointer-events-auto relative flex w-full flex-col overflow-hidden rounded-t-[24px] border border-border/50 bg-card text-card-foreground shadow-lg sm:rounded-[34px] sm:shadow-2xl',
                className,
              )}
            >
              {/* Drag handle – mobile only */}
              {!isDesktop && !hideHandle && (
                <div
                  className="flex-none h-7 flex items-center justify-center touch-none cursor-grab active:cursor-grabbing shrink-0"
                  onPointerDown={(e) => dragControls.start(e)}
                >
                  <div className="w-12 h-1.5 rounded-full bg-border/60" />
                </div>
              )}

              {showClose && (
                <CloseButton
                  onClick={() => onOpenChange(false)}
                  ariaLabel={closeAriaLabel ?? 'Close'}
                />
              )}

              {children({
                isDesktop,
                dragControls,
                isDragging,
                entered,
                bindScroll: overscroll.bind,
              })}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
