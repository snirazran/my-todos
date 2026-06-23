'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The one canonical popup close button: a muted circle pinned to the top-right
 * corner (always physical right / LTR), used by every sheet and modal so the X
 * looks and sits the same everywhere.
 */
export function CloseButton({
  onClick,
  className,
  ariaLabel = 'Close',
}: {
  onClick: () => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      dir="ltr"
      className={cn(
        'absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-muted/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95',
        className,
      )}
    >
      <X size={18} />
    </button>
  );
}
