/** The belly reads as 6 fly-meals, one per 8h of the 48h bar. */
export const HUNGER_SEGMENTS = 6;

export type HungerState = {
  /** Fill colour for a belly segment. */
  bg: string;
  /** Matching text colour for the state label. */
  text: string;
  label: string;
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
    return { bg: 'bg-emerald-500', text: 'text-emerald-600', label: 'Full' };
  if (percent > 80)
    return {
      bg: 'bg-emerald-500',
      text: 'text-emerald-600',
      label: 'Nearly full',
    };
  if (percent > 60)
    return { bg: 'bg-lime-500', text: 'text-lime-600', label: 'Content' };
  if (percent > 40)
    return { bg: 'bg-yellow-500', text: 'text-yellow-600', label: 'Peckish' };
  if (percent > 20)
    return { bg: 'bg-amber-500', text: 'text-amber-600', label: 'Hungry' };
  return { bg: 'bg-rose-500', text: 'text-rose-600', label: 'Starving' };
}

/** How full segment `index` sits, 0–1, for a 0–100 fullness. */
export function segmentFill(percent: number, index: number): number {
  return Math.max(0, Math.min(1, (percent / 100) * HUNGER_SEGMENTS - index));
}
