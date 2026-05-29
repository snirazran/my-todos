import mongoose, { Schema, type Model } from 'mongoose';
import type {
  MacroCategoryId,
  QuestLogicBlock,
  QuestPlacement,
  QuestVisibilityCondition,
} from '@/lib/quests/types';

export type QuestCoverImageFile = {
  storagePath: string;
  contentType: string;
  size?: number;
  updatedAt?: Date;
};

export interface QuestTemplateDoc {
  _id?: mongoose.Types.ObjectId;
  templateId: string;
  name: string;
  description: string;
  coverImageUrl?: string;
  coverImageFile?: QuestCoverImageFile | null;
  placement: QuestPlacement;
  categoryId?: MacroCategoryId;
  durationMinutes?: number;
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
    coverImageFile: { type: Schema.Types.Mixed, default: undefined },
    placement: {
      type: String,
      enum: ['daily', 'category'],
      required: true,
    },
    categoryId: {
      type: String,
      default: undefined,
    },
    durationMinutes: {
      type: Number,
      default: undefined,
    },
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
