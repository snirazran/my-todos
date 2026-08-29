import mongoose, { Schema, type Model } from 'mongoose';
import {
  CAMPAIGN_ART_KINDS,
  CAMPAIGN_STATUSES,
  DISCOUNT_STYLES,
  ELEMENT_TYPES,
  TEXT_ALIGNMENTS,
  TIMER_EXPIRY,
  TIMER_FORMATS,
  TIMER_MODES,
  CAMPAIGN_TEMPLATES,
  CAMPAIGN_TIERS,
  CAMPAIGN_TRIGGERS,
  CTA_ACTIONS,
  PAYER_TARGETS,
  PLATFORM_TARGETS,
  PLUS_TARGETS,
  RIVE_INPUT_TARGETS,
  RIVE_INPUT_TYPES,
  RIVE_LAYOUTS,
  RIVE_SIGNAL_SOURCES,
  REWARD_KINDS,
  REWARD_LIMITS,
  SIGNAL_ACTIONS,
  type CampaignArtKind,
  type CampaignCanvas,
  type CampaignCaps,
  type CampaignElement,
  type CampaignCopy,
  type CampaignCta,
  type CampaignOffer,
  type CampaignReward,
  type CampaignRewardGrant,
  type CampaignRive,
  type CampaignRiveButton,
  type CampaignStatus,
  type CampaignTargeting,
  type CampaignTemplate,
  type CampaignTier,
  type CampaignTriggerRule,
  type RiveInputValue,
  type RiveTicker,
} from '@/lib/campaigns/types';

export type CampaignAssetFile = {
  storagePath: string;
  contentType: string;
  size: number;
  updatedAt: Date;
};

/** One uploaded file a canvas element can point at. */
export type CampaignAsset = {
  id: string;
  kind: 'image' | 'rive';
  name: string;
  storagePath: string;
  contentType: string;
  size: number;
  version: number;
};

export type CampaignDoc = {
  id: string;
  name: string;
  template: CampaignTemplate;
  tier: CampaignTier;
  status: CampaignStatus;
  priority: number;
  art: CampaignArtKind;
  copy: CampaignCopy;
  cta: CampaignCta;
  offer: CampaignOffer;
  rive: CampaignRive;
  canvas: CampaignCanvas;
  assets: CampaignAsset[];
  triggers: CampaignTriggerRule[];
  targeting: CampaignTargeting;
  caps: CampaignCaps;
  startAt?: Date | null;
  endAt?: Date | null;
  imageFile?: CampaignAssetFile | null;
  imageVersion: number;
  riveFile?: CampaignAssetFile | null;
  riveVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

const TriggerSchema = new Schema<CampaignTriggerRule>(
  {
    event: { type: String, enum: [...CAMPAIGN_TRIGGERS], required: true },
    minGap: { type: Number, default: undefined },
    minDays: { type: Number, default: undefined },
    minMinutes: { type: Number, default: undefined },
    minStreak: { type: Number, default: undefined },
  },
  { _id: false },
);

const RiveInputSchema = new Schema<RiveInputValue>(
  {
    name: { type: String, required: true },
    type: { type: String, enum: [...RIVE_INPUT_TYPES], default: 'number' },
    target: { type: String, enum: [...RIVE_INPUT_TARGETS], default: 'databind' },
    value: { type: Schema.Types.Mixed, default: '' },
  },
  { _id: false },
);

const RiveTickerSchema = new Schema<RiveTicker>(
  {
    name: { type: String, required: true },
    target: { type: String, enum: [...RIVE_INPUT_TARGETS], default: 'databind' },
    everyMs: { type: Number, default: 3000, min: 250, max: 600000 },
    jitterMs: { type: Number, default: 500, min: 0, max: 60000 },
    onShow: { type: Boolean, default: true },
  },
  { _id: false },
);

const RewardGrantSchema = new Schema<CampaignRewardGrant>(
  {
    kind: { type: String, enum: [...REWARD_KINDS], required: true },
    id: { type: String, default: '' },
    amount: { type: Number, default: 1, min: 0 },
  },
  { _id: false },
);

const RewardSchema = new Schema<CampaignReward>(
  {
    grants: { type: [RewardGrantSchema], default: [] },
    limit: { type: String, enum: [...REWARD_LIMITS], default: 'once' },
    successText: { type: String, default: '' },
  },
  { _id: false },
);

const ElementSchema = new Schema<CampaignElement>(
  {
    id: { type: String, required: true },
    type: { type: String, enum: [...ELEMENT_TYPES], required: true },
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    w: { type: Number, default: 40 },
    h: { type: Number, default: 10 },
    rotation: { type: Number, default: 0 },
    z: { type: Number, default: 0 },
    label: { type: String, default: '' },
    text: { type: String, default: '' },
    fontSize: { type: Number, default: 6 },
    fontWeight: { type: Number, default: 900 },
    color: { type: String, default: '#ffffff' },
    align: { type: String, enum: [...TEXT_ALIGNMENTS], default: 'center' },
    lineHeight: { type: Number, default: 1.15 },
    letterSpacing: { type: Number, default: 0 },
    uppercase: { type: Boolean, default: false },
    italic: { type: Boolean, default: false },
    background: { type: String, default: '' },
    radius: { type: Number, default: 0 },
    shadow: { type: Boolean, default: false },
    borderColor: { type: String, default: '' },
    borderWidth: { type: Number, default: 0 },
    action: { type: String, enum: [...CTA_ACTIONS], default: 'dismiss' },
    path: { type: String, default: '' },
    packId: { type: String, default: '' },
    productId: { type: String, default: '' },
    reward: { type: RewardSchema, default: () => ({ grants: [], limit: 'once' }) },
    assetId: { type: String, default: '' },
    fit: { type: String, enum: ['contain', 'cover'], default: 'contain' },
    libraryPath: { type: String, default: '' },
    artboard: { type: String, default: '' },
    stateMachine: { type: String, default: '' },
    inputs: { type: [RiveInputSchema], default: [] },
    tickers: { type: [RiveTickerSchema], default: [] },
    discountStyle: { type: String, enum: [...DISCOUNT_STYLES], default: 'strike' },
    timerMode: { type: String, enum: [...TIMER_MODES], default: 'per_user' },
    timerMinutes: { type: Number, default: 30 },
    timerFormat: { type: String, enum: [...TIMER_FORMATS], default: 'hms' },
    timerExpiry: { type: String, enum: [...TIMER_EXPIRY], default: 'freeze' },
    opacity: { type: Number, default: 100 },
  },
  { _id: false },
);

const AssetSchema = new Schema<CampaignAsset>(
  {
    id: { type: String, required: true },
    kind: { type: String, enum: ['image', 'rive'], required: true },
    name: { type: String, default: '' },
    storagePath: { type: String, required: true },
    contentType: { type: String, default: '' },
    size: { type: Number, default: 0 },
    version: { type: Number, default: 1 },
  },
  { _id: false },
);

const RiveButtonSchema = new Schema<CampaignRiveButton>(
  {
    signal: { type: String, required: true },
    source: { type: String, enum: [...RIVE_SIGNAL_SOURCES], default: 'event' },
    action: { type: String, enum: [...SIGNAL_ACTIONS], default: 'cta' },
    path: { type: String, default: '' },
    packId: { type: String, default: '' },
    productId: { type: String, default: '' },
    closes: { type: Boolean, default: true },
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
      productId: { type: String, default: '' },
      reward: { type: RewardSchema, default: () => ({ grants: [], limit: 'once' }) },
    },
    offer: {
      packId: { type: String, default: '' },
      productId: { type: String, default: '' },
      bonusLabel: { type: String, default: '' },
    },
    art: { type: String, enum: [...CAMPAIGN_ART_KINDS], default: 'image' },
    rive: {
      libraryPath: { type: String, default: '' },
      artboard: { type: String, default: '' },
      stateMachine: { type: String, default: '' },
      layout: { type: String, enum: [...RIVE_LAYOUTS], default: 'inline' },
      fit: { type: String, enum: ['contain', 'cover'], default: 'contain' },
      aspect: { type: Number, default: 1, min: 0.3, max: 3 },
      buttons: { type: [RiveButtonSchema], default: [] },
      inputs: { type: [RiveInputSchema], default: [] },
      tickers: { type: [RiveTickerSchema], default: [] },
    },
    canvas: {
      aspect: { type: Number, default: 0.75, min: 0.3, max: 3 },
      maxWidth: { type: Number, default: 380, min: 240, max: 720 },
      elements: { type: [ElementSchema], default: [] },
    },
    assets: { type: [AssetSchema], default: [] },
    triggers: { type: [TriggerSchema], default: [] },
    targeting: {
      payer: { type: String, enum: [...PAYER_TARGETS], default: 'any' },
      plus: { type: String, enum: [...PLUS_TARGETS], default: 'any' },
      platform: { type: String, enum: [...PLATFORM_TARGETS], default: 'any' },
      minDaysSinceSignup: { type: Number, default: undefined },
      maxDaysSinceSignup: { type: Number, default: undefined },
      balanceBelow: { type: Number, default: undefined },
      balanceAbove: { type: Number, default: undefined },
      rollout: { type: Number, default: 100, min: 0, max: 100 },
    },
    caps: {
      perUser: { type: Number, default: 3, min: 0 },
      perDay: { type: Number, default: 1, min: 0 },
      cooldownHours: { type: Number, default: 24, min: 0 },
      suppressAfterDismissals: { type: Number, default: 2, min: 0 },
      delayMs: { type: Number, default: 650, min: 0, max: 20000 },
    },
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },
    imageFile: { type: Schema.Types.Mixed, default: null },
    // Bumped on every upload so the asset URL busts client and CDN caches.
    imageVersion: { type: Number, default: 0 },
    riveFile: { type: Schema.Types.Mixed, default: null },
    riveVersion: { type: Number, default: 0 },
  },
  { collection: 'campaigns', timestamps: true },
);

/**
 * Mongoose caches compiled models on `mongoose.models`, and that cache outlives
 * Next's hot reload: after a schema edit the old shape stays registered, and
 * strict mode then drops every newly added field on save without erroring.
 * Re-registering in development makes a schema change take effect on the next
 * request instead of needing a server restart.
 */
if (process.env.NODE_ENV !== 'production' && mongoose.models.Campaign) {
  mongoose.deleteModel('Campaign');
}

const CampaignModel: Model<CampaignDoc> =
  (mongoose.models.Campaign as Model<CampaignDoc>) ||
  mongoose.model<CampaignDoc>('Campaign', CampaignSchema);

export default CampaignModel;
