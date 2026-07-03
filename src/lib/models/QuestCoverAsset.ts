import mongoose, { Schema, type Model } from 'mongoose';
import type { QuestCoverImageFile } from './QuestTemplate';

export interface QuestCoverAssetDoc {
  _id?: mongoose.Types.ObjectId;
  key: string;
  coverImageUrl?: string;
  coverImageFile?: QuestCoverImageFile | null;
  createdAt: Date;
  updatedAt: Date;
}

const QuestCoverAssetSchema = new Schema<QuestCoverAssetDoc>(
  {
    key: { type: String, required: true, unique: true, index: true },
    coverImageUrl: { type: String, default: undefined },
    coverImageFile: { type: Schema.Types.Mixed, default: undefined },
  },
  {
    collection: 'quest_cover_assets',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.QuestCoverAsset;
}

const QuestCoverAssetModel: Model<QuestCoverAssetDoc> =
  (mongoose.models.QuestCoverAsset as Model<QuestCoverAssetDoc>) ||
  mongoose.model<QuestCoverAssetDoc>('QuestCoverAsset', QuestCoverAssetSchema);

export default QuestCoverAssetModel;
