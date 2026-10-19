import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { getZonedToday } from '@/lib/utils';
import { MONDAY, daysBetweenYMD, shiftYMD, startOfWeekYMD } from '@/lib/weekStart';
import { loadFlyEconomyConfig } from './config';

export type TimezoneGuardState = {
  zone?: string;
  windowStartedAt?: Date | string;
  changesInWindow?: number;
};

export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The zone already on file — read-only, for accounting that has no request. */
export async function storedEconomyTimezone(userId: string): Promise<string> {
  await connectMongo();
  const user = await UserModel.findById(userId)
    .select('notificationPrefs.timezone timezoneGuard')
    .lean<{
      notificationPrefs?: { timezone?: string };
      timezoneGuard?: TimezoneGuardState;
    } | null>();
  const guardZone = user?.timezoneGuard?.zone;
  if (isValidTimezone(guardZone)) return guardZone;
  const prefsZone = user?.notificationPrefs?.timezone;
  return isValidTimezone(prefsZone) ? prefsZone : 'UTC';
}

/**
 * The timezone the economy is allowed to believe. A client can send any zone it
 * likes on every request, and each new zone is a fresh set of day boundaries —
 * so a change is accepted only a limited number of times per 24h, and every
 * request after that is accounted against the zone already on file.
 */
export async function resolveEconomyTimezone(
  userId: string,
  requested: unknown,
): Promise<string> {
  await connectMongo();
  const [user, config] = await Promise.all([
    UserModel.findById(userId)
      .select(ECONOMY_TIMEZONE_FIELDS)
      .lean<EconomyTimezoneUser>(),
    loadFlyEconomyConfig(),
  ]);
  const { zone, guard } = economyTimezoneFor(
    user,
    requested,
    config.timezone.changesPerDay,
  );
  if (guard) {
    await UserModel.updateOne({ _id: userId }, { $set: { timezoneGuard: guard } });
  }
  return zone;
}

export const ECONOMY_TIMEZONE_FIELDS = 'notificationPrefs.timezone timezoneGuard';

export type EconomyTimezoneUser = {
  notificationPrefs?: { timezone?: string };
  timezoneGuard?: TimezoneGuardState;
} | null;

export function economyTimezoneFor(
  user: EconomyTimezoneUser,
  requested: unknown,
  changesPerDay: number,
): { zone: string; guard?: TimezoneGuardState } {
  const prefsZone = user?.notificationPrefs?.timezone;
  const stored =
    (isValidTimezone(user?.timezoneGuard?.zone) && user?.timezoneGuard?.zone) ||
    (isValidTimezone(prefsZone) && prefsZone) ||
    undefined;

  if (!isValidTimezone(requested)) return { zone: stored ?? 'UTC' };
  if (!stored) {
    return {
      zone: requested,
      guard: { zone: requested, windowStartedAt: new Date(), changesInWindow: 0 },
    };
  }
  if (requested === stored) return { zone: stored };

  const guard = user?.timezoneGuard ?? {};
  const windowStartedAt = guard.windowStartedAt
    ? new Date(guard.windowStartedAt)
    : null;
  const windowOpen =
    !windowStartedAt || Date.now() - windowStartedAt.getTime() >= 86_400_000;
  const used = windowOpen ? 0 : guard.changesInWindow ?? 0;

  if (used >= changesPerDay) return { zone: stored };

  return {
    zone: requested,
    guard: {
      zone: requested,
      windowStartedAt: windowOpen ? new Date() : windowStartedAt ?? new Date(),
      changesInWindow: used + 1,
    },
  };
}

/**
 * Day-granular reading of the backdating grace: a 48h grace lets a completion
 * dated up to two days back still pay. Anything older is recorded but earns
 * nothing — history stays honest without paying for it.
 */
export function isPayableOccurrenceDate(
  occurrenceDate: string,
  today: string,
  graceHours: number,
): boolean {
  if (!occurrenceDate || !today) return false;
  const age = daysBetweenYMD(occurrenceDate, today);
  if (age < 0) return true;
  return age <= Math.floor(Math.max(0, graceHours) / 24);
}

/** Monday-anchored week the jar's weekly gift allowance resets on. */
export function economyWeekKey(dayKey: string): string {
  return startOfWeekYMD(dayKey, MONDAY);
}

export function economyDayKey(tz: string): string {
  return getZonedToday(tz);
}

export function daysAgoKey(dayKey: string, days: number): string {
  return shiftYMD(dayKey, -days);
}
