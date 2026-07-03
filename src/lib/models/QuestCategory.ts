import mongoose, { Schema, type Model } from 'mongoose';

export interface QuickAddSuggestionEntry {
  text: string;
  emoji: string;
}

export type { QuestCoverImageFile } from './QuestTemplate';
import type { QuestCoverImageFile } from './QuestTemplate';

export interface QuestCategoryDoc {
  _id?: mongoose.Types.ObjectId;
  categoryId: string;
  name: string;
  shortLabel: string;
  description: string;
  onboardingSentence?: string;
  coverImageUrl?: string;
  coverImageFile?: QuestCoverImageFile | null;
  accent: string;
  backgroundFrom: string;
  backgroundTo: string;
  isBuiltIn: boolean;
  questMode?: 'templates' | 'generated';
  quickAddSuggestions: QuickAddSuggestionEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const QuickAddSuggestionSchema = new Schema<QuickAddSuggestionEntry>(
  {
    text: { type: String, required: true },
    emoji: { type: String, default: '' },
  },
  { _id: false },
);

const QuestCategorySchema = new Schema<QuestCategoryDoc>(
  {
    categoryId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    shortLabel: { type: String, default: '' },
    description: { type: String, default: '' },
    onboardingSentence: { type: String, default: '' },
    coverImageUrl: { type: String, default: undefined },
    coverImageFile: { type: Schema.Types.Mixed, default: undefined },
    accent: { type: String, default: '#6366f1' },
    backgroundFrom: { type: String, default: '#1e1b4b' },
    backgroundTo: { type: String, default: '#312e81' },
    isBuiltIn: { type: Boolean, default: false },
    questMode: {
      type: String,
      enum: ['templates', 'generated'],
      default: 'templates',
    },
    quickAddSuggestions: { type: [QuickAddSuggestionSchema], default: [] },
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
