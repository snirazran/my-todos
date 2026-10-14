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
      className={cn(
        'plus-upgrade-button flex min-h-14 w-full items-center gap-2.5 rounded-2xl border border-amber-200 bg-gradient-to-b from-[#ffdf83] to-[#f3bd48] py-2 pl-2 pr-2.5 text-left text-[#49320f] shadow-[0_3px_0_#c58c31] transition-[transform,box-shadow] active:translate-y-0.5 active:shadow-none',
        className,
      )}
    >
      <Icon
        name="frogPlus"
        label="Plus"
        className="h-10 w-10 shrink-0 drop-shadow-[0_2px_0_rgba(31,98,28,0.3)]"
      />
      <span className="flex-1 min-w-0">
        <span className="block whitespace-normal break-words text-clip text-[14px] font-black leading-tight [overflow:visible]">
          {title}
        </span>
        <span className="mt-0.5 block whitespace-normal break-words text-clip text-[11.5px] font-bold leading-tight text-[#6b4a12] [overflow:visible]">
          {subtitle}
        </span>
      </span>
      {prizes && (
        <span className="flex shrink-0 items-center gap-1.5">{prizes}</span>
      )}
      <ChevronRight
        className="h-4 w-4 shrink-0 text-[#6b4a12]"
        strokeWidth={3}
      />
    </button>
  );
}
