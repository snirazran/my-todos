import mongoose, { Schema, type Model } from 'mongoose';

export interface FlyEconomyConfigDoc {
  _id?: mongoose.Types.ObjectId;
  configId: string;
  settings: Record<string, unknown>;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const FLY_ECONOMY_CONFIG_ID = 'fly-economy';

const FlyEconomyConfigSchema = new Schema<FlyEconomyConfigDoc>(
  {
    configId: { type: String, required: true, unique: true, index: true },
    settings: { type: Schema.Types.Mixed, default: {} },
    updatedBy: { type: String },
  },
  {
    collection: 'flyEconomyConfigs',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.FlyEconomyConfig;
}

const FlyEconomyConfigModel: Model<FlyEconomyConfigDoc> =
  (mongoose.models.FlyEconomyConfig as Model<FlyEconomyConfigDoc>) ||
  mongoose.model<FlyEconomyConfigDoc>(
    'FlyEconomyConfig',
    FlyEconomyConfigSchema,
  );

export default FlyEconomyConfigModel;
