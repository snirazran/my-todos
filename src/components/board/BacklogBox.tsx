'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Layers } from 'lucide-react';

interface Props {
  count: number;
  isDragOver: boolean;
  isDragging: boolean;
  proximity: number; // 0 to 1
  onClick: () => void;
  // ✅ FIX: Explicitly typed for Button to match <motion.button>
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
  // Calculate scaling based on proximity
  const scale = isDragOver ? 1.25 : isDragging ? 1.05 + proximity * 0.2 : 1;

  return (
    <motion.button
      ref={forwardRef}
      onClick={onClick}
      aria-label="Backlog"
      className="relative outline-none group"
      animate={{
        scale: scale,
      }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      {/* Pulse Ring when dragging (far) */}
      {isDragging && !isDragOver && (
        <motion.div
          className="absolute inset-0 border-2 rounded-full border-primary/50"
          animate={{ scale: [1, 1.4], opacity: [0.6, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
        />
      )}

      <div
        className={`
          relative flex items-center justify-center w-14 h-14 rounded-full
          bg-card/80 backdrop-blur-xl
          border transition-all duration-200
          shadow-[0_8px_20px_rgba(0,0,0,0.12)] dark:shadow-black/40
          ${
            isDragOver
              ? 'ring-4 ring-primary bg-primary/10 border-primary'
              : isDragging
              ? 'border-primary ring-2 ring-primary/20'
              : 'border-border/40 hover:bg-card hover:scale-105'
          }
        `}
      >
        {/* Icon */}
        <div
          className={`transition-colors ${
            isDragOver
              ? 'text-primary'
              : isDragging
              ? 'text-primary'
              : 'text-muted-foreground'
          }`}
        >
          <Layers size={24} strokeWidth={2.5} />
        </div>

        {/* Count Badge */}
        {count > 0 && (
          <div className="absolute -top-1 -right-1 flex items-center justify-center min-w-[20px] h-5 px-1 text-[11px] font-bold text-white bg-rose-500 rounded-full shadow-sm ring-2 ring-background">
            {count}
          </div>
        )}
      </div>
    </motion.button>
  );
}
