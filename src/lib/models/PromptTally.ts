import mongoose, { Schema, type Model } from 'mongoose';

export interface PromptTallyDoc {
  _id?: mongoose.Types.ObjectId;
  promptId: string;
  counts: Record<string, number>;
  total: number;
  updatedAt: Date;
}

const PromptTallySchema = new Schema<PromptTallyDoc>(
  {
    promptId: { type: String, required: true, unique: true, index: true },
    counts: { type: Schema.Types.Mixed, default: {} },
    total: { type: Number, default: 0 },
  },
  {
    collection: 'prompt_tallies',
    timestamps: { createdAt: false, updatedAt: 'updatedAt' },
    minimize: false,
  },
);

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.PromptTally;
}

const PromptTallyModel: Model<PromptTallyDoc> =
  (mongoose.models.PromptTally as Model<PromptTallyDoc>) ||
  mongoose.model<PromptTallyDoc>('PromptTally', PromptTallySchema);

export default PromptTallyModel;
