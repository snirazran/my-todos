import mongoose, { Schema, type Model } from 'mongoose';

export interface AppleAdsSyncStateDoc {
  _id?: mongoose.Types.ObjectId;
  configId: string;
  backfilledFrom?: string | null;
  lastRunAt?: Date | null;
  lastOkAt?: Date | null;
  lastError?: string | null;
  lastResult?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export const APPLE_ADS_SYNC_STATE_ID = 'apple-ads';

const AppleAdsSyncStateSchema = new Schema<AppleAdsSyncStateDoc>(
  {
    configId: { type: String, required: true, unique: true, index: true },
    backfilledFrom: { type: String, default: null },
    lastRunAt: { type: Date, default: null },
    lastOkAt: { type: Date, default: null },
    lastError: { type: String, default: null },
    lastResult: { type: Schema.Types.Mixed, default: null },
  },
  {
    collection: 'appleAdsSyncState',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.AppleAdsSyncState;
}

const AppleAdsSyncStateModel: Model<AppleAdsSyncStateDoc> =
  (mongoose.models.AppleAdsSyncState as Model<AppleAdsSyncStateDoc>) ||
  mongoose.model<AppleAdsSyncStateDoc>('AppleAdsSyncState', AppleAdsSyncStateSchema);

export default AppleAdsSyncStateModel;
