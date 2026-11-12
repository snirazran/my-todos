'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SeasonSetSummary = {
  seasonId: string;
  name: string;
  image: string | null;
  ids: string[];
};

export function SeasonSetsRow({
  sets,
  inventory,
}: {
  sets: SeasonSetSummary[];
  inventory: Record<string, number>;
}) {
  const rows = sets
    .filter((set) => set.ids.length > 1)
    .map((set) => ({
      set,
      have: set.ids.filter((id) => (inventory[id] ?? 0) > 0).length,
    }))
    .filter((row) => row.have > 0);
  if (rows.length === 0) return null;

  return (
    <section aria-label="Season sets" className="mb-3">
      <h3 className="mb-1 text-[12px] font-black text-muted-foreground">Season sets</h3>
      <ul className="no-scrollbar -mx-1 flex gap-2.5 overflow-x-auto px-1 py-1">
        {rows.map(({ set, have }) => {
          const complete = have === set.ids.length;
          const status = complete ? 'complete' : `${have} of ${set.ids.length}`;
          return (
            <li
              key={set.seasonId}
              aria-label={`${set.name} set, ${status}`}
              className={cn(
                'flex w-[10rem] shrink-0 items-center gap-2.5 rounded-[16px] bg-card p-1.5 pr-3',
                complete ? 'ring-2 ring-amber-400' : 'ring-1 ring-border/70',
              )}
            >
              <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[12px] bg-muted">
                {set.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={set.image} alt="" className="h-full w-full object-cover" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-black leading-tight text-foreground">
                  {set.name}
                </span>
                <span
                  className={cn(
                    'mt-0.5 flex items-center gap-1 text-[11.5px] font-extrabold tabular-nums',
                    complete ? 'text-amber-600 dark:text-amber-300' : 'text-muted-foreground',
                  )}
                >
                  {complete && <Check className="h-3 w-3" strokeWidth={4} />}
                  {complete ? 'Complete' : status}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
