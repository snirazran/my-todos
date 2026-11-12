'use client';

import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

export function LeapPlusButton({
  title,
  subtitle,
  prizes,
  onClick,
  className,
}: {
  title: string;
  subtitle: string;
  prizes?: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        'plus-upgrade-button plus-club relative mt-4 flex min-h-[3.5rem] w-full touch-manipulation items-center gap-2.5 rounded-[16px] py-2 pl-[3.6rem] pr-2.5 text-left focus-visible:outline-none',
        className,
      )}
    >
      <Icon
        name="frogPlus"
        label="Plus"
        className="plus-cta-frog pointer-events-none absolute -left-1 -top-5 h-14 w-14 drop-shadow-[0_3px_0_rgba(110,76,6,0.35)]"
      />
      <span className="relative min-w-0 flex-1">
        <span className="block text-[15px] font-black leading-tight">{title}</span>
        <span className="plus-club-sub mt-0.5 block text-[11.5px] font-bold leading-tight">
          {subtitle}
        </span>
      </span>
      {prizes && (
        <span className="relative flex shrink-0 items-center gap-2.5 pt-2">{prizes}</span>
      )}
      <ChevronRight className="relative h-4 w-4 shrink-0 opacity-70" strokeWidth={3} />
    </button>
  );
}
