import type { BuddyCreateParams } from '@/lib/models/TaskBond';

export type BuddyRepeatChoice = 'once' | 'daily' | 'weekdays' | 'custom';

export type BuddyPreset = {
  id: string;
  text: string;
  emoji: string;
  repeat: BuddyRepeatChoice;
  days?: number[];
};

export const BUDDY_PRESETS: BuddyPreset[] = [
  { id: 'walk', text: 'Walk 30 minutes', emoji: '🚶', repeat: 'daily' },
  { id: 'read', text: 'Read 10 pages', emoji: '📖', repeat: 'daily' },
  { id: 'gym', text: 'Workout', emoji: '💪', repeat: 'custom', days: [1, 3, 5] },
  { id: 'water', text: 'Drink 8 glasses of water', emoji: '💧', repeat: 'daily' },
  { id: 'early', text: 'Wake up early', emoji: '⏰', repeat: 'weekdays' },
  { id: 'study', text: 'Study 1 hour', emoji: '📚', repeat: 'weekdays' },
  { id: 'meditate', text: 'Meditate 10 minutes', emoji: '🧘', repeat: 'daily' },
  { id: 'tidy', text: 'Tidy up for 15 minutes', emoji: '🧹', repeat: 'daily' },
];

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
export const WEEKDAYS = [1, 2, 3, 4, 5];

export function daysForChoice(
  choice: BuddyRepeatChoice,
  customDays: number[],
): number[] {
  if (choice === 'once') return [];
  if (choice === 'daily') return ALL_DAYS;
  if (choice === 'weekdays') return WEEKDAYS;
  return customDays;
}

export function buddyRepeatSummary(
  choice: BuddyRepeatChoice,
  customDays: number[],
): string {
  if (choice === 'once') return 'Just once';
  const days = daysForChoice(choice, customDays);
  if (days.length === 7) return 'Every day';
  if (days.length === 5 && WEEKDAYS.every((d) => days.includes(d)))
    return 'Weekdays';
  if (days.length === 2 && [0, 6].every((d) => days.includes(d)))
    return 'Weekends';
  if (days.length === 0) return 'Pick at least one day';
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days
    .slice()
    .sort((a, b) => a - b)
    .map((d) => names[d])
    .join(' · ');
}

export function toBuddyCreateParams(
  text: string,
  choice: BuddyRepeatChoice,
  customDays: number[],
  today?: string,
): BuddyCreateParams {
  if (choice === 'once')
    return { text: text.trim(), repeat: 'this-week', dates: today ? [today] : [] };
  return {
    text: text.trim(),
    repeat: 'weekly',
    days: daysForChoice(choice, customDays),
  };
}
