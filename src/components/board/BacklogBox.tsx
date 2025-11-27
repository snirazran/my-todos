'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Archive, Layers } from 'lucide-react';

interface Props {
  count: number;
  isDragOver: boolean;
  onClick: () => void;
  forwardRef: React.Ref<HTMLDivElement>;
}

export default function BacklogBox({
  count,
  isDragOver,
  onClick,
  forwardRef,
}: Props) {
  return (
    <motion.button
      ref={forwardRef}
      onClick={onClick}
      className="relative group outline-none"
      animate={isDragOver ? { scale: 1.1 } : { scale: 1 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      <div
        className={`
          relative flex items-center justify-center w-12 h-12 rounded-full
          bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl
          border border-white/40 dark:border-slate-700/50
          shadow-[0_8px_20px_rgba(0,0,0,0.12)] dark:shadow-black/40
          transition-all duration-200
          ${isDragOver ? 'ring-2 ring-purple-500 bg-purple-50 dark:bg-purple-900/30' : 'hover:bg-white hover:scale-105'}
        `}
      >
        {/* Icon */}
        <div className={`transition-colors ${isDragOver ? 'text-purple-600' : 'text-slate-600 dark:text-slate-300'}`}>
           <Layers size={20} strokeWidth={2.5} />
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