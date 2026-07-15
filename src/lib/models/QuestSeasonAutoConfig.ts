import mongoose, { Schema, type Model } from 'mongoose';

export interface QuestSeasonAutoConfigDoc {
  _id?: mongoose.Types.ObjectId;
  configId: string;
  isActive: boolean;
  dailyTargetFlies: number;
  createdAt: Date;
  updatedAt: Date;
}

export const SEASON_AUTO_CONFIG_ID = 'season-auto';
export const SEASON_AUTO_TARGET_MIN = 1;
export const SEASON_AUTO_TARGET_MAX = 500;

const QuestSeasonAutoConfigSchema = new Schema<QuestSeasonAutoConfigDoc>(
  {
    configId: { type: String, required: true, unique: true, index: true },
    isActive: { type: Boolean, default: false },
    dailyTargetFlies: { type: Number, default: 3 },
  },
  {
    collection: 'questSeasonAutoConfigs',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.QuestSeasonAutoConfig;
}

const QuestSeasonAutoConfigModel: Model<QuestSeasonAutoConfigDoc> =
  (mongoose.models.QuestSeasonAutoConfig as Model<QuestSeasonAutoConfigDoc>) ||
  mongoose.model<QuestSeasonAutoConfigDoc>(
    'QuestSeasonAutoConfig',
    QuestSeasonAutoConfigSchema,
  );

export default QuestSeasonAutoConfigModel;
