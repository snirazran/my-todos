import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type StatusDockRowState = 'idle' | 'ready' | 'golden';

export function statusDockRowClass(
  state: StatusDockRowState = 'idle',
  interactive = true,
) {
  return cn(
    'group relative flex w-full items-center gap-3 rounded-b-[19px] border-t border-border/50 py-2.5 pl-3 pr-3 text-left transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 md:h-full md:rounded-bl-none md:rounded-r-[19px] md:border-l md:border-t-0',
    interactive ? 'cursor-pointer' : 'cursor-default',
    !interactive
      ? null
      : state === 'golden'
        ? 'bg-gradient-to-r from-amber-100 to-yellow-50 dark:from-amber-500/20 dark:to-amber-500/10'
        : state === 'ready'
          ? 'bg-amber-50 dark:bg-amber-500/10 [@media(hover:hover)]:hover:bg-amber-100/70 dark:[@media(hover:hover)]:hover:bg-amber-500/15'
          : 'active:bg-foreground/[0.04] [@media(hover:hover)]:hover:bg-foreground/[0.025]',
  );
}

export function StatusDock({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-fly-fade
      className={cn(
        'relative z-[25] w-full md:mx-auto md:w-[300px] md:has-[[data-dock-row]]:w-[calc(min(100%,48rem)-6rem)] xl:has-[[data-dock-row]]:w-[calc(min(100%,48rem)-7rem)]',
        className,
      )}
    >
      <div className="group/dock relative flex flex-col rounded-[20px] border border-border/60 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_28px_-18px_rgba(15,23,42,0.35)] dark:shadow-[0_12px_28px_-16px_rgba(0,0,0,0.8)] md:flex-row md:flex-wrap md:items-stretch">
        <div className="pointer-events-none absolute inset-x-6 top-0 z-10 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent dark:via-white/20" />
        {children}
      </div>
    </div>
  );
}
