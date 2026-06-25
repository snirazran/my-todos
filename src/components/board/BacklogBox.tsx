'use client';

import React, { useEffect } from 'react';
import { motion, useSpring, useTransform, AnimatePresence } from 'framer-motion';
import { ArrowDownToLine } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';

interface Props {
  count: number;
  isDragOver: boolean;
  isDragging: boolean;
  isDesktop: boolean;
  proximity: number; // 0 to 1
  onClick: () => void;
  forwardRef: React.Ref<HTMLButtonElement>;
}

export default function BacklogBox({
  count,
  isDragOver,
  isDragging,
  isDesktop,
  proximity,
  onClick,
  forwardRef,
}: Props) {
  const idleSize = isDesktop ? 64 : 48;
  const dropHeight = isDesktop ? 96 : 72;
  const dropRadius = isDesktop ? 26 : 22;
  const idleRadius = isDesktop ? 18 : 14;
  const countBadgeClass = isDesktop
    ? 'min-w-6 h-6 px-1 text-[11px]'
    : 'w-5 h-5 text-[10px]';

  // Smooth out the proximity value to prevent jitter
  const smoothProx = useSpring(proximity, {
    stiffness: 100,
    damping: 30,
    mass: 0.5
  });

  useEffect(() => {
    smoothProx.set(isDragging ? proximity : 0);
  }, [proximity, isDragging, smoothProx]);

  return (
    <motion.div 
      className="relative flex pointer-events-auto origin-left shrink-0"
      initial={false}
      animate={{
        width: isDragging ? '100%' : `${idleSize}px`,
      }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 28,
      }}
    >
      <motion.button
        ref={forwardRef}
        onClick={!isDragging ? onClick : undefined}
        aria-label="Backlog"
        initial={false}
        animate={{
          width: '100%', // Button always fills wrapper
          height: isDragging ? `${dropHeight}px` : `${idleSize}px`,
          borderRadius: isDragging ? dropRadius : idleRadius,
        }}
        transition={{
          type: 'spring',
          stiffness: 300,
          damping: 28,
        }}
        // Base styles
        className={`
           relative flex items-center justify-center overflow-hidden w-full
           bg-card border-border/80 border
           ${isDragging 
             ? isDragOver 
               ? 'bg-primary border-primary text-primary-foreground shadow-xl' 
               : 'bg-card border-primary/50 text-foreground shadow-lg'
             : 'hover:bg-card/95 hover:border-primary/50 transition-colors shadow-lg shadow-black/5 dark:shadow-black/20'
           }
        `}
      >
        {/* State A: Drop Zone (Visible when dragging) */}
        <motion.div
          initial={false}
          animate={{ 
            opacity: isDragging ? 1 : 0,
            scale: isDragging ? 1 : 0.8 
          }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0 flex flex-col items-center justify-center gap-1"
          style={{ pointerEvents: 'none' }}
        >
          <ArrowDownToLine
            size={isDesktop ? 28 : 22}
            className={isDragOver ? 'animate-bounce' : ''}
          />
          <span
            className={`${isDesktop ? 'text-sm' : 'text-xs'} font-black whitespace-nowrap`}
          >
            {isDragOver ? 'Drop to save' : 'Save for later'}
          </span>
        </motion.div>

        {/* State B: Icon (Visible when NOT dragging) */}
        <motion.div
           initial={false}
           animate={{ 
             opacity: isDragging ? 0 : 1,
             scale: isDragging ? 0.8 : 1 
           }}
           transition={{ duration: 0.2 }}
           className="absolute inset-0 flex items-center justify-center"
           style={{ pointerEvents: 'none' }}
        >
          <Icon name="saved" className={isDesktop ? 'h-10 w-10' : 'h-8 w-8'} />
        </motion.div>

        {/* Drag Over Glow Effect */}
        {isDragging && isDragOver && (
          <motion.div
            layoutId="glow"
            className="absolute inset-0 z-[-1] bg-white/20 dark:bg-black/20"
            transition={{ duration: 0.2 }}
          />
        )}
      </motion.button>

      {/* Count Badge - Outside button to avoid overflow clipping */}
      <AnimatePresence>
        {!isDragging && count > 0 && (
          <motion.div
            key="backlog-count"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className={`absolute -top-2.5 -right-2.5 z-10 flex ${countBadgeClass} items-center justify-center font-black text-primary-foreground bg-primary rounded-full shadow-sm ring-2 ring-background pointer-events-none`}
          >
            {count}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
