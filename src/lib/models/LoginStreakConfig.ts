import mongoose, { Schema, type Model } from 'mongoose';
import type { LoginStreakReward } from '@/lib/streak/types';

export interface LoginStreakGoalTier {
  days: number;
  rewards: LoginStreakReward[];
}

export interface LoginStreakConfigDoc {
  _id?: mongoose.Types.ObjectId;
  configId: string;
  isActive: boolean;
  saverMinStreak: number;
  /**
   * What a rung pays on its 1st, 2nd, 3rd… completion since the user last
   * stepped up, as percentages. Beyond the list, `repeatPayoutFloorPercent`
   * applies. Without decay everyone farms the shortest pledge forever and the
   * ladder stops pulling upward.
   */
  repeatPayoutPercents: number[];
  repeatPayoutFloorPercent: number;
  /** Gifts, Lily Pads and guaranteed skins only land on a full-price completion. */
  repeatItemsAtFullOnly: boolean;
  goalTiers: LoginStreakGoalTier[];
  createdAt: Date;
  updatedAt: Date;
}

export const LOGIN_STREAK_CONFIG_ID = 'login-streak';

export const DEFAULT_REPEAT_PAYOUT_PERCENTS = [100, 85, 70];
export const DEFAULT_REPEAT_PAYOUT_FLOOR_PERCENT = 60;

/**
 * The pledge ladder. Flies per day climb with the length of the promise
 * (10.0 / 11.4 / 12.0 / 13.6) so a longer pledge is always worth more per day
 * than a short one — that gradient is what makes the ladder pull upward. Plus
 * doubles the flies at grant time; a free player buys the same double with one
 * rewarded ad. Gifts are never duplicated — they open twice instead.
 */
export const DEFAULT_GOAL_TIERS: LoginStreakGoalTier[] = [
  {
    days: 7,
    rewards: [
      { type: 'FLIES', amountMode: 'fixed', amount: 70 },
      { type: 'BOX', itemId: 'gift_box_rare', amount: 1 },
    ],
  },
  {
    days: 14,
    rewards: [
      { type: 'FLIES', amountMode: 'fixed', amount: 160 },
      { type: 'BOX', itemId: 'gift_box_legendary', amount: 1 },
      { type: 'SHIELD', amount: 1 },
    ],
  },
  {
    days: 30,
    rewards: [
      { type: 'FLIES', amountMode: 'fixed', amount: 360 },
      { type: 'BOX', itemId: 'gift_box_legendary', amount: 1 },
      { type: 'SHIELD', amount: 1 },
      { type: 'SKIN_ROLL', minRarity: 'rare' },
    ],
  },
  {
    days: 50,
    rewards: [
      { type: 'FLIES', amountMode: 'fixed', amount: 680 },
      { type: 'BOX', itemId: 'gift_box_legendary', amount: 2 },
      { type: 'SHIELD', amount: 2 },
      { type: 'SKIN_ROLL', minRarity: 'epic' },
    ],
  },
];

const LoginStreakConfigSchema = new Schema<LoginStreakConfigDoc>(
  {
    configId: { type: String, required: true, unique: true, index: true },
    isActive: { type: Boolean, default: true },
    saverMinStreak: { type: Number, default: 2 },
    repeatPayoutPercents: {
      type: [Number],
      default: () => [...DEFAULT_REPEAT_PAYOUT_PERCENTS],
    },
    repeatPayoutFloorPercent: {
      type: Number,
      default: DEFAULT_REPEAT_PAYOUT_FLOOR_PERCENT,
    },
    repeatItemsAtFullOnly: { type: Boolean, default: true },
    goalTiers: { type: [Schema.Types.Mixed], default: [] } as any,
  },
  {
    collection: 'loginStreakConfigs',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.LoginStreakConfig;
}

const LoginStreakConfigModel: Model<LoginStreakConfigDoc> =
  (mongoose.models.LoginStreakConfig as Model<LoginStreakConfigDoc>) ||
  mongoose.model<LoginStreakConfigDoc>(
    'LoginStreakConfig',
    LoginStreakConfigSchema,
  );

export default LoginStreakConfigModel;
