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
    taskSuggestions: [
      'Plan your next workout',
      'Prep your gym bag',
      'Schedule a walk after lunch',
    ],
    habitSuggestions: [
      { text: 'Stretch for 10 minutes', timesPerWeek: 5 },
      { text: 'Move your body every day', timesPerWeek: 6 },
    ],
    campaignHeadlines: ['Training Sprint', 'Momentum Pass', 'Endurance Push'],
    durationDaysOptions: [7, 14],
    premiumAnimationId: 'sport_victory_bounce',
  },
  {
    id: 'family',
    name: 'Family',
    shortLabel: 'Connect',
    description: 'Protect space for people you care about and shared routines.',
    accent: '#f97316',
    backgroundFrom: '#1d4ed8',
    backgroundTo: '#0f172a',
    taskSuggestions: [
      'Plan quality time with family',
      'Send a thoughtful check-in message',
      'Book a catch-up call',
    ],
    habitSuggestions: [
      { text: 'Reach out to someone you care about', timesPerWeek: 4 },
      { text: 'Family tidy-up reset', timesPerWeek: 3 },
    ],
    campaignHeadlines: ['Connection Bundle', 'Family Focus', 'Together Time'],
    durationDaysOptions: [7, 14],
    premiumAnimationId: 'family_firefly_hug',
  },
  {
    id: 'mindfulness',
    name: 'Mindfulness',
    shortLabel: 'Reset',
    description: 'Slow down, reflect, and make room for consistent calm.',
    accent: '#8b5cf6',
    backgroundFrom: '#06b6d4',
    backgroundTo: '#2563eb',
    taskSuggestions: [
      'Write down one thing you are grateful for',
      'Block a 15-minute reflection session',
      'Create a self-care checklist',
    ],
    habitSuggestions: [
      { text: 'Meditate for 5 minutes', timesPerWeek: 7 },
      { text: 'Journal before bed', timesPerWeek: 5 },
    ],
    campaignHeadlines: ['Calm Mode', 'Mind Garden', 'Grounding Run'],
    durationDaysOptions: [7, 14],
    premiumAnimationId: 'mindfulness_lotus_glow',
  },
  {
    id: 'house_chores',
    name: 'House Chores',
    shortLabel: 'Reset',
    description: 'Turn maintenance work into clear, trackable wins.',
    accent: '#eab308',
    backgroundFrom: '#7c3aed',
    backgroundTo: '#c026d3',
    taskSuggestions: [
      'Reset the kitchen counters',
      'Sort one clutter hotspot',
      'Run one laundry cycle',
    ],
    habitSuggestions: [
      { text: '10-minute tidy reset', timesPerWeek: 6 },
      { text: 'Evening clean-up sweep', timesPerWeek: 5 },
    ],
    campaignHeadlines: ['Home Reset', 'Clean Sweep', 'Tidy Track'],
    durationDaysOptions: [7, 14],
    premiumAnimationId: 'chores_sparkle_spin',
  },
  {
    id: 'sleep',
    name: 'Sleep',
    shortLabel: 'Recharge',
    description: 'Support better rest with consistent shutdown routines.',
    accent: '#38bdf8',
    backgroundFrom: '#0f172a',
    backgroundTo: '#1d4ed8',
    taskSuggestions: [
      'Set a wind-down reminder',
      'Prepare tomorrow before bed',
      'Put devices away 30 minutes before sleep',
    ],
    habitSuggestions: [
      { text: 'Start wind-down routine', timesPerWeek: 7 },
      { text: 'Lights out at a consistent time', timesPerWeek: 6 },
    ],
    campaignHeadlines: ['Sleep Reset', 'Night Shift', 'Moonlight Routine'],
    durationDaysOptions: [7, 14],
    premiumAnimationId: 'sleep_moon_drift',
  },
];

export function getMacroCategory(categoryId: string) {
  return QUEST_MACRO_CATEGORIES.find((entry) => entry.id === categoryId);
}
