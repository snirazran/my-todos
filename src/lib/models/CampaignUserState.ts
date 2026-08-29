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
  /** Clicks per canvas element id, for the admin's per-element breakdown. */
  elementClicks?: Record<string, number>;
  /**
   * Reward claims, keyed by element and (for a daily reward) day. The key's
   * presence is the idempotency record: it is written before anything is
   * granted, so a replayed request finds it and grants nothing.
   */
  claims?: Record<string, Date>;
  /** Impressions on the user's current local day, for the per-day cap. */
  dayKey?: string;
  dayCount?: number;
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
    elementClicks: { type: Schema.Types.Mixed, default: {} },
    claims: { type: Schema.Types.Mixed, default: {} },
    dayKey: { type: String, default: '' },
    dayCount: { type: Number, default: 0 },
    lastShownAt: { type: Date, default: null },
    convertedAt: { type: Date, default: null },
  },
  { collection: 'campaignUserStates', timestamps: true },
);

CampaignUserStateSchema.index({ userId: 1, campaignId: 1 }, { unique: true });

/**
 * Mongoose caches compiled models on `mongoose.models`, and that cache outlives
 * Next's hot reload: after a schema edit the old shape stays registered, and
 * strict mode then drops every newly added field on save without erroring.
 * Re-registering in development makes a schema change take effect on the next
 * request instead of needing a server restart.
 */
if (process.env.NODE_ENV !== 'production' && mongoose.models.CampaignUserState) {
  mongoose.deleteModel('CampaignUserState');
}

const CampaignUserStateModel: Model<CampaignUserStateDoc> =
  (mongoose.models.CampaignUserState as Model<CampaignUserStateDoc>) ||
  mongoose.model<CampaignUserStateDoc>(
    'CampaignUserState',
    CampaignUserStateSchema,
  );

export default CampaignUserStateModel;
