'use client';

import { type ReactNode } from 'react';

type Props = {
  onBack?: () => void;
  rightSlot?: ReactNode;
};

export function OnboardingTopBar({ onBack, rightSlot }: Props) {
  return (
    <div className="absolute inset-x-0 top-[calc(0.5rem+env(safe-area-inset-top))] z-40 flex items-center justify-between gap-3 px-3 animate-in fade-in duration-300">
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

      {rightSlot}
    </div>
  );
}
