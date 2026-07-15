import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type MobileHeaderActionsProps = {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  visibleOnDesktop?: boolean;
  position?: 'fixed' | 'absolute';
};

export function MobileHeaderActions({
  children,
  className,
  disabled = false,
  visibleOnDesktop = false,
  position = 'fixed',
}: MobileHeaderActionsProps) {
  return (
    <div
      className={cn(
        'right-4 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[90] flex items-center gap-2',
        position === 'absolute' ? 'absolute' : 'fixed',
        !visibleOnDesktop && 'md:hidden',
        disabled && 'pointer-events-none',
        className,
      )}
      aria-disabled={disabled || undefined}
    >
      {children}
    </div>
  );
}
