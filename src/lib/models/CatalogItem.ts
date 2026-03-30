import mongoose, { Schema, type Model } from 'mongoose';

export type CatalogItemDoc = {
  _id: string;
  id: string;
  name: string;
  slot: 'skin' | 'hat' | 'body' | 'hand_item' | 'container';
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  riveIndex: number;
  icon: string;
  priceFlies: number;
  hidden: boolean;
};

const CatalogItemSchema = new Schema<CatalogItemDoc>(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    slot: { type: String, required: true, enum: ['skin', 'hat', 'body', 'hand_item', 'container'] },
    rarity: { type: String, required: true, enum: ['common', 'uncommon', 'rare', 'epic', 'legendary'], default: 'common' },
    riveIndex: { type: Number, required: true },
    icon: { type: String, default: '' },
    priceFlies: { type: Number, default: 100 },
    hidden: { type: Boolean, default: false },
  },
  { collection: 'catalogItems' },
);

if (mongoose.models.CatalogItem) {
  delete mongoose.models.CatalogItem;
}

const CatalogItemModel: Model<CatalogItemDoc> = mongoose.model<CatalogItemDoc>('CatalogItem', CatalogItemSchema);

export default CatalogItemModel;
