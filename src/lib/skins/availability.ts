export type AvailabilityWindow = {
  availableFrom?: string | Date | null;
  availableUntil?: string | Date | null;
};

export type AvailabilityState = 'scheduled' | 'active' | 'expired';

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function availabilityStateAt(
  item: AvailabilityWindow,
  now: Date = new Date(),
): AvailabilityState {
  const from = toDate(item.availableFrom);
  if (from && now.getTime() < from.getTime()) return 'scheduled';

  const until = toDate(item.availableUntil);
  if (until && now.getTime() > until.getTime()) return 'expired';

  return 'active';
}

export function isAvailableAt(
  item: AvailabilityWindow,
  now: Date = new Date(),
): boolean {
  return availabilityStateAt(item, now) === 'active';
}

export function filterAvailable<T extends AvailabilityWindow>(
  items: T[],
  now: Date = new Date(),
): T[] {
  return items.filter((item) => isAvailableAt(item, now));
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `2026-08-01` means the whole day in UTC: a start lands on 00:00:00.000Z and
 * an end on 23:59:59.999Z, so an item scheduled through its end date stays
 * buyable for all of it. Values that already carry a time are used as given.
 */
export function parseAvailabilityDate(
  value: string,
  edge: 'start' | 'end',
): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (DATE_ONLY.test(trimmed)) {
    const suffix = edge === 'start' ? 'T00:00:00.000Z' : 'T23:59:59.999Z';
    const date = new Date(`${trimmed}${suffix}`);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}
