/** The belly reads as 6 fly-meals, one per 8h of the 48h bar. */
export const HUNGER_SEGMENTS = 6;

export type HungerState = {
  /** Fill colour for a belly segment. */
  bg: string;
  /** Matching text colour for the state label. */
  text: string;
  label: string;
};

/** The frog's belly state for a 0–100 fullness, shared by every belly readout. */
export function getHungerState(percent: number): HungerState {
  if (percent > 80)
    return { bg: 'bg-emerald-500', text: 'text-emerald-600', label: 'Full' };
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
