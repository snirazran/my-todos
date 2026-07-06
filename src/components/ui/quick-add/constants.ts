export const REMINDER_OFFSET_OPTIONS = [
  { value: 'at_time', label: 'On time', minutes: 0 },
  { value: '5m', label: '5 min', minutes: 5 },
  { value: '10m', label: '10 min', minutes: 10 },
  { value: '15m', label: '15 min', minutes: 15 },
  { value: '30m', label: '30 min', minutes: 30 },
  { value: '1h', label: '1 hour', minutes: 60 },
] as const;

export const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
export const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);
export const MINUTES_60 = Array.from({ length: 60 }, (_, i) => i);
export const PERIODS = ['AM', 'PM'] as const;

export const TAG_MAX_LENGTH = 20;
export const MAX_SAVED_TAGS = 50;
export const FREE_TAG_LIMIT = 6;
export const PREMIUM_TAG_LIMIT = 50;

export const TAG_COLORS = [
  { name: 'Red', value: '#ef4444', bg: 'bg-red-500' },
  { name: 'Orange', value: '#f97316', bg: 'bg-orange-500' },
  { name: 'Amber', value: '#f59e0b', bg: 'bg-amber-500' },
  { name: 'Yellow', value: '#eab308', bg: 'bg-yellow-400' },
  { name: 'Lime', value: '#84cc16', bg: 'bg-lime-500' },
  { name: 'Green', value: '#22c55e', bg: 'bg-green-500' },
  { name: 'Emerald', value: '#10b981', bg: 'bg-emerald-500' },
  { name: 'Teal', value: '#14b8a6', bg: 'bg-teal-500' },
  { name: 'Cyan', value: '#06b6d4', bg: 'bg-cyan-500' },
  { name: 'Blue', value: '#3b82f6', bg: 'bg-blue-500' },
  { name: 'Indigo', value: '#6366f1', bg: 'bg-indigo-500' },
  { name: 'Violet', value: '#8b5cf6', bg: 'bg-violet-500' },
  { name: 'Purple', value: '#a855f7', bg: 'bg-purple-500' },
  { name: 'Fuchsia', value: '#d946ef', bg: 'bg-fuchsia-500' },
  { name: 'Pink', value: '#ec4899', bg: 'bg-pink-500' },
  { name: 'Rose', value: '#f43f5e', bg: 'bg-rose-500' },
] as const;

export const DEFAULT_TAG_COLOR = TAG_COLORS[5].value;
