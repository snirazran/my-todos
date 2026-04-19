import mongoose, { Schema, type Model } from 'mongoose';

export type GiftDropEntryDoc = {
  itemId: string;
  chance: number;
};

export type GiftDropConfigDoc = {
  _id: string;
  giftId: string;
  drops: GiftDropEntryDoc[];
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

const GiftDropConfigSchema = new Schema<GiftDropConfigDoc>(
  {
    giftId: { type: String, required: true, unique: true, index: true },
    drops: { type: [GiftDropEntrySchema], default: [] },
  },
  { collection: 'giftDropConfigs', timestamps: true },
);

if (mongoose.models.GiftDropConfig) {
  delete mongoose.models.GiftDropConfig;
}

const GiftDropConfigModel: Model<GiftDropConfigDoc> =
  mongoose.model<GiftDropConfigDoc>('GiftDropConfig', GiftDropConfigSchema);

export default GiftDropConfigModel;
