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
  // FIX: Updated type from HTMLDivElement to HTMLButtonElement to match <motion.button>
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
  // Calculate scaling based on proximity: 1.0 -> 1.25
  // If just dragging but far, maybe slight bump to 1.05
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
          className="absolute inset-0 border-2 rounded-full border-purple-400/50 dark:border-purple-500/50"
          animate={{ scale: [1, 1.4], opacity: [0.6, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
        />
      )}

      <div
        className={`
          relative flex items-center justify-center w-14 h-14 rounded-full
          bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl
          border transition-all duration-200
          shadow-[0_8px_20px_rgba(0,0,0,0.12)] dark:shadow-black/40
          ${
            isDragOver
              ? 'ring-4 ring-purple-500 bg-purple-100 dark:bg-purple-900 border-purple-500'
              : isDragging
              ? 'border-purple-400 dark:border-purple-500 ring-2 ring-purple-200 dark:ring-purple-800'
              : 'border-white/40 dark:border-slate-700/50 hover:bg-white hover:scale-105'
          }
        `}
      >
        {/* Icon */}
        <div
          className={`transition-colors ${
            isDragOver
              ? 'text-purple-700 dark:text-purple-100'
              : isDragging
              ? 'text-purple-600 dark:text-purple-300'
              : 'text-slate-600 dark:text-slate-300'
          }`}
        >
          <Layers size={24} strokeWidth={2.5} />
        </div>

        {/* Count Badge */}
        {count > 0 && (
          <div className="absolute -top-1 -right-1 flex items-center justify-center min-w-[20px] h-5 px-1 text-[10px] font-bold text-white bg-rose-500 rounded-full shadow-sm ring-2 ring-white dark:ring-slate-900">
            {count}
          </div>
        )}
      </div>
    </motion.button>
  );
}
