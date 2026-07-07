'use client';

import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  onBack?: () => void;
  done: number;
  total: number;
  rightSlot?: ReactNode;
};

export function OnboardingTopBar({ onBack, done, total, rightSlot }: Props) {
  const fraction = total > 0 ? done / total : 0;
  const progressWidth = `${Math.max(fraction, 0.045) * 100}%`;

  return (
    <div className="absolute inset-x-0 top-[calc(0.5rem+env(safe-area-inset-top))] z-40 flex items-center gap-3 px-3">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-md ring-1 ring-border/40 backdrop-blur transition hover:bg-background"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : (
        <div aria-hidden className="h-10 w-10 shrink-0" />
      )}

      <div className="relative h-10 flex-1 rounded-full bg-background/85 px-4 shadow-md ring-1 ring-border/40 backdrop-blur">
        <div className="relative h-full">
          <div className="absolute left-0 right-0 top-1/2 h-3 -translate-y-1/2 rounded-full bg-zinc-300 dark:bg-zinc-600" />
          <motion.div
            className="absolute left-0 top-1/2 h-3 -translate-y-1/2"
            initial={false}
            animate={{ width: progressWidth }}
            transition={{ type: 'spring', stiffness: 140, damping: 22 }}
          >
            <motion.div
              className="h-full w-full rounded-full bg-primary shadow-sm"
              animate={{
                filter: ['brightness(1)', 'brightness(1.08)', 'brightness(1)'],
                boxShadow: [
                  '0 1px 2px rgba(0,0,0,0.08)',
                  '0 0 14px rgba(34,197,94,0.35)',
                  '0 1px 2px rgba(0,0,0,0.08)',
                ],
              }}
              transition={{
                duration: 2.2,
                ease: 'easeInOut',
                repeat: Infinity,
              }}
            />
          </motion.div>
          {Array.from({ length: Math.max(total - 1, 0) }, (_, index) => {
            const milestone = index + 1;
            const isCompleted = milestone <= done;

            return (
              <div
                key={milestone}
                className={cn(
                  'absolute top-1/2 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition-colors',
                  isCompleted
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-zinc-300 text-transparent dark:bg-zinc-600',
                )}
                style={{ left: `${(milestone / total) * 100}%` }}
              >
                {isCompleted ? <Check className="h-3 w-3" strokeWidth={3.5} /> : null}
              </div>
            );
          })}
        </div>
      </div>

      {rightSlot}
    </div>
  );
}
