import mongoose, { Schema, type Model } from 'mongoose';
import type { GiftRules } from '@/lib/skins/giftRules';
import type { RecipeSlot } from '@/lib/models/QuestRecipe';

export type EconomyUpdateChange = {
  key: string;
  label: string;
  from: string;
  to: string;
  count?: number;
};

export type EconomyUpdateBefore = {
  pity?: Pick<GiftRules, 'softPityLuck' | 'softPityBonusPoints' | 'hardPityLuck' | 'epicPityLuck'>;
  cleanSweepFlies?: number;
  recipes?: Array<{ recipeId: string; slots: RecipeSlot[] }>;
  itemPrices?: Array<{ id: string; priceFlies: number }>;
  backgroundPrices?: Array<{ id: string; priceFlies: number }>;
};

export interface EconomyUpdateSnapshotDoc {
  _id?: mongoose.Types.ObjectId;
  by: string;
  changes: EconomyUpdateChange[];
  before: EconomyUpdateBefore;
  undoneAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const EconomyUpdateSnapshotSchema = new Schema<EconomyUpdateSnapshotDoc>(
  {
    by: { type: String, required: true },
    changes: { type: [Schema.Types.Mixed], default: [] } as any,
    before: { type: Schema.Types.Mixed, default: {} },
    undoneAt: { type: Date, default: null },
  },
  {
    collection: 'economyUpdateSnapshots',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

EconomyUpdateSnapshotSchema.index({ createdAt: -1 });

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.EconomyUpdateSnapshot;
}

const EconomyUpdateSnapshotModel: Model<EconomyUpdateSnapshotDoc> =
  (mongoose.models.EconomyUpdateSnapshot as Model<EconomyUpdateSnapshotDoc>) ||
  mongoose.model<EconomyUpdateSnapshotDoc>(
    'EconomyUpdateSnapshot',
    EconomyUpdateSnapshotSchema,
  );

export default EconomyUpdateSnapshotModel;
