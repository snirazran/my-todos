// Synchronizes the focus-session hunt across surfaces: the timer sheet's
// FocusScene is the conductor (it schedules misses and detects catches) and
// broadcasts each event; the home hero mirrors it with its own tongue on the
// same fly index in the same frame — so both frogs lunge together, at the
// same target, and both succeed or miss together.

export type FocusHuntEvent =
  | { type: 'miss'; flyIndex: number; overshoot: number; jitterX: number }
  | { type: 'catch'; flyIndex: number; line: string };

type Listener = (event: FocusHuntEvent) => void;

const listeners = new Set<Listener>();

export function emitFocusHunt(event: FocusHuntEvent): void {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      // one surface failing must not break the other
    }
  });
}

export function onFocusHunt(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
