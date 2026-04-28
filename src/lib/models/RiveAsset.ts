import mongoose, { Schema, type Model } from 'mongoose';

type RiveBackupRecord = {
  name: string;
  storagePath: string;
  size: number;
  updatedAt: Date;
};

export type RiveAssetDoc = {
  assetId: string;
  storagePath: string;
  size: number;
  updatedAt: Date;
  backups: RiveBackupRecord[];
};

const RiveBackupSchema = new Schema<RiveBackupRecord>(
  {
    name: { type: String, required: true },
    storagePath: { type: String, required: true },
    size: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const RiveAssetSchema = new Schema<RiveAssetDoc>(
  {
    assetId: { type: String, required: true, unique: true },
    storagePath: { type: String, required: true },
    size: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now },
    backups: { type: [RiveBackupSchema], default: [] },
  },
  { collection: 'riveAssets' },
);

if (mongoose.models.RiveAsset) {
  delete mongoose.models.RiveAsset;
}

const RiveAssetModel: Model<RiveAssetDoc> = mongoose.model<RiveAssetDoc>(
  'RiveAsset',
  RiveAssetSchema,
);

export default RiveAssetModel;
