import connectMongo from '@/lib/mongoose';

const TICK_MS = 30 * 60 * 1000;

type GlobalWithTicker = typeof globalThis & {
  plusTicker?: ReturnType<typeof setInterval>;
  plusTickerRunning?: boolean;
};

export function startPlusTicker() {
  const g = globalThis as GlobalWithTicker;
  if (g.plusTicker) return;

  const tick = async () => {
    if (g.plusTickerRunning) return;
    g.plusTickerRunning = true;
    try {
      await connectMongo();
      const { runPlusTrialReminders } = await import('@/lib/plus/trialReminder');
      await runPlusTrialReminders();
    } catch (err) {
      console.error('Plus ticker failed:', err);
    } finally {
      g.plusTickerRunning = false;
    }
  };

  g.plusTicker = setInterval(tick, TICK_MS);
  if (typeof g.plusTicker.unref === 'function') {
    g.plusTicker.unref();
  }
  setTimeout(tick, 45_000).unref?.();
}
