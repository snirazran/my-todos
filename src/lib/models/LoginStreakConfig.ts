import mongoose, { Schema, type Model } from 'mongoose';
import type { LoginStreakReward } from '@/lib/streak/types';

export interface LoginStreakGoalTier {
  days: number;
  rewards: LoginStreakReward[];
}

export interface LoginStreakMilestone {
  days: number;
  rewards: LoginStreakReward[];
}

export interface LoginStreakConfigDoc {
  _id?: mongoose.Types.ObjectId;
  configId: string;
  isActive: boolean;
  freezePriceFlies: number;
  freezeCap: number;
  saverMinStreak: number;
  goalTiers: LoginStreakGoalTier[];
  milestones: LoginStreakMilestone[];
  createdAt: Date;
  updatedAt: Date;
}

export const LOGIN_STREAK_CONFIG_ID = 'login-streak';
export const FREEZE_CAP_MIN = 1;
export const FREEZE_CAP_MAX = 5;

export const DEFAULT_GOAL_TIERS: LoginStreakGoalTier[] = [
  { days: 7, rewards: [{ type: 'FLIES', amountMode: 'fixed', amount: 50 }] },
  { days: 14, rewards: [{ type: 'FLIES', amountMode: 'fixed', amount: 120 }] },
  {
    days: 30,
    rewards: [
      { type: 'FLIES', amountMode: 'fixed', amount: 300 },
      { type: 'STREAK_FREEZE', amount: 1 },
    ],
  },
  {
    days: 50,
    rewards: [
      { type: 'FLIES', amountMode: 'fixed', amount: 600 },
      { type: 'STREAK_FREEZE', amount: 1 },
    ],
  },
];

export const DEFAULT_MILESTONES: LoginStreakMilestone[] = [
  { days: 7, rewards: [{ type: 'STREAK_FREEZE', amount: 1 }] },
  {
    days: 30,
    rewards: [
      { type: 'FLIES', amountMode: 'fixed', amount: 100 },
      { type: 'STREAK_FREEZE', amount: 1 },
    ],
  },
  { days: 100, rewards: [{ type: 'FLIES', amountMode: 'fixed', amount: 400 }] },
  { days: 365, rewards: [{ type: 'FLIES', amountMode: 'fixed', amount: 1500 }] },
];

const LoginStreakConfigSchema = new Schema<LoginStreakConfigDoc>(
  {
    configId: { type: String, required: true, unique: true, index: true },
    isActive: { type: Boolean, default: true },
    freezePriceFlies: { type: Number, default: 100 },
    freezeCap: { type: Number, default: 2 },
    saverMinStreak: { type: Number, default: 2 },
    goalTiers: { type: [Schema.Types.Mixed], default: [] } as any,
    milestones: { type: [Schema.Types.Mixed], default: [] } as any,
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
