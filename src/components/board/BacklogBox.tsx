'use client';

import React, { useEffect } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';
import { Inbox } from 'lucide-react';

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

  // Sync the spring with the prop
  useEffect(() => {
    smoothProx.set(isDragging ? proximity : 0);
  }, [proximity, isDragging, smoothProx]);

  // Derived smooth values for the "Glow" behind the box
  const glowScale = useTransform(smoothProx, [0, 1], [1.1, 1.4]);
  const glowOpacity = useTransform(smoothProx, [0, 1], [0.1, 0.4]);

  return (
    <motion.button
      ref={forwardRef}
      onClick={onClick}
      aria-label="Backlog"
      className="relative outline-none group"
      whileTap={{ scale: 0.96 }}
    >
      {/* 1. Constant Pulse (Always runs when dragging) */}
      {isDragging && (
        <motion.div
          className="absolute inset-0 rounded-2xl bg-primary/30 -z-20"
          animate={{
            scale: [1, 1.45, 1],
            opacity: [0.5, 0.1, 0.5],
          }}
          transition={{
            duration: 1.8,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      )}

      {/* 2. Proximity Glow (Grows as you get closer) */}
      {isDragging && (
        <motion.div
          className="absolute inset-0 rounded-2xl bg-primary -z-10"
          style={{
            scale: glowScale,
            opacity: glowOpacity,
          }}
        />
      )}

      <motion.div
        animate={{
          scale: isDragOver ? 1.15 : 1 + (proximity * 0.05),
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className={`
          relative flex items-center justify-center w-14 h-14 rounded-2xl
          bg-card/80 backdrop-blur-2xl
          border transition-all duration-300
          shadow-lg shadow-black/5 dark:shadow-black/20
          ${
            isDragOver
              ? 'border-primary ring-4 ring-primary/10 bg-primary/5'
              : isDragging
              ? 'border-primary/40'
              : 'border-border/80 hover:border-primary/50 hover:bg-card/95'
          }
        `}
      >
        {/* Icon */}
        <div
          className={`transition-colors duration-300 ${
            isDragOver || isDragging
              ? 'text-primary'
              : 'text-muted-foreground group-hover:text-primary'
          }`}
        >
          <Inbox size={22} strokeWidth={2} />
        </div>

        {/* Count Badge */}
        {count > 0 && (
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[22px] h-[22px] px-1.5 text-[10px] font-black text-white bg-rose-500 rounded-full shadow-md shadow-rose-500/20 ring-2 ring-background"
          >
            {count}
          </motion.div>
        )}
      </motion.div>
    </motion.button>
  );
}
