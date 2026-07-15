import mongoose, { Schema, type Model } from 'mongoose';
import type { QuestReward } from '@/lib/quests/types';

export interface QuestMoveToWebConfigDoc {
  _id?: mongoose.Types.ObjectId;
  configId: string;
  isActive: boolean;
  reward: QuestReward | null;
  createdAt: Date;
  updatedAt: Date;
}

export const MOVE_TO_WEB_CONFIG_ID = 'move-to-web';

const QuestMoveToWebConfigSchema = new Schema<QuestMoveToWebConfigDoc>(
  {
    configId: { type: String, required: true, unique: true, index: true },
    isActive: { type: Boolean, default: false },
    reward: { type: Schema.Types.Mixed, default: null } as any,
  },
  {
    collection: 'questMoveToWebConfigs',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.QuestMoveToWebConfig;
}

const QuestMoveToWebConfigModel: Model<QuestMoveToWebConfigDoc> =
  (mongoose.models.QuestMoveToWebConfig as Model<QuestMoveToWebConfigDoc>) ||
  mongoose.model<QuestMoveToWebConfigDoc>(
    'QuestMoveToWebConfig',
    QuestMoveToWebConfigSchema,
  );

export default QuestMoveToWebConfigModel;
