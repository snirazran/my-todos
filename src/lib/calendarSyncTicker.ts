import connectMongo from '@/lib/mongoose';
import {
  runGuardedSync,
  SYNCABLE_STATUSES,
  sweepStaleConnections,
  withTimeout,
} from '@/lib/calendar/health';

const TICK_MS = 60_000;
const MAX_CONNECTIONS_PER_TICK = 10;
const TICK_TIMEOUT_MS = 8 * 60_000;
const STALE_SWEEP_MS = 60 * 60_000;

type GlobalWithTicker = typeof globalThis & {
  calendarSyncTicker?: ReturnType<typeof setInterval>;
  calendarSyncTickRunningSince?: number;
  calendarSyncLastStaleSweep?: number;
};

async function tick() {
  await connectMongo();
  const { default: CalendarConnectionModel } = await import(
    '@/lib/models/CalendarConnection'
  );
  const now = new Date();

  const due = await CalendarConnectionModel.find({
    status: { $in: SYNCABLE_STATUSES },
    $or: [
      { syncRequestedAt: { $exists: true, $ne: null } },
      { nextPollAt: { $lte: now } },
      { nextPollAt: { $exists: false } },
    ],
  })
    .sort({ syncRequestedAt: -1, nextPollAt: 1 })
    .limit(MAX_CONNECTIONS_PER_TICK);

  for (const conn of due) {
    let appChanged = false;
    try {
      appChanged = await runGuardedSync(conn, 'scheduled sync', async () => {
        if (conn.provider === 'google') {
          const { googleInbound } = await import('@/lib/calendar/google/sync');
          return googleInbound(conn);
        }
        const { appleInbound } = await import('@/lib/calendar/apple/sync');
        return appleInbound(conn);
      });
    } catch {
      continue;
    }

    if (conn.provider === 'google') {
      try {
        const { ensureChannel } = await import('@/lib/calendar/google/channels');
        await withTimeout(ensureChannel(conn), 30_000, 'watch channel renewal');
      } catch (err) {
        console.error('[calendar] watch renewal failed:', (err as Error)?.message);
      }
    }

    const { scheduleOutboundSweep } = await import('@/lib/calendar/outboundQueue');
    scheduleOutboundSweep(conn.userId);

    if (appChanged) {
      const { notifyTaskChanged } = await import('@/lib/taskSync');
      await notifyTaskChanged(conn.userId);
    }
  }

  const g = globalThis as GlobalWithTicker;
  if (Date.now() - (g.calendarSyncLastStaleSweep ?? 0) > STALE_SWEEP_MS) {
    g.calendarSyncLastStaleSweep = Date.now();
    await sweepStaleConnections();
  }
}

export function startCalendarSyncTicker() {
  const g = globalThis as GlobalWithTicker;
  if (g.calendarSyncTicker) return;

  g.calendarSyncTicker = setInterval(async () => {
    const startedAt = g.calendarSyncTickRunningSince;
    if (startedAt) {
      if (Date.now() - startedAt < TICK_TIMEOUT_MS) return;
      console.error('[calendar] previous sync tick never finished — restarting');
    }
    g.calendarSyncTickRunningSince = Date.now();
    try {
      await withTimeout(tick(), TICK_TIMEOUT_MS, 'calendar sync tick');
    } catch (err) {
      console.error('Calendar sync ticker failed:', (err as Error)?.message);
    } finally {
      g.calendarSyncTickRunningSince = undefined;
    }
  }, TICK_MS);

  if (typeof g.calendarSyncTicker.unref === 'function') g.calendarSyncTicker.unref();
}
