import mongoose, { Schema, type Model } from 'mongoose';
import type {
  MacroCategoryId,
  QuestPlacement,
  QuestRewards,
  ResolvedQuestLogicBlock,
} from '@/lib/quests/types';

export interface QuestDoc {
  _id?: mongoose.Types.ObjectId;
  userId: string;
  questId: string;
  templateId: string;
  rollKey: string;
  placement: QuestPlacement;
  categoryId?: MacroCategoryId;
  windowKey: string;
  title: string;
  description: string;
  coverImageUrl?: string;
  target: number;
  progress: number;
  logic: ResolvedQuestLogicBlock[];
  rewards: QuestRewards;
  completedAt?: Date | null;
  claimedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const QuestSchema = new Schema<QuestDoc>(
  {
    userId: { type: String, required: true, index: true },
    questId: { type: String, required: true, index: true },
    templateId: { type: String, required: true, index: true },
    rollKey: { type: String, required: true, index: true },
    placement: {
      type: String,
      enum: ['daily', 'category'],
      required: true,
    },
    categoryId: {
      type: String,
      enum: ['sport', 'family', 'mindfulness', 'house_chores', 'sleep'],
      default: undefined,
    },
    windowKey: { type: String, required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    coverImageUrl: { type: String, default: undefined },
    target: { type: Number, required: true },
    progress: { type: Number, default: 0 },
    logic: { type: [Schema.Types.Mixed], default: [] },
    rewards: { type: Schema.Types.Mixed, required: true },
    completedAt: { type: Date, default: null },
    claimedAt: { type: Date, default: null },
  },
  {
    collection: 'quests',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

QuestSchema.index({ userId: 1, placement: 1, windowKey: 1 });
QuestSchema.index({ userId: 1, templateId: 1, windowKey: 1 }, { unique: true });
QuestSchema.index({ userId: 1, questId: 1 }, { unique: true });

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.Quest;
}

const QuestModel: Model<QuestDoc> =
  (mongoose.models.Quest as Model<QuestDoc>) ||
  mongoose.model<QuestDoc>('Quest', QuestSchema);

export default QuestModel;
