import mongoose, { Schema, type Model } from 'mongoose';
import type { QuestReward } from '@/lib/quests/types';
import type { PactRarity, PactShieldReward } from '@/lib/pact/types';

/**
 * A guaranteed rarity. `itemId` pins it to one outfit; without it the tier is
 * certain and which item lands is drawn (wishlist-first, un-owned favoured),
 * which is the default the shipped tables use.
 */
export type SweepRarityReward = {
  type: 'RARITY_ITEM';
  rarity: PactRarity;
  amount?: number;
  itemId?: string;
};

/**
 * What one outcome on a Reward Roll table pays. Mostly the pact bonus
 * vocabulary — it already covers the two entries the plain quest reward type
 * cannot express, a Lily Pad and a guaranteed-rarity draw, and
 * `applyPactBonusRewards` already knows how to grant all of them.
 */
export type SweepReward = QuestReward | PactShieldReward | SweepRarityReward;

/** `chance` is a percentage of the table; the table is normalised by its sum. */
export type SweepRollEntry = {
  id: string;
  chance: number;
  reward: SweepReward;
};

export interface QuestStreakConfigDoc {
  _id?: mongoose.Types.ObjectId;
  configId: string;
  isActive: boolean;
  /** Paid once on the day all three daily quests are finished. */
  cleanSweepFlies: number;
  /** Every Nth consecutive sweep day rolls the golden table instead. */
  goldenEveryDays: number;
  /** Every Nth consecutive sweep day adds `megaRewards` on top. 0 disables. */
  megaEveryDays: number;
  megaRewards: SweepReward[];
  standardRoll: SweepRollEntry[];
  goldenRoll: SweepRollEntry[];
  /**
   * Retired. The streak used to pay one prize from `rewards` every
   * `streakLength` days; both are now read only by the one-time migration that
   * seeds the roll tables.
   */
  streakLength: number;
  rewards: QuestReward[];
  createdAt: Date;
  updatedAt: Date;
}

export const STREAK_CONFIG_ID = 'daily-streak';
export const STREAK_LENGTH_MIN = 2;
export const STREAK_LENGTH_MAX = 60;

export const SWEEP_GOLDEN_MIN = 2;
export const SWEEP_GOLDEN_MAX = 30;
export const SWEEP_MEGA_MAX = 90;
export const SWEEP_MAX_FLIES = 100000;

const entry = (chance: number, reward: SweepReward): SweepRollEntry => ({
  id: `${reward.type}-${
    (reward as any).itemId ??
    (reward as any).rarity ??
    (reward as any).amount ??
    'x'
  }-${chance}`,
  chance,
  reward,
});

export const SWEEP_DEFAULT_STANDARD_ROLL: SweepRollEntry[] = [
  entry(50, { type: 'FLIES', amountMode: 'fixed', amount: 15 }),
  entry(22, { type: 'BOX', itemId: 'gift_box_1', amount: 1 }),
  entry(14, { type: 'FLIES', amountMode: 'fixed', amount: 35 }),
  entry(8, { type: 'BOX', itemId: 'gift_box_rare', amount: 1 }),
  entry(4, { type: 'FLIES', amountMode: 'fixed', amount: 70 }),
  entry(1.5, { type: 'BOX', itemId: 'gift_box_legendary', amount: 1 }),
  entry(0.5, { type: 'SHIELD', amount: 1 }),
];

export const SWEEP_DEFAULT_GOLDEN_ROLL: SweepRollEntry[] = [
  entry(32, { type: 'BOX', itemId: 'gift_box_rare', amount: 1 }),
  entry(28, { type: 'FLIES', amountMode: 'fixed', amount: 60 }),
  entry(16, { type: 'BOX', itemId: 'gift_box_legendary', amount: 1 }),
  entry(14, { type: 'FLIES', amountMode: 'fixed', amount: 120 }),
  entry(6, { type: 'SHIELD', amount: 1 }),
  entry(3, { type: 'RARITY_ITEM', rarity: 'epic', amount: 1 }),
  entry(1, { type: 'RARITY_ITEM', rarity: 'legendary', amount: 1 }),
];

export const SWEEP_DEFAULT_MEGA_REWARDS: SweepReward[] = [
  { type: 'BOX', itemId: 'gift_box_legendary', amount: 1 },
  { type: 'FLIES', amountMode: 'fixed', amount: 100 },
];

export const SWEEP_DEFAULTS = {
  isActive: true,
  cleanSweepFlies: 12,
  goldenEveryDays: 3,
  megaEveryDays: 9,
} as const;

const QuestStreakConfigSchema = new Schema<QuestStreakConfigDoc>(
  {
    configId: { type: String, required: true, unique: true, index: true },
    isActive: { type: Boolean, default: SWEEP_DEFAULTS.isActive },
    cleanSweepFlies: { type: Number, default: SWEEP_DEFAULTS.cleanSweepFlies },
    goldenEveryDays: { type: Number, default: SWEEP_DEFAULTS.goldenEveryDays },
    megaEveryDays: { type: Number, default: SWEEP_DEFAULTS.megaEveryDays },
    megaRewards: { type: [Schema.Types.Mixed], default: [] } as any,
    standardRoll: { type: [Schema.Types.Mixed], default: [] } as any,
    goldenRoll: { type: [Schema.Types.Mixed], default: [] } as any,
    streakLength: { type: Number, default: 3 },
    rewards: { type: [Schema.Types.Mixed], default: [] } as any,
  },
  {
    collection: 'questStreakConfigs',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.QuestStreakConfig;
}

const QuestStreakConfigModel: Model<QuestStreakConfigDoc> =
  (mongoose.models.QuestStreakConfig as Model<QuestStreakConfigDoc>) ||
  mongoose.model<QuestStreakConfigDoc>(
    'QuestStreakConfig',
    QuestStreakConfigSchema,
  );

export default QuestStreakConfigModel;
