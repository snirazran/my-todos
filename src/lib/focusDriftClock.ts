import { useFrogodoroStore } from '@/lib/frogodoroStore';

// A shared, pause-aware clock for the focus-fly drift. Every surface derives
// each fly's position from THIS elapsed value, so a layer mounting at any
// moment (popup opening, page navigation, brief hide/show) lands on exactly
// the same loop phase as every other surface — sync by construction, not by
// synchronized starts. It accumulates only while a focus phase is running,
// so pausing freezes every fly in place and resuming continues from there.

let acc = 0;
let runningSince: number | null = null;

function setRunning(running: boolean) {
  if (running && runningSince === null) {
    runningSince = performance.now();
  } else if (!running && runningSince !== null) {
    acc += performance.now() - runningSince;
    runningSince = null;
  }
}

export function driftElapsedMs(): number {
  return acc + (runningSince !== null ? performance.now() - runningSince : 0);
}

if (typeof window !== 'undefined') {
  const apply = (s: {
    timerActive: boolean;
    isRunning: boolean;
    phase: string;
  }) => setRunning(s.timerActive && s.isRunning && s.phase === 'focus');
  apply(useFrogodoroStore.getState());
  useFrogodoroStore.subscribe(apply);
}
