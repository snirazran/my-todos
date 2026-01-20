'use client';

import React, { useEffect } from 'react';
import { motion, useSpring, useTransform, AnimatePresence } from 'framer-motion';
import { Inbox, ArrowDownToLine } from 'lucide-react';

interface Props {
  count: number;
  isDragOver: boolean;
  isDragging: boolean;
  proximity: number; // 0 to 1
  onClick: () => void;
  forwardRef: React.Ref<HTMLButtonElement>;
}

export default function BacklogBox({
  count,
  isDragOver,
  isDragging,
  proximity,
  onClick,
  forwardRef,
}: Props) {
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
        width: isDragging ? '100%' : '56px',
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
          height: isDragging ? '80px' : '56px',
          borderRadius: isDragging ? 24 : 16, 
        }}
        transition={{
          type: 'spring',
          stiffness: 300,
          damping: 28,
        }}
        // Base styles
        className={`
           // Removed backdrop-blur-2xl for performance, simplified shadow
           relative flex items-center justify-center overflow-hidden w-full
           bg-card border-border/80 border shadow-md will-change-transform
           ${isDragging 
             ? isDragOver 
               ? 'bg-primary border-primary text-primary-foreground shadow-xl' 
               : 'bg-card border-primary/50 text-foreground shadow-lg'
             : 'hover:bg-card/95 hover:border-primary/50 transition-colors'
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
          <ArrowDownToLine size={24} className={isDragOver ? 'animate-bounce' : ''} />
          <span className="text-sm font-bold whitespace-nowrap">
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
          <Inbox size={22} strokeWidth={2} className="text-muted-foreground group-hover:text-primary transition-colors" />
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
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="absolute -top-2 -right-2 z-10 flex items-center justify-center min-w-[20px] h-[20px] px-1 text-[10px] font-black text-white bg-rose-500 rounded-full shadow-sm ring-2 ring-background pointer-events-none"
          >
            {count}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

