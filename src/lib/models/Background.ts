import mongoose, { Schema, type Model } from 'mongoose';

export type BackgroundRarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'epic'
  | 'legendary';

export type BackgroundImages = {
  mobile: string;
  tablet: string;
  web: string;
  webLarge: string;
};

export type BackgroundImageFile = {
  storagePath: string;
  contentType: string;
  size?: number;
  updatedAt?: Date;
};

export type BackgroundImageFiles = {
  mobile?: BackgroundImageFile | null;
  tablet?: BackgroundImageFile | null;
  web?: BackgroundImageFile | null;
  webLarge?: BackgroundImageFile | null;
};

export type BackgroundSizeKey = keyof BackgroundImages;

export type BackgroundDoc = {
  _id: string;
  id: string;
  name: string;
  rarity: BackgroundRarity;
  priceFlies: number;
  images: BackgroundImages;
  imageFiles?: BackgroundImageFiles;
  hidden: boolean;
  createdAt: Date;
};

const BackgroundSchema = new Schema<BackgroundDoc>(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    rarity: {
      type: String,
      required: true,
      enum: ['common', 'uncommon', 'rare', 'epic', 'legendary'],
      default: 'common',
    },
    priceFlies: { type: Number, default: 200 },
    images: {
      mobile: { type: String, default: '' },
      tablet: { type: String, default: '' },
      web: { type: String, default: '' },
      webLarge: { type: String, default: '' },
    },
    imageFiles: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    hidden: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'backgrounds' },
);

if (mongoose.models.Background) {
  delete mongoose.models.Background;
}

const BackgroundModel: Model<BackgroundDoc> = mongoose.model<BackgroundDoc>(
  'Background',
  BackgroundSchema,
);

export default BackgroundModel;
