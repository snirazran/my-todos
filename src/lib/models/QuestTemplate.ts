import mongoose, { Schema, type Model } from 'mongoose';
import type {
  MacroCategoryId,
  QuestLogicBlock,
  QuestPlacement,
  QuestRewards,
  QuestVisibilityCondition,
} from '@/lib/quests/types';

export interface QuestTemplateDoc {
  _id?: mongoose.Types.ObjectId;
  templateId: string;
  name: string;
  description: string;
  coverImageUrl?: string;
  placement: QuestPlacement;
  categoryId?: MacroCategoryId;
  rewards: QuestRewards;
  logic: QuestLogicBlock[];
  visibilityConditions: QuestVisibilityCondition[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const QuestTemplateSchema = new Schema<QuestTemplateDoc>(
  {
    templateId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    coverImageUrl: { type: String, default: undefined },
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
    rewards: { type: Schema.Types.Mixed, required: true },
    logic: { type: [Schema.Types.Mixed], default: [] } as any,
    visibilityConditions: { type: [Schema.Types.Mixed], default: [] } as any,
    isActive: { type: Boolean, default: true, index: true },
  },
  {
    collection: 'quest_templates',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.QuestTemplate;
}

const QuestTemplateModel: Model<QuestTemplateDoc> =
  (mongoose.models.QuestTemplate as Model<QuestTemplateDoc>) ||
  mongoose.model<QuestTemplateDoc>('QuestTemplate', QuestTemplateSchema);

export default QuestTemplateModel;
