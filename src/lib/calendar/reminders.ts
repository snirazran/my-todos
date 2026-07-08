const OFFSET_MINUTES: Record<string, number> = {
  at_time: 0,
  '5m': 5,
  '10m': 10,
  '15m': 15,
  '30m': 30,
  '1h': 60,
};

const LADDER: { key: string; minutes: number }[] = [
  { key: '1h', minutes: 60 },
  { key: '30m', minutes: 30 },
  { key: '15m', minutes: 15 },
  { key: '10m', minutes: 10 },
  { key: '5m', minutes: 5 },
  { key: 'at_time', minutes: 0 },
];

export function reminderToMinutes(reminder?: string): number | undefined {
  if (!reminder) return undefined;
  return OFFSET_MINUTES[reminder];
}

export function minutesToReminder(minutes?: number): string | undefined {
  if (minutes === undefined || minutes < 0) return undefined;
  for (const step of LADDER) {
    if (minutes >= step.minutes) return step.key;
  }
  return 'at_time';
}
