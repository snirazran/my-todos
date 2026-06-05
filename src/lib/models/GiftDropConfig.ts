import mongoose, { Schema, type Model } from 'mongoose';

export type GiftDropMode = 'item' | 'rarity';

export type GiftDropEntryDoc = {
  itemId: string;
  chance: number;
};

export type GiftRarityDropDoc = {
  rarity: string;
  chance: number;
};

export type GiftDropConfigDoc = {
  _id: string;
  giftId: string;
  /** How prizes are rolled: by specific items ('item') or by rarity buckets ('rarity'). */
  dropMode: GiftDropMode;
  drops: GiftDropEntryDoc[];
  /** Weights per rarity, used when dropMode === 'rarity'. */
  rarityDrops: GiftRarityDropDoc[];
  createdAt: Date;
  updatedAt: Date;
};

const GiftDropEntrySchema = new Schema<GiftDropEntryDoc>(
  {
    itemId: { type: String, required: true },
    chance: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const GiftRarityDropSchema = new Schema<GiftRarityDropDoc>(
  {
    rarity: { type: String, required: true },
    chance: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const GiftDropConfigSchema = new Schema<GiftDropConfigDoc>(
  {
    giftId: { type: String, required: true, unique: true, index: true },
    dropMode: { type: String, enum: ['item', 'rarity'], default: 'item' },
    drops: { type: [GiftDropEntrySchema], default: [] },
    rarityDrops: { type: [GiftRarityDropSchema], default: [] },
  },
  { collection: 'giftDropConfigs', timestamps: true },
);

if (mongoose.models.GiftDropConfig) {
  delete mongoose.models.GiftDropConfig;
}

const GiftDropConfigModel: Model<GiftDropConfigDoc> =
  mongoose.model<GiftDropConfigDoc>('GiftDropConfig', GiftDropConfigSchema);

export default GiftDropConfigModel;
