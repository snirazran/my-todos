import mongoose, { Schema, type Model } from 'mongoose';

/** One row per (user, campaign): everything frequency capping needs to decide
 *  whether this person should see this popup again. */
export type CampaignUserStateDoc = {
  userId: string;
  campaignId: string;
  impressions: number;
  clicks: number;
  dismissals: number;
  converted: boolean;
  lastShownAt?: Date | null;
  convertedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const CampaignUserStateSchema = new Schema<CampaignUserStateDoc>(
  {
    userId: { type: String, required: true, index: true },
    campaignId: { type: String, required: true, index: true },
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    dismissals: { type: Number, default: 0 },
    converted: { type: Boolean, default: false },
    lastShownAt: { type: Date, default: null },
    convertedAt: { type: Date, default: null },
  },
  { collection: 'campaignUserStates', timestamps: true },
);

CampaignUserStateSchema.index({ userId: 1, campaignId: 1 }, { unique: true });

const CampaignUserStateModel: Model<CampaignUserStateDoc> =
  (mongoose.models.CampaignUserState as Model<CampaignUserStateDoc>) ||
  mongoose.model<CampaignUserStateDoc>(
    'CampaignUserState',
    CampaignUserStateSchema,
  );

export default CampaignUserStateModel;
