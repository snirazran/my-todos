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
      className="relative flex pointer-events-auto origin-left"
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
           relative flex items-center justify-center overflow-hidden w-full
           backdrop-blur-2xl duration-200
           bg-card/80 border-border/80 border shadow-lg
           ${isDragging 
             ? isDragOver 
               ? 'bg-primary border-primary text-primary-foreground shadow-[0_0_50px_rgba(var(--primary),0.3)]' 
               : 'bg-card/95 border-primary/50 text-foreground shadow-2xl'
             : 'hover:bg-card/95 hover:border-primary/50 transition-colors'
           }
        `}
      >
        <AnimatePresence mode="popLayout">
          {isDragging ? (
            <motion.div
              key="drop-zone"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col items-center gap-1"
            >
              <ArrowDownToLine size={24} className={isDragOver ? 'animate-bounce' : ''} />
              <span className="text-sm font-bold">
                {isDragOver ? 'Drop to save' : 'Save for later'}
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="icon"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              className="relative"
            >
              <Inbox size={22} strokeWidth={2} className="text-muted-foreground group-hover:text-primary transition-colors" />
            </motion.div>
          )}
        </AnimatePresence>

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

