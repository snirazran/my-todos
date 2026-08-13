'use client';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

/**
 * Marks a row as Plus. A badge, not a button: the filled gradient with a
 * bevel, a ring and a light-top highlight carried every signifier of a
 * pressable control while sitting in the row's action slot without being
 * separately pressable — and it made the one row a free user cannot take the
 * brightest thing in a list of three they can. Flat, tinted and outlined
 * keeps the mark legible while it stays subordinate to the real choices.
 */
export function PlusPill({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-400/12 py-1 pl-1.5 pr-2.5 text-[12px] font-black uppercase tracking-[0.12em] text-amber-600 ring-1 ring-amber-400/35 dark:text-amber-400',
        className,
      )}
    >
      <Icon name="frogPlus" className="h-7 w-7 shrink-0" />
      {children}
    </span>
  );
}

/**
 * What Plus would pay, beside what you're getting.
 *
 * States the multiplier rather than a doubled fly count: the grant applies
 * the Plus multiplier to every reward branch, so the gift box comes twice
 * too, and naming only the flies undersells it. The tiles it sits under
 * already show exactly what gets doubled.
 *
 * Bare text, not a chip: area is a salience channel like color is, so a
 * boxed footnote wider than the reward it annotates dominates that reward
 * just as surely as a gold fill did. It sits in the label column, under the
 * line it qualifies, so it reads as a note on the deal rather than a second
 * announcement competing with it.
 */
export function PlusDoubleNote() {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-black leading-none text-amber-600 dark:text-amber-400">
      <Icon name="frogPlus" className="h-[22px] w-[22px] shrink-0" />
      Plus doubles rewards
    </span>
  );
}
