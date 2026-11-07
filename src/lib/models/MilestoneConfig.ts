import mongoose, { Schema, type Model } from 'mongoose';
import type { MilestoneTrack } from '@/lib/quests/milestones';

export interface MilestoneConfigDoc {
  _id?: mongoose.Types.ObjectId;
  configId: string;
  isActive: boolean;
  tracks: MilestoneTrack[];
  createdAt: Date;
  updatedAt: Date;
}

export const MILESTONE_CONFIG_ID = 'milestones';

const MilestoneConfigSchema = new Schema<MilestoneConfigDoc>(
  {
    configId: { type: String, required: true, unique: true, index: true },
    isActive: { type: Boolean, default: true },
    tracks: { type: Schema.Types.Mixed, default: [] } as any,
  },
  {
    collection: 'milestoneConfigs',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.MilestoneConfig;
}

const MilestoneConfigModel: Model<MilestoneConfigDoc> =
  (mongoose.models.MilestoneConfig as Model<MilestoneConfigDoc>) ||
  mongoose.model<MilestoneConfigDoc>('MilestoneConfig', MilestoneConfigSchema);

export default MilestoneConfigModel;
