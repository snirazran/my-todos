import type { Rarity } from '@/lib/skins/catalog';

export const RARITY_STYLE: Record<Rarity, { chip: string; tile: string; label: string }> = {
  common: {
    chip: 'border-slate-400/40 bg-slate-400/15 text-slate-600 dark:text-slate-300',
    tile: 'border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-800',
    label: 'Common',
  },
  uncommon: {
    chip: 'border-emerald-500/35 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    tile: 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950',
    label: 'Uncommon',
  },
  rare: {
    chip: 'border-sky-500/35 bg-sky-500/15 text-sky-700 dark:text-sky-400',
    tile: 'border-sky-300 bg-sky-50 dark:border-sky-700 dark:bg-sky-950',
    label: 'Rare',
  },
  epic: {
    chip: 'border-violet-500/35 bg-violet-500/15 text-violet-700 dark:text-violet-400',
    tile: 'border-violet-300 bg-violet-50 dark:border-violet-700 dark:bg-violet-950',
    label: 'Epic',
  },
  legendary: {
    chip: 'border-amber-500/40 bg-amber-400/20 text-amber-700 dark:text-amber-400',
    tile: 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950',
    label: 'Legendary',
  },
};
