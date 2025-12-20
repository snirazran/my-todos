'use client';

import React from 'react';
import Fly from '@/components/ui/fly';

interface Props {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
  className?: string;
  showFly?: boolean;
}

export function AddTaskButton({
  onClick,
  disabled,
  label = 'Add a',
  className = '',
  showFly = true,
}: Props) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        'relative h-12 rounded-full px-6 md:w-full group',
        'bg-gradient-to-b from-white to-slate-50 dark:from-slate-800 dark:to-slate-900',
        'border border-white/50 dark:border-slate-700/50',
        'text-slate-700 dark:text-slate-200 font-bold tracking-tight',
        'shadow-[0_8px_20px_-6px_rgba(99,102,241,0.15),0_4px_12px_-4px_rgba(99,102,241,0.1)] dark:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.4)]',
        'hover:shadow-[0_12px_24px_-6px_rgba(99,102,241,0.25),0_6px_16px_-4px_rgba(99,102,241,0.15)] dark:hover:shadow-[0_12px_24px_-6px_rgba(0,0,0,0.6)]',
        'hover:border-indigo-200 dark:hover:border-indigo-700/50 hover:text-indigo-600 dark:hover:text-indigo-300',
        'transition-all duration-300 ease-out',
        'active:scale-[0.98]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900',
        disabled ? 'opacity-60 pointer-events-none grayscale' : '',
        className,
      ].join(' ')}
    >
      <span className="relative z-10 flex items-center justify-center h-full gap-2.5">
        <span className="text-[15px]">{label}</span>
        {showFly && (
          <span className="translate-y-[1px] opacity-70 group-hover:opacity-100 transition-opacity grayscale group-hover:grayscale-0">
            <Fly size={22} x={-2} y={-3} />
          </span>
        )}
      </span>
    </button>
  );
}
