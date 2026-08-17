import mongoose, { Schema, type Model } from 'mongoose';
import {
  SEASON_PASS_DEFAULTS,
  type SeasonSkinIds,
} from '@/lib/quests/seasonLadder';

/**
 * The saved defaults the season generator starts from: pass knobs plus which
 * catalog skins fill the ladder's six "new skin" rungs. Generating a season
 * stamps a copy into the season itself, so later template edits never rewrite
 * a season that is already running.
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
  skinIds: SeasonSkinIds;
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
    skinIds: { type: Schema.Types.Mixed, default: () => ({}) },
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
