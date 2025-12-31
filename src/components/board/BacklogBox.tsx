'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Inbox } from 'lucide-react';

interface Props {
  count: number;
  isDragOver: boolean;
  isDragging: boolean;
  proximity: number; 
  onClick: () => void;
  forwardRef: React.Ref<HTMLButtonElement>;
}

export default function BacklogBox({
  count,
  isDragOver,
  isDragging,
  onClick,
  forwardRef,
}: Props) {
  return (
    <motion.button
      ref={forwardRef}
      onClick={onClick}
      aria-label="Backlog"
      className="relative outline-none group"
      whileTap={{ scale: 0.96 }}
    >
      {/* Soft Pulse Effect when dragging */}
      {isDragging && (
        <>
          <motion.div
            className="absolute inset-0 rounded-2xl bg-primary/20 -z-10"
            animate={{
              scale: [1, 1.25, 1],
              opacity: [0.3, 0, 0.3],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
        </>
      )}

      <motion.div
        animate={{
          scale: isDragOver ? 1.1 : 1,
        }}
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
              : 'text-muted-foreground/80 group-hover:text-primary'
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
