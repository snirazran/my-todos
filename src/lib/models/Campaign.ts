import mongoose, { Schema, type Model } from 'mongoose';
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_TEMPLATES,
  CAMPAIGN_TIERS,
  CAMPAIGN_TRIGGERS,
  CTA_ACTIONS,
  PAYER_TARGETS,
  PLATFORM_TARGETS,
  PLUS_TARGETS,
  type CampaignCaps,
  type CampaignCopy,
  type CampaignCta,
  type CampaignOffer,
  type CampaignStatus,
  type CampaignTargeting,
  type CampaignTemplate,
  type CampaignTier,
  type CampaignTriggerRule,
} from '@/lib/campaigns/types';

export type CampaignAssetFile = {
  storagePath: string;
  contentType: string;
  size: number;
  updatedAt: Date;
};

export type CampaignDoc = {
  id: string;
  name: string;
  template: CampaignTemplate;
  tier: CampaignTier;
  status: CampaignStatus;
  priority: number;
  copy: CampaignCopy;
  cta: CampaignCta;
  offer: CampaignOffer;
  triggers: CampaignTriggerRule[];
  targeting: CampaignTargeting;
  caps: CampaignCaps;
  startAt?: Date | null;
  endAt?: Date | null;
  imageFile?: CampaignAssetFile | null;
  imageVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

const TriggerSchema = new Schema<CampaignTriggerRule>(
  {
    event: { type: String, enum: [...CAMPAIGN_TRIGGERS], required: true },
    minGap: { type: Number, default: undefined },
    minDays: { type: Number, default: undefined },
  },
  { _id: false },
);

const CampaignSchema = new Schema<CampaignDoc>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    template: { type: String, enum: [...CAMPAIGN_TEMPLATES], required: true },
    tier: { type: String, enum: [...CAMPAIGN_TIERS], default: 'nudge' },
    status: { type: String, enum: [...CAMPAIGN_STATUSES], default: 'draft', index: true },
    priority: { type: Number, default: 50, min: 0, max: 100 },
    copy: {
      eyebrow: { type: String, default: '' },
      headline: { type: String, default: '' },
      body: { type: String, default: '' },
      ctaLabel: { type: String, default: 'Get it' },
      dismissLabel: { type: String, default: 'Not now' },
    },
    cta: {
      action: { type: String, enum: [...CTA_ACTIONS], default: 'dismiss' },
      path: { type: String, default: '' },
    },
    offer: {
      packId: { type: String, default: '' },
      bonusLabel: { type: String, default: '' },
    },
    triggers: { type: [TriggerSchema], default: [] },
    targeting: {
      payer: { type: String, enum: [...PAYER_TARGETS], default: 'any' },
      plus: { type: String, enum: [...PLUS_TARGETS], default: 'any' },
      platform: { type: String, enum: [...PLATFORM_TARGETS], default: 'any' },
      minDaysSinceSignup: { type: Number, default: undefined },
      maxDaysSinceSignup: { type: Number, default: undefined },
      balanceBelow: { type: Number, default: undefined },
      balanceAbove: { type: Number, default: undefined },
    },
    caps: {
      perUser: { type: Number, default: 3, min: 0 },
      cooldownHours: { type: Number, default: 24, min: 0 },
      suppressAfterDismissals: { type: Number, default: 2, min: 0 },
    },
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },
    imageFile: { type: Schema.Types.Mixed, default: null },
    // Bumped on every upload so the asset URL busts client and CDN caches.
    imageVersion: { type: Number, default: 0 },
  },
  { collection: 'campaigns', timestamps: true },
);

const CampaignModel: Model<CampaignDoc> =
  (mongoose.models.Campaign as Model<CampaignDoc>) ||
  mongoose.model<CampaignDoc>('Campaign', CampaignSchema);

export default CampaignModel;
