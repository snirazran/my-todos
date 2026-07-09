import { addDaysYMD } from '@/lib/taskOccurrence';
import type { ProviderAdapter, RemoteChange } from '../engine';
import { instantToZoned, untilUtcForDate, zonedToUtc } from '../time';
import {
  deleteEvent,
  ensureAppCalendar,
  getEvent,
  getInstances,
  insertEvent,
  patchEvent,
} from './client';
import { neutralToGoogle } from './map';

export const googleAdapter: ProviderAdapter = {
  provider: 'google',

  async insert(conn, neutral, fp) {
    if (!conn.appCalendarId) await ensureAppCalendar(conn);
    const created = await insertEvent(conn, neutralToGoogle(neutral, fp));
    return { providerEventId: created.id, etag: created.etag };
  },

  async update(conn, link, neutral, fp, opts) {
    if (!link.providerEventId) return 'gone';
    const body = neutralToGoogle(neutral, fp);
    if (opts.instanceOnly) delete body.recurrence;
    try {
      const updated = await patchEvent(conn, link.providerEventId, body);
      return { etag: updated.etag };
    } catch (err) {
      if (/events\.patch (404|410)/.test((err as Error).message)) return 'gone';
      throw err;
    }
  },

  async removeOrEnd(conn, link, todayYMD, tz) {
    if (!link.providerEventId) return;
    const remote = await getEvent(conn, link.providerEventId);
    if (!remote || remote.status === 'cancelled') return;

    const rruleIdx = (remote.recurrence ?? []).findIndex((l) =>
      l.toUpperCase().startsWith('RRULE:'),
    );
    const startYmd = remote.start?.date
      ? remote.start.date
      : remote.start?.dateTime
        ? instantToZoned(remote.start.dateTime, tz).ymd
        : undefined;

    if (rruleIdx >= 0 && startYmd && startYmd < todayYMD) {
      const yesterday = addDaysYMD(todayYMD, -1);
      const recurrence = [...(remote.recurrence ?? [])];
      const withoutBounds = recurrence[rruleIdx]
        .split(';')
        .filter((p) => !/^(UNTIL|COUNT)=/i.test(p))
        .join(';');
      const until = remote.start?.date
        ? yesterday.replace(/-/g, '')
        : untilUtcForDate(yesterday, tz);
      recurrence[rruleIdx] = `${withoutBounds};UNTIL=${until}`;
      await patchEvent(conn, link.providerEventId, { recurrence });
    } else {
      await deleteEvent(conn, link.providerEventId);
    }
  },

  async listInstances(conn, change: RemoteChange, windowStart, windowEnd, tz) {
    if (!change.providerEventId) return [];
    const timeMin = zonedToUtc(windowStart, '00:00', tz).toISOString();
    const timeMax = zonedToUtc(addDaysYMD(windowEnd, 1), '00:00', tz).toISOString();
    const items = await getInstances(conn, change.providerEventId, timeMin, timeMax);
    const out: { date: string; instanceEventId?: string }[] = [];
    for (const inst of items) {
      if (inst.status === 'cancelled') continue;
      const date = inst.start?.date
        ? inst.start.date
        : inst.start?.dateTime
          ? instantToZoned(inst.start.dateTime, tz).ymd
          : undefined;
      if (date) out.push({ date, instanceEventId: inst.id });
    }
    return out;
  },
};
