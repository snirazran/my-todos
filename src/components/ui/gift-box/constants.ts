import { Rarity } from '@/lib/skins/catalog';

export const RARITY_CONFIG: Record<
  Rarity,
  {
    border: string;
    bg: string;
    text: string;
    glow: string;
    label: string;
    gradient: string;
    shadow: string;
    rays: string;
    button: string;
  }
> = {
  common: {
    border: 'border-slate-300 dark:border-slate-600',
    bg: 'bg-slate-50 dark:bg-slate-800',
    text: 'text-slate-600 dark:text-slate-400',
    glow: 'shadow-slate-500/20',
    label: 'Common',
    gradient:
      'from-slate-200 to-slate-100 dark:from-slate-800 dark:to-slate-900',
    shadow: 'shadow-xl shadow-slate-900/10',
    rays: 'text-slate-400/20',
    button: 'bg-white text-slate-900 hover:bg-slate-50',
  },
  uncommon: {
    border: 'border-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    text: 'text-emerald-700 dark:text-emerald-400',
    glow: 'shadow-emerald-500/30',
    label: 'Uncommon',
    gradient:
      'from-emerald-100 to-emerald-50 dark:from-emerald-900/40 dark:to-emerald-950/40',
    shadow: 'shadow-xl shadow-emerald-900/10',
    rays: 'text-emerald-500/20',
    button: 'bg-emerald-500 text-white hover:bg-emerald-400',
  },
  rare: {
    border: 'border-sky-400',
    bg: 'bg-sky-50 dark:bg-sky-950/40',
    text: 'text-sky-700 dark:text-sky-400',
    glow: 'shadow-sky-500/40',
    label: 'Rare',
    gradient: 'from-sky-100 to-sky-50 dark:from-sky-900/40 dark:to-sky-950/40',
    shadow: 'shadow-xl shadow-sky-900/10',
    rays: 'text-sky-500/30',
    button: 'bg-sky-500 text-white hover:bg-sky-400',
  },
  epic: {
    border: 'border-violet-400',
    bg: 'bg-violet-50 dark:bg-violet-950/40',
    text: 'text-violet-700 dark:text-violet-400',
    glow: 'shadow-violet-500/50',
    label: 'Epic',
    gradient:
      'from-violet-100 to-violet-50 dark:from-violet-900/40 dark:to-violet-950/40',
    shadow: 'shadow-2xl shadow-violet-900/20',
    rays: 'text-violet-500/40',
    button: 'bg-violet-600 text-white hover:bg-violet-500',
  },
  legendary: {
    border: 'border-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-700 dark:text-amber-400',
    glow: 'shadow-amber-500/60',
    label: 'Legendary',
    gradient:
      'from-amber-100 to-amber-50 dark:from-amber-900/40 dark:to-amber-950/40',
    shadow: 'shadow-2xl shadow-amber-900/30',
    rays: 'text-amber-500/50',
    button:
      'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:brightness-110',
  },
};
