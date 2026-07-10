import { v4 as uuid } from 'uuid';
import type { DAVCalendar } from 'tsdav';
import { addDaysYMD } from '@/lib/taskOccurrence';
import type { ProviderAdapter } from '../engine';
import { ensureAppCalendar, getClient } from './client';
import { buildVEVENT, expandInstances, parseVEVENT } from './ics';

function calendarRef(url: string): DAVCalendar {
  return { url } as DAVCalendar;
}

function collectionUrlOf(href: string): string {
  return href.slice(0, href.lastIndexOf('/') + 1);
}

async function fetchOne(conn: Parameters<ProviderAdapter['insert']>[0], href: string) {
  const client = await getClient(conn);
  const objects = await client.fetchCalendarObjects({
    calendar: calendarRef(collectionUrlOf(href)),
    objectUrls: [href],
  });
  return objects[0] ?? null;
}

export const appleAdapter: ProviderAdapter = {
  provider: 'apple',

  async insert(conn, neutral, fp) {
    if (!conn.appCalendarUrl) await ensureAppCalendar(conn);
    const client = await getClient(conn);
    const uid = `${uuid()}@local`;
    const filename = `${uid}.ics`;
    const ics = buildVEVENT(neutral, uid, fp);
    const res = await client.createCalendarObject({
      calendar: calendarRef(conn.appCalendarUrl!),
      iCalString: ics,
      filename,
    });
    if (!res.ok) {
      throw new Error(`caldav create ${res.status}: ${await res.text()}`);
    }
    const href = `${conn.appCalendarUrl!.replace(/\/$/, '')}/${filename}`;
    let etag = res.headers.get('etag') ?? undefined;
    if (!etag) {
      const obj = await fetchOne(conn, href);
      etag = obj?.etag ?? undefined;
    }
    return { providerHref: href, providerUid: uid, etag };
  },

  async update(conn, link, neutral, fp) {
    if (!link.providerHref || !link.providerUid) return 'gone';
    const client = await getClient(conn);
    const ics = buildVEVENT(neutral, link.providerUid, fp);
    const res = await client.updateCalendarObject({
      calendarObject: {
        url: link.providerHref,
        data: ics,
        etag: link.etag,
      },
    });
    if (res.status === 412) return 'conflict';
    if (res.status === 404 || res.status === 410) return 'gone';
    if (!res.ok) {
      throw new Error(`caldav update ${res.status}: ${await res.text()}`);
    }
    let etag = res.headers.get('etag') ?? undefined;
    if (!etag) {
      const obj = await fetchOne(conn, link.providerHref);
      etag = obj?.etag ?? undefined;
    }
    return { etag };
  },

  async removeOrEnd(conn, link, todayYMD, tz) {
    if (!link.providerHref) return;
    const client = await getClient(conn);
    const obj = await fetchOne(conn, link.providerHref);
    if (!obj?.data) return;

    const parsed = parseVEVENT(String(obj.data), tz);
    const recurring =
      parsed.kind !== 'skip' &&
      'neutral' in parsed &&
      (parsed.kind === 'unsupported-recurrence' || !!parsed.neutral.recurrence);
    const startedInPast =
      parsed.kind !== 'skip' &&
      'neutral' in parsed &&
      parsed.neutral.startDate < todayYMD;

    if (recurring && startedInPast && parsed.kind === 'event' && parsed.neutral.recurrence) {
      const yesterday = addDaysYMD(todayYMD, -1);
      const truncated = {
        ...parsed.neutral,
        recurrence: { ...parsed.neutral.recurrence, until: yesterday },
      };
      const uid = link.providerUid ?? `${uuid()}@local`;
      const ics = buildVEVENT(truncated, uid, link.lastSyncedFingerprint);
      const res = await client.updateCalendarObject({
        calendarObject: { url: link.providerHref, data: ics, etag: obj.etag },
      });
      if (!res.ok && res.status !== 412) {
        throw new Error(`caldav truncate ${res.status}`);
      }
      return;
    }

    const res = await client.deleteCalendarObject({
      calendarObject: { url: link.providerHref, etag: obj.etag },
    });
    if (!res.ok && res.status !== 404 && res.status !== 410 && res.status !== 412) {
      throw new Error(`caldav delete ${res.status}`);
    }
  },

  async listInstances(conn, change, windowStart, windowEnd, tz) {
    const href = change.providerHref;
    if (!href) return [];
    const obj = await fetchOne(conn, href);
    if (!obj?.data) return [];
    return expandInstances(String(obj.data), windowStart, windowEnd, tz);
  },
};
