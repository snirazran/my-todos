import mongoose, { Schema, type Model } from 'mongoose';

/** One generated coaching note per user per ISO week. The week key is unique
 *  per user, so a second request in the same week reads the cached row instead
 *  of paying for another model call. */
export type WeeklyInsightDoc = {
  userId: string;
  /** `YYYY-Www` for the week the note covers (the last full week). */
  weekKey: string;
  headline: string;
  takeaway: string;
  findings: Array<{ label: string; detail: string }>;
  focus: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  createdAt: Date;
  updatedAt: Date;
};

const WeeklyInsightSchema = new Schema<WeeklyInsightDoc>(
  {
    userId: { type: String, required: true, index: true },
    weekKey: { type: String, required: true },
    headline: { type: String, default: '' },
    takeaway: { type: String, default: '' },
    findings: {
      type: [{ label: String, detail: String, _id: false }],
      default: [],
    },
    focus: { type: String, default: '' },
    model: { type: String, default: '' },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
  },
  { collection: 'weeklyInsights', timestamps: true },
);

WeeklyInsightSchema.index({ userId: 1, weekKey: 1 }, { unique: true });

// The compiled model is cached across hot reloads, so a schema change would
// otherwise keep saving through the previous shape and drop the new fields.
if (mongoose.models.WeeklyInsight) {
  delete mongoose.models.WeeklyInsight;
}

const WeeklyInsightModel: Model<WeeklyInsightDoc> = mongoose.model<WeeklyInsightDoc>(
  'WeeklyInsight',
  WeeklyInsightSchema,
);

export default WeeklyInsightModel;
