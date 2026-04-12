import mongoose, { Schema, type Model } from 'mongoose';

export interface QuestCategoryDoc {
  _id?: mongoose.Types.ObjectId;
  categoryId: string;
  name: string;
  shortLabel: string;
  description: string;
  coverImageUrl?: string;
  accent: string;
  backgroundFrom: string;
  backgroundTo: string;
  isBuiltIn: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const QuestCategorySchema = new Schema<QuestCategoryDoc>(
  {
    categoryId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    shortLabel: { type: String, default: '' },
    description: { type: String, default: '' },
    coverImageUrl: { type: String, default: undefined },
    accent: { type: String, default: '#6366f1' },
    backgroundFrom: { type: String, default: '#1e1b4b' },
    backgroundTo: { type: String, default: '#312e81' },
    isBuiltIn: { type: Boolean, default: false },
  },
  {
    collection: 'quest_categories',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.QuestCategory;
}

const QuestCategoryModel: Model<QuestCategoryDoc> =
  (mongoose.models.QuestCategory as Model<QuestCategoryDoc>) ||
  mongoose.model<QuestCategoryDoc>('QuestCategory', QuestCategorySchema);

export default QuestCategoryModel;
