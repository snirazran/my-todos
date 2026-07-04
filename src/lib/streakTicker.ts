import connectMongo from '@/lib/mongoose';

const TICK_MS = 10 * 60 * 1000;

type GlobalWithTicker = typeof globalThis & {
  loginStreakTicker?: ReturnType<typeof setInterval>;
  loginStreakTickerRunning?: boolean;
};

export function startLoginStreakTicker() {
  const g = globalThis as GlobalWithTicker;
  if (g.loginStreakTicker) return;

  const tick = async () => {
    if (g.loginStreakTickerRunning) return;
    g.loginStreakTickerRunning = true;
    try {
      await connectMongo();
      const { runLoginStreakSweep } = await import('@/lib/streak/sweep');
      await runLoginStreakSweep();
    } catch (err) {
      console.error('Login streak ticker failed:', err);
    } finally {
      g.loginStreakTickerRunning = false;
    }
  };

  g.loginStreakTicker = setInterval(tick, TICK_MS);
  if (typeof g.loginStreakTicker.unref === 'function') {
    g.loginStreakTicker.unref();
  }
  setTimeout(tick, 15_000).unref?.();
}
