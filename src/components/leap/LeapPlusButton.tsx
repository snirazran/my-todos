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
      onClick={onClick}
      style={{ ['--plus-button-base' as string]: '#b7791f' }}
      className={cn(
        'plus-upgrade-button relative mt-4 flex min-h-[3.5rem] w-full touch-manipulation items-center gap-2.5 rounded-[14px] bg-[#f7bf33] py-2 pl-[3.6rem] pr-2.5 text-left text-[#3d2905] hover:brightness-105 focus-visible:outline-none',
        className,
      )}
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[14px]">
        <span className="absolute inset-x-3 top-[3px] h-[5px] rounded-full bg-white/45" />
        <span className="absolute inset-y-0 left-0 w-1/2 -skew-x-12 bg-white/30 animate-[bar-shine-idle_3.2s_ease-in-out_infinite] motion-reduce:hidden" />
      </span>
      <Icon
        name="frogPlus"
        label="Plus"
        className="plus-cta-frog pointer-events-none absolute -left-1 -top-5 h-14 w-14 drop-shadow-[0_3px_0_rgba(120,80,10,0.35)]"
      />
      <span className="relative min-w-0 flex-1">
        <span className="block text-[15px] font-black leading-tight">{title}</span>
        <span className="mt-0.5 block text-[11.5px] font-bold leading-tight text-[#6b4a12]">
          {subtitle}
        </span>
      </span>
      {prizes && (
        <span className="relative flex shrink-0 items-center gap-1.5">{prizes}</span>
      )}
      <ChevronRight className="relative h-4 w-4 shrink-0 text-[#6b4a12]" strokeWidth={3} />
    </button>
  );
}
