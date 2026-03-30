import mongoose, { Schema, type Model } from 'mongoose';
import type {
  CampaignObjectiveKind,
  MacroCategoryId,
  TierRewards,
} from '@/lib/quests/types';

export interface CampaignObjectiveDoc {
  id: string;
  kind: CampaignObjectiveKind;
  title: string;
  description: string;
  target: number;
  progress: number;
  tagIds?: string[];
  habitId?: string;
  habitName?: string;
}

export interface CampaignDoc {
  _id?: mongoose.Types.ObjectId;
  userId: string;
  campaignId: string;
  categoryId: MacroCategoryId;
  categoryName: string;
  title: string;
  subtitle: string;
  durationDays: number;
  startsAt: Date;
  endsAt: Date;
  objectives: CampaignObjectiveDoc[];
  rewards: TierRewards;
  claimedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const CampaignObjectiveSchema = new Schema<CampaignObjectiveDoc>(
  {
    id: { type: String, required: true },
    kind: {
      type: String,
      enum: [
        'complete_tag_tasks',
        'add_tag_tasks',
        'complete_tag_habits',
        'add_tag_habits',
        'focus_tag_minutes',
        'habit_streak',
      ],
      required: true,
    },
    title: { type: String, required: true },
    description: { type: String, required: true },
    target: { type: Number, required: true },
    progress: { type: Number, default: 0 },
    tagIds: { type: [String], default: undefined },
    habitId: { type: String, default: undefined },
    habitName: { type: String, default: undefined },
  },
  { _id: false },
);

const CampaignSchema = new Schema<CampaignDoc>(
  {
    userId: { type: String, required: true, index: true },
    campaignId: { type: String, required: true, index: true },
    categoryId: {
      type: String,
      enum: ['sport', 'family', 'mindfulness', 'house_chores', 'sleep'],
      required: true,
    },
    categoryName: { type: String, required: true },
    title: { type: String, required: true },
    subtitle: { type: String, required: true },
    durationDays: { type: Number, required: true },
    startsAt: { type: Date, required: true, index: true },
    endsAt: { type: Date, required: true, index: true },
    objectives: { type: [CampaignObjectiveSchema], default: [] },
    rewards: { type: Schema.Types.Mixed, required: true },
    claimedAt: { type: Date, default: null },
  },
  {
    collection: 'campaigns',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

CampaignSchema.index({ userId: 1, campaignId: 1 }, { unique: true });
CampaignSchema.index({ userId: 1, categoryId: 1, endsAt: -1 });

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.Campaign;
}

const CampaignModel: Model<CampaignDoc> =
  (mongoose.models.Campaign as Model<CampaignDoc>) ||
  mongoose.model<CampaignDoc>('Campaign', CampaignSchema);

export default CampaignModel;
