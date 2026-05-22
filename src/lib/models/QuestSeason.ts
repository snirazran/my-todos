import mongoose, { Schema, type Model } from 'mongoose';
import type { QuestRewards } from '@/lib/quests/types';

export type QuestSeasonDayReward = {
  day: number;
  freeRewards: QuestRewards;
  premiumRewards: QuestRewards;
};

export type QuestSeasonImages = {
  mobile: string;
  tablet: string;
  web: string;
  webLarge: string;
};

export type QuestSeasonImageFile = {
  storagePath: string;
  contentType: string;
  size?: number;
  updatedAt?: Date;
};

export type QuestSeasonImageFiles = {
  mobile?: QuestSeasonImageFile | null;
  tablet?: QuestSeasonImageFile | null;
  web?: QuestSeasonImageFile | null;
  webLarge?: QuestSeasonImageFile | null;
};

export type QuestSeasonSizeKey = keyof QuestSeasonImages;

export interface QuestSeasonDoc {
  _id?: mongoose.Types.ObjectId;
  seasonId: string;
  name: string;
  images: QuestSeasonImages;
  imageFiles?: QuestSeasonImageFiles;
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
    images: {
      mobile: { type: String, default: '' },
      tablet: { type: String, default: '' },
      web: { type: String, default: '' },
      webLarge: { type: String, default: '' },
    },
    imageFiles: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
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
