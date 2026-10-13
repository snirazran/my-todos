import mongoose, { Schema, type Model } from 'mongoose';

export type PondKeepsakeDoc = { userId: string; keepsakeId: string; earnedAt: Date; partnerId?: string };
const schema = new Schema<PondKeepsakeDoc>({
  userId: { type: String, required: true, index: true },
  keepsakeId: { type: String, required: true },
  earnedAt: { type: Date, required: true, default: Date.now },
  partnerId: { type: String },
}, { collection: 'pondkeepsakes' });
schema.index({ userId: 1, keepsakeId: 1 }, { unique: true });

const PondKeepsakeModel: Model<PondKeepsakeDoc> =
  (mongoose.models.PondKeepsake as Model<PondKeepsakeDoc>) || mongoose.model<PondKeepsakeDoc>('PondKeepsake', schema);
export default PondKeepsakeModel;
