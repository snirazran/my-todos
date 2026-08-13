export type WeekStartDay = 0 | 1;

export const SUNDAY: WeekStartDay = 0;
export const MONDAY: WeekStartDay = 1;

export const WEEK_START_LABEL: Record<WeekStartDay, string> = {
  0: 'Sunday',
  1: 'Monday',
};

export function normalizeWeekStart(value: unknown): WeekStartDay {
  return Number(value) === 1 ? MONDAY : SUNDAY;
}

/**
 * The device's own convention, via Intl.Locale.getWeekInfo() where it exists
 * (Chromium 99+, Safari 17+) and ISO 8601 — Monday — as the fallback, which is
 * what Luxon does. Only used to seed a new user's default; once they choose,
 * their stored value wins.
 */
export function localeWeekStart(): WeekStartDay {
  if (typeof Intl === 'undefined') return SUNDAY;
  try {
    const locale = new Intl.Locale(
      typeof navigator !== 'undefined' ? navigator.language : 'en-US',
    ) as Intl.Locale & { getWeekInfo?: () => { firstDay: number } };
    const firstDay =
      typeof locale.getWeekInfo === 'function'
        ? locale.getWeekInfo().firstDay
        : (locale as unknown as { weekInfo?: { firstDay: number } }).weekInfo
            ?.firstDay;
    if (firstDay === 7) return SUNDAY;
    if (firstDay === 1) return MONDAY;
  } catch {
    // Unsupported engine — fall through.
  }
  return SUNDAY;
}

const SUNDAY_FIRST = [0, 1, 2, 3, 4, 5, 6] as const;
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0] as const;

/** Weekday numbers (0=Sun..6=Sat) in the order this user reads a week. */
export function weekOrder(
  weekStartsOn: WeekStartDay,
): ReadonlyArray<0 | 1 | 2 | 3 | 4 | 5 | 6> {
  return weekStartsOn === MONDAY ? MONDAY_FIRST : SUNDAY_FIRST;
}

export function shiftYMD(dateKey: string, deltaDays: number): string {
  const base = new Date(`${dateKey}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return base.toISOString().slice(0, 10);
}

export function dowFromYMD(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay();
}

/** The YYYY-MM-DD the containing week starts on, for this user's convention. */
export function startOfWeekYMD(
  dateKey: string,
  weekStartsOn: WeekStartDay,
): string {
  const back = (dowFromYMD(dateKey) - weekStartsOn + 7) % 7;
  return shiftYMD(dateKey, -back);
}

export function endOfWeekYMD(
  dateKey: string,
  weekStartsOn: WeekStartDay,
): string {
  return shiftYMD(startOfWeekYMD(dateKey, weekStartsOn), 6);
}

/** Every date in the containing week, in the user's reading order. */
export function weekDatesFor(
  dateKey: string,
  weekStartsOn: WeekStartDay,
): string[] {
  const start = startOfWeekYMD(dateKey, weekStartsOn);
  return Array.from({ length: 7 }, (_, index) => shiftYMD(start, index));
}

export function daysBetweenYMD(fromKey: string, toKey: string): number {
  const a = new Date(`${fromKey}T00:00:00Z`).getTime();
  const b = new Date(`${toKey}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}
