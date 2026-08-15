import mongoose, { Schema, type Model } from 'mongoose';
import type { QuestRewards } from '@/lib/quests/types';
import type {
  PactAreaMasteryTier,
  PactStreakMultiplier,
  PactStreakTier,
  PactSuggestion,
} from '@/lib/pact/types';

export interface PactConfigDoc {
  _id?: mongoose.Types.ObjectId;
  configId: string;
  isActive: boolean;
  /** Local hour on the user's own week-start day when the pick nudge fires. */
  pickHour: number;
  fliesPerCompletion: number;
  weekBonusFlies: number;
  bigCommitmentBonusFlies: number;
  comebackBonusFlies: number;
  /** Which payout model this doc is on. Bumping it re-seeds the fly numbers. */
  payoutVersion: number;
  completionRewards: QuestRewards;
  streakMultipliers: PactStreakMultiplier[];
  /** Retired in payout v3. Kept on the doc so old configs still load. */
  milestoneEveryWeeks: number;
  milestoneRewards: QuestRewards;
  streakTiers: PactStreakTier[];
  masteryTiers: PactAreaMasteryTier[];
  shieldCapFree: number;
  shieldCapPlus: number;
  shieldEarnEveryWeeks: number;
  shieldPriceFlies: number;
  shieldAdsRequired: number;
  shieldAdMinStreak: number;
  plusSwapTokensPerMonth: number;
  minOptionsPerArea: number;
  autoGenerate: boolean;
  suggestions: PactSuggestion[];
  createdAt: Date;
  updatedAt: Date;
}

export const PACT_CONFIG_ID = 'weekly-pact';

/**
 * v1 paid nothing until the whole week landed and handed the hardest-labelled
 * ideas a flat bonus nobody could verify. v2 pays per kept session as
 * it happens, keeps a bonus for finishing, and prices ambition in sessions —
 * the only unit of effort the app can actually see.
 *
 * v3 collapses the four payout tracks into one. Lump tiers at 2/4/8/12 weeks,
 * area mastery and a gift every other week were four rewards on three clocks,
 * none of which could be read off the card the user was looking at. The streak
 * now multiplies the week instead, so there is one rule and one number.
 *
 * v4 caps the ladder at x4 over three rungs. v3's four-rung x5 ladder averaged
 * x3.17 and pushed a kept 3-session week to 53.5 flies/day all-in, past the
 * economy doc's tighten-above-50 line.
 */
export const PACT_PAYOUT_VERSION = 4;

export const PACT_V2_PAYOUT = {
  fliesPerCompletion: 7,
  weekBonusFlies: 32,
  comebackBonusFlies: 5,
  bigCommitmentBonusFlies: 0,
} as const;

// The old focus quest dropped a gift every 3-day cycle — 2.33 a week — and was
// the main source behind the PDF's "2–3 Simple gifts a week". One weekly event
// can't match that count, so the milestone gift stacks ON TOP every 2nd week
// rather than replacing that week's, recovering most of the lost frequency.
export const DEFAULT_PACT_COMPLETION_REWARDS: QuestRewards = [
  { type: 'BOX', itemId: 'gift_box_1' },
];

export const DEFAULT_PACT_MILESTONE_REWARDS: QuestRewards = [
  { type: 'BOX', itemId: 'gift_box_rare' },
];

// Whole numbers on purpose: "your weeks pay x3" needs no arithmetic to act on,
// where "+50% after the first two" needs a calculator and a base. The gift
// climbs with the rate, so one rung is one promise: keep the streak and the
// week pays more flies AND a better box. Rarity is the app's own colour
// language, which is why a rung can be read before it is parsed.
//
// Three rungs, not four. Topping out at x5 averaged x3.17 across the lap and
// put a kept 3-session week at 53.5 flies/day all-in — past the economy doc's
// "over 50 and tighten" line. Capping at x4 could not simply relabel the old
// x4 rung, or two stops would pay the same; one rung had to go and the rest
// re-space. Averaging x2.58 lands the same player at 49.1.
//
// The first rung stays at 2 weeks. Moving it to 3 saved only 0.7 flies/day and
// cost the early win that is the whole reason anyone starts a second week.
export const DEFAULT_PACT_STREAK_MULTIPLIERS: PactStreakMultiplier[] = [
  {
    weeks: 2,
    multiplier: 2,
    rewards: [{ type: 'BOX', itemId: 'gift_box_rare' }],
  },
  {
    weeks: 6,
    multiplier: 3,
    rewards: [{ type: 'BOX', itemId: 'gift_box_rare' }],
  },
  {
    weeks: 12,
    multiplier: 4,
    rewards: [{ type: 'BOX', itemId: 'gift_box_legendary' }],
  },
];

/** @deprecated Retired in payout v3 — the streak multiplies the week instead. */
export const DEFAULT_PACT_STREAK_TIERS: PactStreakTier[] = [];

/** @deprecated Retired in payout v3. */
export const DEFAULT_PACT_MASTERY_TIERS: PactAreaMasteryTier[] = [];

type SeedEntry = Omit<PactSuggestion, 'id' | 'isActive' | 'picked' | 'kept'>;

// An idea is a what and a how-often. Which days and what time belong to the
// person doing it, and they answer that on the confirm step.
const SEED_SUGGESTIONS: SeedEntry[] = [
  { categoryId: 'sport', text: 'Take a 20-minute walk', sessions: 2 },
  { categoryId: 'sport', text: 'Do a 15-minute home workout', sessions: 3 },
  { categoryId: 'sport', text: 'Stretch for 10 minutes', sessions: 5 },
  { categoryId: 'sport', text: 'Train at the gym for 45 minutes', sessions: 4 },

  { categoryId: 'mindfulness', text: 'Breathe slowly for 5 minutes', sessions: 2 },
  { categoryId: 'mindfulness', text: 'Write three lines in a journal', sessions: 3 },
  { categoryId: 'mindfulness', text: 'Sit quietly for 10 minutes, no phone', sessions: 5 },
  { categoryId: 'mindfulness', text: 'Meditate for 20 minutes', sessions: 4 },

  { categoryId: 'family', text: 'Call someone you love', sessions: 1 },
  { categoryId: 'family', text: 'Send a proper check-in message', sessions: 2 },
  { categoryId: 'family', text: 'Eat dinner together, phones away', sessions: 3 },
  { categoryId: 'family', text: 'Plan and do one outing together', sessions: 5 },

  { categoryId: 'house_chores', text: 'Tidy one surface for 10 minutes', sessions: 2 },
  { categoryId: 'house_chores', text: 'Reset the kitchen before bed', sessions: 5 },
  { categoryId: 'house_chores', text: 'Do one load of laundry end to end', sessions: 3 },
  { categoryId: 'house_chores', text: 'Deep clean one room', sessions: 1 },

  { categoryId: 'sleep', text: 'Put the phone away 30 minutes before bed', sessions: 2 },
  { categoryId: 'sleep', text: 'Start winding down at the same time', sessions: 3 },
  { categoryId: 'sleep', text: 'Be in bed by 23:00', sessions: 5 },
  { categoryId: 'sleep', text: 'No screens after 21:30, lights out by 22:30', sessions: 7 },
];

export function seedSuggestions(): PactSuggestion[] {
  return SEED_SUGGESTIONS.map((entry, index) => ({
    ...entry,
    id: `seed-${entry.categoryId}-${index}`,
    isActive: true,
    picked: 0,
    kept: 0,
  }));
}

const PactConfigSchema = new Schema<PactConfigDoc>(
  {
    configId: { type: String, required: true, unique: true, index: true },
    isActive: { type: Boolean, default: true },
    pickHour: { type: Number, default: 18 },
    // The old focus quest paid 23 flies per 3-DAY cycle = 53.7 flies/week, and
    // that faucet is what the pact replaces. 7/session + 32 lands a 2–5 session
    // week at 46–67, with the modal 3-session week on 53 — free income holds at
    // the PDF's ~37 flies/day. Sub-linear on purpose: per session it falls 23 →
    // 13.4 as days are added, so stacking days is never the cheap way to farm.
    fliesPerCompletion: { type: Number, default: PACT_V2_PAYOUT.fliesPerCompletion },
    weekBonusFlies: { type: Number, default: PACT_V2_PAYOUT.weekBonusFlies },
    // Paid once a week, on the first session completed after a scheduled one
    // was missed. The largest single effect in the 53-arm gym megastudy came
    // from paying for exactly this return, so it is a faucet, not a courtesy.
    comebackBonusFlies: { type: Number, default: PACT_V2_PAYOUT.comebackBonusFlies },
    // Retired. Difficulty is self-declared and unverifiable, so paying for it
    // made the hardest-labelled option strictly dominant. Ambition is priced in
    // sessions now. Kept at 0 so an existing admin form doesn't break.
    bigCommitmentBonusFlies: {
      type: Number,
      default: PACT_V2_PAYOUT.bigCommitmentBonusFlies,
    },
    payoutVersion: { type: Number, default: PACT_PAYOUT_VERSION },
    completionRewards: {
      type: [Schema.Types.Mixed],
      default: DEFAULT_PACT_COMPLETION_REWARDS,
    } as any,
    streakMultipliers: {
      type: [Schema.Types.Mixed],
      default: DEFAULT_PACT_STREAK_MULTIPLIERS,
    } as any,
    milestoneEveryWeeks: { type: Number, default: 0 },
    milestoneRewards: { type: [Schema.Types.Mixed], default: [] } as any,
    streakTiers: { type: [Schema.Types.Mixed], default: [] } as any,
    masteryTiers: { type: [Schema.Types.Mixed], default: [] } as any,
    // Held, not granted monthly. A weekly pact with 4 monthly shields is a
    // pact that can never be broken, and a streak that cannot break stops
    // motivating — the cap is small on purpose, and refills are earned.
    shieldCapFree: { type: Number, default: 1 },
    shieldCapPlus: { type: Number, default: 2 },
    shieldEarnEveryWeeks: { type: Number, default: 2 },
    shieldPriceFlies: { type: Number, default: 100 },
    shieldAdsRequired: { type: Number, default: 1 },
    shieldAdMinStreak: { type: Number, default: 2 },
    plusSwapTokensPerMonth: { type: Number, default: 4 },
    minOptionsPerArea: { type: Number, default: 3 },
    autoGenerate: { type: Boolean, default: true },
    suggestions: { type: [Schema.Types.Mixed], default: [] } as any,
  },
  {
    collection: 'pactConfigs',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.PactConfig;
}

const PactConfigModel: Model<PactConfigDoc> =
  (mongoose.models.PactConfig as Model<PactConfigDoc>) ||
  mongoose.model<PactConfigDoc>('PactConfig', PactConfigSchema);

export default PactConfigModel;
