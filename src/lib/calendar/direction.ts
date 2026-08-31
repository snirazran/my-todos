import type { ConnectionSettings } from './types';

export type SyncDirection = 'two_way' | 'import_only' | 'export_only';

export const SYNC_DIRECTIONS: SyncDirection[] = [
  'two_way',
  'import_only',
  'export_only',
];

export function isSyncDirection(value: unknown): value is SyncDirection {
  return (
    typeof value === 'string' &&
    SYNC_DIRECTIONS.includes(value as SyncDirection)
  );
}

export function directionToSettings(direction: SyncDirection) {
  return {
    importEnabled: direction !== 'export_only',
    exportEnabled: direction !== 'import_only',
  };
}

export function settingsToDirection(
  settings?: Partial<ConnectionSettings> | null,
): SyncDirection {
  const importEnabled = settings?.importEnabled !== false;
  const exportEnabled = settings?.exportEnabled !== false;
  if (importEnabled && !exportEnabled) return 'import_only';
  if (exportEnabled && !importEnabled) return 'export_only';
  return 'two_way';
}

const EVENTS = 'https://www.googleapis.com/auth/calendar.events';
const EVENTS_READONLY = 'https://www.googleapis.com/auth/calendar.events.readonly';
const APP_CREATED = 'https://www.googleapis.com/auth/calendar.app.created';
const FULL = 'https://www.googleapis.com/auth/calendar';

/**
 * The narrowest Google consent each direction can run on.
 *
 * Import-only never writes, so it asks for read access and nothing else;
 * export-only only ever touches the calendar this app creates, so it never
 * asks to see the user's events at all. Asking for both halves regardless
 * would put permissions on the consent screen the connection cannot use.
 */
export const GOOGLE_SCOPES: Record<SyncDirection, string[]> = {
  two_way: [EVENTS, APP_CREATED],
  import_only: [EVENTS_READONLY],
  export_only: [APP_CREATED],
};

/** Scopes that grant everything the key grants, so a wider consent still covers a narrower need. */
const IMPLIES: Record<string, string[]> = {
  [FULL]: [EVENTS, EVENTS_READONLY, APP_CREATED],
  [EVENTS]: [EVENTS_READONLY],
};

/**
 * Connections made before scopes were recorded were all minted with the
 * two-way pair, so a missing list means that, not "no access".
 */
export function grantedScopesOf(granted?: string[] | null): string[] {
  return granted?.length ? granted : GOOGLE_SCOPES.two_way;
}

export function scopesCover(
  granted: string[] | undefined | null,
  needed: string[],
): boolean {
  const held = new Set<string>();
  for (const scope of grantedScopesOf(granted)) {
    held.add(scope);
    for (const implied of IMPLIES[scope] ?? []) held.add(implied);
  }
  return needed.every((scope) => held.has(scope));
}

/** True when moving to this direction needs a fresh Google consent. */
export function needsReconsent(
  provider: string,
  granted: string[] | undefined | null,
  direction: SyncDirection,
): boolean {
  if (provider !== 'google') return false;
  return !scopesCover(granted, GOOGLE_SCOPES[direction]);
}
