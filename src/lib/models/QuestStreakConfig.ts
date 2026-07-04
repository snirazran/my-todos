import mongoose, { Schema, type Model } from 'mongoose';
import type { QuestReward } from '@/lib/quests/types';

export interface QuestStreakConfigDoc {
  _id?: mongoose.Types.ObjectId;
  configId: string;
  isActive: boolean;
  streakLength: number;
  rewards: QuestReward[];
  createdAt: Date;
  updatedAt: Date;
}

export const STREAK_CONFIG_ID = 'daily-streak';
export const STREAK_LENGTH_MIN = 2;
export const STREAK_LENGTH_MAX = 60;

const QuestStreakConfigSchema = new Schema<QuestStreakConfigDoc>(
  {
    configId: { type: String, required: true, unique: true, index: true },
    isActive: { type: Boolean, default: false },
    streakLength: { type: Number, default: 5 },
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
