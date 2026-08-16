'use client';

import { Flame, Trophy } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { RewardTile, type QuestRewardCatalogItem } from '@/components/ui/QuestCards';
import type { PactBonusRewards } from '@/lib/pact/types';
import {
  formatPactRate,
  pactBonusLabel,
  pactRateWord,
  pactTileRewards,
} from '@/lib/pact/format';
import {
  LeapRail,
  LILY_LADDER_ART,
  LILY_PLAIN,
  type LeapStop,
} from './LeapRail';
import { usePactView } from './PactCard';

/**
 * One stop on the climb, as the card thinks of it: the three tuned rungs plus
 * the prestige that ends the cycle. Prestige is a rung here rather than a
 * separate banner because it is the twelfth week of the same ladder — split
 * across two components it read as a second, unrelated clock.
 */
type Stop = {
  weeks: number;
  effective: number;
  rewards: PactBonusRewards;
  reached: boolean;
  isPrestige: boolean;
  label?: string;
};

export function PactStreakLadder() {
  const { data } = usePactView();
  if (!data || !data.enabled || data.needsAreas) return null;

  const { ladder, streak } = data;
  const rewardCatalog = data.rewardCatalog as Record<
    string,
    QuestRewardCatalogItem
  >;
  const weeks = streak.weeks;
  const rate = ladder.multiplier;

  const stops: Stop[] = ladder.rungs.map((rung) => ({
    weeks: rung.weeks,
    effective: rung.effective,
    rewards: rung.rewards,
    // A milestone already collected in this cycle is behind you even if the
    // streak has since been held rather than advanced.
    reached: rung.weeks === 0 ? true : rung.paid || rung.reached,
    isPrestige: false,
  }));

  // Prestige joins the same rail rather than getting its own banner: it is the
  // twelfth week of this ladder, and split across two components it read as a
  // second, unrelated clock. A rung tuned to land on the same week merges into
  // it rather than being dropped, or the payoff would silently disappear.
  if (ladder.prestigeWeeks > 0) {
    const collision = stops.findIndex(
      (stop) => stop.weeks === ladder.prestigeWeeks,
    );
    const prestige: Stop = {
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

  if (stops.length === 0) return null;

  const nextIndex = stops.findIndex((stop) => !stop.reached);
  const next = nextIndex === -1 ? null : stops[nextIndex];
  const toGo = next ? Math.max(1, next.weeks - weeks) : 0;
  const shown = next ?? stops[stops.length - 1];
  const tiles = pactTileRewards(shown.rewards);
  const words = shown.rewards
    .map((reward) => pactBonusLabel(reward))
    .filter((label): label is string => !!label);

  // Stops sit at even spacing rather than true week distance — 4/7/10/12 to
  // scale crushes the last two together — so how far into the current leap the
  // user stands is measured in weeks and applied to that one arc.
  const leapProgress = (() => {
    if (nextIndex <= 0) return nextIndex === -1 ? 1 : 0;
    const fromWeeks = stops[nextIndex - 1]?.weeks ?? 0;
    const span = stops[nextIndex].weeks - fromWeeks;
    return span > 0 ? Math.min(1, Math.max(0, (weeks - fromWeeks) / span)) : 0;
  })();

  const railStops: LeapStop[] = stops.map((stop, index) => ({
    label: stop.weeks === 0 ? 'Now' : `${stop.weeks} wk`,
    rate: formatPactRate(stop.effective),
    state: stop.reached ? 'reached' : index === nextIndex ? 'next' : 'locked',
    isDestination: stop.isPrestige,
    // The last pad already behind you is the one you are standing on. Before
    // the first Leap that is the base rung, which is exactly right: week zero
    // is a real place on this ladder.
    isHere: stop.reached && (index === nextIndex - 1 || nextIndex === -1),
    // The pads climb through the metals as the rungs do, so how far up the
    // ladder a stop sits is legible from the artwork alone.
    art:
      LILY_LADDER_ART[Math.min(index, LILY_LADDER_ART.length - 1)] ?? LILY_PLAIN,
  }));

  // How much better the next stop makes every week, stated against what the
  // user is paid right now. A rate is a mechanic; "20% more" is an outcome, and
  // the outcome is the half worth reading.
  const uplift = Math.round((shown.effective / Math.max(rate, 0.01) - 1) * 100);

  // Counted in Leaps, not weeks. A week is calendar time that passes whether
  // or not anyone did anything; a Leap is the thing being asked for, and it is
  // the same object the Lily Pad catches when one is missed.
  //
  // From a standing start the ask is the whole run: "4 more" implies four
  // already behind you that aren't there. Once the streak is going, the
  // countdown is the motivating half and the total stops mattering.
  const leaps = (count: number) => `${count} Leap${count === 1 ? '' : 's'}`;
  const distance =
    weeks === 0
      ? `Land ${leaps(shown.weeks)} in a row`
      : `${leaps(toGo)} to go`;

  // Ends on the prize, not on the mechanic. "Milestone" is a word for the
  // system's benefit; "this is yours" points at the reward sitting directly
  // underneath the sentence, which is the thing worth four weeks of work.
  const headline = !next
    ? `Every Leap you land pays ${pactRateWord(rate)}`
    : next.isPrestige && shown.label
      ? `${distance} and ${shown.label} is yours`
      : `${distance} and this is yours`;

  return (
    <div className="mx-1.5 w-[calc(100%-0.75rem)] rounded-[24px] border border-border/50 bg-card px-3.5 py-3 shadow-sm md:mx-4 md:w-[calc(100%-2rem)]">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
            <Flame
              className={cn(
                'h-3.5 w-3.5',
                weeks > 0
                  ? 'fill-amber-400 text-amber-500'
                  : 'text-muted-foreground/50',
              )}
              strokeWidth={2.25}
            />
            {/* What the flame is for: the run itself, and what it is worth
                right now. The target it is heading for belongs to the headline
                and the rail — repeating it here as a fraction only made the
                reader check two numbers against each other. */}
            {weeks > 0
              ? `${leaps(weeks)} in a row${rate > 1 ? ` · paying ${pactRateWord(rate)}` : ''}`
              : ladder.baseMultiplier > 1
                ? `No Leaps yet · base ${formatPactRate(ladder.baseMultiplier)}`
                : 'No Leaps yet'}
          </p>
          <p className="mt-1 text-[14px] font-black leading-snug text-foreground">
            {headline}
          </p>
        </div>
        {/* Deliberately empty. A collection tracker lived here and could not be
            made to explain itself in the space available — five empty slots
            read as a carousel indicator, and every label tried on it named the
            mechanic rather than the prize. Whitespace beats an affordance the
            reader has to decode. The set is better introduced at the moment the
            first Lily is actually won. */}
      </div>

      {/* What the stop actually hands over. The tiles carry the things that
          have art; the line underneath names the two that do not — a Lily Pad
          and a guaranteed rarity — because those are half the reason to climb. */}
      {(tiles.length > 0 || words.length > 0) && (
        // A card inside a card drew a second frame that earned nothing. One
        // device — a tinted surface — is enough to group the prize; the border
        // was the redundant half.
        <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-muted/40 px-3 py-2.5">
          {tiles.slice(0, 3).map((reward, index) => (
            <RewardTile
              key={`${reward.type}-${reward.itemId ?? index}`}
              reward={reward}
              rewardCatalog={rewardCatalog}
              isPremium={data.isPremium}
              hideBadge={reward.type !== 'FLIES'}
              hydrateDelayMs={120}
              // The fly shares its tile with a four-digit count, so at the
              // default size it read as a speck next to the number rather than
              // as the thing the number is counting.
              flySize={34}
              giftAnimation={reward.type === 'BOX' ? 'box_shake' : undefined}
            />
          ))}
          {words.length > 0 && tiles.length > 0 && (
            <span className="text-[15px] font-black text-muted-foreground/60">
              +
            </span>
          )}
          {words.length > 0 && (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-500/12">
              {shown.rewards.some((reward) => reward.type === 'SHIELD') ? (
                <Icon name="lilyPad" className="h-5 w-5" />
              ) : (
                <Trophy
                  className="h-5 w-5 text-amber-500"
                  strokeWidth={2.25}
                />
              )}
            </span>
          )}
          {/* One line, not two. The tiles beside it already say "120 flies and
              a Rare Gift" — naming them again in words spent the card's best
              row restating a picture. What the tiles CANNOT show is what the
              stop changes afterwards, so that gets the weight instead: the
              prize lands once, the raise is every Leap from then on. */}
          <p className="min-w-0 flex-1 text-[12.5px] font-black leading-snug text-foreground">
            {!next
              ? 'Yours every Leap you land'
              : next.isPrestige
                ? 'Plus a pay rise that never resets, even if your streak does'
                : uplift > 0
                  ? `Plus every Leap after earns ${uplift}% more flies`
                  : 'A one-off reward for keeping your word'}
          </p>
        </div>
      )}

      {/* The rail is the mechanic, drawn. Each stop is a lily pad, each gap
          is the leap between them, and the gold arc is how far into the
          current one you already are. */}
      <LeapRail
        stops={railStops}
        progress={leapProgress}
        className="mt-3"
      />
    </div>
  );
}
