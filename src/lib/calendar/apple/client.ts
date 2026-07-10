import { createDAVClient } from 'tsdav';
import { v4 as uuid } from 'uuid';
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

function toCalendarInfo(calendars: Awaited<ReturnType<DavClient['fetchCalendars']>>) {
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

export async function listVEventCalendars(
  client: DavClient,
): Promise<AppleCalendarInfo[]> {
  return toCalendarInfo(await client.fetchCalendars());
}

/** Calendars we import from: every VEVENT calendar except the app-owned one. */
export async function listSourceCalendars(
  client: DavClient,
  appCalendarUrl?: string,
): Promise<AppleCalendarInfo[]> {
  const all = await listVEventCalendars(client);
  return appCalendarUrl ? all.filter((c) => c.url !== appCalendarUrl) : all;
}

export const APP_CALENDAR_DISPLAY_NAME = 'Frogress';

function calendarHomeUrl(calendars: AppleCalendarInfo[]): string | null {
  if (calendars.length === 0) return null;
  const url = calendars[0].url;
  const trimmed = url.endsWith('/') ? url.slice(0, -1) : url;
  const idx = trimmed.lastIndexOf('/');
  return idx < 0 ? null : trimmed.slice(0, idx + 1);
}

/**
 * Create (or verify) the app-owned "Frogress" calendar and persist its URL on
 * the connection. Mutates `conn.appCalendarUrl` so callers in the same pass
 * write to the right calendar immediately.
 */
export async function ensureAppCalendar(
  conn: CalendarConnectionDoc,
): Promise<string> {
  const client = await getClient(conn);
  const calendars = await listVEventCalendars(client);

  if (conn.appCalendarUrl && calendars.some((c) => c.url === conn.appCalendarUrl)) {
    return conn.appCalendarUrl;
  }

  const home = calendarHomeUrl(calendars);
  if (!home) throw new Error('could not determine iCloud calendar home url');
  const url = `${home}${uuid()}/`;
  const res = await client.makeCalendar({
    url,
    props: { displayname: APP_CALENDAR_DISPLAY_NAME },
  });
  if (!res.some((r) => r.ok)) {
    throw new Error(`caldav mkcalendar failed: ${res.map((r) => r.status).join(',')}`);
  }

  conn.appCalendarUrl = url;
  const { default: CalendarConnectionModel } = await import(
    '@/lib/models/CalendarConnection'
  );
  await CalendarConnectionModel.updateOne(
    { _id: conn._id },
    { $set: { appCalendarUrl: url } },
  );
  return url;
}

export async function deleteAppCalendar(conn: CalendarConnectionDoc): Promise<void> {
  if (!conn.appCalendarUrl) return;
  const client = await getClient(conn);
  const res = await client.deleteObject({ url: conn.appCalendarUrl });
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`caldav calendar delete ${res.status}: ${await res.text()}`);
  }
}
