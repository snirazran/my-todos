import mongoose, { Schema, type Model } from 'mongoose';

export interface StarterPlanConfigDoc {
  _id?: mongoose.Types.ObjectId;
  configId: string;
  isActive: boolean;
  maxTasks: number;
  maxPerArea: number;
  linkTags: boolean;
  headline: string;
  subheadline: string;
  acceptLabel: string;
  declineLabel: string;
  footnote: string;
  createdAt: Date;
  updatedAt: Date;
}

export const STARTER_PLAN_CONFIG_ID = 'starter-plan';

const StarterPlanConfigSchema = new Schema<StarterPlanConfigDoc>(
  {
    configId: { type: String, required: true, unique: true, index: true },
    isActive: { type: Boolean, default: true },
    maxTasks: { type: Number, default: 5 },
    maxPerArea: { type: Number, default: 3 },
    linkTags: { type: Boolean, default: true },
    headline: { type: String, default: '' },
    subheadline: { type: String, default: '' },
    acceptLabel: { type: String, default: '' },
    declineLabel: { type: String, default: '' },
    footnote: { type: String, default: '' },
  },
  {
    collection: 'starterPlanConfigs',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.StarterPlanConfig;
}

const StarterPlanConfigModel: Model<StarterPlanConfigDoc> =
  (mongoose.models.StarterPlanConfig as Model<StarterPlanConfigDoc>) ||
  mongoose.model<StarterPlanConfigDoc>(
    'StarterPlanConfig',
    StarterPlanConfigSchema,
  );

export default StarterPlanConfigModel;
