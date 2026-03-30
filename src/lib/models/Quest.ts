import mongoose, { Schema, type Model } from 'mongoose';
import type { DailyQuestKind, TierRewards } from '@/lib/quests/types';

export interface QuestDoc {
  _id?: mongoose.Types.ObjectId;
  userId: string;
  questId: string;
  kind: DailyQuestKind;
  windowKey: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  completedAt?: Date | null;
  claimedAt?: Date | null;
  rewards: TierRewards;
  createdAt: Date;
  updatedAt: Date;
}

const QuestSchema = new Schema<QuestDoc>(
  {
    userId: { type: String, required: true, index: true },
    questId: { type: String, required: true, index: true },
    kind: {
      type: String,
      enum: [
        'complete_tasks',
        'add_tasks',
        'complete_habits',
        'add_habits',
        'focus_minutes',
      ],
      required: true,
    },
    windowKey: { type: String, required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    target: { type: Number, required: true },
    progress: { type: Number, default: 0 },
    completedAt: { type: Date, default: null },
    claimedAt: { type: Date, default: null },
    rewards: { type: Schema.Types.Mixed, required: true },
  },
  {
    collection: 'quests',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

QuestSchema.index({ userId: 1, windowKey: 1 });
QuestSchema.index({ userId: 1, questId: 1 }, { unique: true });

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.Quest;
}

const QuestModel: Model<QuestDoc> =
  (mongoose.models.Quest as Model<QuestDoc>) ||
  mongoose.model<QuestDoc>('Quest', QuestSchema);

export default QuestModel;
