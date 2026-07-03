import mongoose, { Schema, type Model } from 'mongoose';
import type {
  MacroCategoryId,
  QuestPlacement,
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
  durationMinutes?: number;
  startedAt?: Date | null;
  expiresAt?: Date | null;
  target: number;
  progress: number;
  logic: ResolvedQuestLogicBlock[];
  claimedObjectiveIds: string[];
  completedAt?: Date | null;
  claimedAt?: Date | null;
  // Generated (recipe-rolled) quests: local day the quest finished; a new roll
  // is generated once the user's local date moves past it.
  regenAfterDay?: string;
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
      enum: ['daily', 'category', 'onboarding'],
      required: true,
    },
    categoryId: {
      type: String,
      default: undefined,
    },
    windowKey: { type: String, required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    coverImageUrl: { type: String, default: undefined },
    durationMinutes: { type: Number, default: undefined },
    startedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null, index: true },
    target: { type: Number, required: true },
    progress: { type: Number, default: 0 },
    logic: { type: [Schema.Types.Mixed], default: [] } as any,
    claimedObjectiveIds: { type: [String], default: [] },
    completedAt: { type: Date, default: null },
    claimedAt: { type: Date, default: null },
    regenAfterDay: { type: String, default: undefined },
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
