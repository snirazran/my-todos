import connectMongo from '@/lib/mongoose';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import CalendarConnectionModel, {
  type CalendarConnectionDoc,
} from '@/lib/models/CalendarConnection';
import { notifyTaskChanged } from '@/lib/taskSync';
import { invalidateConnectionCache } from './connections';
import { deleteConnectionData } from './engine';

async function tearDownRemote(conn: CalendarConnectionDoc, reason: string) {
  try {
    if (conn.provider === 'google') {
      const { clearTokenCache, deleteAppCalendar, stopChannel } = await import(
        './google/client'
      );
      if (conn.channelId && conn.resourceId) {
        await stopChannel(conn, conn.channelId, conn.resourceId);
      }
      await deleteAppCalendar(conn);
      clearTokenCache(conn._id);
    } else {
      const { clearClientCache, deleteAppCalendar } = await import('./apple/client');
      await deleteAppCalendar(conn);
      clearClientCache(conn._id);
    }
  } catch (err) {
    console.error(
      `[calendar] remote cleanup failed during ${reason} (continuing):`,
      (err as Error)?.message,
    );
  }
}

/** User-initiated disconnect: removes the connection and its imported data. */
export async function disconnectCalendarConnection(conn: CalendarConnectionDoc) {
  await connectMongo();
  await tearDownRemote(conn, 'disconnect');
  await deleteConnectionData(conn._id!);
  invalidateConnectionCache(conn.userId);
  await recordAnalyticsEvent({
    userId: conn.userId,
    name: 'calendar_disconnected',
    properties: { provider: conn.provider, reason: 'user' },
  });
  await notifyTaskChanged(conn.userId);
}

/**
 * Automatic disconnect after a connection stays broken past the grace period.
 * Deliberately non-destructive: credentials and push channels go away, but
 * tasks, events and event links stay put so reconnecting picks up where it
 * left off instead of duplicating everything.
 */
export async function autoDisconnectConnection(
  conn: CalendarConnectionDoc,
  reason: 'credentials-expired' | 'sync-unhealthy',
) {
  await connectMongo();
  if (conn.provider === 'google') {
    try {
      if (conn.channelId && conn.resourceId) {
        const { stopChannel } = await import('./google/client');
        await stopChannel(conn, conn.channelId, conn.resourceId);
      }
      const { clearTokenCache } = await import('./google/client');
      clearTokenCache(conn._id);
    } catch (err) {
      console.error(
        '[calendar] channel teardown failed during auto-disconnect (continuing):',
        (err as Error)?.message,
      );
    }
  } else {
    const { clearClientCache } = await import('./apple/client');
    clearClientCache(conn._id);
  }

  await CalendarConnectionModel.updateOne(
    { _id: conn._id },
    {
      $set: {
        status: 'disconnected',
        pausedReason: reason,
        errorMessage:
          reason === 'credentials-expired'
            ? 'Access expired — reconnect to resume syncing.'
            : 'Syncing kept failing — reconnect to resume.',
      },
      $unset: {
        encRefreshToken: 1,
        encAppPassword: 1,
        syncToken: 1,
        calendarCtags: 1,
        channelId: 1,
        channelToken: 1,
        resourceId: 1,
        channelExpiration: 1,
        nextPollAt: 1,
        syncRequestedAt: 1,
      },
    },
  );
  invalidateConnectionCache(conn.userId);
  await recordAnalyticsEvent({
    userId: conn.userId,
    name: 'calendar_disconnected',
    properties: { provider: conn.provider, reason },
  });
  console.warn(
    `[calendar] auto-disconnected ${conn.provider} for ${conn.userId} (${reason})`,
  );
}
