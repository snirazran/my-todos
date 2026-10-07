import connectMongo from '@/lib/mongoose';

const TICK_MS = 15 * 60 * 1000;

type GlobalWithTicker = typeof globalThis & {
  attributionTicker?: ReturnType<typeof setInterval>;
  attributionTickerRunning?: boolean;
};

export function startAttributionTicker() {
  const g = globalThis as GlobalWithTicker;
  if (g.attributionTicker) return;

  const tick = async () => {
    if (g.attributionTickerRunning) return;
    g.attributionTickerRunning = true;
    try {
      await connectMongo();
      const { runAttributionResolver } = await import('@/lib/attribution/server');
      await runAttributionResolver();
    } catch (err) {
      console.error('Attribution ticker failed:', err);
    } finally {
      g.attributionTickerRunning = false;
    }
  };

  g.attributionTicker = setInterval(tick, TICK_MS);
  if (typeof g.attributionTicker.unref === 'function') {
    g.attributionTicker.unref();
  }
  setTimeout(tick, 60_000).unref?.();
}
