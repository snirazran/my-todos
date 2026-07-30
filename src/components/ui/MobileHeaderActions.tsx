import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const HEADER_CONTROL_HEIGHT = 'h-10';
export const HEADER_CONTROL_SURFACE =
  'rounded-full border border-border/50 bg-card/85 shadow-sm backdrop-blur-xl';
export const HEADER_CONTROL_ICON_BUTTON = cn(
  'flex w-10 shrink-0 items-center justify-center transition-colors active:scale-95',
  HEADER_CONTROL_HEIGHT,
  HEADER_CONTROL_SURFACE,
);

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
      data-fly-fade
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
