import mongoose, { Schema, type Model } from 'mongoose';
import type { QuestPromptKind } from '@/lib/quests/types';

export interface PromptAnswerDoc {
  _id?: mongoose.Types.ObjectId;
  userId: string;
  promptId: string;
  dayKey: string;
  kind: QuestPromptKind;
  category: string;
  question: string;
  text?: string;
  optionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PromptAnswerSchema = new Schema<PromptAnswerDoc>(
  {
    userId: { type: String, required: true },
    promptId: { type: String, required: true },
    dayKey: { type: String, required: true },
    kind: { type: String, required: true },
    category: { type: String, default: 'reflection' },
    question: { type: String, required: true },
    text: { type: String, default: undefined },
    optionId: { type: String, default: undefined },
  },
  {
    collection: 'prompt_answers',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

PromptAnswerSchema.index({ userId: 1, promptId: 1, dayKey: 1 }, { unique: true });
PromptAnswerSchema.index({ userId: 1, dayKey: -1 });
PromptAnswerSchema.index({ promptId: 1, userId: 1 });

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.PromptAnswer;
}

const PromptAnswerModel: Model<PromptAnswerDoc> =
  (mongoose.models.PromptAnswer as Model<PromptAnswerDoc>) ||
  mongoose.model<PromptAnswerDoc>('PromptAnswer', PromptAnswerSchema);

export default PromptAnswerModel;
