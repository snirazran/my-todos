import connectMongo from '@/lib/mongoose';

const TICK_MS = 60 * 60 * 1000;

type GlobalWithTicker = typeof globalThis & {
  seasonTicker?: ReturnType<typeof setInterval>;
  seasonTickerRunning?: boolean;
};

export function startSeasonTicker() {
  const g = globalThis as GlobalWithTicker;
  if (g.seasonTicker) return;

  const tick = async () => {
    if (g.seasonTickerRunning) return;
    g.seasonTickerRunning = true;
    try {
      await connectMongo();
      const { ensureSeasonCalendar } = await import('@/lib/quests/seasonProvision');
      await ensureSeasonCalendar();
    } catch (err) {
      console.error('Season ticker failed:', err);
    } finally {
      g.seasonTickerRunning = false;
    }
  };

  g.seasonTicker = setInterval(tick, TICK_MS);
  if (typeof g.seasonTicker.unref === 'function') {
    g.seasonTicker.unref();
  }
  setTimeout(tick, 60_000).unref?.();
}
