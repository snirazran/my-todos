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
        'bg-card',
        'border border-border/50',
        'text-foreground font-bold tracking-tight',
        'shadow-sm shadow-black/5 dark:shadow-black/40',
        'hover:shadow-[0_12px_24px_-6px_rgba(0,0,0,0.1),0_6px_16px_-4px_rgba(0,0,0,0.05)] dark:hover:shadow-[0_12px_24px_-6px_rgba(0,0,0,0.6)]',
        'hover:border-primary/50 hover:text-primary',
        'transition-all duration-300 ease-out',
        'active:scale-[0.98]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
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
