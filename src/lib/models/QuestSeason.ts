import mongoose, { Schema, type Model } from 'mongoose';
import type { QuestRewards } from '@/lib/quests/types';

export type QuestSeasonDayReward = {
  day: number;
  freeRewards: QuestRewards;
  premiumRewards: QuestRewards;
};

export interface QuestSeasonDoc {
  _id?: mongoose.Types.ObjectId;
  seasonId: string;
  name: string;
  coverImageUrl?: string;
  startsAt: Date;
  endsAt: Date;
  dailyTargetFlies: number;
  dayRewards: QuestSeasonDayReward[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const QuestSeasonSchema = new Schema<QuestSeasonDoc>(
  {
    seasonId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    coverImageUrl: { type: String, default: undefined },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    dailyTargetFlies: { type: Number, default: 3 },
    dayRewards: { type: [Schema.Types.Mixed], default: [] } as any,
    isActive: { type: Boolean, default: true, index: true },
  },
  {
    collection: 'quest_seasons',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.QuestSeason;
}

const QuestSeasonModel: Model<QuestSeasonDoc> =
  (mongoose.models.QuestSeason as Model<QuestSeasonDoc>) ||
  mongoose.model<QuestSeasonDoc>('QuestSeason', QuestSeasonSchema);

export default QuestSeasonModel;
