import mongoose, { Schema, type Model } from 'mongoose';
import type { QuestReward, QuestRewards } from '@/lib/quests/types';
import type { QuestCoverImageFile } from './QuestTemplate';

export type RecipePoolEntry = {
  id: string;
  type: 'count' | 'focus_minutes' | 'metric_count';
  action?: 'complete' | 'add';
  metricKey?: string;
  // Streak metrics only: the rolled quest requires a streak of N days, with N
  // picked from this inclusive range.
  streakDaysMin?: number;
  streakDaysMax?: number;
  minTarget: number;
  maxTarget: number;
  weight: number;
};

// Rolled independently of the base reward pick, each with its own chance
// (0–1; 1 grants on every roll). Lets a slot pay "X flies + a chance of a
// gift" instead of one-of-a-pool.
export type RecipeBonusReward = {
  chance: number;
  reward: QuestReward;
};

export type RecipeSlot = {
  id: string;
  pool: RecipePoolEntry[];
  rewards: QuestRewards;
  bonusRewards?: RecipeBonusReward[];
};

export interface QuestRecipeDoc {
  _id?: mongoose.Types.ObjectId;
  recipeId: string;
  name: string;
  placement: 'category' | 'daily';
  isActive: boolean;
  durationMinutes: number;
  categoryIds: string[];
  coverImageUrl?: string;
  coverImageFile?: QuestCoverImageFile | null;
  slots: RecipeSlot[];
  createdAt: Date;
  updatedAt: Date;
}

const QuestRecipeSchema = new Schema<QuestRecipeDoc>(
  {
    recipeId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    placement: {
      type: String,
      enum: ['category', 'daily'],
      default: 'category',
    },
    isActive: { type: Boolean, default: true },
    durationMinutes: { type: Number, default: 3 * 24 * 60 },
    categoryIds: { type: [String], default: [] },
    coverImageUrl: { type: String, default: undefined },
    coverImageFile: { type: Schema.Types.Mixed, default: undefined },
    slots: { type: [Schema.Types.Mixed], default: [] } as any,
  },
  {
    collection: 'quest_recipes',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.QuestRecipe;
}

const QuestRecipeModel: Model<QuestRecipeDoc> =
  (mongoose.models.QuestRecipe as Model<QuestRecipeDoc>) ||
  mongoose.model<QuestRecipeDoc>('QuestRecipe', QuestRecipeSchema);

export default QuestRecipeModel;
