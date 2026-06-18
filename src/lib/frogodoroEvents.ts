import type { ActiveFrogodoroTimer } from '@/lib/types/UserDoc';

export type TimerEvent = {
  timer: ActiveFrogodoroTimer | null;
  serverNow: number;
  seq: number;
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

// Whether a live client (open app/web) is currently connected for this user.
// Used to decide which surface rings the finish alert: a connected client rings
// locally (works even on the simulator), so the server skips its APNs alert to
// avoid double-firing; with no client connected (app closed) the server rings.
export function hasActiveTimerSubscriber(userId: string): boolean {
  const set = getBus().get(userId);
  return !!set && set.size > 0;
}

export function publishTimerEvent(
  userId: string,
  timer: ActiveFrogodoroTimer | null,
  seq: number,
): void {
  const set = getBus().get(userId);
  if (!set || set.size === 0) return;
  const event: TimerEvent = { timer, serverNow: Date.now(), seq };
  set.forEach((fn) => {
    try {
      fn(event);
    } catch {
      void 0;
    }
  });
}
