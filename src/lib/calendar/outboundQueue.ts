const DEBOUNCE_MS = 5_000;

type QueueState = {
  timers: Map<string, ReturnType<typeof setTimeout>>;
  running: Set<string>;
  rerun: Set<string>;
};

const globalStore = globalThis as unknown as { calendarOutboundQueue?: QueueState };

function state(): QueueState {
  if (!globalStore.calendarOutboundQueue) {
    globalStore.calendarOutboundQueue = {
      timers: new Map(),
      running: new Set(),
      rerun: new Set(),
    };
  }
  return globalStore.calendarOutboundQueue;
}

async function runSweep(userId: string) {
  const s = state();
  if (s.running.has(userId)) {
    s.rerun.add(userId);
    return;
  }
  s.running.add(userId);
  try {
    const { runOutboundSweep } = await import('./engine');
    const { getAdapters } = await import('./adapters');
    await runOutboundSweep(userId, await getAdapters());
  } catch (err) {
    console.error('calendar outbound sweep error:', (err as Error)?.message);
  } finally {
    s.running.delete(userId);
    if (s.rerun.delete(userId)) scheduleOutboundSweep(userId);
  }
}

/** Debounced per-user push of app tasks to connected calendars. */
export function scheduleOutboundSweep(userId: string) {
  const s = state();
  const existing = s.timers.get(userId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    s.timers.delete(userId);
    void runSweep(userId);
  }, DEBOUNCE_MS);
  if (typeof timer.unref === 'function') timer.unref();
  s.timers.set(userId, timer);
}
