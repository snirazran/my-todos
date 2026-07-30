import connectMongo from '@/lib/mongoose';
import { beatServerHeartbeat, claimDowntimeWindow } from '@/lib/serverHeartbeat';

const TICK_MS = 10_000;

type GlobalWithTicker = typeof globalThis & {
  frogodoroTicker?: ReturnType<typeof setInterval>;
  frogodoroTickerRunning?: boolean;
};

export function startFrogodoroTicker() {
  const g = globalThis as GlobalWithTicker;
  if (g.frogodoroTicker) return;

  const tick = async () => {
    if (g.frogodoroTickerRunning) return;
    g.frogodoroTickerRunning = true;
    try {
      await connectMongo();
      const { processDueFrogodoroTimers } = await import(
        '@/lib/frogodoroTimerProcessor'
      );
      await processDueFrogodoroTimers();
    } catch (err) {
      console.error('Frogodoro ticker failed:', err);
    } finally {
      // Always, even if processing threw: the heartbeat records that the
      // process was running, not that the work succeeded. Skipping it on error
      // would grow a fake downtime window with every failed tick, and nothing
      // would ever expire again.
      await beatServerHeartbeat().catch(() => undefined);
      g.frogodoroTickerRunning = false;
    }
  };

  g.frogodoroTicker = setInterval(tick, TICK_MS);

  if (typeof g.frogodoroTicker.unref === 'function') g.frogodoroTicker.unref();

  // Sessions that ended while this process was down are already sitting in the
  // database. Recover them now instead of waiting out the first tick, and
  // record the downtime window first so the processor doesn't mistake them for
  // abandoned junk and drop their focus time.
  void claimDowntimeWindow()
    .then(tick)
    .catch((err) => {
      console.error('Frogodoro boot recovery failed:', err);
    });
}
