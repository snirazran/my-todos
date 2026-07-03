import mongoose, { Schema, type Model } from 'mongoose';

export interface QuestCounterDoc {
  _id?: mongoose.Types.ObjectId;
  userId: string;
  metric: string;
  dateKey: string;
  count: number;
  createdAt: Date;
  updatedAt: Date;
}

const QuestCounterSchema = new Schema<QuestCounterDoc>(
  {
    userId: { type: String, required: true, index: true },
    metric: { type: String, required: true },
    dateKey: { type: String, required: true },
    count: { type: Number, default: 0 },
  },
  {
    collection: 'questCounters',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

QuestCounterSchema.index({ userId: 1, metric: 1, dateKey: 1 }, { unique: true });

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.QuestCounter;
}

const QuestCounterModel: Model<QuestCounterDoc> =
  (mongoose.models.QuestCounter as Model<QuestCounterDoc>) ||
  mongoose.model<QuestCounterDoc>('QuestCounter', QuestCounterSchema);

export default QuestCounterModel;
