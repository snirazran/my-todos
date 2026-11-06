import mongoose, { Schema, type Model } from 'mongoose';
import type { QuestPromptKind, QuestPromptOption } from '@/lib/quests/types';

export interface QuestPromptDoc {
  _id?: mongoose.Types.ObjectId;
  promptId: string;
  kind: QuestPromptKind;
  question: string;
  placeholder?: string;
  options: QuestPromptOption[];
  category: string;
  weight: number;
  cooldownDays: number;
  dateKey?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const QuestPromptSchema = new Schema<QuestPromptDoc>(
  {
    promptId: { type: String, required: true, unique: true, index: true },
    kind: {
      type: String,
      enum: ['journal', 'poll', 'this_or_that', 'checkin'],
      required: true,
    },
    question: { type: String, required: true },
    placeholder: { type: String, default: undefined },
    options: { type: [Schema.Types.Mixed], default: [] } as any,
    category: { type: String, default: 'reflection', index: true },
    weight: { type: Number, default: 1 },
    cooldownDays: { type: Number, default: 30 },
    dateKey: { type: String, default: null },
    isActive: { type: Boolean, default: true, index: true },
  },
  {
    collection: 'quest_prompts',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.QuestPrompt;
}

const QuestPromptModel: Model<QuestPromptDoc> =
  (mongoose.models.QuestPrompt as Model<QuestPromptDoc>) ||
  mongoose.model<QuestPromptDoc>('QuestPrompt', QuestPromptSchema);

export default QuestPromptModel;
