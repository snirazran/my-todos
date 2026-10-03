import {
  HUNGER_FULL_SNAP_MS,
  HUNGRY_MOOD_THRESHOLD,
  TASK_HUNGER_REWARD_MS,
} from '@/lib/hungerLogic';

/** The belly reads as 6 fly-meals, one per 8h of the 48h bar. */
export const HUNGER_SEGMENTS = 6;

export type HungerState = {
  /** Fill colour for a belly segment. */
  bg: string;
  /** Matching text colour for the state label. */
  text: string;
  label: string;
  /** Glossy pip fill used by the belly deck and meters. */
  fill: string;
  /** Pale wash the fresh meal lands as before the fill pours in. */
  ghost: string;
  /** Breathing ring on the next empty pip while the frog is hungry. */
  ring: string;
};

/**
 * The frog's belly state for a 0–100 fullness, shared by every belly readout.
 *
 * "Full" is reserved for a belly that actually looks full — the last pip has to
 * be all but filled. Anything short of that reads as a contradiction next to six
 * pips with a visible gap, so it gets its own rung.
 */
export function getHungerState(percent: number): HungerState {
  if (percent >= 97)
    return {
      bg: 'bg-emerald-500',
      text: 'text-emerald-600 dark:text-emerald-400',
      label: 'Full',
      fill: 'bg-gradient-to-b from-emerald-400 to-emerald-500',
      ghost: 'bg-emerald-300/60',
      ring: 'ring-emerald-400/70',
    };
  if (percent > 80)
    return {
      bg: 'bg-emerald-500',
      text: 'text-emerald-600 dark:text-emerald-400',
      label: 'Nearly full',
      fill: 'bg-gradient-to-b from-emerald-400 to-emerald-500',
      ghost: 'bg-emerald-300/60',
      ring: 'ring-emerald-400/70',
    };
  if (percent > 60)
    return {
      bg: 'bg-lime-500',
      text: 'text-lime-600 dark:text-lime-400',
      label: 'Content',
      fill: 'bg-gradient-to-b from-lime-400 to-lime-500',
      ghost: 'bg-lime-300/60',
      ring: 'ring-lime-400/70',
    };
  if (percent > 40)
    return {
      bg: 'bg-yellow-500',
      text: 'text-yellow-600 dark:text-yellow-400',
      label: 'Peckish',
      fill: 'bg-gradient-to-b from-yellow-300 to-yellow-500',
      ghost: 'bg-yellow-200/70',
      ring: 'ring-yellow-400/70',
    };
  if (percent > 20)
    return {
      bg: 'bg-amber-500',
      text: 'text-amber-600 dark:text-amber-400',
      label: 'Hungry',
      fill: 'bg-gradient-to-b from-amber-400 to-amber-500',
      ghost: 'bg-amber-200/70',
      ring: 'ring-amber-400/70',
    };
  return {
    bg: 'bg-rose-500',
    text: 'text-rose-600 dark:text-rose-400',
    label: 'Starving',
    fill: 'bg-gradient-to-b from-rose-400 to-rose-500',
    ghost: 'bg-rose-200/70',
    ring: 'ring-rose-400/70',
  };
}

/** How full segment `index` sits, 0–1, for a 0–100 fullness. */
export function segmentFill(percent: number, index: number): number {
  return Math.max(0, Math.min(1, (percent / 100) * HUNGER_SEGMENTS - index));
}

/** Finished tasks it takes to fill the belly, matching the server's full snap. */
export function tasksToFull(hungerMs: number, maxHungerMs: number): number {
  const missing = maxHungerMs - hungerMs - HUNGER_FULL_SNAP_MS;
  return missing <= 0 ? 1 : Math.ceil(missing / TASK_HUNGER_REWARD_MS);
}

function formatSpan(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return `${hours}h`;
  return `${Math.max(1, totalMinutes)}m`;
}

/**
 * The belly's second line: what one more task does, or how long a full belly
 * lasts before the frog gets sad.
 */
export function bellyHint(hungerMs: number, maxHungerMs: number): string {
  const percent = (hungerMs / maxHungerMs) * 100;
  if (percent >= 97) {
    return `Good for ${formatSpan(hungerMs - HUNGRY_MOOD_THRESHOLD * maxHungerMs)}`;
  }
  if (percent <= HUNGRY_MOOD_THRESHOLD * 100) return '1 task feeds me';
  const n = tasksToFull(hungerMs, maxHungerMs);
  return `${n} ${n === 1 ? 'task' : 'tasks'} to full`;
}
