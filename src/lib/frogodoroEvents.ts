import type { ActiveFrogodoroTimer } from '@/lib/types/UserDoc';

export type TimerEvent = {
  timer: ActiveFrogodoroTimer | null;
  serverNow: number;
};

type Subscriber = (event: TimerEvent) => void;

type GlobalWithBus = typeof globalThis & {
  frogodoroSubscribers?: Map<string, Set<Subscriber>>;
};

function getBus(): Map<string, Set<Subscriber>> {
  const g = globalThis as GlobalWithBus;
  if (!g.frogodoroSubscribers) g.frogodoroSubscribers = new Map();
  return g.frogodoroSubscribers;
}

export function subscribeTimer(userId: string, fn: Subscriber): () => void {
  const bus = getBus();
  let set = bus.get(userId);
  if (!set) {
    set = new Set();
    bus.set(userId, set);
  }
  set.add(fn);
  return () => {
    const current = bus.get(userId);
    if (!current) return;
    current.delete(fn);
    if (current.size === 0) bus.delete(userId);
  };
}

export function publishTimerEvent(
  userId: string,
  timer: ActiveFrogodoroTimer | null,
): void {
  const set = getBus().get(userId);
  if (!set || set.size === 0) return;
  const event: TimerEvent = { timer, serverNow: Date.now() };
  set.forEach((fn) => {
    try {
      fn(event);
    } catch {
      void 0;
    }
  });
}
