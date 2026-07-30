import connectMongo from '@/lib/mongoose';

const TICK_MS = 10_000;

type GlobalWithTicker = typeof globalThis & {
  frogodoroTicker?: ReturnType<typeof setInterval>;
  frogodoroTickerRunning?: boolean;
};

export function startFrogodoroTicker() {
  const g = globalThis as GlobalWithTicker;
  if (g.frogodoroTicker) return;

  g.frogodoroTicker = setInterval(async () => {
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
      g.frogodoroTickerRunning = false;
    }
  }, TICK_MS);

  if (typeof g.frogodoroTicker.unref === 'function') g.frogodoroTicker.unref();
}
