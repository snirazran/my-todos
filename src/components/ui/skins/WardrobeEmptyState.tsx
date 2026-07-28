'use client';

import React from 'react';
import { cn } from '@/lib/utils';

/**
 * The one empty state for every wardrobe tab. Inventory and Trade had been
 * built separately and drifted — different icon wells, type scales and border
 * treatments — so the same "nothing here" moment looked like two features.
 *
 * No dashed border: that reads as a drop zone. This is a dead end that should
 * point somewhere, so it's a centred block with an action.
 */
export function WardrobeEmptyState({
  icon,
  title,
  description,
  action,
  footer,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; icon?: React.ReactNode; onClick: () => void };
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-[40vh] flex-col items-center justify-center px-6 text-center',
        className,
      )}
    >
      <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        {icon}
      </span>
      <p className="text-lg font-black text-foreground">{title}</p>
      {description && (
        <p className="mt-1 max-w-[280px] text-sm font-medium text-muted-foreground">
          {description}
        </p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#4f9149] px-5 text-sm font-black tracking-wide text-white shadow-[0_4px_0_0_#34631f] transition-all active:translate-y-0.5 active:shadow-none"
        >
          {action.icon}
          {action.label}
        </button>
      )}
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );
}
