import { createDAVClient } from 'tsdav';
import type { CalendarConnectionDoc } from '@/lib/models/CalendarConnection';
import { decryptSecret } from '../crypto';

export const ICLOUD_CALDAV_URL = 'https://caldav.icloud.com';

export type DavClient = Awaited<ReturnType<typeof createDAVClient>>;

export class AppleAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppleAuthError';
  }
}

type ClientCacheEntry = { client: DavClient; expires: number };

const globalStore = globalThis as unknown as {
  caldavClientCache?: Map<string, ClientCacheEntry>;
};

function cache() {
  if (!globalStore.caldavClientCache) globalStore.caldavClientCache = new Map();
  return globalStore.caldavClientCache;
}

const CLIENT_TTL_MS = 30 * 60_000;

export async function createAppleClient(
  appleId: string,
  appPassword: string,
): Promise<DavClient> {
  try {
    return await createDAVClient({
      serverUrl: ICLOUD_CALDAV_URL,
      credentials: { username: appleId, password: appPassword },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
    });
  } catch (err) {
    const msg = (err as Error)?.message ?? '';
    if (/401|unauthoriz/i.test(msg)) {
      throw new AppleAuthError('invalid Apple ID or app-specific password');
    }
    throw err;
  }
}

export async function getClient(conn: CalendarConnectionDoc): Promise<DavClient> {
  const key = String(conn._id);
  const entry = cache().get(key);
  if (entry && entry.expires > Date.now()) return entry.client;
  if (!conn.appleId || !conn.encAppPassword)
    throw new AppleAuthError('missing credentials');
  const client = await createAppleClient(
    conn.appleId,
    decryptSecret(conn.encAppPassword),
  );
  cache().set(key, { client, expires: Date.now() + CLIENT_TTL_MS });
  return client;
}

export function clearClientCache(connId: unknown) {
  cache().delete(String(connId));
}

export type AppleCalendarInfo = {
  url: string;
  displayName: string;
  ctag?: string;
};

export async function listVEventCalendars(
  client: DavClient,
): Promise<AppleCalendarInfo[]> {
  const calendars = await client.fetchCalendars();
  return calendars
    .filter((c) => {
      const comps = (c.components ?? []) as string[];
      return comps.length === 0 || comps.includes('VEVENT');
    })
    .map((c) => ({
      url: c.url,
      displayName:
        typeof c.displayName === 'string' && c.displayName
          ? c.displayName
          : 'Calendar',
      ctag: c.ctag ? String(c.ctag) : undefined,
    }));
}

export async function getCalendarCtag(
  client: DavClient,
  calendarUrl: string,
): Promise<string | undefined> {
  const calendars = await client.fetchCalendars();
  const cal = calendars.find((c) => c.url === calendarUrl);
  return cal?.ctag ? String(cal.ctag) : undefined;
}
