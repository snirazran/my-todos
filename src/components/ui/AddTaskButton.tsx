'use client';

import React from 'react';
import Fly from '@/components/ui/fly';
import { Plus } from 'lucide-react';

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
  label = 'Add a task',
  className = '',
  showFly = true,
}: Props) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        'relative h-14 rounded-2xl px-6 w-auto md:w-full group overflow-hidden',
        'bg-card/80 backdrop-blur-2xl',
        'border border-border/80',
        'text-foreground font-bold tracking-tight',
        'shadow-lg shadow-black/5 dark:shadow-black/20',
        'md:hover:border-primary/50 md:hover:bg-card/95',
        'transition-all duration-300 ease-out',
        'active:scale-[0.98]',
        'focus:outline-none outline-none',
        disabled ? 'opacity-60 pointer-events-none grayscale' : '',
        className,
      ].join(' ')}
    >
      {/* Subtle Gradient Hover Effect */}
      <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-emerald-400/5 opacity-0 md:group-hover:opacity-100 transition-opacity duration-500" />
      
      <span className="relative z-10 flex items-center justify-center h-full gap-3">
        <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-primary/10 text-primary md:group-hover:scale-110 transition-transform duration-300">
          <Plus size={18} strokeWidth={3} />
        </div>
        
        <span className="text-[15px] text-foreground transition-colors duration-300">
          {label}
        </span>
        
        {showFly && (
          <span className="opacity-100 transition-all duration-300">
            <Fly size={24} y={-3} x={-5} />
          </span>
        )}
      </span>
    </button>
  );
}