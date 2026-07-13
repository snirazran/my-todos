export type LiveTimerPhase = 'focus' | 'break';

export interface LiveTimerSnapshot {
  active: boolean;
  isRunning: boolean;
  phase: LiveTimerPhase;
  endTime: number | null;
  timeLeft: number;
  totalSeconds: number;
  taskName: string;
  finished?: boolean;
  // The hunt, carried to native surfaces: flies caught this session, the
  // session's reachable total, and whether the deep-focus +1 pledge is live.
  fliesCaught?: number;
  fliesPotential?: number;
  deepFocus?: boolean;
  // The user's chosen finish sound id (timerSounds.ts), for native alarms.
  sound?: string;
}

export const FOCUS_COLOR = '#16a34a';
export const BREAK_COLOR = '#0ea5e9';

export function fmt(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export function phaseMeta(phase: LiveTimerPhase) {
  return phase === 'focus'
    ? { label: 'Focus', color: FOCUS_COLOR, symbol: 'timer' }
    : { label: 'Break', color: BREAK_COLOR, symbol: 'cup.and.saucer.fill' };
}

export function expandedTimeFont(widestSeconds: number): number {
  const len = fmt(widestSeconds).length;
  return len <= 5 ? 66 : len === 6 ? 48 : 40;
}

export type LiveActivityData = {
  color: string;
  label: string;
  subtitle: string;
  endTime: number;
  timeText: string;
  timeFont: number;
  ringValue: number;
  ringTotal: number;
  ringStart: number;
  ringEnd: number;
  paused: boolean;
  finished: boolean;
  fliesCaught: number;
  fliesPotential: number;
  deepFocus: boolean;
  sound: string;
};

export function buildLiveActivityData(snap: LiveTimerSnapshot, now = Date.now()): LiveActivityData {
  const { label, color } = phaseMeta(snap.phase);
  const total = Math.max(1, snap.totalSeconds);
  const endTime = snap.endTime ?? 0;
  const widest =
    snap.isRunning && snap.endTime
      ? Math.max(0, Math.round((snap.endTime - now) / 1000))
      : snap.timeLeft;
  const ringStart = snap.isRunning && snap.endTime ? snap.endTime - total * 1000 : 0;
  const finished = !!snap.finished;

  return {
    color,
    label: finished ? "Time's up" : label,
    subtitle: finished ? `${label} done` : snap.isRunning ? snap.taskName : 'Paused',
    endTime,
    timeText: fmt(snap.timeLeft),
    timeFont: expandedTimeFont(widest),
    ringValue: Math.max(0, snap.timeLeft),
    ringTotal: total,
    ringStart,
    ringEnd: endTime,
    paused: !snap.isRunning,
    finished,
    fliesCaught: Math.max(0, Math.floor(snap.fliesCaught ?? 0)),
    fliesPotential: Math.max(0, Math.floor(snap.fliesPotential ?? 0)),
    deepFocus: snap.deepFocus === true,
    sound: snap.sound ?? '',
  };
}
