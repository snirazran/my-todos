import mongoose, { Schema, type Model } from 'mongoose';
import type { QuestPromptKind } from '@/lib/quests/types';

export interface PromptExposureDoc {
  _id?: mongoose.Types.ObjectId;
  userId: string;
  promptId: string;
  dayKey: string;
  kind: QuestPromptKind;
  category: string;
  personal: boolean;
  createdAt: Date;
}

const PromptExposureSchema = new Schema<PromptExposureDoc>(
  {
    userId: { type: String, required: true },
    promptId: { type: String, required: true },
    dayKey: { type: String, required: true },
    kind: { type: String, required: true },
    category: { type: String, default: 'reflection' },
    personal: { type: Boolean, default: false },
    createdAt: { type: Date, default: () => new Date() },
  },
  { collection: 'prompt_exposures' },
);

PromptExposureSchema.index({ userId: 1, promptId: 1, dayKey: 1 }, { unique: true });
PromptExposureSchema.index({ userId: 1, dayKey: -1 });
PromptExposureSchema.index({ promptId: 1 });
PromptExposureSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.PromptExposure;
}

const PromptExposureModel: Model<PromptExposureDoc> =
  (mongoose.models.PromptExposure as Model<PromptExposureDoc>) ||
  mongoose.model<PromptExposureDoc>('PromptExposure', PromptExposureSchema);

export default PromptExposureModel;
