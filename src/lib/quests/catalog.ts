import type { MacroCategoryDefinition } from './types';

export const QUEST_MACRO_CATEGORIES: MacroCategoryDefinition[] = [
  {
    id: 'sport',
    name: 'Sport',
    shortLabel: 'Move',
    description: 'Build momentum around movement, recovery, and training.',
    accent: '#22c55e',
    backgroundFrom: '#f59e0b',
    backgroundTo: '#fb7185',
  },
  {
    id: 'family',
    name: 'Family',
    shortLabel: 'Connect',
    description: 'Protect space for people you care about and shared routines.',
    accent: '#f97316',
    backgroundFrom: '#1d4ed8',
    backgroundTo: '#0f172a',
  },
  {
    id: 'mindfulness',
    name: 'Mindfulness',
    shortLabel: 'Reset',
    description: 'Slow down, reflect, and make room for consistent calm.',
    accent: '#8b5cf6',
    backgroundFrom: '#06b6d4',
    backgroundTo: '#2563eb',
  },
  {
    id: 'house_chores',
    name: 'House Chores',
    shortLabel: 'Reset',
    description: 'Turn maintenance work into clear, trackable wins.',
    accent: '#eab308',
    backgroundFrom: '#7c3aed',
    backgroundTo: '#c026d3',
  },
  {
    id: 'sleep',
    name: 'Sleep',
    shortLabel: 'Recharge',
    description: 'Support better rest with consistent shutdown routines.',
    accent: '#38bdf8',
    backgroundFrom: '#0f172a',
    backgroundTo: '#1d4ed8',
  },
];

export function getMacroCategory(categoryId: string) {
  return QUEST_MACRO_CATEGORIES.find((entry) => entry.id === categoryId);
}
