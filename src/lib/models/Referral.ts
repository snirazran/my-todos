import mongoose, { Schema, type Model } from 'mongoose';

export type ReferralDoc = {
  _id: string;
  code: string;
  inviterId: string;
  giftItemId: string;
  giftOptionId?: string;
  createdAt: Date;
  claimedByUserId?: string | null;
  claimedAt?: Date | null;
};

const ReferralSchema = new Schema<ReferralDoc>(
  {
    code: { type: String, required: true, unique: true, index: true },
    inviterId: { type: String, required: true, index: true },
    giftItemId: { type: String, required: true },
    giftOptionId: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    claimedByUserId: { type: String, default: null, index: true },
    claimedAt: { type: Date, default: null },
  },
  { collection: 'referrals' },
);

if (mongoose.models.Referral) {
  delete mongoose.models.Referral;
}

const ReferralModel: Model<ReferralDoc> = mongoose.model<ReferralDoc>(
  'Referral',
  ReferralSchema,
);

export default ReferralModel;
