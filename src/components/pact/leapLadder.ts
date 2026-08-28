import { formatPactRate } from '@/lib/pact/format';
import type { PactBonusRewards, PactLadderView } from '@/lib/pact/types';
import { LILY_LADDER_ART, LILY_PLAIN, type LeapStop } from './LeapRail';

/**
 * One stop on the climb: the tuned rungs plus the prestige that ends the
 * cycle. Prestige is a rung here rather than a separate banner because it is
 * the twelfth week of the same ladder — split across two components it read as
 * a second, unrelated clock.
 */
export type LeapLadderStop = {
  weeks: number;
  effective: number;
  rewards: PactBonusRewards;
  reached: boolean;
  isPrestige: boolean;
  label?: string;
};

/**
 * The ladder, resolved once. Both the streak card and the intro sheet draw the
 * same rail, and deriving it twice is how the two would drift.
 */
export function buildLeapLadder(ladder: PactLadderView, weeks: number) {
  const stops: LeapLadderStop[] = ladder.rungs.map((rung) => ({
    weeks: rung.weeks,
    effective: rung.effective,
    rewards: rung.rewards,
    // A milestone already collected in this cycle is behind you even if the
    // streak has since been held rather than advanced.
    reached: rung.weeks === 0 ? true : rung.paid || rung.reached,
    isPrestige: false,
  }));

  // A rung tuned to land on the prestige week merges into it rather than being
  // dropped, or the payoff would silently disappear.
  if (ladder.prestigeWeeks > 0) {
    const collision = stops.findIndex(
      (stop) => stop.weeks === ladder.prestigeWeeks,
    );
    const prestige: LeapLadderStop = {
      weeks: ladder.prestigeWeeks,
      effective: Math.min(
        ladder.cap,
        ladder.baseMultiplier *
          (ladder.rungs[ladder.rungs.length - 1]?.multiplier ?? 1),
      ),
      rewards: [
        ...(collision >= 0 ? stops[collision].rewards : []),
        ...ladder.prestigeRewards,
      ],
      reached: false,
      isPrestige: true,
      label: ladder.prestigeLabel,
    };
    if (collision >= 0) stops.splice(collision, 1, prestige);
    else stops.push(prestige);
    stops.sort((a, b) => a.weeks - b.weeks);
  }

  const nextIndex = stops.findIndex((stop) => !stop.reached);
  const next = nextIndex === -1 ? null : stops[nextIndex];

  // Stops sit at even spacing rather than true week distance — 4/7/10/12 to
  // scale crushes the last two together — so how far into the current leap the
  // user stands is measured in weeks and applied to that one arc.
  const progress = (() => {
    if (nextIndex <= 0) return nextIndex === -1 ? 1 : 0;
    const fromWeeks = stops[nextIndex - 1]?.weeks ?? 0;
    const span = stops[nextIndex].weeks - fromWeeks;
    return span > 0 ? Math.min(1, Math.max(0, (weeks - fromWeeks) / span)) : 0;
  })();

  const railStops: LeapStop[] = stops.map((stop, index) => ({
    label: stop.weeks === 0 ? 'Now' : `${stop.weeks} wk`,
    weeks: stop.weeks,
    rate: formatPactRate(stop.effective),
    state: stop.reached ? 'reached' : index === nextIndex ? 'next' : 'locked',
    isDestination: stop.isPrestige,
    // The last pad already behind you is the one you are standing on. Before
    // the first Leap that is the base rung, which is exactly right: week zero
    // is a real place on this ladder.
    isHere: stop.reached && (index === nextIndex - 1 || nextIndex === -1),
    // The pads bloom as the rungs climb, so how far up the ladder a stop sits
    // is legible from the artwork alone.
    art:
      LILY_LADDER_ART[Math.min(index, LILY_LADDER_ART.length - 1)] ?? LILY_PLAIN,
  }));

  return { stops, nextIndex, next, progress, railStops };
}
