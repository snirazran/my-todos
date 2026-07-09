import CalendarConnectionModel, {
  type CalendarConnectionDoc,
} from '@/lib/models/CalendarConnection';
import CalendarEventLinkModel from '@/lib/models/CalendarEventLink';
import { addDaysYMD } from '@/lib/taskOccurrence';
import { getZonedToday } from '@/lib/utils';
import {
  getUserTz,
  processRemoteChanges,
  runOutboundSweep,
  MAX_IMPORTED_EVENTS,
  SYNC_WINDOW_FUTURE_DAYS,
  SYNC_WINDOW_PAST_DAYS,
  type RemoteChange,
} from '../engine';
import { instantToZoned, zonedToUtc } from '../time';
import { googleAdapter } from './adapter';
import {
  GoogleAuthError,
  GoogleSyncTokenGoneError,
  ensureAppCalendar,
  listEvents,
  type GoogleEvent,
} from './client';
import { googleToNeutral, PRIVATE_GROUP_ID, PRIVATE_TASK_ID } from './map';

async function toRemoteChanges(
  conn: CalendarConnectionDoc,
  items: GoogleEvent[],
  tz: string,
): Promise<RemoteChange[]> {
  const instanceIds = items
    .filter((e) => e.recurringEventId && e.status !== 'cancelled')
    .map((e) => e.id);
  const trackedInstanceIds = new Set<string>(
    instanceIds.length
      ? (
          await CalendarEventLinkModel.find(
            {
              userId: conn.userId,
              connectionId: conn._id,
              providerEventId: { $in: instanceIds },
              recurrenceInstanceId: { $exists: true },
            },
            { providerEventId: 1 },
          ).lean<{ providerEventId?: string }[]>()
        ).map((l) => l.providerEventId!)
      : [],
  );

  const changes: RemoteChange[] = [];
  for (const item of items) {
    // App-written events that still live on the read calendar (pre-split
    // leftovers) are mirrors, not user data — never import or act on them.
    const priv = item.extendedProperties?.private;
    if (priv?.[PRIVATE_TASK_ID] || priv?.[PRIVATE_GROUP_ID]) continue;
    if (item.status === 'cancelled') {
      if (item.recurringEventId && item.originalStartTime) {
        const date = item.originalStartTime.date
          ? item.originalStartTime.date
          : item.originalStartTime.dateTime
            ? instantToZoned(item.originalStartTime.dateTime, tz).ymd
            : undefined;
        if (date) {
          changes.push({
            providerEventId: item.id,
            status: 'cancelled',
            cancelledInstance: { parentEventId: item.recurringEventId, date },
          });
        }
        continue;
      }
      changes.push({ providerEventId: item.id, status: 'cancelled' });
      continue;
    }

    // Modified single instances of a recurring series: only track ones the
    // app already expanded to dated tasks; other field overrides are ignored.
    if (item.recurringEventId && !trackedInstanceIds.has(item.id)) continue;

    changes.push({
      providerEventId: item.id,
      etag: item.etag,
      status: 'active',
      parse: googleToNeutral(item, tz),
    });
  }
  return changes;
}

async function fullList(
  conn: CalendarConnectionDoc,
  tz: string,
): Promise<{ items: GoogleEvent[]; nextSyncToken?: string }> {
  const today = getZonedToday(tz);
  const timeMin = zonedToUtc(addDaysYMD(today, -SYNC_WINDOW_PAST_DAYS), '00:00', tz);
  const timeMax = zonedToUtc(
    addDaysYMD(today, SYNC_WINDOW_FUTURE_DAYS + 1),
    '00:00',
    tz,
  );
  const items: GoogleEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;
  do {
    const res = await listEvents(conn, {
      maxResults: '250',
      singleEvents: 'false',
      showDeleted: 'true',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      ...(pageToken ? { pageToken } : {}),
    });
    items.push(...res.items);
    pageToken = res.nextPageToken;
    if (res.nextSyncToken) nextSyncToken = res.nextSyncToken;
  } while (pageToken && items.length < MAX_IMPORTED_EVENTS * 2);
  return { items, nextSyncToken };
}

async function incrementalList(
  conn: CalendarConnectionDoc,
): Promise<{ items: GoogleEvent[]; nextSyncToken?: string }> {
  const items: GoogleEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;
  do {
    const res = await listEvents(conn, {
      maxResults: '250',
      ...(pageToken ? { pageToken } : { syncToken: conn.syncToken! }),
    });
    items.push(...res.items);
    pageToken = res.nextPageToken;
    if (res.nextSyncToken) nextSyncToken = res.nextSyncToken;
  } while (pageToken);
  return { items, nextSyncToken };
}

/**
 * One inbound sync pass for a Google connection (incremental when a sync
 * token exists, full otherwise). Returns whether app tasks changed.
 */
export async function googleInbound(conn: CalendarConnectionDoc): Promise<boolean> {
  const tz = await getUserTz(conn.userId);

  let items: GoogleEvent[];
  let nextSyncToken: string | undefined;
  try {
    if (conn.syncToken) {
      try {
        ({ items, nextSyncToken } = await incrementalList(conn));
      } catch (err) {
        if (!(err instanceof GoogleSyncTokenGoneError)) throw err;
        ({ items, nextSyncToken } = await fullList(conn, tz));
      }
    } else {
      ({ items, nextSyncToken } = await fullList(conn, tz));
    }
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      await CalendarConnectionModel.updateOne(
        { _id: conn._id },
        { $set: { status: 'reauth_required', errorMessage: err.message } },
      );
      return false;
    }
    throw err;
  }

  const changes = await toRemoteChanges(conn, items, tz);
  const appChanged = await processRemoteChanges(conn, googleAdapter, changes, tz);

  await CalendarConnectionModel.updateOne(
    { _id: conn._id },
    {
      $set: {
        ...(nextSyncToken ? { syncToken: nextSyncToken } : {}),
        lastIncrementalSyncAt: new Date(),
        status: 'active',
      },
      $unset: { errorMessage: 1 },
    },
  );

  return appChanged;
}

/** Full connect-time sync: seed legacy links, pull events, push app tasks. */
export async function googleInitialSync(conn: CalendarConnectionDoc): Promise<boolean> {
  const tz = await getUserTz(conn.userId);
  const { seedLegacyGoogleLinks } = await import('../engine');
  await seedLegacyGoogleLinks(conn, tz);
  await ensureAppCalendar(conn);
  const appChanged = await googleInbound(conn);
  await runOutboundSweep(conn.userId, { google: googleAdapter });
  await CalendarConnectionModel.updateOne(
    { _id: conn._id },
    { $set: { lastFullSyncAt: new Date() } },
  );
  return appChanged;
}
