import mongoose, { Schema, type Model } from 'mongoose';
import type { QuestRewards } from '@/lib/quests/types';

export type InviteRewardTier = {
  tier: number; // 1, 2, 3, ...
  label: string; // e.g. "1st friend"
  description?: string; // shown under "YOUR REWARDS"
  itemId?: string | null; // optional skin/catalog item id
  flies?: number; // optional fly amount
  imageUrl?: string; // optional custom image to render (placeholder for now)
  rewards?: QuestRewards;
};

export type InviteGiftOption = {
  id: string;
  name: string;
  itemId: string; // catalog item id to grant
  imageUrl?: string; // optional custom image
};

export type InviteConfigDoc = {
  _id: string;
  key: 'singleton';
  headline: string;
  subheading: string;
  rewards: InviteRewardTier[];
  giftOptions: InviteGiftOption[];
  shareTitle: string;
  shareMessage: string;
  updatedAt: Date;
};

const RewardSchema = new Schema<InviteRewardTier>(
  {
    tier: { type: Number, required: true },
    label: { type: String, required: true },
    description: { type: String, default: '' },
    itemId: { type: String, default: null },
    flies: { type: Number, default: 0 },
    imageUrl: { type: String, default: '' },
    rewards: { type: [Schema.Types.Mixed], default: [] },
  },
  { _id: false },
);

const GiftOptionSchema = new Schema<InviteGiftOption>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    itemId: { type: String, required: true },
    imageUrl: { type: String, default: '' },
  },
  { _id: false },
);

const InviteConfigSchema = new Schema<InviteConfigDoc>(
  {
    key: { type: String, required: true, unique: true, default: 'singleton' },
    headline: { type: String, default: 'Share FrogTask, get rewards!' },
    subheading: {
      type: String,
      default: 'Invite a friend to gift them a skin and earn rewards for yourself!',
    },
    rewards: { type: [RewardSchema], default: [] },
    giftOptions: { type: [GiftOptionSchema], default: [] },
    shareTitle: { type: String, default: 'Come join me on FrogTask!' },
    shareMessage: {
      type: String,
      default: 'I have a gift for you on FrogTask. Tap the link to claim it!',
    },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: 'inviteConfig' },
);

if (mongoose.models.InviteConfig) {
  delete mongoose.models.InviteConfig;
}

const InviteConfigModel: Model<InviteConfigDoc> = mongoose.model<InviteConfigDoc>(
  'InviteConfig',
  InviteConfigSchema,
);

export default InviteConfigModel;

export const INVITE_CONFIG_KEY = 'singleton';
