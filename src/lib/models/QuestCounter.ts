import mongoose, { Schema, type Model } from 'mongoose';

export interface QuestCounterDoc {
  _id?: mongoose.Types.ObjectId;
  userId: string;
  metric: string;
  dateKey: string;
  // Sorted tag ids of the task the event came from, '' when untagged. Rows are
  // split per tag combination so focus quests can count only their own tags;
  // the metric's global total is the sum across all rows for the day.
  tagKey: string;
  tagIds: string[];
  count: number;
  createdAt: Date;
  updatedAt: Date;
}

const QuestCounterSchema = new Schema<QuestCounterDoc>(
  {
    userId: { type: String, required: true, index: true },
    metric: { type: String, required: true },
    dateKey: { type: String, required: true },
    tagKey: { type: String, default: '' },
    tagIds: { type: [String], default: [] },
    count: { type: Number, default: 0 },
  },
  {
    collection: 'questCounters',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

QuestCounterSchema.index(
  { userId: 1, metric: 1, dateKey: 1, tagKey: 1 },
  { unique: true },
);

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.QuestCounter;
}

const QuestCounterModel: Model<QuestCounterDoc> =
  (mongoose.models.QuestCounter as Model<QuestCounterDoc>) ||
  mongoose.model<QuestCounterDoc>('QuestCounter', QuestCounterSchema);

export default QuestCounterModel;
