import mongoose, { Schema, type Model } from 'mongoose';
import {
  SEASON_PASS_DEFAULTS,
  type SeasonSlotRarities,
} from '@/lib/quests/seasonLadder';
import type { WardrobeSlot } from '@/lib/skins/catalog';

/**
 * The pass rules every monthly season is stamped from: pacing knobs, the
 * rarity each "new skin" rung rolls at, and which wardrobe slots it may draw
 * from. A season keeps its own copy, so edits only reach seasons not yet live.
 */
export interface QuestSeasonTemplateDoc {
  _id?: mongoose.Types.ObjectId;
  configId: string;
  tierCount: number;
  tasksPerStep: number;
  stepsPerTier: number;
  maxStepsPerDay: number;
  tierSkipCost: number;
  graceHours: number;
  slotRarities?: SeasonSlotRarities;
  skinPool?: WardrobeSlot[];
  createdAt: Date;
  updatedAt: Date;
}

export const SEASON_TEMPLATE_CONFIG_ID = 'season-template';

const QuestSeasonTemplateSchema = new Schema<QuestSeasonTemplateDoc>(
  {
    configId: { type: String, required: true, unique: true, index: true },
    tierCount: { type: Number, default: SEASON_PASS_DEFAULTS.tierCount },
    tasksPerStep: { type: Number, default: SEASON_PASS_DEFAULTS.tasksPerStep },
    stepsPerTier: { type: Number, default: SEASON_PASS_DEFAULTS.stepsPerTier },
    maxStepsPerDay: {
      type: Number,
      default: SEASON_PASS_DEFAULTS.maxStepsPerDay,
    },
    tierSkipCost: { type: Number, default: SEASON_PASS_DEFAULTS.tierSkipCost },
    graceHours: { type: Number, default: SEASON_PASS_DEFAULTS.graceHours },
    slotRarities: { type: Schema.Types.Mixed, default: undefined },
    skinPool: { type: [String], default: undefined },
  },
  {
    collection: 'questSeasonTemplates',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    strict: false,
  },
);

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.QuestSeasonTemplate;
}

const QuestSeasonTemplateModel: Model<QuestSeasonTemplateDoc> =
  (mongoose.models.QuestSeasonTemplate as Model<QuestSeasonTemplateDoc>) ||
  mongoose.model<QuestSeasonTemplateDoc>(
    'QuestSeasonTemplate',
    QuestSeasonTemplateSchema,
  );

export default QuestSeasonTemplateModel;
