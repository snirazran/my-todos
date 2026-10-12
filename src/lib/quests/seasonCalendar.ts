const MONTH_KEY_RE = /^(\d{4})-(\d{2})$/;

export const SEASON_DEFAULT_NAMES = [
  'Frosty Pond',
  'Lovebug Lagoon',
  'Spring Hop',
  'Rainy Ripples',
  'Blossom Bog',
  'Sunny Lilypad',
  'Firefly Nights',
  'Summer Splash',
  'Back to the Swamp',
  'Spooky Bog',
  'Harvest Hop',
  'Snowy Lilypad',
] as const;

export const SEASON_PLAN_AHEAD_MONTHS = 3;

export function isSeasonMonthKey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = MONTH_KEY_RE.exec(value);
  return !!match && Number(match[2]) >= 1 && Number(match[2]) <= 12;
}

export function seasonMonthKey(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${date.getUTCFullYear()}-${month}`;
}

function parseMonthKey(monthKey: string) {
  const match = MONTH_KEY_RE.exec(monthKey);
  if (!match) throw new Error(`Invalid season month "${monthKey}"`);
  return { year: Number(match[1]), monthIndex: Number(match[2]) - 1 };
}

export function shiftSeasonMonth(monthKey: string, delta: number): string {
  const { year, monthIndex } = parseMonthKey(monthKey);
  return seasonMonthKey(new Date(Date.UTC(year, monthIndex + delta, 1)));
}

export function seasonMonthWindow(monthKey: string) {
  const { year, monthIndex } = parseMonthKey(monthKey);
  return {
    startsAt: new Date(Date.UTC(year, monthIndex, 1)),
    endsAt: new Date(Date.UTC(year, monthIndex + 1, 1)),
  };
}

export function seasonMonthDays(monthKey: string) {
  const { startsAt, endsAt } = seasonMonthWindow(monthKey);
  return Math.round((endsAt.getTime() - startsAt.getTime()) / 86_400_000);
}

export function defaultSeasonName(monthKey: string) {
  return SEASON_DEFAULT_NAMES[parseMonthKey(monthKey).monthIndex];
}

export function seasonMonthLabel(monthKey: string) {
  const { startsAt } = seasonMonthWindow(monthKey);
  return startsAt.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
