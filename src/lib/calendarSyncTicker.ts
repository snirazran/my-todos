import connectMongo from '@/lib/mongoose';

const TICK_MS = 60_000;
const MAX_CONNECTIONS_PER_TICK = 10;
const GOOGLE_POLL_MS = 15 * 60_000;
const APPLE_POLL_MS = 5 * 60_000;

type GlobalWithTicker = typeof globalThis & {
  calendarSyncTicker?: ReturnType<typeof setInterval>;
  calendarSyncTickerRunning?: boolean;
};

async function tick() {
  await connectMongo();
  const { default: CalendarConnectionModel } = await import(
    '@/lib/models/CalendarConnection'
  );
  const now = new Date();

  const due = await CalendarConnectionModel.find({
    status: 'active',
    $or: [
      { syncRequestedAt: { $exists: true, $ne: null } },
      { nextPollAt: { $lte: now } },
      { nextPollAt: { $exists: false } },
    ],
  })
    .sort({ syncRequestedAt: -1, nextPollAt: 1 })
    .limit(MAX_CONNECTIONS_PER_TICK);

  for (const conn of due) {
    try {
      let appChanged = false;
      if (conn.provider === 'google') {
        const { googleInbound } = await import('@/lib/calendar/google/sync');
        appChanged = await googleInbound(conn);
        const { ensureChannel } = await import('@/lib/calendar/google/channels');
        await ensureChannel(conn);
      } else if (conn.provider === 'apple') {
        const { appleInbound } = await import('@/lib/calendar/apple/sync');
        appChanged = await appleInbound(conn);
      }

      const pollMs = conn.provider === 'google' ? GOOGLE_POLL_MS : APPLE_POLL_MS;
      await CalendarConnectionModel.updateOne(
        { _id: conn._id },
        {
          $set: { nextPollAt: new Date(Date.now() + pollMs) },
          $unset: { syncRequestedAt: 1 },
        },
      );

      const { scheduleOutboundSweep } = await import(
        '@/lib/calendar/outboundQueue'
      );
      scheduleOutboundSweep(conn.userId);

      if (appChanged) {
        const { notifyTaskChanged } = await import('@/lib/taskSync');
        await notifyTaskChanged(conn.userId);
      }
    } catch (err) {
      console.error(
        `calendar sync failed (${conn.provider}/${conn.userId}):`,
        (err as Error)?.message,
      );
      await CalendarConnectionModel.updateOne(
        { _id: conn._id },
        {
          $set: {
            nextPollAt: new Date(Date.now() + 10 * 60_000),
            errorMessage: (err as Error)?.message?.slice(0, 300),
          },
          $unset: { syncRequestedAt: 1 },
        },
      );
    }
  }
}

export function startCalendarSyncTicker() {
  const g = globalThis as GlobalWithTicker;
  if (g.calendarSyncTicker) return;

  g.calendarSyncTicker = setInterval(async () => {
    if (g.calendarSyncTickerRunning) return;
    g.calendarSyncTickerRunning = true;
    try {
      await tick();
    } catch (err) {
      console.error('Calendar sync ticker failed:', err);
    } finally {
      g.calendarSyncTickerRunning = false;
    }
  }, TICK_MS);

  if (typeof g.calendarSyncTicker.unref === 'function') g.calendarSyncTicker.unref();
}
