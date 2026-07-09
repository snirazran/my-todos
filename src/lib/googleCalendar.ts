import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import UserModel from '@/lib/models/User';
import type { TaskDoc } from '@/lib/models/Task';

const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_OAUTH_CLIENT_ID ||
  '324868480648-mcnp29sgs2r9ip4nsbfs82phhiuv4tos.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
const STATE_SECRET = process.env.NEXTAUTH_SECRET || 'frogress-cal-state';

export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.app.created',
];

export const APP_CALENDAR_SUMMARY = 'Frogress';
export const APP_TASK_PROP = 'frogressTaskId';

export type GoogleCalendarState = {
  refreshToken?: string;
  accessToken?: string;
  accessTokenExpiresAt?: string | Date;
  calendarId?: string;
};

export function oauthConfigured() {
  return Boolean(GOOGLE_CLIENT_SECRET);
}

export function redirectUri(origin: string) {
  return `${origin}/api/calendar/google/callback`;
}

export function signState(uid: string) {
  const payload = `${uid}.${Date.now() + 10 * 60 * 1000}`;
  const sig = createHmac('sha256', STATE_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}

export function verifyState(state: string): string | null {
  try {
    const raw = Buffer.from(state, 'base64url').toString('utf8');
    const [uid, expStr, sig] = raw.split('.');
    if (!uid || !expStr || !sig) return null;
    const expected = createHmac('sha256', STATE_SECRET)
      .update(`${uid}.${expStr}`)
      .digest('hex');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    if (Date.now() > Number(expStr)) return null;
    return uid;
  } catch {
    return null;
  }
}

export function buildAuthUrl(origin: string, state: string) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri(origin));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', CALENDAR_SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state);
  return url.toString();
}

export async function exchangeCode(origin: string, code: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(origin),
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
}

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  return (await res.json()) as { access_token: string; expires_in: number };
}

export async function getAccessToken(
  uid: string,
  gcal: GoogleCalendarState | undefined,
  legacyToken?: string,
): Promise<string | null> {
  if (gcal?.refreshToken) {
    const expiresAt = gcal.accessTokenExpiresAt
      ? new Date(gcal.accessTokenExpiresAt).getTime()
      : 0;
    if (gcal.accessToken && expiresAt - Date.now() > 60_000) {
      return gcal.accessToken;
    }
    const fresh = await refreshAccessToken(gcal.refreshToken);
    await UserModel.updateOne(
      { _id: uid },
      {
        $set: {
          'googleCalendar.accessToken': fresh.access_token,
          'googleCalendar.accessTokenExpiresAt': new Date(
            Date.now() + fresh.expires_in * 1000,
          ),
        },
      },
    );
    return fresh.access_token;
  }
  return legacyToken ?? null;
}

export async function revokeToken(token: string) {
  await fetch(
    `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
    { method: 'POST' },
  ).catch(() => {});
}

// ---------------------------------------------------------------------------
// Calendar API helpers
// ---------------------------------------------------------------------------

export class GcalError extends Error {
  status: number;
  constructor(status: number, body: string) {
    super(`Google Calendar API ${status}: ${body}`);
    this.status = status;
  }
}

async function gcal(
  token: string,
  path: string,
  init?: RequestInit & { query?: Record<string, string> },
) {
  const url = new URL(`https://www.googleapis.com/calendar/v3${path}`);
  for (const [k, v] of Object.entries(init?.query ?? {})) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (res.status === 204) return null;
  if (!res.ok) throw new GcalError(res.status, await res.text());
  return res.json();
}

export type GcalEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  recurringEventId?: string;
  iCalUID?: string;
  extendedProperties?: { private?: Record<string, string> };
};

export async function ensureAppCalendar(
  uid: string,
  token: string,
  existingId?: string,
): Promise<string> {
  if (existingId) {
    try {
      await gcal(token, `/calendars/${encodeURIComponent(existingId)}`);
      return existingId;
    } catch (e) {
      if (!(e instanceof GcalError) || (e.status !== 404 && e.status !== 410))
        throw e;
    }
  }
  const created = await gcal(token, '/calendars', {
    method: 'POST',
    body: JSON.stringify({ summary: APP_CALENDAR_SUMMARY }),
  });
  await UserModel.updateOne(
    { _id: uid },
    { $set: { 'googleCalendar.calendarId': created.id } },
  );
  return created.id as string;
}

export async function listEvents(
  token: string,
  calendarId: string,
  query: Record<string, string>,
): Promise<GcalEvent[]> {
  const items: GcalEvent[] = [];
  let pageToken: string | undefined;
  do {
    const data = await gcal(
      token,
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      { query: { maxResults: '250', ...query, ...(pageToken ? { pageToken } : {}) } },
    );
    items.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return items;
}

export function insertEvent(token: string, calendarId: string, event: object) {
  return gcal(token, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    body: JSON.stringify(event),
  });
}

export function patchEvent(
  token: string,
  calendarId: string,
  eventId: string,
  event: object,
) {
  return gcal(
    token,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: 'PATCH', body: JSON.stringify(event) },
  );
}

export async function deleteEvent(
  token: string,
  calendarId: string,
  eventId: string,
) {
  try {
    await gcal(
      token,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: 'DELETE' },
    );
  } catch (e) {
    if (e instanceof GcalError && (e.status === 404 || e.status === 410)) return;
    throw e;
  }
}

export async function deleteCalendar(token: string, calendarId: string) {
  try {
    await gcal(token, `/calendars/${encodeURIComponent(calendarId)}`, {
      method: 'DELETE',
    });
  } catch (e) {
    if (e instanceof GcalError && (e.status === 404 || e.status === 410)) return;
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Task -> event mapping
// ---------------------------------------------------------------------------

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

function untilClause(repeatEndDate?: string) {
  if (!repeatEndDate) return '';
  return `;UNTIL=${repeatEndDate.replace(/-/g, '')}T235959Z`;
}

export function buildRRule(group: TaskDoc[]): string | null {
  const doc = group[0];
  if (!doc) return null;
  const until = untilClause(doc.repeatEndDate);

  if (doc.repeatRule) {
    const r = doc.repeatRule;
    const interval = Math.max(1, r.interval || 1);
    if (r.freq === 'daily') return `RRULE:FREQ=DAILY;INTERVAL=${interval}${until}`;
    if (r.freq === 'weekly') {
      const days = (r.byWeekday ?? []).map((d) => BYDAY[d]).join(',');
      return `RRULE:FREQ=WEEKLY;INTERVAL=${interval}${days ? `;BYDAY=${days}` : ''}${until}`;
    }
    const dom = (r.byMonthday ?? []).join(',');
    return `RRULE:FREQ=MONTHLY;INTERVAL=${interval}${dom ? `;BYMONTHDAY=${dom}` : ''}${until}`;
  }
  if (doc.repeatMode === 'monthly' && typeof doc.repeatDayOfMonth === 'number') {
    return `RRULE:FREQ=MONTHLY;BYMONTHDAY=${doc.repeatDayOfMonth}${until}`;
  }
  const dows = Array.from(
    new Set(
      group
        .map((g) => g.dayOfWeek)
        .filter((d): d is NonNullable<TaskDoc['dayOfWeek']> => typeof d === 'number'),
    ),
  ).sort((a, b) => a - b);
  if (dows.length === 0) return null;
  if (dows.length === 7) return `RRULE:FREQ=DAILY${until}`;
  return `RRULE:FREQ=WEEKLY;BYDAY=${dows.map((d) => BYDAY[d]).join(',')}${until}`;
}

function addDaysYMD(ymd: string, n: number) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dowFromYMD(ymd: string) {
  return new Date(`${ymd}T12:00:00Z`).getUTCDay();
}

function domFromYMD(ymd: string) {
  return Number(ymd.slice(8, 10));
}

function groupOccursOn(group: TaskDoc[], date: string): boolean {
  return group.some((doc) => {
    if (doc.repeatEndDate && date > doc.repeatEndDate) return false;
    if (doc.repeatRule) {
      const r = doc.repeatRule;
      const start = doc.repeatStartDate;
      if (!start || date < start) return false;
      const interval = Math.max(1, r.interval || 1);
      const diffDays = Math.round(
        (Date.parse(date) - Date.parse(start)) / 86400000,
      );
      if (r.freq === 'daily') return diffDays >= 0 && diffDays % interval === 0;
      if (r.freq === 'weekly') {
        if (!(r.byWeekday ?? []).includes(dowFromYMD(date))) return false;
        const startWeek = addDaysYMD(start, -dowFromYMD(start));
        const dateWeek = addDaysYMD(date, -dowFromYMD(date));
        const weekDiff = Math.round(
          (Date.parse(dateWeek) - Date.parse(startWeek)) / (7 * 86400000),
        );
        return weekDiff >= 0 && weekDiff % interval === 0;
      }
      return (r.byMonthday ?? []).includes(domFromYMD(date));
    }
    if (doc.repeatMode === 'monthly' && typeof doc.repeatDayOfMonth === 'number')
      return domFromYMD(date) === doc.repeatDayOfMonth;
    if (typeof doc.dayOfWeek === 'number')
      return dowFromYMD(date) === doc.dayOfWeek;
    return false;
  });
}

export function nextOccurrenceOnOrAfter(
  group: TaskDoc[],
  fromYMD: string,
): string | null {
  let d = fromYMD;
  for (let i = 0; i < 366; i++) {
    if (groupOccursOn(group, d)) return d;
    d = addDaysYMD(d, 1);
  }
  return null;
}

export function eventTimesForTask(
  task: Pick<TaskDoc, 'startTime' | 'endTime'>,
  date: string,
  tz: string,
) {
  if (task.startTime) {
    const start = `${date}T${task.startTime}:00`;
    let end: string;
    if (task.endTime && task.endTime > task.startTime) {
      end = `${date}T${task.endTime}:00`;
    } else {
      const [h, m] = task.startTime.split(':').map(Number);
      const total = h * 60 + m + 60;
      const eh = Math.min(23, Math.floor(total / 60));
      const em = total >= 24 * 60 ? 59 : total % 60;
      end = `${date}T${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}:00`;
    }
    return {
      start: { dateTime: start, timeZone: tz },
      end: { dateTime: end, timeZone: tz },
    };
  }
  return {
    start: { date },
    end: { date: addDaysYMD(date, 1) },
  };
}

export function exportFingerprint(parts: (string | undefined | null)[]) {
  return createHash('sha1').update(parts.map((p) => p ?? '').join('|')).digest('hex');
}
