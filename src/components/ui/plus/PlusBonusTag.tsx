import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

export function PlusBonusTag({
  children,
  size = 'md',
  className,
}: {
  children?: ReactNode;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'plus-club plus-bonus-tag inline-flex shrink-0 items-center whitespace-nowrap rounded-full font-black leading-none',
        size === 'sm' ? 'h-6 gap-0.5 pl-0.5 pr-2.5 text-[11.5px]' : 'h-7 gap-1 pl-1 pr-3 text-[13px]',
        className,
      )}
    >
      <Icon name="frogPlus" className={size === 'sm' ? 'h-5 w-5 shrink-0' : 'h-6 w-6 shrink-0'} />
      <span>Plus</span>
      {children != null && <span className="tabular-nums">{children}</span>}
    </span>
  );
}
