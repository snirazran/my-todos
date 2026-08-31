import mongoose, { Schema, type Model } from 'mongoose';
import type { QuestRewards } from '@/lib/quests/types';
import type {
  PactBonusRewards,
  PactCompletionGiftTier,
  PactPrestigeCycle,
  PactStreakMultiplier,
  PactSuggestion,
} from '@/lib/pact/types';

export interface PactConfigDoc {
  _id?: mongoose.Types.ObjectId;
  configId: string;
  isActive: boolean;
  /** Local hour on the user's own week-start day when the pick nudge fires. */
  pickHour: number;
  comebackBonusFlies: number;
  /** The 20 in `20 × (sessions + 1)`: what one session adds to a week. */
  weekValuePerSession: number;
  /** The `+ 1`: sessions' worth of value that finishing adds on its own. */
  weekValueBaseSessions: number;
  /** Curve on a partial week's share of the value. Above 1 it is convex. */
  partialCreditExponent: number;
  /** Sessions a week may be moved to another day. 0 disables moving. */
  sessionMovesPerWeek: number;
  /** The same allowance for Plus. */
  plusSessionMovesPerWeek: number;
  /** Which payout model this doc is on. Bumping it re-seeds the fly numbers. */
  payoutVersion: number;
  /** Gift for a session count below the first tier. */
  completionRewards: QuestRewards;
  /** Gift at completion, by how many sessions the week asked for. */
  completionGiftTiers: PactCompletionGiftTier[];
  streakMultipliers: PactStreakMultiplier[];
  /** Weeks held that complete a cycle and trigger prestige. */
  prestigeWeeks: number;
  /** Permanent base multiplier each completed cycle adds. */
  prestigeBaseStep: number;
  /** Hard ceiling on base × streak, before the Plus doubling. */
  maxEffectiveMultiplier: number;
  /** Paid every prestige until the set is complete. */
  prestigeRewards: PactBonusRewards;
  /** One entry per cycle — the exclusive piece that cycle awards. */
  prestigeCycles: PactPrestigeCycle[];
  /** Paid instead of a set piece once every cycle has been claimed. */
  postSetPrestigeRewards: PactBonusRewards;
  /** Share of the week's sessions that keeps a streak alive without finishing. */
  nearMissPercent: number;
  plusSwapTokensPerMonth: number;
  minOptionsPerArea: number;
  autoGenerate: boolean;
  suggestions: PactSuggestion[];
  createdAt: Date;
  updatedAt: Date;
}

export const PACT_CONFIG_ID = 'weekly-pact';

/**
 * The pact is the deepest ladder in the game — around fourteen months of
 * progression ending in a five-piece legendary set. One formula prices a week
 * (`20 × (sessions + 1)`), the streak multiplies it in fractional steps every
 * three weeks, and every twelfth week prestiges: the streak resets, the base
 * rate rises permanently, and a set piece is issued.
 *
 * There is only ever ONE payout model in this file. Earlier ones are deleted
 * rather than kept as branches — a config doc is seeded to the current shape or
 * it is not, and a ladder of historical `if (version < n)` blocks made it
 * impossible to read what the app actually pays today.
 */
export const PACT_PAYOUT_VERSION = 8;

/**
 * Fields earlier payout models wrote that nothing reads any more. Removed from
 * live documents on the next seed, so the database and this file never disagree
 * about what is paid.
 */
export const RETIRED_PACT_CONFIG_FIELDS = [
  'fliesPerCompletion',
  'weekBonusFlies',
  'bigCommitmentBonusFlies',
  'milestoneEveryWeeks',
  'milestoneRewards',
  'streakTiers',
  'masteryTiers',
] as const;

const SIMPLE_GIFT = 'gift_box_1';
const FANCY_GIFT = 'gift_box_rare';
const AMAZING_GIFT = 'gift_box_legendary';

// The gift a week below the first tier pays — a one-session pact. Every other
// session count is priced by `DEFAULT_PACT_COMPLETION_GIFT_TIERS`.
export const DEFAULT_PACT_COMPLETION_REWARDS: QuestRewards = [
  { type: 'BOX', itemId: SIMPLE_GIFT },
];

/**
 * The gift arrives only at completion, never per session: a gift delivered
 * mid-pact spends the anticipation that pulls someone through session four.
 * It climbs with what the week asked for, so a bigger commitment is visibly
 * worth more before it is made.
 */
export const DEFAULT_PACT_COMPLETION_GIFT_TIERS: PactCompletionGiftTier[] = [
  { minSessions: 2, rewards: [{ type: 'BOX', itemId: FANCY_GIFT }] },
  { minSessions: 4, rewards: [{ type: 'BOX', itemId: AMAZING_GIFT }] },
  {
    minSessions: 6,
    rewards: [
      { type: 'BOX', itemId: AMAZING_GIFT },
      { type: 'BOX', itemId: FANCY_GIFT },
    ],
  },
];

/**
 * Milestones at 2, 5, 8 and 12 — gaps of 2, 3, 3, 4, widening as the run goes
 * on. Even spacing asked for the hardest thing first: four unbroken weeks from
 * a standing start, before the user has any evidence the ladder pays at all.
 * The first rung is the one that has to be reachable, and the last is the one
 * that can afford to be a climb, because by then three payouts have already
 * landed. The multiplier applies to the whole payout, sessions and bonus alike,
 * and a rung's rewards are paid ONCE, the first time the streak reaches it —
 * the week's own gift comes from the session-count tiers instead.
 *
 * Fractional steps rather than whole numbers. A ladder that has to reach x4 in
 * three stops prices the twelfth week at four times the first, which is what
 * makes a reset feel like a cliff. 1.25 → 1.50 → 1.80 climbs the same distance
 * in feel while leaving room for prestige to keep raising the floor underneath
 * it for the next fourteen months.
 */
export const DEFAULT_PACT_STREAK_MULTIPLIERS: PactStreakMultiplier[] = [
  {
    weeks: 2,
    multiplier: 1.25,
    rewards: [
      { type: 'FLIES', amount: 120 },
      { type: 'BOX', itemId: FANCY_GIFT },
    ],
  },
  {
    weeks: 5,
    multiplier: 1.5,
    rewards: [
      { type: 'FLIES', amount: 250 },
      { type: 'BOX', itemId: AMAZING_GIFT },
      { type: 'SHIELD', amount: 1 },
    ],
  },
  {
    weeks: 8,
    multiplier: 1.8,
    rewards: [
      { type: 'FLIES', amount: 400 },
      { type: 'BOX', itemId: AMAZING_GIFT },
      { type: 'RARITY_ITEM', rarity: 'epic' },
    ],
  },
];

/**
 * Five cycles, five unique legendaries that form a visible matching set. A
 * half-complete set of five is one of the most reliable long-horizon
 * motivators there is — far stronger than five unrelated legendaries of the
 * same value.
 *
 * Named for the pads, not the system. The user Leaps every week and a Lily Pad
 * catches them when they miss, so the thing twelve Leaps carries them to is the
 * next pad across the pond — one picture the whole feature runs on, and no
 * vocabulary to learn beyond the metal.
 *
 * The pieces ship as a drawn legendary rather than a named item because the art
 * does not exist yet. Point each cycle at its real item id from the admin
 * screen and the set becomes a set; until then a cycle still pays a legendary,
 * so nobody is short-changed while the art is made.
 */
export const DEFAULT_PACT_PRESTIGE_CYCLES: PactPrestigeCycle[] = [
  { label: 'Bronze Lily', rewards: [{ type: 'RARITY_ITEM', rarity: 'legendary' }] },
  { label: 'Silver Lily', rewards: [{ type: 'RARITY_ITEM', rarity: 'legendary' }] },
  { label: 'Gold Lily', rewards: [{ type: 'RARITY_ITEM', rarity: 'legendary' }] },
  { label: 'Emerald Lily', rewards: [{ type: 'RARITY_ITEM', rarity: 'legendary' }] },
  { label: 'Diamond Lily', rewards: [{ type: 'RARITY_ITEM', rarity: 'legendary' }] },
];

/** Paid on every prestige, on top of that cycle's set piece. */
export const DEFAULT_PACT_PRESTIGE_REWARDS: PactBonusRewards = [
  { type: 'FLIES', amount: 700 },
  { type: 'BOX', itemId: AMAZING_GIFT, amount: 2 },
  { type: 'SHIELD', amount: 2 },
];

/**
 * The ladder continues after the set is finished — each further twelve-week
 * run pays well — but it issues no new legendary, because a sixth piece would
 * cheapen the other five.
 */
export const DEFAULT_PACT_POST_SET_PRESTIGE_REWARDS: PactBonusRewards = [
  { type: 'FLIES', amount: 1500 },
  { type: 'BOX', itemId: AMAZING_GIFT, amount: 2 },
];

/**
 * The scalar half of the payout, split out so the Mongoose schema can use the
 * same numbers as its field defaults. Effective multiplier is hard capped at
 * 2.50: without it a 60-week Plus veteran on a 7-session pact earns ~900 flies
 * a week from this system alone, which breaks every shop price.
 */
export const PACT_PAYOUT_NUMBERS = {
  weekValuePerSession: 20,
  weekValueBaseSessions: 1,
  partialCreditExponent: 1.7,
  sessionMovesPerWeek: 1,
  plusSessionMovesPerWeek: 2,
  comebackBonusFlies: 5,
  prestigeWeeks: 12,
  prestigeBaseStep: 0.15,
  maxEffectiveMultiplier: 2.5,
  nearMissPercent: 80,
} as const;

/** The whole payout, as one block a config doc can be seeded from. */
export const PACT_PAYOUT: Partial<PactConfigDoc> = {
  ...PACT_PAYOUT_NUMBERS,
  completionRewards: DEFAULT_PACT_COMPLETION_REWARDS,
  completionGiftTiers: DEFAULT_PACT_COMPLETION_GIFT_TIERS,
  streakMultipliers: DEFAULT_PACT_STREAK_MULTIPLIERS,
  prestigeRewards: DEFAULT_PACT_PRESTIGE_REWARDS,
  prestigeCycles: DEFAULT_PACT_PRESTIGE_CYCLES,
  postSetPrestigeRewards: DEFAULT_PACT_POST_SET_PRESTIGE_REWARDS,
};

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
    // One formula: a week is worth `weekValuePerSession × (sessions + base)`,
    // and the whole of it settles at the end of the week. Nothing is paid in
    // advance — a session's own task pays what any task pays, and the Leap is
    // the thing you earn by finishing it. At the defaults a 2-session week is
    // 60 flies and a 7-session week is 160, sub-linear per session by design.
    weekValuePerSession: {
      type: Number,
      default: PACT_PAYOUT_NUMBERS.weekValuePerSession,
    },
    weekValueBaseSessions: {
      type: Number,
      default: PACT_PAYOUT_NUMBERS.weekValueBaseSessions,
    },
    // A week short of its target still pays, on a convex curve: the share of
    // the value is `(done / target) ^ partialCreditExponent`. Above 1 the last
    // session is worth the most, so finishing is always the big jump and a
    // broken week is still worth coming back to.
    partialCreditExponent: {
      type: Number,
      default: PACT_PAYOUT_NUMBERS.partialCreditExponent,
    },
    // Moving a session is free and pays nothing extra: the same work lands on
    // a different day. What it buys is a week that survives an ordinary
    // disruption, which is what actually ends most runs. Capped, because the
    // days picked ARE the commitment — an unlimited move turns the week into
    // "any two days", which is a weaker promise than the one made on Monday.
    sessionMovesPerWeek: {
      type: Number,
      default: PACT_PAYOUT_NUMBERS.sessionMovesPerWeek,
    },
    plusSessionMovesPerWeek: {
      type: Number,
      default: PACT_PAYOUT_NUMBERS.plusSessionMovesPerWeek,
    },
    // Paid once a week at settlement, when a scheduled session was missed and
    // a later one was still kept. The largest single effect in the 53-arm gym megastudy came
    // from paying for exactly this return, so it is a faucet, not a courtesy.
    comebackBonusFlies: {
      type: Number,
      default: PACT_PAYOUT_NUMBERS.comebackBonusFlies,
    },
    payoutVersion: { type: Number, default: PACT_PAYOUT_VERSION },
    completionRewards: {
      type: [Schema.Types.Mixed],
      default: DEFAULT_PACT_COMPLETION_REWARDS,
    } as any,
    completionGiftTiers: {
      type: [Schema.Types.Mixed],
      default: DEFAULT_PACT_COMPLETION_GIFT_TIERS,
    } as any,
    streakMultipliers: {
      type: [Schema.Types.Mixed],
      default: DEFAULT_PACT_STREAK_MULTIPLIERS,
    } as any,
    prestigeWeeks: { type: Number, default: PACT_PAYOUT_NUMBERS.prestigeWeeks },
    prestigeBaseStep: {
      type: Number,
      default: PACT_PAYOUT_NUMBERS.prestigeBaseStep,
    },
    maxEffectiveMultiplier: {
      type: Number,
      default: PACT_PAYOUT_NUMBERS.maxEffectiveMultiplier,
    },
    prestigeRewards: {
      type: [Schema.Types.Mixed],
      default: DEFAULT_PACT_PRESTIGE_REWARDS,
    } as any,
    prestigeCycles: {
      type: [Schema.Types.Mixed],
      default: DEFAULT_PACT_PRESTIGE_CYCLES,
    } as any,
    postSetPrestigeRewards: {
      type: [Schema.Types.Mixed],
      default: DEFAULT_PACT_POST_SET_PRESTIGE_REWARDS,
    } as any,
    // Near-miss protection: finish this share of the week and the streak
    // survives. The completion bonus and the milestone are still forfeit, but
    // the run does not fall to zero — this single rule saves more long-running
    // pacts than shields do.
    nearMissPercent: {
      type: Number,
      default: PACT_PAYOUT_NUMBERS.nearMissPercent,
    },
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
