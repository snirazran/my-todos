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
        'relative w-full h-12 rounded-full',
        'bg-white dark:bg-white/10 backdrop-blur-xl',
        'text-emerald-900 dark:text-emerald-50 font-semibold tracking-[-0.01em]',
        'shadow-[0_1px_0_rgba(255,255,255,.7)_inset,0_4px_12px_rgba(0,0,0,.08)] ring-1 ring-black/10 dark:ring-white/10',
        'transition-transform duration-200 hover:shadow-[0_1px_0_rgba(255,255,255,.75)_inset,0_8px_18px_rgba(0,0,0,.12)] hover:bg-white',
        'active:scale-[0.995] focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-300',
        disabled ? 'opacity-60 pointer-events-none' : '',
        className,
      ].join(' ')}
    >
      <span className="absolute inset-0 rounded-full pointer-events-none bg-gradient-to-b from-white/55 to-white/0 dark:from-white/10 dark:to-transparent" />
      <span className="relative z-10 flex items-center justify-center h-full gap-2">
        <span>{label}</span>
        {showFly && (
          <span className="translate-y-[1px]">
            <Fly size={22} x={-2} y={-3} />
          </span>
        )}
      </span>
    </button>
  );
}
