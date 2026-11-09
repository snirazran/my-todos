'use client';

import { Check } from 'lucide-react';
import type { ItemDef } from '@/lib/skins/catalog';
import { variantSwatch } from '@/lib/skins/variantSwatch';
import { cn } from '@/lib/utils';

const MAX_DOTS = 4;

export function VariantDots({ items, className }: { items: ItemDef[]; className?: string }) {
  const shown = items.slice(0, MAX_DOTS);
  const extra = items.length - shown.length;
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute bottom-1 right-1 flex items-center gap-[3px] rounded-full bg-white/90 px-[5px] py-[4px] shadow-[0_1px_3px_rgba(15,23,42,0.18)] dark:bg-black/55',
        className,
      )}
    >
      {shown.map((item) => (
        <span
          key={item.id}
          className="h-2 w-2 rounded-full ring-1 ring-inset ring-black/15"
          style={{ background: variantSwatch(item) }}
        />
      ))}
      {extra > 0 && (
        <span className="pl-px text-[9px] font-black leading-none text-foreground/70">+{extra}</span>
      )}
    </span>
  );
}

export function VariantSwatchButton({
  item,
  selected,
  marked = false,
  onSelect,
}: {
  item: ItemDef;
  selected: boolean;
  marked?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={item.name}
      aria-pressed={selected}
      title={item.name}
      className={cn(
        'relative grid h-9 w-9 shrink-0 place-items-center rounded-full transition-transform duration-150 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        selected ? 'ring-2 ring-foreground/80 ring-offset-2 ring-offset-background' : 'ring-1 ring-border',
      )}
    >
      <span
        className="h-7 w-7 rounded-full ring-1 ring-inset ring-black/15"
        style={{ background: variantSwatch(item) }}
      />
      {marked && (
        <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-primary text-primary-foreground ring-2 ring-background">
          <Check className="h-2.5 w-2.5" strokeWidth={4} />
        </span>
      )}
    </button>
  );
}
