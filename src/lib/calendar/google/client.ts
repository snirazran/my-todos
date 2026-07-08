import type { CalendarConnectionDoc } from '@/lib/models/CalendarConnection';
import { decryptSecret } from '../crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_BASE = 'https://www.googleapis.com/calendar/v3';

export class GoogleAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleAuthError';
  }
}

export class GoogleSyncTokenGoneError extends Error {
  constructor() {
    super('sync token expired');
    this.name = 'GoogleSyncTokenGoneError';
  }
}

type TokenCacheEntry = { accessToken: string; expires: number };

const globalStore = globalThis as unknown as {
  gcalTokenCache?: Map<string, TokenCacheEntry>;
};

function tokenCache() {
  if (!globalStore.gcalTokenCache) globalStore.gcalTokenCache = new Map();
  return globalStore.gcalTokenCache;
}

function clientCreds() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    throw new Error('GOOGLE_CALENDAR_CLIENT_ID / GOOGLE_CALENDAR_CLIENT_SECRET not set');
  return { clientId, clientSecret };
}

export function googleRedirectUri() {
  const base = process.env.APP_BASE_URL || 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}/api/calendar/google/callback`;
}

export function googleConsentUrl(state: string) {
  const { clientId } = clientCreds();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', googleRedirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar.events');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);
  return url.toString();
}

export async function exchangeCodeForTokens(code: string) {
  const { clientId, clientSecret } = clientCreds();
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: googleRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.refresh_token) {
    throw new GoogleAuthError(
      `code exchange failed: ${res.status} ${data.error ?? ''} ${data.error_description ?? ''}`,
    );
  }
  return {
    refreshToken: data.refresh_token as string,
    accessToken: data.access_token as string,
    expiresIn: Number(data.expires_in ?? 3600),
  };
}

export async function getAccessToken(conn: CalendarConnectionDoc): Promise<string> {
  const key = String(conn._id);
  const cached = tokenCache().get(key);
  if (cached && cached.expires > Date.now() + 30_000) return cached.accessToken;

  if (!conn.encRefreshToken) throw new GoogleAuthError('no refresh token');
  const { clientId, clientSecret } = clientCreds();
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: decryptSecret(conn.encRefreshToken),
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    if (data.error === 'invalid_grant') {
      throw new GoogleAuthError('invalid_grant');
    }
    throw new Error(`token refresh failed: ${res.status} ${data.error ?? ''}`);
  }
  const entry: TokenCacheEntry = {
    accessToken: data.access_token,
    expires: Date.now() + Number(data.expires_in ?? 3600) * 1000,
  };
  tokenCache().set(key, entry);
  return entry.accessToken;
}

export function clearTokenCache(connId: unknown) {
  tokenCache().delete(String(connId));
}

async function gcalFetch(
  conn: CalendarConnectionDoc,
  path: string,
  init?: RequestInit,
  attempt = 0,
): Promise<Response> {
  const token = await getAccessToken(conn);
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) {
    clearTokenCache(conn._id);
    if (attempt === 0) return gcalFetch(conn, path, init, 1);
    throw new GoogleAuthError('unauthorized');
  }
  if ((res.status === 403 || res.status === 429) && attempt < 3) {
    const body = await res.clone().text();
    if (/rateLimitExceeded|userRateLimitExceeded|quotaExceeded/.test(body) || res.status === 429) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      return gcalFetch(conn, path, init, attempt + 1);
    }
  }
  return res;
}

function calPath(conn: CalendarConnectionDoc) {
  return `/calendars/${encodeURIComponent(conn.calendarId || 'primary')}`;
}

export type GoogleEvent = {
  id: string;
  status?: string;
  etag?: string;
  summary?: string;
  description?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  recurrence?: string[];
  recurringEventId?: string;
  originalStartTime?: { date?: string; dateTime?: string; timeZone?: string };
  reminders?: {
    useDefault?: boolean;
    overrides?: { method: string; minutes: number }[];
  };
  extendedProperties?: { private?: Record<string, string> };
  attendees?: { self?: boolean; responseStatus?: string }[];
};

export type ListEventsResult = {
  items: GoogleEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
};

export async function listEvents(
  conn: CalendarConnectionDoc,
  params: Record<string, string>,
): Promise<ListEventsResult> {
  const search = new URLSearchParams(params);
  const res = await gcalFetch(conn, `${calPath(conn)}/events?${search}`);
  if (res.status === 410) throw new GoogleSyncTokenGoneError();
  if (!res.ok) throw new Error(`events.list ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getEvent(
  conn: CalendarConnectionDoc,
  eventId: string,
): Promise<GoogleEvent | null> {
  const res = await gcalFetch(
    conn,
    `${calPath(conn)}/events/${encodeURIComponent(eventId)}`,
  );
  if (res.status === 404 || res.status === 410) return null;
  if (!res.ok) throw new Error(`events.get ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getInstances(
  conn: CalendarConnectionDoc,
  eventId: string,
  timeMin: string,
  timeMax: string,
): Promise<GoogleEvent[]> {
  const items: GoogleEvent[] = [];
  let pageToken: string | undefined;
  do {
    const search = new URLSearchParams({
      timeMin,
      timeMax,
      maxResults: '250',
      ...(pageToken ? { pageToken } : {}),
    });
    const res = await gcalFetch(
      conn,
      `${calPath(conn)}/events/${encodeURIComponent(eventId)}/instances?${search}`,
    );
    if (res.status === 404 || res.status === 410) return items;
    if (!res.ok)
      throw new Error(`events.instances ${res.status}: ${await res.text()}`);
    const data = await res.json();
    items.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return items;
}

export async function insertEvent(
  conn: CalendarConnectionDoc,
  event: Record<string, unknown>,
): Promise<GoogleEvent> {
  const res = await gcalFetch(conn, `${calPath(conn)}/events`, {
    method: 'POST',
    body: JSON.stringify(event),
  });
  if (!res.ok) throw new Error(`events.insert ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function patchEvent(
  conn: CalendarConnectionDoc,
  eventId: string,
  patch: Record<string, unknown>,
): Promise<GoogleEvent> {
  const res = await gcalFetch(
    conn,
    `${calPath(conn)}/events/${encodeURIComponent(eventId)}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  );
  if (!res.ok) throw new Error(`events.patch ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function deleteEvent(conn: CalendarConnectionDoc, eventId: string) {
  const res = await gcalFetch(
    conn,
    `${calPath(conn)}/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE' },
  );
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`events.delete ${res.status}: ${await res.text()}`);
  }
}

export async function watchEvents(
  conn: CalendarConnectionDoc,
  channel: { id: string; token: string },
): Promise<{ resourceId: string; expiration?: string }> {
  const base = process.env.APP_BASE_URL || '';
  const res = await gcalFetch(conn, `${calPath(conn)}/events/watch`, {
    method: 'POST',
    body: JSON.stringify({
      id: channel.id,
      type: 'web_hook',
      address: `${base.replace(/\/$/, '')}/api/calendar/google/webhook`,
      token: channel.token,
    }),
  });
  if (!res.ok) throw new Error(`events.watch ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function stopChannel(
  conn: CalendarConnectionDoc,
  channelId: string,
  resourceId: string,
) {
  try {
    const token = await getAccessToken(conn);
    await fetch(`${API_BASE}/channels/stop`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: channelId, resourceId }),
    });
  } catch {
    // best effort — expired channels die on their own
  }
}
