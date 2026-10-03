import mongoose, { Schema, type Model } from 'mongoose';

export interface AdRewardVerificationDoc {
  _id?: mongoose.Types.ObjectId;
  transactionId: string;
  userId: string;
  adUnit: string;
  customData?: string;
  rewardAmount?: number;
  verifiedAt: Date;
  consumedAt?: Date | null;
}

const AdRewardVerificationSchema = new Schema<AdRewardVerificationDoc>(
  {
    transactionId: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    adUnit: { type: String, default: '' },
    customData: { type: String },
    rewardAmount: { type: Number },
    verifiedAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
  },
  { collection: 'adRewardVerifications' },
);

AdRewardVerificationSchema.index({ userId: 1, consumedAt: 1, verifiedAt: 1 });
AdRewardVerificationSchema.index(
  { verifiedAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 30 },
);

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.AdRewardVerification;
}

const AdRewardVerificationModel: Model<AdRewardVerificationDoc> =
  (mongoose.models.AdRewardVerification as Model<AdRewardVerificationDoc>) ||
  mongoose.model<AdRewardVerificationDoc>(
    'AdRewardVerification',
    AdRewardVerificationSchema,
  );

export default AdRewardVerificationModel;
