import mongoose, { Schema, type Model } from 'mongoose';

export interface FlyPurchaseDoc {
  eventId: string;
  transactionId?: string;
  userId: string;
  packId: string;
  productId: string;
  flies: number;
  revenueUsd?: number;
  store?: string;
  environment?: string;
  purchasedAt: Date;
  grantedAt: Date;
}

const FlyPurchaseSchema = new Schema<FlyPurchaseDoc>(
  {
    eventId: { type: String, required: true, unique: true },
    transactionId: { type: String, default: undefined },
    userId: { type: String, required: true, index: true },
    packId: { type: String, required: true },
    productId: { type: String, required: true },
    flies: { type: Number, required: true },
    revenueUsd: { type: Number, default: undefined },
    store: { type: String, default: undefined },
    environment: { type: String, default: undefined },
    purchasedAt: { type: Date, required: true },
    grantedAt: { type: Date, required: true },
  },
  { collection: 'flyPurchases' },
);

const FlyPurchaseModel: Model<FlyPurchaseDoc> =
  (mongoose.models.FlyPurchase as Model<FlyPurchaseDoc>) ||
  mongoose.model<FlyPurchaseDoc>('FlyPurchase', FlyPurchaseSchema);

export default FlyPurchaseModel;
