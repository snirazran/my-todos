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
  goalTiers: LoginStreakGoalTier[];
  createdAt: Date;
  updatedAt: Date;
}

export const LOGIN_STREAK_CONFIG_ID = 'login-streak';

export const DEFAULT_GOAL_TIERS: LoginStreakGoalTier[] = [
  { days: 7, rewards: [{ type: 'FLIES', amountMode: 'fixed', amount: 50 }] },
  { days: 14, rewards: [{ type: 'FLIES', amountMode: 'fixed', amount: 120 }] },
  {
    days: 30,
    rewards: [
      { type: 'FLIES', amountMode: 'fixed', amount: 300 },
      { type: 'SHIELD', amount: 1 },
    ],
  },
  {
    days: 50,
    rewards: [
      { type: 'FLIES', amountMode: 'fixed', amount: 600 },
      { type: 'SHIELD', amount: 1 },
    ],
  },
];

const LoginStreakConfigSchema = new Schema<LoginStreakConfigDoc>(
  {
    configId: { type: String, required: true, unique: true, index: true },
    isActive: { type: Boolean, default: true },
    saverMinStreak: { type: Number, default: 2 },
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
