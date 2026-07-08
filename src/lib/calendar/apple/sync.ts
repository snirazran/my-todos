import type { DAVCalendar } from 'tsdav';
import CalendarConnectionModel, {
  type CalendarConnectionDoc,
} from '@/lib/models/CalendarConnection';
import CalendarEventLinkModel, {
  type CalendarEventLinkDoc,
} from '@/lib/models/CalendarEventLink';
import { addDaysYMD } from '@/lib/taskOccurrence';
import { getZonedToday } from '@/lib/utils';
import {
  getUserTz,
  processRemoteChanges,
  runOutboundSweep,
  SYNC_WINDOW_FUTURE_DAYS,
  SYNC_WINDOW_PAST_DAYS,
  type RemoteChange,
} from '../engine';
import { zonedToUtc } from '../time';
import { appleAdapter } from './adapter';
import { AppleAuthError, getCalendarCtag, getClient } from './client';
import { parseVEVENT } from './ics';

/**
 * One inbound sync pass for an iCloud connection. Cheap when nothing changed:
 * a single calendar-home PROPFIND compares the collection ctag.
 */
export async function appleInbound(
  conn: CalendarConnectionDoc,
  opts?: { force?: boolean },
): Promise<boolean> {
  if (!conn.calendarUrl) return false;
  const tz = await getUserTz(conn.userId);

  try {
    const client = await getClient(conn);
    const ctag = await getCalendarCtag(client, conn.calendarUrl);
    if (!opts?.force && ctag && conn.ctag === ctag) {
      await CalendarConnectionModel.updateOne(
        { _id: conn._id },
        { $set: { lastIncrementalSyncAt: new Date(), status: 'active' } },
      );
      return false;
    }

    const today = getZonedToday(tz);
    const windowStart = addDaysYMD(today, -SYNC_WINDOW_PAST_DAYS);
    const windowEnd = addDaysYMD(today, SYNC_WINDOW_FUTURE_DAYS);
    const calendar = { url: conn.calendarUrl } as DAVCalendar;

    const objects = await client.fetchCalendarObjects({
      calendar,
      timeRange: {
        start: zonedToUtc(windowStart, '00:00', tz).toISOString(),
        end: zonedToUtc(addDaysYMD(windowEnd, 1), '00:00', tz).toISOString(),
      },
    });

    const links = await CalendarEventLinkModel.find({
      userId: conn.userId,
      connectionId: conn._id,
    }).lean<CalendarEventLinkDoc[]>();
    const etagByHref = new Map(
      links.filter((l) => l.providerHref).map((l) => [l.providerHref!, l.etag]),
    );

    const changes: RemoteChange[] = [];
    const seenHrefs = new Set<string>();

    for (const obj of objects) {
      if (!obj.url || !obj.data) continue;
      seenHrefs.add(obj.url);
      if (obj.etag && etagByHref.has(obj.url) && etagByHref.get(obj.url) === obj.etag) {
        continue;
      }
      const parsed = parseVEVENT(String(obj.data), tz);
      changes.push({
        providerHref: obj.url,
        providerUid: 'uid' in parsed ? parsed.uid : undefined,
        etag: obj.etag ?? undefined,
        status: 'active',
        parse: parsed,
      });
    }

    // Linked events not returned by the window query: either deleted remotely
    // or simply out of window — a multiget on their hrefs tells them apart.
    const missingHrefs = Array.from(
      new Set(
        links
          .map((l) => l.providerHref)
          .filter((h): h is string => !!h && !seenHrefs.has(h)),
      ),
    );
    if (missingHrefs.length > 0) {
      const found = await client.fetchCalendarObjects({
        calendar,
        objectUrls: missingHrefs,
      });
      const foundSet = new Set(
        found.filter((o) => o.url && o.data).map((o) => o.url),
      );
      for (const href of missingHrefs) {
        if (!foundSet.has(href)) {
          changes.push({ providerHref: href, status: 'cancelled' });
        }
      }
    }

    const appChanged = await processRemoteChanges(conn, appleAdapter, changes, tz);

    await CalendarConnectionModel.updateOne(
      { _id: conn._id },
      {
        $set: {
          ...(ctag ? { ctag } : {}),
          lastIncrementalSyncAt: new Date(),
          status: 'active',
        },
        $unset: { errorMessage: 1 },
      },
    );

    return appChanged;
  } catch (err) {
    if (err instanceof AppleAuthError) {
      await CalendarConnectionModel.updateOne(
        { _id: conn._id },
        { $set: { status: 'reauth_required', errorMessage: err.message } },
      );
      return false;
    }
    throw err;
  }
}

/** Full connect-time sync: pull calendar events, push app tasks. */
export async function appleInitialSync(conn: CalendarConnectionDoc): Promise<boolean> {
  const appChanged = await appleInbound(conn, { force: true });
  await runOutboundSweep(conn.userId, { apple: appleAdapter });
  await CalendarConnectionModel.updateOne(
    { _id: conn._id },
    { $set: { lastFullSyncAt: new Date() } },
  );
  return appChanged;
}
